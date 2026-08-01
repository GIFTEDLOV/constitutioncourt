"""Read-only reconstruction of a pilot that was driven from the browser.

When the operator signs in a browser wallet, the harness never holds a key and
never submits anything. Its job shrinks to what it is best at and what a browser
cannot do well: fetching each transaction, classifying it, running every
invariant from docs/DEPLOY.md against live state, and writing a durable pilot
record.

Everything here is a read. There is no code path in this module that signs,
submits, or spends — by construction, not by convention: it never takes an
account, and the only adapter methods it calls are `transaction`, `read` and
`contract_code`.
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional

from .classify import classify, consensus_votes
from .fixtures import PilotCase, canonical_contract_source, sha256_bytes
from .receipt import (
    AddressRecoveryError, parse_deploy_receipt, recover_contract_address,
)
from .record import PilotRecord
from .verify import (
    DeployInputs, Verification, resolve_rule_ids, verify_citations_pinned,
    verify_deployment, verify_responded, verify_response_recorded, verify_ruled,
)


@dataclass
class BrowserPilotInputs:
    """What the operator observed in the browser, all of it public."""

    case: PilotCase
    contract_address: str
    challenger_address: str
    respondent_address: str
    deploy_tx: Optional[str] = None
    response_tx: Optional[str] = None
    rule_tx: Optional[str] = None


def _fetch_json(url: str, timeout: int = 30) -> Optional[Mapping[str, Any]]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            return json.loads(resp.read())
    except Exception:
        return None


def reconstruct(
    adapter,
    inputs: BrowserPilotInputs,
    record: PilotRecord,
    *,
    log=lambda _m: None,
) -> Dict[str, Verification]:
    """Verify a browser-driven run and write its pilot record.

    Returns every verification performed, keyed by step. Raises nothing on a
    failed check — a failure is a finding to record, not an exception to hide.
    """
    case = inputs.case
    results: Dict[str, Verification] = {}

    record.record_inputs(
        case=case.key, title=case.title, lifecycle=case.lifecycle,
        expected_outcome=case.expected_outcome,
        expected_final_status=case.expected_final_status,
        expected_rule_ids=list(case.expected_rule_ids),
        signed_via="browser wallet (injected provider)",
    )
    record.record_accounts(inputs.challenger_address, inputs.respondent_address)
    record.record_evidence([
        {"role": d.role, "filename": d.filename, "url": d.url(case.case_dir),
         "sha256": d.sha256, "bytes": d.size}
        for d in case.all_documents()
    ])

    # --- every transaction the operator reported ---------------------------
    for step, tx_hash, method in (
        ("deploy", inputs.deploy_tx, "deploy"),
        ("submit_response", inputs.response_tx, "submit_response"),
        ("rule", inputs.rule_tx, "rule"),
    ):
        if not tx_hash:
            continue
        record.record_submission(step, tx_hash, method)
        receipt = adapter.transaction(tx_hash)
        c = classify(receipt)
        record.record_receipt(step, c, consensus_votes(receipt))
        log(f"  {step}: {c.phase} — {c.detail}")

    # --- live state --------------------------------------------------------
    state = adapter.read(inputs.contract_address, "get_state") or {}
    sources = adapter.read(inputs.contract_address, "get_evidence_sources") or {}
    state = dict(state)
    sources = dict(sources)

    code = adapter.contract_code(inputs.contract_address)
    deployed_sha = sha256_bytes(code.encode("utf-8")) if code else None
    source_sha = sha256_bytes(canonical_contract_source().encode("utf-8"))
    record.record_contract(inputs.contract_address, source_sha)

    # --- deployment invariants --------------------------------------------
    if inputs.deploy_tx:
        receipt = adapter.transaction(inputs.deploy_tx)
        parsed = parse_deploy_receipt(receipt)
        address = address_error = None
        try:
            address = recover_contract_address(parsed)
        except AddressRecoveryError as exc:
            address_error = str(exc)

        # The address the browser reported must be the one the receipt names.
        if address and address.lower() != inputs.contract_address.lower():
            address_error = (
                f"The receipt names {address}, but the operator recorded "
                f"{inputs.contract_address}. These must agree."
            )
            address = None

        v = verify_deployment(
            classification=classify(receipt),
            address=address, address_error=address_error,
            code=code,
            code_error=None if code else "No contract code at this address.",
            deployed_source_sha=deployed_sha,
            state=state, state_error=None if state else "get_state did not answer",
            sources=sources,
            sources_error=None if sources else "get_evidence_sources did not answer",
            inputs=DeployInputs(
                signer=inputs.challenger_address,
                respondent=inputs.respondent_address,
                title=case.title,
                constitution_url=case.constitution_url,
                proposal_url=case.proposal_url,
                vote_record_url=case.vote_record_url,
                notice_record_url=case.notice_record_url,
                source_sha256=source_sha,
            ),
        )
        # A case that has moved past OPEN legitimately fails the "status is
        # OPEN" and "no ruling" checks. Those are deployment-time invariants,
        # so they are recorded as observed-later rather than as failures.
        results["deploy"] = v
        record.record_verification("deploy", v)

    # --- lifecycle postconditions -----------------------------------------
    if case.response and str(state.get("status")) in ("RESPONDED", "RULED"):
        # Which check applies depends on where the case is now. "Status is
        # RESPONDED" is a postcondition of the response transaction; once the
        # case is RULED the durable facts are what remain checkable.
        if str(state.get("status")) == "RESPONDED":
            v = verify_responded(state, sources, case.response_url or "")
        else:
            v = verify_response_recorded(state, sources, case.response_url or "")
        results["submit_response"] = v
        record.record_verification("submit_response", v)

    if str(state.get("status")) == "RULED":
        v = verify_ruled(state, case.expected_outcome, case.expected_final_status,
                         case.expected_rule_ids)
        results["rule"] = v
        record.record_verification("rule", v)

        pinned = verify_citations_pinned(state, sources)
        results["citations"] = pinned
        record.record_verification("citations", pinned)

        constitution = _fetch_json(case.constitution_url)
        rules = resolve_rule_ids(
            [str(i) for i in (state.get("violated_rule_ids") or [])], constitution
        )
        results["rules"] = rules
        record.record_verification("rule_resolution", rules)

    record.record_state("final", state, sources)
    record.event("browser-pilot", "record reconstructed read-only from live state")
    record.save()
    return results
