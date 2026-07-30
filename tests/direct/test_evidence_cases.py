"""Each fixture case produces its documented outcome, status and cited rules.

These are the end-to-end tests: real fixture documents served at the pinned
URLs, a ruling from the (mocked) model, and the contract's own invariants and
mapping applied on top. If a fixture and its README ever disagree, this is what
catches it.
"""

import pytest

from conftest import (
    ALL_CASES,
    CASE_COMPLIANT,
    CASE_INSUFFICIENT,
    CASE_NOTICE,
    CASE_TWO_THIRDS,
    EXPECTED,
    doc_url,
    has_response,
    mock_case_ruling,
)


@pytest.fixture
def ruled(direct_vm, deploy_case, direct_alice, direct_bob):
    """Deploy a case, serve its documents and expected ruling, then rule."""

    def _ruled(case: str, *, with_response: bool = None):
        contract = deploy_case(case)
        if with_response is None:
            with_response = has_response(case)
        if with_response:
            direct_vm.sender = direct_bob
            contract.submit_response(doc_url(case, "response"))
        mock_case_ruling(direct_vm, case)
        direct_vm.sender = direct_alice
        contract.rule()
        return contract

    return _ruled


@pytest.mark.parametrize("case", ALL_CASES)
def test_case_produces_its_documented_outcome(ruled, case):
    expected_outcome, _final, _ids = EXPECTED[case]
    assert ruled(case).get_state()["outcome"] == expected_outcome


@pytest.mark.parametrize("case", ALL_CASES)
def test_case_produces_its_documented_final_status(ruled, case):
    _outcome, expected_final, _ids = EXPECTED[case]
    assert ruled(case).get_state()["final_status"] == expected_final


@pytest.mark.parametrize("case", ALL_CASES)
def test_case_cites_its_documented_rules(ruled, case):
    _outcome, _final, expected_ids = EXPECTED[case]
    assert ruled(case).get_state()["violated_rule_ids"] == expected_ids


@pytest.mark.parametrize("case", ALL_CASES)
def test_every_case_reaches_ruled(ruled, case):
    assert ruled(case).get_state()["status"] == "RULED"


def test_compliant_case_certifies_and_cites_nothing(ruled):
    state = ruled(CASE_COMPLIANT).get_state()
    assert state["outcome"] == "COMPLIANT"
    assert state["final_status"] == "CERTIFIED"
    assert state["violated_rule_ids"] == []


def test_two_thirds_case_rejects_on_art_4_3(ruled):
    state = ruled(CASE_TWO_THIRDS).get_state()
    assert state["final_status"] == "REJECTED"
    assert state["violated_rule_ids"] == ["ART-4.3"]


def test_notice_case_rejects_on_art_5_4(ruled):
    """The vote is impeccable here; only the notice period fails."""
    state = ruled(CASE_NOTICE).get_state()
    assert state["final_status"] == "REJECTED"
    assert state["violated_rule_ids"] == ["ART-5.4"]


def test_insufficient_case_is_unresolved_and_cites_nothing(ruled):
    """Insufficiency is a real, final outcome — not an error, not a violation."""
    state = ruled(CASE_INSUFFICIENT).get_state()
    assert state["outcome"] == "INSUFFICIENT_EVIDENCE"
    assert state["final_status"] == "UNRESOLVED"
    assert state["violated_rule_ids"] == []


def test_ruled_at_is_recorded(ruled):
    assert ruled(CASE_TWO_THIRDS).get_state()["ruled_at"].endswith("Z")


def test_citations_are_stored_and_decodable(ruled):
    citations = ruled(CASE_TWO_THIRDS).get_state()["evidence_citations"]
    assert citations, "a NON_COMPLIANT ruling must carry at least one citation"
    for citation in citations:
        assert set(citation) >= {"source", "url", "locator", "quote"}


def test_citation_urls_are_pinned_urls(ruled):
    """A citation may only point at a document that was actually pinned."""
    contract = ruled(CASE_TWO_THIRDS)
    pinned = set(contract.get_evidence_sources().values())
    for citation in contract.get_state()["evidence_citations"]:
        assert citation["url"] in pinned


def test_ruling_a_responded_case_uses_the_response(ruled):
    """Case 001 is ruled from RESPONDED, not from OPEN."""
    contract = ruled(CASE_COMPLIANT, with_response=True)
    assert contract.get_state()["has_response"] is True
    assert contract.get_state()["status"] == "RULED"


def test_ruling_without_a_response_still_reaches_ruled(ruled):
    """Case 002's respondent stayed silent; the case is still adjudicated."""
    contract = ruled(CASE_TWO_THIRDS, with_response=False)
    assert contract.get_state()["has_response"] is False
    assert contract.get_state()["final_status"] == "REJECTED"
