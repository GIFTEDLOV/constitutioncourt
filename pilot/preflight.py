"""Read-only preflight.

Everything checkable without a signature, checked before one is requested.
Account and balance checks are performed **only when a write run is requested** —
merely running preflight must not require an unlocked wallet, because the most
common use of preflight is confirming the world is ready *before* anyone
unlocks anything.
"""

from __future__ import annotations

import hashlib
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import List, Optional

from . import config
from .fixtures import (
    CASES, PilotCase, all_urls_are_commit_pinned, verify_contract_source,
    verify_local_fixture_bytes, verify_manifest_against_readme,
)
from .record import PilotRecord


@dataclass
class PreflightCheck:
    id: str
    label: str
    ok: Optional[bool]
    detail: str


@dataclass
class PreflightReport:
    checks: List[PreflightCheck] = field(default_factory=list)

    def add(self, id: str, label: str, ok: Optional[bool], detail: str = "") -> None:
        self.checks.append(PreflightCheck(id, label, ok, detail))

    @property
    def ok(self) -> bool:
        return all(c.ok is not False for c in self.checks)

    @property
    def failures(self) -> List[PreflightCheck]:
        return [c for c in self.checks if c.ok is False]


def http_status(url: str, timeout: int = 30) -> tuple:
    """Fetch a URL, returning (status, body-bytes-or-None)."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, None
    except Exception as exc:  # noqa: BLE001
        return None, None if not str(exc) else None


def run_preflight(
    *,
    adapter=None,
    cases: Optional[List[PilotCase]] = None,
    check_accounts: bool = False,
    challenger_address: Optional[str] = None,
    respondent_address: Optional[str] = None,
    resuming: bool = False,
    fetch: bool = True,
) -> PreflightReport:
    """Run every read-only check.

    `check_accounts` gates the account and balance checks: they are meaningful
    only for a write run, and requiring an unlocked wallet to run a read-only
    preflight would defeat its purpose.
    """
    report = PreflightReport()
    cases = cases or list(CASES.values())

    # --- contract source ---------------------------------------------------
    ok, detail = verify_contract_source()
    report.add("contract-source", "Canonical contract source hash matches", ok, detail)

    # --- fixture manifest --------------------------------------------------
    problems = verify_manifest_against_readme()
    report.add("manifest-readme", "Fixture manifest agrees with evidence/README.md",
               not problems, "; ".join(problems) or "all documents agree")

    problems = verify_local_fixture_bytes()
    report.add("fixture-bytes", "On-disk fixtures hash to the manifest values",
               not problems, "; ".join(problems) or "all documents match")

    problems = all_urls_are_commit_pinned()
    report.add("commit-pinned", "Every evidence URL is pinned to a commit, not a branch",
               not problems, "; ".join(problems) or "all URLs carry a 40-hex commit")

    # --- network -----------------------------------------------------------
    if adapter is not None:
        try:
            chain_id = adapter.chain_id()
            report.add("rpc", "Bradbury RPC reachable", True, config.rpc_url())
            report.add("chain-id", "Chain ID is 4221", chain_id == config.CHAIN_ID,
                       f"chain_id={chain_id}")
        except Exception as exc:  # noqa: BLE001
            report.add("rpc", "Bradbury RPC reachable", False, f"{exc}")
            report.add("chain-id", "Chain ID is 4221", None, "Not reached — RPC unreachable.")
    else:
        report.add("rpc", "Bradbury RPC reachable", None, "Not checked — no adapter supplied.")
        report.add("chain-id", "Chain ID is 4221", None, "Not checked.")

    # --- evidence URLs -----------------------------------------------------
    if fetch:
        for case in cases:
            for doc in case.all_documents():
                url = doc.url(case.case_dir)
                status, body = http_status(url)
                label = f"{case.key}/{doc.filename}"
                if status != 200:
                    report.add(f"url-{label}", f"{label} returns HTTP 200", False,
                               f"status={status}")
                    continue
                actual = hashlib.sha256(body or b"").hexdigest()
                report.add(f"url-{label}", f"{label} returns HTTP 200 and matches its hash",
                           actual == doc.sha256,
                           f"sha256={actual[:12]}… expected={doc.sha256[:12]}…")
    else:
        report.add("urls", "Evidence URLs fetched", None, "Not checked — fetching disabled.")

    # --- accounts, only for a write run ------------------------------------
    if check_accounts:
        creds = config.credentials()
        report.add("challenger-key", "Challenger signing key present in the environment",
                   creds.challenger_present,
                   "present" if creds.challenger_present
                   else f"set {config.ENV_CHALLENGER_KEY}")
        report.add("respondent-key", "Respondent signing key present in the environment",
                   creds.respondent_present,
                   "present" if creds.respondent_present
                   else f"set {config.ENV_RESPONDENT_KEY}")

        if adapter is not None and challenger_address:
            try:
                bal = adapter.balance_wei(challenger_address)
                enough = bal >= config.gen_to_wei(config.MIN_CHALLENGER_GEN)
                report.add("challenger-balance",
                           f"Challenger holds at least {config.MIN_CHALLENGER_GEN} GEN",
                           enough, f"{config.wei_to_gen(bal):.4f} GEN")
            except Exception as exc:  # noqa: BLE001
                report.add("challenger-balance", "Challenger balance readable", False, f"{exc}")
        if adapter is not None and respondent_address:
            try:
                bal = adapter.balance_wei(respondent_address)
                enough = bal >= config.gen_to_wei(config.MIN_RESPONDENT_GEN)
                report.add("respondent-balance",
                           f"Respondent holds at least {config.MIN_RESPONDENT_GEN} GEN",
                           enough, f"{config.wei_to_gen(bal):.4f} GEN")
            except Exception as exc:  # noqa: BLE001
                report.add("respondent-balance", "Respondent balance readable", False, f"{exc}")

        if challenger_address and respondent_address:
            differ = challenger_address.lower() != respondent_address.lower()
            report.add("distinct-parties", "Challenger and respondent are different addresses",
                       differ, "the constructor rejects a case against oneself")
    else:
        report.add("accounts", "Account and balance checks", None,
                   "Not checked — read-only preflight does not require an unlocked wallet.")

    # --- existing records --------------------------------------------------
    for case in cases:
        rec = PilotRecord.load_or_create(case.key)
        if not rec.exists:
            report.add(f"record-{case.key}", f"No prior pilot record for {case.key}", True,
                       "clean start")
            continue
        unresolved = rec.any_unresolved()
        if unresolved and not resuming:
            report.add(f"record-{case.key}", f"No unresolved write for {case.key}", False,
                       f"step {unresolved!r} holds a hash with no settled outcome. Inspect it, "
                       "then resume explicitly.")
        elif not resuming:
            report.add(f"record-{case.key}", f"No prior pilot record for {case.key}", False,
                       "a record already exists; pass the resume flag to continue it")
        else:
            report.add(f"record-{case.key}", f"Resuming {case.key}", True,
                       f"record present, unresolved step={unresolved or 'none'}")

    return report
