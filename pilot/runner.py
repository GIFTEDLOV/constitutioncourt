"""Orchestration: preflight, deploy, respond, rule — with single-flight writes
and resume.

The rules this module exists to enforce, all from docs/DEPLOY.md:

* A write is submitted **exactly once**. If the record already holds a hash for
  a step, the runner resumes tracking it and never submits again.
* The hash is persisted **before** anything is awaited.
* Polling is finalization-aware and single-flight, with a Bradbury-realistic
  timeout.
* On timeout or an unknown outcome the runner **stops**: it preserves the hash,
  guesses nothing, resends nothing, and requires an explicit resume after a
  human has inspected.
* Consensus result and execution result are distinguished at every step.

The chain is behind `ChainAdapter`, so the offline suite drives every branch
here with a fake and no network.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Mapping, Optional

from . import config
from .classify import (
    Classification, Phase, Retry, classify, classify_not_submitted, consensus_votes,
)
from .chain import normalize_state
from .fixtures import PilotCase, canonical_contract_source, sha256_bytes
from .receipt import (
    AddressRecoveryError, parse_deploy_receipt, recover_contract_address,
)
from .record import PilotRecord
from .verify import DeployInputs, Verification, verify_deployment


class PilotStop(Exception):
    """The run must stop and a human must look before anything else happens.

    Raised on timeout, on an unknown outcome, and whenever proceeding would
    require guessing what happened on-chain.
    """

    def __init__(self, message: str, *, tx_hash: Optional[str] = None,
                 step: Optional[str] = None, classification: Optional[Classification] = None):
        super().__init__(message)
        self.tx_hash = tx_hash
        self.step = step
        self.classification = classification


@dataclass
class StepResult:
    tx_hash: str
    classification: Classification
    receipt: Optional[Mapping[str, Any]]


class PilotRunner:
    def __init__(
        self,
        adapter,
        record: PilotRecord,
        *,
        sleep: Callable[[float], None] = time.sleep,
        now: Callable[[], float] = time.monotonic,
        poll_interval: float = config.POLL_INTERVAL_SECONDS,
        log: Optional[Callable[[str], None]] = None,
    ):
        self.adapter = adapter
        self.record = record
        self._sleep = sleep
        self._now = now
        self.poll_interval = poll_interval
        self._log = log or (lambda _m: None)

    # ------------------------------------------------------------ polling

    def await_settlement(
        self, step: str, tx_hash: str, timeout: float,
    ) -> StepResult:
        """Poll one transaction to a terminal outcome.

        Single-flight by construction: one request, then sleep, then the next.
        Never overlaps, so responses cannot land out of order and rewind the
        tracker to an earlier phase.
        """
        started = self._now()
        last: Optional[Classification] = None

        while True:
            receipt = self.adapter.transaction(tx_hash)
            c = classify(receipt)
            last = c
            self._log(f"  {step}: {c.phase} ({c.status or 'no status'})")

            if c.terminal:
                self.record.record_receipt(step, c, consensus_votes(receipt))
                if c.phase == Phase.UNKNOWN:
                    raise PilotStop(
                        f"{step}: outcome could not be established. {c.detail} The hash is "
                        "preserved in the pilot record. Inspect the transaction, then resume "
                        "explicitly — nothing will be resent automatically.",
                        tx_hash=tx_hash, step=step, classification=c,
                    )
                return StepResult(tx_hash=tx_hash, classification=c, receipt=receipt)

            if self._now() - started > timeout:
                # A timeout is not a failure of the transaction — it is the end
                # of our patience. The distinction matters: the write may still
                # settle later, so nothing may be resent.
                self.record.record_receipt(step, c, consensus_votes(receipt))
                raise PilotStop(
                    f"{step}: still {c.phase} after {timeout / 60:.0f} minutes. The transaction "
                    "may yet settle. The hash is preserved; do not resend. Inspect it and "
                    "resume explicitly.",
                    tx_hash=tx_hash, step=step, classification=c,
                )

            self._sleep(self.poll_interval)

        # unreachable
        raise PilotStop(f"{step}: polling ended unexpectedly", tx_hash=tx_hash, step=step,
                        classification=last)

    # ------------------------------------------------- single-flight submit

    def submit_once(
        self,
        step: str,
        method: str,
        submit: Callable[[], str],
        timeout: float,
    ) -> StepResult:
        """Submit a write exactly once, or resume the one already submitted.

        The ordering is deliberate and is the reason this function exists:
        check the record first, submit, persist the hash, *then* await. A hash
        that exists but is unsettled is never resubmitted — it is resumed.
        """
        pending = self.record.pending_hash(step)
        if pending:
            self._log(f"  {step}: resuming existing hash {pending} — not resubmitting")
            self.record.event("resume", f"resuming {method}() from persisted hash", step=step,
                              tx_hash=pending)
            return self.await_settlement(step, pending, timeout)

        settled = self.record.settled_hash(step)
        if settled and self.record.step_succeeded(step):
            self._log(f"  {step}: already settled successfully ({settled})")
            receipt = self.adapter.transaction(settled)
            return StepResult(tx_hash=settled, classification=classify(receipt), receipt=receipt)

        try:
            tx_hash = submit()
        except Exception as exc:  # noqa: BLE001 — classification is the point
            c = classify_not_submitted(str(exc))
            self.record.step(step)["not_submitted"] = c.detail
            self.record.event("not-submitted", c.detail, step=step)
            self.record.save()
            raise PilotStop(
                f"{step}: {c.detail}", step=step, classification=c
            ) from exc

        if not tx_hash:
            c = classify_not_submitted("the SDK returned no transaction hash")
            raise PilotStop(f"{step}: {c.detail}", step=step, classification=c)

        # Persisted before the first await. If the process dies here, the hash
        # survives and the run is resumable rather than orphaned.
        self.record.record_submission(step, tx_hash, method)
        self._log(f"  {step}: submitted {tx_hash}")

        return self.await_settlement(step, tx_hash, timeout)

    # ------------------------------------------------------------- reading

    def read_state(self, address: str) -> Dict[str, Any]:
        return normalize_state(self.adapter.read(address, "get_state"))

    def read_sources(self, address: str) -> Dict[str, Any]:
        return normalize_state(self.adapter.read(address, "get_evidence_sources"))

    # ------------------------------------------------------------- deploy

    def deploy_case(self, case: PilotCase, challenger_account, challenger_address: str,
                    respondent_address: str, address_arg: Callable[[str], Any]) -> str:
        """Deploy, verify, and return the contract address.

        Raises PilotStop unless all fourteen deployment checks pass.
        """
        source = canonical_contract_source()
        source_sha = sha256_bytes(source.encode("utf-8"))

        args = [
            address_arg(respondent_address),
            case.title,
            case.constitution_url,
            case.proposal_url,
            case.vote_record_url,
            case.notice_record_url,
        ]

        result = self.submit_once(
            "deploy", "deploy",
            lambda: self.adapter.deploy(source, args, challenger_account),
            config.DEPLOY_TIMEOUT_SECONDS,
        )

        if not result.classification.succeeded:
            raise PilotStop(
                f"deploy: {result.classification.detail}",
                tx_hash=result.tx_hash, step="deploy", classification=result.classification,
            )

        parsed = parse_deploy_receipt(result.receipt)
        address: Optional[str] = None
        address_error: Optional[str] = None
        try:
            address = recover_contract_address(parsed)
        except AddressRecoveryError as exc:
            address_error = str(exc)

        code = code_error = None
        deployed_sha = None
        state = sources = None
        state_error = sources_error = None

        if address:
            code = self.adapter.contract_code(address)
            if not code:
                code_error = ("No contract exists at this address. The node reports no code "
                              "there, so the transaction finalized without leaving a contract.")
            else:
                deployed_sha = sha256_bytes(code.encode("utf-8"))
                try:
                    state = self.read_state(address)
                except Exception as exc:  # noqa: BLE001
                    state_error = f"get_state did not answer: {exc}"
                try:
                    sources = self.read_sources(address)
                except Exception as exc:  # noqa: BLE001
                    sources_error = f"get_evidence_sources did not answer: {exc}"

        verification = verify_deployment(
            classification=result.classification,
            address=address, address_error=address_error,
            code=code, code_error=code_error,
            deployed_source_sha=deployed_sha,
            state=state, state_error=state_error,
            sources=sources, sources_error=sources_error,
            inputs=DeployInputs(
                signer=challenger_address,
                respondent=respondent_address,
                title=case.title,
                constitution_url=case.constitution_url,
                proposal_url=case.proposal_url,
                vote_record_url=case.vote_record_url,
                notice_record_url=case.notice_record_url,
                source_sha256=source_sha,
            ),
        )
        self.record.record_verification("deploy", verification)

        if not verification.ok:
            failed = verification.failed
            raise PilotStop(
                "Deployment NOT VERIFIED — "
                f"{failed.label if failed else 'a check did not pass'}: "
                f"{failed.detail if failed else ''} The case must not proceed.",
                tx_hash=result.tx_hash, step="deploy",
            )

        assert address is not None  # guaranteed by verification.ok
        self.record.record_contract(address, source_sha)
        if state is not None:
            self.record.record_state("after-deploy", state, sources)
        return address

    # ------------------------------------------------------------- writes

    def submit_response(self, address: str, response_url: str, respondent_account) -> StepResult:
        return self.submit_once(
            "submit_response", "submit_response",
            lambda: self.adapter.write(address, "submit_response", [response_url],
                                       respondent_account),
            config.WRITE_TIMEOUT_SECONDS,
        )

    def rule(self, address: str, account) -> StepResult:
        return self.submit_once(
            "rule", "rule",
            lambda: self.adapter.write(address, "rule", [], account),
            config.RULE_TIMEOUT_SECONDS,
        )
