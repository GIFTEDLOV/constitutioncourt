"""Operator command for the Bradbury pilot.

    python -m pilot preflight                 read-only, no wallet needed
    python -m pilot run case-002              deploy + rule        (CASE A)
    python -m pilot run case-003              deploy + respond + rule (CASE B)
    python -m pilot resume case-002           continue an interrupted run
    python -m pilot resume case-003
    python -m pilot verify case-002 --address 0x…    verify without writing

Nothing writes unless `run` or `resume` is used **and** both environment gates
are set. `preflight` and `verify` never sign anything and never need a key.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import List, Optional

from . import config
from .fixtures import CASES, canonical_contract_source, sha256_bytes
from .preflight import run_preflight
from .record import PilotRecord
from .keystore import KeystoreError, describe_accounts
from .runner import PilotRunner, PilotStop
from .signing import assert_distinct, resolve_challenger, resolve_respondent
from .verify import (
    resolve_rule_ids, verify_citations_pinned, verify_responded, verify_ruled,
)

TICK = {True: "ok  ", False: "FAIL", None: "--  "}


def _print_checks(checks) -> None:
    for c in checks:
        print(f"  [{TICK[c.ok]}] {c.label}")
        if c.detail:
            print(f"         {c.detail}")


def _adapter():
    from .chain import GenLayerAdapter

    return GenLayerAdapter(rpc_url=config.rpc_url())


def cmd_preflight(args) -> int:
    print("ConstitutionCourt — Bradbury preflight (read-only, nothing is signed)")
    print(json.dumps(config.describe(), indent=2))
    print()

    adapter = None
    if not args.offline:
        try:
            adapter = _adapter()
        except Exception as exc:  # noqa: BLE001
            print(f"  (could not construct a chain adapter: {exc})")

    challenger = respondent = None
    if args.writes:
        accounts = describe_accounts()
        print(f"  keystore accounts available ({len(accounts)}):")
        for a in accounts:
            print(f"    {a['name']:<14} {a['address']}")
        print()
        # Expected addresses are public and can be checked without unlocking
        # anything, so a read-only preflight never prompts for a password.
        challenger = config.challenger_expected_address()
        respondent = config.respondent_expected_address()
        if not challenger or not respondent:
            print("  Note: set "
                  f"{config.ENV_CHALLENGER_ADDRESS} and {config.ENV_RESPONDENT_ADDRESS} to "
                  "check balances without unlocking a keystore.")

    cases = [CASES[args.case]] if args.case else None
    report = run_preflight(
        adapter=adapter, cases=cases, check_accounts=args.writes,
        challenger_address=challenger, respondent_address=respondent,
        resuming=args.resuming, fetch=not args.offline,
    )
    _print_checks(report.checks)
    print()
    if report.ok:
        print("Preflight passed.")
        return 0
    print(f"{len(report.failures)} check(s) failed. Do not proceed.")
    return 1


def _require_write_gates() -> None:
    if not config.live_enabled():
        raise SystemExit(
            f"Refusing to run: set {config.ENV_LIVE}=1 to enable live operations."
        )
    if not config.writes_enabled():
        raise SystemExit(
            f"Refusing to write: set {config.ENV_WRITES}=1 to permit transactions that "
            "spend testnet GEN and require a wallet signature."
        )


def cmd_run(args, resuming: bool = False) -> int:
    case = CASES[args.case]
    _require_write_gates()

    if resuming and not config.resume_enabled():
        raise SystemExit(
            f"Refusing to resume: set {config.ENV_RESUME}=1 after inspecting the preserved "
            "transaction. Resuming is deliberate, never automatic."
        )

    record = PilotRecord.load_or_create(case.key)
    if record.exists and not resuming:
        unresolved = record.any_unresolved()
        raise SystemExit(
            f"A pilot record already exists for {case.key}"
            + (f" with an unresolved {unresolved!r} step" if unresolved else "")
            + ". Use `resume` rather than `run`, so nothing is submitted twice."
        )

    adapter = _adapter()

    # Resolved separately so the two parties can never collapse into one code
    # path, and so each keystore password is prompted for on its own.
    try:
        challenger_signer = resolve_challenger(adapter.account)
        respondent_signer = resolve_respondent(adapter.account)
        assert_distinct(challenger_signer, respondent_signer)
    except KeystoreError as exc:
        raise SystemExit(str(exc)) from exc

    challenger = challenger_signer.account
    respondent = respondent_signer.account

    print(f"Case {case.key}: {case.lifecycle}")
    print(f"  challenger {challenger_signer.address}  "
          f"[{challenger_signer.mode}"
          + (f": {challenger_signer.account_name}]" if challenger_signer.account_name else "]"))
    print(f"  respondent {respondent_signer.address}  "
          f"[{respondent_signer.mode}"
          + (f": {respondent_signer.account_name}]" if respondent_signer.account_name else "]"))
    if challenger_signer.mode == config.SigningMode.RAW_KEY \
            or respondent_signer.mode == config.SigningMode.RAW_KEY:
        print("  WARNING: signing from a raw environment key. A named keystore account is "
              "safer — see docs/DEPLOY.md.")

    report = run_preflight(
        adapter=adapter, cases=[case], check_accounts=True,
        challenger_address=challenger_signer.address, respondent_address=respondent_signer.address,
        resuming=resuming,
    )
    if not report.ok:
        _print_checks(report.failures)
        raise SystemExit("Preflight failed. Nothing was signed.")

    record.record_inputs(
        case=case.key, title=case.title, lifecycle=case.lifecycle,
        expected_outcome=case.expected_outcome,
        expected_final_status=case.expected_final_status,
        expected_rule_ids=list(case.expected_rule_ids),
    )
    record.record_accounts(challenger_signer.address, respondent_signer.address)
    record.record_evidence([
        {"role": d.role, "filename": d.filename, "url": d.url(case.case_dir),
         "sha256": d.sha256, "bytes": d.size}
        for d in case.all_documents()
    ])

    runner = PilotRunner(adapter, record, log=print)

    try:
        address = record.contract_address()
        if address:
            print(f"  contract already deployed at {address}")
        else:
            address = runner.deploy_case(
                case, challenger, challenger_signer.address, respondent_signer.address,
                adapter.address_arg,
            )
            print(f"  deployed and verified: {address}")

        if case.response:
            if not record.step_succeeded("submit_response"):
                runner.submit_response(address, case.response_url, respondent)
            state = runner.read_state(address)
            sources = runner.read_sources(address)
            record.record_state("after-response", state, sources)
            v = verify_responded(state, sources, case.response_url)
            record.record_verification("submit_response", v)
            _print_checks(v.checks)
            if not v.ok:
                raise SystemExit("Response postcondition failed.")

        if not record.step_succeeded("rule"):
            runner.rule(address, challenger)
        state = runner.read_state(address)
        sources = runner.read_sources(address)
        record.record_state("after-rule", state, sources)

        v = verify_ruled(state, case.expected_outcome, case.expected_final_status,
                         case.expected_rule_ids)
        record.record_verification("rule", v)
        _print_checks(v.checks)

        pinned = verify_citations_pinned(state, sources)
        _print_checks(pinned.checks)

        print()
        print(f"Record: {record.path}")
        return 0 if v.ok and pinned.ok else 1

    except PilotStop as stop:
        print()
        print(f"STOPPED: {stop}")
        if stop.tx_hash:
            print(f"  hash preserved: {stop.tx_hash}")
            print("  Nothing was resent. Inspect the transaction, then resume explicitly.")
        print(f"  Record: {record.path}")
        return 2


def cmd_verify(args) -> int:
    """Verify an existing contract without writing anything."""
    case = CASES[args.case]
    adapter = _adapter()
    record = PilotRecord.load_or_create(case.key)
    address = args.address or record.contract_address()
    if not address:
        raise SystemExit("No contract address given and none recorded. Pass --address.")

    print(f"Verifying {case.key} at {address} (read-only)")
    runner = PilotRunner(adapter, record, log=print)
    state = runner.read_state(address)
    sources = runner.read_sources(address)
    print(json.dumps({"get_state": state, "get_evidence_sources": sources},
                     indent=2, default=str))

    code = adapter.contract_code(address)
    if code:
        actual = sha256_bytes(code.encode("utf-8"))
        expected = sha256_bytes(canonical_contract_source().encode("utf-8"))
        print(f"  deployed source sha256 {actual[:16]}… "
              f"{'matches' if actual == expected else 'DOES NOT MATCH'} canonical")
    else:
        print("  no contract code at this address")

    status = str(state.get("status", ""))
    if status != "RULED":
        print(f"  status is {status}; ruling assertions not applicable yet")
        return 0

    v = verify_ruled(state, case.expected_outcome, case.expected_final_status,
                     case.expected_rule_ids)
    _print_checks(v.checks)
    pinned = verify_citations_pinned(state, sources)
    _print_checks(pinned.checks)
    return 0 if v.ok and pinned.ok else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="pilot", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)

    pf = sub.add_parser("preflight", help="read-only checks; signs nothing")
    pf.add_argument("case", nargs="?", choices=sorted(CASES))
    pf.add_argument("--writes", action="store_true",
                    help="also check signing keys and balances for a write run")
    pf.add_argument("--offline", action="store_true",
                    help="skip network checks (no RPC, no URL fetches)")
    pf.add_argument("--resuming", action="store_true",
                    help="treat an existing pilot record as expected")
    pf.set_defaults(func=cmd_preflight)

    run = sub.add_parser("run", help="deploy and drive a case (writes, spends GEN)")
    run.add_argument("case", choices=sorted(CASES))
    run.set_defaults(func=lambda a: cmd_run(a, resuming=False))

    res = sub.add_parser("resume", help="continue an interrupted case")
    res.add_argument("case", choices=sorted(CASES))
    res.set_defaults(func=lambda a: cmd_run(a, resuming=True))

    ver = sub.add_parser("verify", help="verify an existing contract; writes nothing")
    ver.add_argument("case", choices=sorted(CASES))
    ver.add_argument("--address", help="contract address; defaults to the recorded one")
    ver.set_defaults(func=cmd_verify)

    return p


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":
    sys.exit(main())
