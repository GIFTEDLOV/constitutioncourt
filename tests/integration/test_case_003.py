"""CASE B — respondent answers. OPEN → RESPONDED → RULED, NON_COMPLIANT →
REJECTED, ART-5.4.

Runs after CASE A. Both share the challenger signer, so the two modules are
serialised by file order and must never be run in parallel: two writes from one
account, in flight at once, is how a nonce collision turns into a mystery.
"""

import json
import urllib.request

import pytest

from pilot import config
from pilot.classify import Phase
from pilot.runner import PilotRunner
from pilot.verify import (
    resolve_rule_ids, verify_citations_pinned, verify_responded, verify_ruled,
)

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def runner(adapter, record_b):
    return PilotRunner(adapter, record_b, log=print)


@pytest.fixture(scope="module")
def contract_address(runner, adapter, record_b, case_b, challenger, respondent):
    existing = record_b.contract_address()
    if existing:
        return existing
    return runner.deploy_case(
        case_b, challenger, challenger.address, respondent.address, adapter.address_arg
    )


def test_deploy_and_verify_open(contract_address, runner, record_b):
    checks = record_b.data["steps"]["deploy"]["verification"]
    assert all(c["ok"] is True for c in checks), [c for c in checks if c["ok"] is not True]
    assert runner.read_state(contract_address)["status"] == "OPEN"


# ------------------------------------------------------- negative, pre-write


def test_the_challenger_cannot_submit_a_response(
    runner, contract_address, case_b, challenger
):
    """submit_response is respondent-only.

    Runs before the real response so the case is still OPEN — the refusal must
    be about *who* is calling, not about the state.
    """
    before = runner.read_state(contract_address)
    assert before["status"] == "OPEN"

    try:
        tx = runner.adapter.write(
            contract_address, "submit_response", [case_b.response_url], challenger
        )
    except Exception:
        assert runner.read_state(contract_address) == before
        return

    result = runner.await_settlement("negative-challenger-response", tx,
                                     config.WRITE_TIMEOUT_SECONDS)
    assert result.classification.phase == Phase.EXECUTION_ERROR
    after = runner.read_state(contract_address)
    assert after["status"] == "OPEN", "a refused response must not move the case"
    assert after == before


# ------------------------------------------------------------- the response


def test_respondent_submits_the_response(
    runner, contract_address, record_b, case_b, respondent
):
    if record_b.step_succeeded("submit_response"):
        pytest.skip("submit_response already settled in this record")
    result = runner.submit_response(contract_address, case_b.response_url, respondent)
    assert result.classification.succeeded, result.classification.detail


def test_state_is_responded_with_the_exact_url(
    runner, contract_address, record_b, case_b
):
    state = runner.read_state(contract_address)
    sources = runner.read_sources(contract_address)
    record_b.record_state("after-response", state, sources)

    v = verify_responded(state, sources, case_b.response_url)
    record_b.record_verification("submit_response", v)
    assert v.ok, [f"{c.label}: {c.detail}" for c in v.checks if c.ok is False]

    assert state["status"] == "RESPONDED"
    assert sources["response_url"] == case_b.response_url
    assert state["responded_at"]
    assert state["has_response"] is True


def test_the_response_cannot_be_replaced(
    runner, contract_address, case_b, respondent
):
    """One response, ever — the document cannot be swapped after it lands."""
    before = runner.read_state(contract_address)
    sources_before = runner.read_sources(contract_address)

    try:
        tx = runner.adapter.write(
            contract_address, "submit_response",
            [case_b.documents[0].url(case_b.case_dir)], respondent,
        )
    except Exception:
        assert runner.read_sources(contract_address) == sources_before
        return

    result = runner.await_settlement("negative-replace-response", tx,
                                     config.WRITE_TIMEOUT_SECONDS)
    assert result.classification.phase == Phase.EXECUTION_ERROR
    assert runner.read_sources(contract_address) == sources_before, (
        "the first response must survive a rejected second attempt"
    )
    assert runner.read_state(contract_address) == before


# ------------------------------------------------------------- the ruling


def test_rule_succeeds_from_responded(runner, contract_address, record_b, challenger):
    if record_b.step_succeeded("rule"):
        pytest.skip("rule already settled in this record")
    result = runner.rule(contract_address, challenger)
    assert result.classification.succeeded, result.classification.detail


def test_ruled_state_matches_the_expected_outcome(
    runner, contract_address, record_b, case_b
):
    state = runner.read_state(contract_address)
    sources = runner.read_sources(contract_address)
    record_b.record_state("after-rule", state, sources)

    v = verify_ruled(state, case_b.expected_outcome, case_b.expected_final_status,
                     case_b.expected_rule_ids)
    record_b.record_verification("rule", v)
    assert v.ok, [f"{c.label}: {c.detail}" for c in v.checks if c.ok is False]

    assert state["status"] == "RULED"
    assert state["outcome"] == "NON_COMPLIANT"
    assert state["final_status"] == "REJECTED"
    assert state["ruled_at"]
    # The response is part of the record that was adjudicated.
    assert state["has_response"] is True


def test_art_5_4_is_cited_exactly_once(runner, contract_address):
    ids = list(runner.read_state(contract_address)["violated_rule_ids"])
    assert ids.count("ART-5.4") == 1
    assert len(ids) == len(set(ids)), f"duplicate rule ids: {ids}"


def test_citations_decode_and_point_at_pinned_evidence(runner, contract_address):
    state = runner.read_state(contract_address)
    sources = runner.read_sources(contract_address)
    v = verify_citations_pinned(state, sources)
    assert v.ok, [c.detail for c in v.checks if c.ok is False]
    for citation in state["evidence_citations"]:
        assert {"source", "url", "locator", "quote"} <= set(citation)


def test_cited_rules_resolve_in_the_pinned_constitution(runner, contract_address, case_b):
    with urllib.request.urlopen(case_b.constitution_url, timeout=30) as resp:
        constitution = json.loads(resp.read())
    ids = list(runner.read_state(contract_address)["violated_rule_ids"])
    v = resolve_rule_ids(ids, constitution)
    assert v.ok, [c.detail for c in v.checks if c.ok is False]
