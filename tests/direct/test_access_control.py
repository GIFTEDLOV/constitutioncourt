"""Who may call what.

Two rules, and they pull in opposite directions on purpose:

* ``submit_response`` is restricted to the respondent. It is the respondent's own
  document; nobody else may put words in their mouth.
* ``rule`` is permissionless. Restricting it to the two parties would reintroduce
  the deadlock through a smaller door — if the challenger loses interest and the
  respondent prefers no ruling, the case would sit in OPEN forever. The caller
  pays gas and gains nothing: there is no payout to race for and no ordering to
  exploit, because the ruling depends only on the evidence.
"""

from conftest import (
    CASE_COMPLIANT,
    CASE_TWO_THIRDS,
    doc_url,
    mock_case_ruling,
)

RESPONSE_URL = doc_url(CASE_COMPLIANT, "response")
OTHER_URL = "https://evidence.example/not-my-case.json"


# ------------------------------------------------ submit_response: respondent ---


def test_the_respondent_may_submit(direct_vm, deploy_case, direct_bob):
    contract = deploy_case(CASE_COMPLIANT)
    direct_vm.sender = direct_bob
    contract.submit_response(RESPONSE_URL)
    assert contract.get_state()["status"] == "RESPONDED"


def test_the_challenger_may_not_submit_a_response(direct_vm, open_case, direct_alice):
    """The challenger filing the respondent's answer would let them argue both
    sides and then cite the weaker one."""
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("only the respondent"):
        open_case.submit_response(OTHER_URL)


def test_a_third_party_may_not_submit_a_response(direct_vm, open_case, direct_charlie):
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only the respondent"):
        open_case.submit_response(OTHER_URL)


def test_a_rejected_submission_leaves_the_case_open(direct_vm, open_case, direct_charlie):
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only the respondent"):
        open_case.submit_response(OTHER_URL)

    state = open_case.get_state()
    assert state["status"] == "OPEN"
    assert state["has_response"] is False
    assert state["responded_at"] == ""
    assert open_case.get_evidence_sources()["response_url"] == ""


def test_authorization_is_checked_before_the_url(direct_vm, open_case, direct_charlie):
    """An unauthorized caller is told they are unauthorized, not that their URL
    is malformed. Validating first would let a stranger probe the URL rules."""
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only the respondent"):
        open_case.submit_response("http://not-even-https.example/x.json")


# -------------------------------------------------------- rule: permissionless ---


def test_the_challenger_may_rule(direct_vm, open_case, direct_alice):
    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_alice
    open_case.rule()
    assert open_case.get_state()["status"] == "RULED"


def test_the_respondent_may_rule(direct_vm, open_case, direct_bob):
    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_bob
    open_case.rule()
    assert open_case.get_state()["status"] == "RULED"


def test_an_unrelated_third_party_may_rule(direct_vm, open_case, direct_charlie):
    """The point of permissionless ruling: neither party can bury the case."""
    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_charlie
    open_case.rule()
    assert open_case.get_state()["status"] == "RULED"


def test_the_caller_does_not_influence_the_ruling(
    direct_vm, open_case, from_scratch, direct_alice, direct_charlie
):
    """Same evidence, same ruling, whoever pays the gas. There is no payout to
    race for and no ordering to exploit, because the ruling depends only on the
    evidence — and this is what that claim means concretely."""
    reset = from_scratch()

    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_alice
    open_case.rule()
    by_challenger = open_case.get_state()

    reset()

    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_charlie
    open_case.rule()
    by_stranger = open_case.get_state()

    for field in ("outcome", "final_status", "violated_rule_ids", "reasoning"):
        assert by_challenger[field] == by_stranger[field]


def test_ruling_does_not_record_the_caller(direct_vm, open_case, direct_charlie):
    """No caller identity is stored, so there is nothing to game by being first."""
    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_charlie
    open_case.rule()

    state = open_case.get_state()
    assert direct_charlie not in state.values()
    # The only addresses on the record are the two parties.
    assert set(state) & {"ruled_by", "caller", "ruler"} == set()
