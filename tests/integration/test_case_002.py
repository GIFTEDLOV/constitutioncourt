"""CASE A — silent respondent. OPEN → RULED, NON_COMPLIANT → REJECTED, ART-4.3.

Ordered and serialised: these steps share a signer and a contract, so they run
in file order and never in parallel. `pytest-xdist` is not used, and the module
is written so that each test depends on the record left by the previous one
rather than on in-memory state — which is also what makes the run resumable.
"""

import pytest

from pilot import config
from pilot.runner import PilotRunner
from pilot.verify import (
    resolve_rule_ids, verify_citations_pinned, verify_ruled,
)

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def runner(adapter, record_a):
    return PilotRunner(adapter, record_a, log=print)


@pytest.fixture(scope="module")
def contract_address(runner, adapter, record_a, case_a, challenger, respondent):
    """Deploy once, verify fully, and reuse the address for the whole module."""
    existing = record_a.contract_address()
    if existing:
        return existing
    return runner.deploy_case(
        case_a, challenger, challenger.address, respondent.address, adapter.address_arg
    )


def test_deploy_and_verify(contract_address, record_a):
    """All fourteen deployment invariants from docs/DEPLOY.md.

    `deploy_case` raises unless every one passes, so reaching here means the
    deployment is verified — never merely finalized.
    """
    assert contract_address
    checks = record_a.data["steps"]["deploy"]["verification"]
    assert all(c["ok"] is True for c in checks), [c for c in checks if c["ok"] is not True]


def test_initial_state_is_open_with_the_submitted_inputs(
    runner, contract_address, case_a, challenger, respondent
):
    state = runner.read_state(contract_address)
    sources = runner.read_sources(contract_address)

    assert state["status"] == "OPEN"
    assert state["challenger"].lower() == challenger.address.lower()
    assert state["respondent"].lower() == respondent.address.lower()
    assert state["case_title"] == case_a.title

    assert sources["constitution_url"] == case_a.constitution_url
    assert sources["proposal_url"] == case_a.proposal_url
    assert sources["vote_record_url"] == case_a.vote_record_url
    assert sources["notice_record_url"] == case_a.notice_record_url

    # Case A's respondent stays silent throughout.
    assert sources["response_url"] == ""
    assert state["has_response"] is False
    assert state["outcome"] == ""
    assert state["final_status"] == ""
    assert state["created_at"]


def test_rule_succeeds_directly_from_open(
    runner, contract_address, record_a, challenger
):
    """The locked decision: a respondent cannot deadlock a case by staying silent."""
    if record_a.step_succeeded("rule"):
        pytest.skip("rule already settled in this record")
    result = runner.rule(contract_address, challenger)
    assert result.classification.succeeded, result.classification.detail


def test_ruled_state_matches_the_expected_outcome(
    runner, contract_address, record_a, case_a
):
    state = runner.read_state(contract_address)
    sources = runner.read_sources(contract_address)
    record_a.record_state("after-rule", state, sources)

    v = verify_ruled(state, case_a.expected_outcome, case_a.expected_final_status,
                     case_a.expected_rule_ids)
    record_a.record_verification("rule", v)
    assert v.ok, [f"{c.label}: {c.detail}" for c in v.checks if c.ok is False]

    assert state["status"] == "RULED"
    assert state["outcome"] == "NON_COMPLIANT"
    assert state["final_status"] == "REJECTED"
    assert state["ruled_at"]


def test_art_4_3_is_cited_exactly_once(runner, contract_address):
    ids = list(runner.read_state(contract_address)["violated_rule_ids"])
    assert ids.count("ART-4.3") == 1
    assert len(ids) == len(set(ids)), f"duplicate rule ids: {ids}"


def test_citations_decode_and_point_at_pinned_evidence(runner, contract_address):
    state = runner.read_state(contract_address)
    sources = runner.read_sources(contract_address)
    v = verify_citations_pinned(state, sources)
    assert v.ok, [c.detail for c in v.checks if c.ok is False]

    for citation in state["evidence_citations"]:
        assert {"source", "url", "locator", "quote"} <= set(citation)


def test_cited_rules_resolve_in_the_pinned_constitution(runner, contract_address, case_a):
    import json
    import urllib.request

    with urllib.request.urlopen(case_a.constitution_url, timeout=30) as resp:
        constitution = json.loads(resp.read())

    ids = list(runner.read_state(contract_address)["violated_rule_ids"])
    v = resolve_rule_ids(ids, constitution)
    assert v.ok, [c.detail for c in v.checks if c.ok is False]


# ------------------------------------------------------ negative live checks


def test_no_write_is_available_after_ruled(runner, contract_address, respondent, case_b):
    """RULED is terminal: even the respondent's own action is refused.

    Uses case B's response URL only as a well-formed argument — the point is
    that the contract refuses regardless of what is submitted. Nothing changes,
    so this needs no additional deployment.
    """
    from pilot.classify import Phase

    before = runner.read_state(contract_address)
    assert before["status"] == "RULED"

    try:
        tx = runner.adapter.write(
            contract_address, "submit_response", [case_b.response_url], respondent
        )
    except Exception:
        # Rejected before submission — also a pass, and nothing was spent.
        after = runner.read_state(contract_address)
        assert after["status"] == "RULED"
        return

    result = runner.await_settlement("negative-response-after-ruled", tx,
                                     config.WRITE_TIMEOUT_SECONDS)
    assert result.classification.phase == Phase.EXECUTION_ERROR, (
        "the contract must refuse a response on a RULED case"
    )
    after = runner.read_state(contract_address)
    assert after == before, "a refused write must change nothing"


def test_a_second_ruling_is_refused(runner, contract_address, challenger):
    """rule() is permissionless but single-shot."""
    from pilot.classify import Phase

    before = runner.read_state(contract_address)
    try:
        tx = runner.adapter.write(contract_address, "rule", [], challenger)
    except Exception:
        assert runner.read_state(contract_address) == before
        return

    result = runner.await_settlement("negative-second-rule", tx,
                                     config.RULE_TIMEOUT_SECONDS)
    assert result.classification.phase == Phase.EXECUTION_ERROR
    assert runner.read_state(contract_address) == before
