"""Deployment and lifecycle verification — every invariant from docs/DEPLOY.md.

Pure functions over already-fetched data. The runner does the I/O; these decide
what it means, so the offline suite can exercise every branch without a network.

A check that was not reached is reported as ``None``, never as a pass. That
distinction is the whole point: a panel that shows twelve ticks because two
checks silently returned early has told the operator something untrue.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Mapping, Optional, Sequence

from .receipt import same_address

OUTCOME_TO_FINAL = {
    "COMPLIANT": "CERTIFIED",
    "NON_COMPLIANT": "REJECTED",
    "INSUFFICIENT_EVIDENCE": "UNRESOLVED",
}
VALID_OUTCOMES = frozenset(OUTCOME_TO_FINAL)


@dataclass
class Check:
    id: str
    label: str
    ok: Optional[bool]
    detail: str


@dataclass
class Verification:
    checks: List[Check] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.checks) and all(c.ok is True for c in self.checks)

    @property
    def failed(self) -> Optional[Check]:
        return next((c for c in self.checks if c.ok is False), None)

    def add(self, id: str, label: str, ok: Optional[bool], detail: str) -> None:
        self.checks.append(Check(id, label, ok, detail))

    def not_reached(self, remaining: Sequence[tuple]) -> None:
        for cid, label in remaining:
            self.checks.append(
                Check(cid, label, None, "Not reached — an earlier check failed.")
            )

    def summary(self) -> str:
        done = sum(1 for c in self.checks if c.ok is True)
        return f"{done}/{len(self.checks)} checks passed"


#: The fourteen deployment checks, in order, exactly as docs/DEPLOY.md §8 lists.
DEPLOY_CHECKS = [
    ("finalized", "Receipt finalized"),
    ("execution", "Execution succeeded"),
    ("address", "Non-zero contract address recovered from the decoded receipt"),
    ("code", "Contract code exists on-chain"),
    ("source", "Deployed source hash matches canonical source"),
    ("state", "get_state readable"),
    ("sources", "get_evidence_sources readable"),
    ("challenger", "Challenger matches signer"),
    ("respondent", "Respondent matches input"),
    ("title", "Case title matches"),
    ("urls", "All four immutable URLs match"),
    ("status", "Status is OPEN"),
    ("response", "response_url empty"),
    ("ruling", "outcome and final_status empty"),
    ("created", "created_at populated"),
]


@dataclass
class DeployInputs:
    signer: str
    respondent: str
    title: str
    constitution_url: str
    proposal_url: str
    vote_record_url: str
    notice_record_url: str
    source_sha256: str


def verify_deployment(
    *,
    classification,
    address: Optional[str],
    address_error: Optional[str],
    code: Optional[str],
    code_error: Optional[str],
    deployed_source_sha: Optional[str],
    state: Optional[Mapping[str, Any]],
    state_error: Optional[str],
    sources: Optional[Mapping[str, Any]],
    sources_error: Optional[str],
    inputs: DeployInputs,
) -> Verification:
    """Run every deployment invariant, stopping at the first failure."""
    v = Verification()
    order = list(DEPLOY_CHECKS)

    def remaining(after: str):
        idx = [c[0] for c in order].index(after)
        return order[idx + 1:]

    if classification.status != "FINALIZED":
        v.add("finalized", order[0][1], False,
              f"Consensus status is {classification.status or 'unknown'}, not FINALIZED.")
        v.not_reached(remaining("finalized"))
        return v
    v.add("finalized", order[0][1], True, "FINALIZED")

    if classification.execution != "FINISHED_WITH_RETURN":
        v.add("execution", order[1][1], False,
              f"Execution result is {classification.execution or 'absent'}. The transaction "
              "reached consensus but the contract did not run to completion.")
        v.not_reached(remaining("execution"))
        return v
    v.add("execution", order[1][1], True, "FINISHED_WITH_RETURN")

    if address is None:
        v.add("address", order[2][1], False, address_error or "No contract address recovered.")
        v.not_reached(remaining("address"))
        return v
    v.add("address", order[2][1], True, address)

    if not code:
        v.add("code", order[3][1], False,
              code_error or "The node returned no contract code at this address. The "
              "transaction finalized without leaving a contract behind.")
        v.not_reached(remaining("code"))
        return v
    v.add("code", order[3][1], True, f"{len(code)} characters present")

    if deployed_source_sha != inputs.source_sha256:
        v.add("source", order[4][1], False,
              f"Deployed source hashes to {(deployed_source_sha or 'unknown')[:16]}…, not the "
              f"{inputs.source_sha256[:16]}… submitted.")
        v.not_reached(remaining("source"))
        return v
    v.add("source", order[4][1], True, f"sha256 {inputs.source_sha256[:16]}…")

    if state is None or not str(state.get("status", "")):
        v.add("state", order[5][1], False, state_error or "get_state did not answer.")
        v.not_reached(remaining("state"))
        return v
    v.add("state", order[5][1], True, "get_state answered")

    if sources is None:
        v.add("sources", order[6][1], False,
              sources_error or "get_evidence_sources did not answer.")
        v.not_reached(remaining("sources"))
        return v
    v.add("sources", order[6][1], True, "get_evidence_sources answered")

    if not same_address(str(state.get("challenger", "")), inputs.signer):
        v.add("challenger", order[7][1], False,
              f"Contract challenger is {state.get('challenger')}, not the signer "
              f"{inputs.signer}.")
        v.not_reached(remaining("challenger"))
        return v
    v.add("challenger", order[7][1], True, str(state.get("challenger")))

    if not same_address(str(state.get("respondent", "")), inputs.respondent):
        v.add("respondent", order[8][1], False,
              f"Contract respondent is {state.get('respondent')}, not the submitted "
              f"{inputs.respondent}.")
        v.not_reached(remaining("respondent"))
        return v
    v.add("respondent", order[8][1], True, str(state.get("respondent")))

    want_title = inputs.title.strip()
    if str(state.get("case_title", "")) != want_title:
        v.add("title", order[9][1], False,
              f"On-chain title is {state.get('case_title')!r}, not {want_title!r}.")
        v.not_reached(remaining("title"))
        return v
    v.add("title", order[9][1], True, want_title)

    expected_urls = [
        ("constitution_url", inputs.constitution_url),
        ("proposal_url", inputs.proposal_url),
        ("vote_record_url", inputs.vote_record_url),
        ("notice_record_url", inputs.notice_record_url),
    ]
    bad = [(k, want) for k, want in expected_urls if str(sources.get(k, "")) != want]
    if bad:
        k, want = bad[0]
        v.add("urls", order[10][1], False,
              f"On-chain {k} is {sources.get(k)!r}, not the submitted {want!r}.")
        v.not_reached(remaining("urls"))
        return v
    v.add("urls", order[10][1], True, "all four match exactly")

    if str(state.get("status")) != "OPEN":
        v.add("status", order[11][1], False, f"Status is {state.get('status')}, not OPEN.")
        v.not_reached(remaining("status"))
        return v
    v.add("status", order[11][1], True, "OPEN")

    if str(sources.get("response_url", "")) != "" or bool(state.get("has_response")):
        v.add("response", order[12][1], False,
              f"A fresh case must carry no response, but records "
              f"{sources.get('response_url')!r}.")
        v.not_reached(remaining("response"))
        return v
    v.add("response", order[12][1], True, "empty")

    if str(state.get("outcome", "")) != "" or str(state.get("final_status", "")) != "":
        v.add("ruling", order[13][1], False,
              f"A fresh case must carry no ruling, but records outcome "
              f"{state.get('outcome')!r} / final status {state.get('final_status')!r}.")
        v.not_reached(remaining("ruling"))
        return v
    v.add("ruling", order[13][1], True, "both empty")

    if not str(state.get("created_at", "")):
        v.add("created", order[14][1], False, "No created_at recorded.")
        return v
    v.add("created", order[14][1], True, str(state.get("created_at")))

    return v


# ------------------------------------------------------------- postconditions


def verify_responded(
    state: Mapping[str, Any],
    sources: Mapping[str, Any],
    expected_response_url: str,
) -> Verification:
    v = Verification()
    v.add("status", "Status is RESPONDED", str(state.get("status")) == "RESPONDED",
          f"status={state.get('status')}")
    v.add("response_url", "Response URL matches exactly",
          str(sources.get("response_url", "")) == expected_response_url,
          f"on-chain={sources.get('response_url')!r}")
    v.add("has_response", "has_response is true", bool(state.get("has_response")),
          f"has_response={state.get('has_response')}")
    v.add("responded_at", "responded_at populated", bool(str(state.get("responded_at", ""))),
          f"responded_at={state.get('responded_at')!r}")
    return v


def verify_ruled(
    state: Mapping[str, Any],
    expected_outcome: str,
    expected_final_status: str,
    expected_rule_ids: Sequence[str],
) -> Verification:
    """Every ruling assertion, including uniqueness of the cited rule ids."""
    v = Verification()

    v.add("status", "Status is RULED", str(state.get("status")) == "RULED",
          f"status={state.get('status')}")

    outcome = str(state.get("outcome", ""))
    v.add("outcome_valid", "Outcome is one of the three", outcome in VALID_OUTCOMES,
          f"outcome={outcome!r}")
    v.add("outcome", f"Outcome is {expected_outcome}", outcome == expected_outcome,
          f"outcome={outcome!r}")

    final_status = str(state.get("final_status", ""))
    v.add("final_status", f"Final status is {expected_final_status}",
          final_status == expected_final_status, f"final_status={final_status!r}")

    mapped = OUTCOME_TO_FINAL.get(outcome)
    v.add("mapping", "Final status matches the locked outcome mapping",
          mapped is not None and mapped == final_status,
          f"{outcome} should map to {mapped}")

    ids = [str(i) for i in (state.get("violated_rule_ids") or [])]
    v.add("rule_ids", f"Violated rule ids are exactly {list(expected_rule_ids)}",
          sorted(ids) == sorted(expected_rule_ids), f"ids={ids}")
    v.add("rule_ids_unique", "Each violated rule id appears exactly once",
          len(ids) == len(set(ids)), f"ids={ids}")

    v.add("ruled_at", "ruled_at populated", bool(str(state.get("ruled_at", ""))),
          f"ruled_at={state.get('ruled_at')!r}")

    citations = state.get("evidence_citations") or []
    v.add("citations_present", "At least one citation recorded", len(citations) > 0,
          f"{len(citations)} citation(s)")
    v.add("citations_decode", "Every citation decodes to an object with the expected keys",
          all(isinstance(c, Mapping) and {"source", "url", "locator", "quote"} <= set(c)
              for c in citations),
          f"{len(citations)} citation(s)")

    return v


def verify_citations_pinned(
    state: Mapping[str, Any], sources: Mapping[str, Any]
) -> Verification:
    """Every citation URL must be one of the URLs pinned on this case."""
    pinned = {str(sources.get(k, "")) for k in (
        "constitution_url", "proposal_url", "vote_record_url",
        "notice_record_url", "response_url")} - {""}
    v = Verification()
    for i, citation in enumerate(state.get("evidence_citations") or []):
        url = str(citation.get("url", "")) if isinstance(citation, Mapping) else ""
        v.add(f"citation-{i}", f"Citation {i} points at a pinned URL", url in pinned,
              f"url={url!r}")
    if not v.checks:
        v.add("citations", "No citations to check", True, "none recorded")
    return v


def resolve_rule_ids(
    rule_ids: Sequence[str], constitution: Optional[Mapping[str, Any]]
) -> Verification:
    """Every cited rule id must resolve in the pinned constitution.

    Never invents text: an id that does not resolve is reported as unresolved.
    """
    v = Verification()
    if constitution is None:
        v.add("constitution", "Constitution fetched for rule resolution", False,
              "The constitution document could not be fetched.")
        return v
    known = {str(r.get("id", "")).strip()
             for r in (constitution.get("rules") or []) if isinstance(r, Mapping)}
    for rid in rule_ids:
        v.add(f"rule-{rid}", f"{rid} resolves in the pinned constitution", rid in known,
              f"constitution declares {len(known)} rule ids")
    if not rule_ids:
        v.add("rules", "No rule ids to resolve", True, "none cited")
    return v
