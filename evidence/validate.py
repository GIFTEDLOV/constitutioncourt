#!/usr/bin/env python3
"""Validate the ConstitutionCourt evidence fixtures against `schema.md` v1.

This runs in CI on every push. It has no third-party dependencies on purpose:
the fixtures are the one thing that must stay checkable even if the GenLayer
toolchain is mid-upgrade and `pip install -r requirements.txt` is broken.

What it enforces, and why each check earns its place:

  * Structural conformance to the five document types. A fixture that drifts
    from the schema silently changes what validators would fetch, and the
    direct-mode tests would keep passing because they mock the fetch.
  * `proposal_id` agreement across proposal, vote record, notice record and
    response. A mismatched id means the four documents describe different
    proposals, which is a case that cannot be adjudicated at all.
  * Amounts and voting power as decimal *strings*, never JSON numbers. Above
    2^53 a JSON number is a lossy IEEE-754 double, so two validators can read
    two different values from identical bytes — a silent consensus split.
  * The constitution is byte-identical across all four cases. If it drifts, a
    difference in outcome stops being attributable to the proposal under test.
  * Every rule id cited by a fixture README's expectation table resolves in the
    constitution.
  * Files are LF-only. `.gitattributes` pins this; this check proves the pin is
    actually working on whatever machine is running.

Usage:
    python evidence/validate.py            # validate, print a summary
    python evidence/validate.py --quiet    # exit code only

Exit code 0 = all fixtures valid, 1 = at least one problem.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

EVIDENCE_DIR = Path(__file__).resolve().parent

CASES = (
    "case-001-compliant-simple-majority",
    "case-002-non-compliant-two-thirds",
    "case-003-non-compliant-notice-period",
    "case-004-insufficient-evidence",
)

# Cases where the respondent answered. The other two are ruled from OPEN, and
# a stray response.json in those directories would silently change which
# lifecycle path the fixture exercises.
CASES_WITH_RESPONSE = frozenset(
    {
        "case-001-compliant-simple-majority",
        "case-003-non-compliant-notice-period",
    }
)

REQUIRED_DOCS = ("constitution", "proposal", "vote-record", "notice-record")

SCHEMA_LITERALS = {
    "constitution": "constitutioncourt/constitution@1",
    "proposal": "constitutioncourt/proposal@1",
    "vote-record": "constitutioncourt/vote-record@1",
    "notice-record": "constitutioncourt/notice-record@1",
    "response": "constitutioncourt/response@1",
}

VALID_SCOPES = frozenset({"treasury", "governance", "membership"})
VALID_CHANNELS = frozenset({"forum", "blog", "mailing-list", "chat"})

# ISO-8601 UTC with an explicit `Z`. Local times and offsets are rejected:
# a validator in a different process should never have to guess a timezone.
ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

# Decimal string. Leading zeros rejected so "0500" and "500" cannot both appear
# and compare unequal as strings while comparing equal as integers.
DECIMAL_STR = re.compile(r"^(0|[1-9]\d*)$")


class Problems:
    """Collects every failure instead of stopping at the first one.

    A run that reports one error, gets fixed, then reports the next is a slow
    way to find five errors. CI should print all of them at once.
    """

    def __init__(self) -> None:
        self.items: list[str] = []

    def add(self, where: str, message: str) -> None:
        self.items.append(f"{where}: {message}")

    def __bool__(self) -> bool:
        return bool(self.items)

    def __len__(self) -> int:
        return len(self.items)


def _require(obj: dict, key: str, where: str, problems: Problems) -> object | None:
    if key not in obj:
        problems.add(where, f"missing required field '{key}'")
        return None
    return obj[key]


def _check_str(value: object, where: str, key: str, problems: Problems) -> None:
    if not isinstance(value, str) or not value.strip():
        problems.add(where, f"'{key}' must be a non-empty string, got {value!r}")


def _check_iso_utc(value: object, where: str, key: str, problems: Problems) -> None:
    if not isinstance(value, str) or not ISO_UTC.match(value):
        problems.add(where, f"'{key}' must be ISO-8601 UTC ending in Z, got {value!r}")
        return
    try:
        datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        problems.add(where, f"'{key}' is not a real timestamp: {value!r}")


def _check_decimal_string(value: object, where: str, key: str, problems: Problems) -> None:
    """Reject JSON numbers outright — this is the consensus-safety check."""
    if isinstance(value, bool) or isinstance(value, (int, float)):
        problems.add(
            where,
            f"'{key}' is a JSON number ({value!r}); it must be a decimal STRING. "
            "Numbers above 2^53 lose precision as IEEE-754 doubles and can be "
            "read differently by two validators from identical bytes.",
        )
        return
    if not isinstance(value, str) or not DECIMAL_STR.match(value):
        problems.add(
            where, f"'{key}' must be a decimal string with no leading zeros, got {value!r}"
        )


def load_json(path: Path, problems: Problems) -> dict | None:
    if not path.exists():
        problems.add(str(path.relative_to(EVIDENCE_DIR)), "file not found")
        return None
    raw = path.read_bytes()
    if b"\r\n" in raw:
        problems.add(
            str(path.relative_to(EVIDENCE_DIR)),
            "contains CRLF line endings; .gitattributes pins evidence/**/*.json to LF",
        )
    try:
        return json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError as exc:
        problems.add(str(path.relative_to(EVIDENCE_DIR)), f"not valid UTF-8: {exc}")
    except json.JSONDecodeError as exc:
        problems.add(str(path.relative_to(EVIDENCE_DIR)), f"invalid JSON: {exc}")
    return None


def check_schema_literal(doc: dict, kind: str, where: str, problems: Problems) -> None:
    expected = SCHEMA_LITERALS[kind]
    actual = doc.get("schema")
    if actual != expected:
        problems.add(where, f"'schema' must be {expected!r}, got {actual!r}")


def check_constitution(doc: dict, where: str, problems: Problems) -> set[str]:
    check_schema_literal(doc, "constitution", where, problems)
    for key in ("organization", "version"):
        _check_str(_require(doc, key, where, problems), where, key, problems)
    _check_iso_utc(
        _require(doc, "effective_from", where, problems), where, "effective_from", problems
    )

    rules = _require(doc, "rules", where, problems)
    rule_ids: set[str] = set()
    if not isinstance(rules, list) or not rules:
        problems.add(where, "'rules' must be a non-empty array")
        return rule_ids

    for i, rule in enumerate(rules):
        rwhere = f"{where} rules[{i}]"
        if not isinstance(rule, dict):
            problems.add(rwhere, "must be an object")
            continue
        for key in ("id", "title", "text"):
            _check_str(_require(rule, key, rwhere, problems), rwhere, key, problems)
        scope = _require(rule, "scope", rwhere, problems)
        if scope is not None and scope not in VALID_SCOPES:
            problems.add(rwhere, f"'scope' must be one of {sorted(VALID_SCOPES)}, got {scope!r}")

        rid = rule.get("id")
        if isinstance(rid, str):
            if rid in rule_ids:
                problems.add(
                    rwhere,
                    f"duplicate rule id {rid!r}; ids are the join key for "
                    "violated_rule_ids and must be unique",
                )
            rule_ids.add(rid)

        # A rule that reduces to a machine-readable threshold would let a
        # deterministic function decide the case, removing the reason to run
        # this on GenLayer at all. See schema.md, "Ground rules".
        for banned in ("machine", "threshold_bps", "min_bps", "predicate"):
            if banned in rule:
                problems.add(
                    rwhere,
                    f"contains machine-readable field {banned!r}; rules must be "
                    "natural language only (schema.md, 'Ground rules')",
                )
    return rule_ids


def check_proposal(doc: dict, where: str, problems: Problems) -> str | None:
    check_schema_literal(doc, "proposal", where, problems)
    for key in ("proposal_id", "title", "type", "author", "recipient", "body"):
        _check_str(_require(doc, key, where, problems), where, key, problems)
    _check_iso_utc(
        _require(doc, "submitted_at", where, problems), where, "submitted_at", problems
    )

    amount = _require(doc, "requested_amount", where, problems)
    if isinstance(amount, dict):
        _check_str(_require(amount, "asset", where, problems), where, "requested_amount.asset", problems)
        if "amount" in amount:
            _check_decimal_string(amount["amount"], where, "requested_amount.amount", problems)
        else:
            problems.add(where, "missing required field 'requested_amount.amount'")
    elif amount is not None:
        problems.add(where, "'requested_amount' must be an object")

    pid = doc.get("proposal_id")
    return pid if isinstance(pid, str) else None


def check_vote_record(doc: dict, where: str, problems: Problems) -> str | None:
    check_schema_literal(doc, "vote-record", where, problems)
    _check_str(_require(doc, "proposal_id", where, problems), where, "proposal_id", problems)
    for key in ("voting_opened_at", "voting_closed_at"):
        _check_iso_utc(_require(doc, key, where, problems), where, key, problems)

    # Optional by design: their absence is the INSUFFICIENT_EVIDENCE shape.
    for key in ("eligible_voting_power", "participating_voting_power"):
        if key in doc:
            _check_decimal_string(doc[key], where, key, problems)

    tally = doc.get("tally")
    if tally is not None:
        if not isinstance(tally, dict):
            problems.add(where, "'tally' must be an object when present")
        else:
            for key in ("for", "against", "abstain"):
                if key in tally:
                    _check_decimal_string(tally[key], where, f"tally.{key}", problems)
                else:
                    problems.add(where, f"'tally' present but missing '{key}'")

    declared = doc.get("declared_result")
    if declared is not None and declared not in ("PASSED", "FAILED"):
        problems.add(where, f"'declared_result' must be PASSED or FAILED, got {declared!r}")

    opened, closed = doc.get("voting_opened_at"), doc.get("voting_closed_at")
    if isinstance(opened, str) and isinstance(closed, str) and ISO_UTC.match(opened) and ISO_UTC.match(closed):
        if closed <= opened:
            problems.add(where, "'voting_closed_at' must be after 'voting_opened_at'")

    pid = doc.get("proposal_id")
    return pid if isinstance(pid, str) else None


def check_notice_record(doc: dict, where: str, problems: Problems) -> str | None:
    check_schema_literal(doc, "notice-record", where, problems)
    _check_str(_require(doc, "proposal_id", where, problems), where, "proposal_id", problems)

    notices = _require(doc, "notices", where, problems)
    if notices is None:
        pass
    elif not isinstance(notices, list):
        problems.add(where, "'notices' must be an array (it may be empty)")
    else:
        for i, notice in enumerate(notices):
            nwhere = f"{where} notices[{i}]"
            if not isinstance(notice, dict):
                problems.add(nwhere, "must be an object")
                continue
            _check_str(_require(notice, "url", nwhere, problems), nwhere, "url", problems)
            _check_str(
                _require(notice, "content_summary", nwhere, problems),
                nwhere, "content_summary", problems,
            )
            _check_iso_utc(
                _require(notice, "published_at", nwhere, problems),
                nwhere, "published_at", problems,
            )
            channel = _require(notice, "channel", nwhere, problems)
            if channel is not None and channel not in VALID_CHANNELS:
                problems.add(
                    nwhere, f"'channel' must be one of {sorted(VALID_CHANNELS)}, got {channel!r}"
                )
            url = notice.get("url")
            if isinstance(url, str) and not url.startswith("https://"):
                problems.add(nwhere, f"'url' must be HTTPS, got {url!r}")

    pid = doc.get("proposal_id")
    return pid if isinstance(pid, str) else None


def check_response(doc: dict, where: str, rule_ids: set[str], problems: Problems) -> str | None:
    check_schema_literal(doc, "response", where, problems)
    for key in ("proposal_id", "respondent", "statement"):
        _check_str(_require(doc, key, where, problems), where, key, problems)
    _check_iso_utc(
        _require(doc, "submitted_at", where, problems), where, "submitted_at", problems
    )

    points = doc.get("supporting_points")
    if points is not None:
        if not isinstance(points, list):
            problems.add(where, "'supporting_points' must be an array when present")
        else:
            for i, point in enumerate(points):
                pwhere = f"{where} supporting_points[{i}]"
                if not isinstance(point, dict):
                    problems.add(pwhere, "must be an object")
                    continue
                for key in ("rule_id", "argument"):
                    _check_str(_require(point, key, pwhere, problems), pwhere, key, problems)
                rid = point.get("rule_id")
                if isinstance(rid, str) and rule_ids and rid not in rule_ids:
                    problems.add(
                        pwhere, f"cites rule id {rid!r}, which does not resolve in the constitution"
                    )

    pid = doc.get("proposal_id")
    return pid if isinstance(pid, str) else None


def check_case(case: str, problems: Problems) -> tuple[str | None, set[str]]:
    """Validate one case directory. Returns (constitution digest, rule ids)."""
    case_dir = EVIDENCE_DIR / case
    if not case_dir.is_dir():
        problems.add(case, "case directory not found")
        return None, set()

    if not (case_dir / "README.md").exists():
        problems.add(case, "missing README.md documenting the expected ruling")

    docs: dict[str, dict] = {}
    for kind in REQUIRED_DOCS:
        doc = load_json(case_dir / f"{kind}.json", problems)
        if doc is not None:
            docs[kind] = doc

    rule_ids: set[str] = set()
    if "constitution" in docs:
        rule_ids = check_constitution(docs["constitution"], f"{case}/constitution.json", problems)

    ids: dict[str, str | None] = {}
    if "proposal" in docs:
        ids["proposal"] = check_proposal(docs["proposal"], f"{case}/proposal.json", problems)
    if "vote-record" in docs:
        ids["vote-record"] = check_vote_record(docs["vote-record"], f"{case}/vote-record.json", problems)
    if "notice-record" in docs:
        ids["notice-record"] = check_notice_record(
            docs["notice-record"], f"{case}/notice-record.json", problems
        )

    response_path = case_dir / "response.json"
    expects_response = case in CASES_WITH_RESPONSE
    if response_path.exists():
        if not expects_response:
            problems.add(
                case,
                "has response.json but is registered as a no-response case; that "
                "silently changes which lifecycle path the fixture exercises",
            )
        response = load_json(response_path, problems)
        if response is not None:
            ids["response"] = check_response(response, f"{case}/response.json", rule_ids, problems)
    elif expects_response:
        problems.add(case, "registered as a RESPONDED case but response.json is missing")

    present = {k: v for k, v in ids.items() if v is not None}
    distinct = set(present.values())
    if len(distinct) > 1:
        detail = ", ".join(f"{k}={v!r}" for k, v in sorted(present.items()))
        problems.add(case, f"proposal_id disagreement across documents: {detail}")

    digest = None
    const_path = case_dir / "constitution.json"
    if const_path.exists():
        digest = hashlib.sha256(const_path.read_bytes()).hexdigest()

    return digest, rule_ids


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true", help="suppress the summary table")
    args = parser.parse_args()

    problems = Problems()
    digests: dict[str, str | None] = {}

    for case in CASES:
        digest, _ = check_case(case, problems)
        digests[case] = digest

    # The constitution must be byte-identical across all four cases. If it
    # drifts, a difference in outcome stops being attributable to the proposal,
    # vote or notice record under test, and the fixture set loses its point.
    seen = {d for d in digests.values() if d is not None}
    if len(seen) > 1:
        detail = "\n".join(f"    {c}: {d}" for c, d in digests.items())
        problems.add(
            "evidence", f"constitution.json is not byte-identical across cases:\n{detail}"
        )

    # Any directory under evidence/ that is not a registered case is either a
    # typo or an orphan left behind by a rename.
    for child in sorted(EVIDENCE_DIR.iterdir()):
        if child.is_dir() and child.name not in CASES and not child.name.startswith("."):
            problems.add("evidence", f"unregistered directory {child.name!r}")

    if not args.quiet:
        print(f"ConstitutionCourt evidence fixtures — schema v1\n{'-' * 62}")
        for case in CASES:
            digest = digests[case]
            mark = "ok " if digest else "ERR"
            response = "responded" if case in CASES_WITH_RESPONSE else "no response"
            print(f"  [{mark}] {case:<40} ({response})")
        if seen:
            print(f"\n  shared constitution sha256: {sorted(seen)[0]}")

    if problems:
        print(f"\n{len(problems)} problem(s) found:", file=sys.stderr)
        for item in problems.items:
            print(f"  - {item}", file=sys.stderr)
        return 1

    if not args.quiet:
        print(f"\n{len(CASES)} cases valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
