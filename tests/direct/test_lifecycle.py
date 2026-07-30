"""The locked lifecycle.

    OPEN → RULED                  (response is optional)
    OPEN → RESPONDED → RULED

RULED is terminal. The response is optional by design: requiring RESPONDED
before ruling would let a respondent deadlock the case forever by simply
refusing to answer, and with no escrow and no deadline nothing else in the
system would break that stalemate.
"""

import pytest

from conftest import (
    CASE_COMPLIANT,
    CASE_TWO_THIRDS,
    doc_url,
    mock_case,
    mock_case_ruling,
    mock_document,
    mock_ruling,
)

RESPONSE_URL = doc_url(CASE_COMPLIANT, "response")


def _rule(contract, direct_vm, sender, case=CASE_TWO_THIRDS):
    mock_case_ruling(direct_vm, case)
    direct_vm.sender = sender
    contract.rule()
    return contract


# ------------------------------------------------- OPEN → RESPONDED → RULED ---


def test_open_to_responded(direct_vm, deploy_case, direct_bob):
    contract = deploy_case(CASE_COMPLIANT)
    direct_vm.sender = direct_bob
    contract.submit_response(RESPONSE_URL)
    assert contract.get_state()["status"] == "RESPONDED"


def test_responded_records_the_url_and_timestamp(direct_vm, deploy_case, direct_bob):
    contract = deploy_case(CASE_COMPLIANT)
    direct_vm.sender = direct_bob
    contract.submit_response(RESPONSE_URL)
    state = contract.get_state()
    assert state["has_response"] is True
    assert state["responded_at"].endswith("Z")
    assert contract.get_evidence_sources()["response_url"] == RESPONSE_URL


def test_responded_to_ruled(direct_vm, deploy_case, direct_bob, direct_alice):
    contract = deploy_case(CASE_COMPLIANT)
    direct_vm.sender = direct_bob
    contract.submit_response(RESPONSE_URL)
    _rule(contract, direct_vm, direct_alice, CASE_COMPLIANT)
    assert contract.get_state()["status"] == "RULED"


# ------------------------------------------------------------ OPEN → RULED ---


def test_open_to_ruled_without_any_response(direct_vm, open_case, direct_alice):
    """The core of the locked decision: silence does not block adjudication."""
    _rule(open_case, direct_vm, direct_alice)
    assert open_case.get_state()["status"] == "RULED"


def test_ruling_from_open_leaves_the_response_url_empty(
    direct_vm, open_case, direct_alice
):
    _rule(open_case, direct_vm, direct_alice)
    assert open_case.get_evidence_sources()["response_url"] == ""
    assert open_case.get_state()["has_response"] is False
    assert open_case.get_state()["responded_at"] == ""


# ------------------------------------------------------- terminal behaviour ---


def test_a_second_ruling_is_rejected(direct_vm, open_case, direct_alice):
    """A losing party must not be able to re-roll the adjudication."""
    _rule(open_case, direct_vm, direct_alice)
    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("already RULED"):
        open_case.rule()


def test_a_response_after_ruling_is_rejected(direct_vm, open_case, direct_alice, direct_bob):
    """After RULED the record is frozen — no evidence, no response, no changes."""
    _rule(open_case, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("frozen"):
        open_case.submit_response(RESPONSE_URL)


def test_a_second_response_is_rejected(direct_vm, deploy_case, direct_bob):
    """One response only, so the document cannot be swapped after the fact."""
    contract = deploy_case(CASE_COMPLIANT)
    direct_vm.sender = direct_bob
    contract.submit_response(RESPONSE_URL)
    with direct_vm.expect_revert("already been submitted"):
        contract.submit_response("https://evidence.example/second-thoughts.json")


def test_the_first_response_survives_a_rejected_second_attempt(
    direct_vm, deploy_case, direct_bob
):
    contract = deploy_case(CASE_COMPLIANT)
    direct_vm.sender = direct_bob
    contract.submit_response(RESPONSE_URL)
    with direct_vm.expect_revert("already been submitted"):
        contract.submit_response("https://evidence.example/second-thoughts.json")
    assert contract.get_evidence_sources()["response_url"] == RESPONSE_URL


def test_ruling_is_immutable_after_the_fact(direct_vm, open_case, direct_alice):
    _rule(open_case, direct_vm, direct_alice)
    before = open_case.get_state()

    mock_case(direct_vm, CASE_TWO_THIRDS)
    mock_ruling(direct_vm, "COMPLIANT")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("already RULED"):
        open_case.rule()

    assert open_case.get_state() == before


def test_evidence_urls_never_change_after_construction(
    direct_vm, open_case, direct_alice, direct_bob
):
    before = open_case.get_evidence_sources()
    direct_vm.sender = direct_bob
    open_case.submit_response(RESPONSE_URL)
    # The response URL borrowed here belongs to case 001, so it needs its own
    # mock: `_rule` only serves the four documents of the case being ruled.
    mock_document(direct_vm, CASE_COMPLIANT, "response")
    _rule(open_case, direct_vm, direct_alice)

    after = open_case.get_evidence_sources()
    for field in (
        "constitution_url",
        "proposal_url",
        "vote_record_url",
        "notice_record_url",
    ):
        assert after[field] == before[field]
