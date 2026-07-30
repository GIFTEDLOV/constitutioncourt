"""The outcome → final_status mapping.

    COMPLIANT             → CERTIFIED
    NON_COMPLIANT         → REJECTED
    INSUFFICIENT_EVIDENCE → UNRESOLVED

Total and injective. Applied inside the contract after consensus — never by the
frontend, and never asked of the model. The model returns `outcome` only; asking
it for a value that is a pure function of another value it already returned
invites the two to disagree, and then there are two sources of truth for one
fact.
"""

import json

import pytest

from conftest import (
    CASE_TWO_THIRDS,
    mock_case,
    mock_raw_ruling,
    serve_ruling,
)

# The mapping under test, written out independently of the contract so that a
# change to either side has to be made twice, deliberately.
MAPPING = {
    "COMPLIANT": "CERTIFIED",
    "NON_COMPLIANT": "REJECTED",
    "INSUFFICIENT_EVIDENCE": "UNRESOLVED",
}

# ART-4.3 exists in every fixture constitution, so a NON_COMPLIANT ruling can
# cite something real.
REAL_RULE = "ART-4.3"


def _rule_with(direct_vm, contract, sender, outcome):
    rule_ids = [REAL_RULE] if outcome == "NON_COMPLIANT" else []
    serve_ruling(direct_vm, CASE_TWO_THIRDS, outcome, rule_ids=rule_ids)
    direct_vm.sender = sender
    contract.rule()
    return contract.get_state()


@pytest.mark.parametrize("outcome,final", sorted(MAPPING.items()))
def test_each_outcome_maps_to_its_final_status(
    direct_vm, deploy_case, direct_alice, outcome, final
):
    contract = deploy_case(CASE_TWO_THIRDS)
    assert _rule_with(direct_vm, contract, direct_alice, outcome)["final_status"] == final


@pytest.mark.parametrize("outcome", sorted(MAPPING))
def test_the_mapping_is_total(direct_vm, deploy_case, direct_alice, outcome):
    """Every valid outcome produces a non-empty final status. A ruling that
    reached RULED with an empty final_status would be a record with a verdict
    nobody can read."""
    contract = deploy_case(CASE_TWO_THIRDS)
    state = _rule_with(direct_vm, contract, direct_alice, outcome)
    assert state["final_status"] != ""
    assert state["status"] == "RULED"


def test_the_mapping_is_injective(direct_vm, open_case, from_scratch, direct_alice):
    """Three outcomes, three distinct final statuses. If two collapsed onto one,
    a reader could not recover which finding was made."""
    reset = from_scratch()

    finals = []
    for outcome in sorted(MAPPING):
        reset()
        finals.append(_rule_with(direct_vm, open_case, direct_alice, outcome)["final_status"])

    assert len(set(finals)) == 3


def test_final_status_is_empty_until_ruled(open_case):
    assert open_case.get_state()["final_status"] == ""


def test_outcome_and_final_status_are_always_consistent(
    direct_vm, open_case, from_scratch, direct_alice
):
    reset = from_scratch()

    for outcome, final in sorted(MAPPING.items()):
        reset()
        state = _rule_with(direct_vm, open_case, direct_alice, outcome)
        assert MAPPING[state["outcome"]] == state["final_status"] == final


# ------------------------------------------- the model never supplies it ------


def test_a_model_supplied_final_status_is_ignored(direct_vm, deploy_case, direct_alice):
    """The model returns `outcome`. If it volunteers a contradictory
    `final_status`, the contract's own mapping wins — the extra field is not even
    read."""
    contract = deploy_case(CASE_TWO_THIRDS)
    mock_case(direct_vm, CASE_TWO_THIRDS)
    mock_raw_ruling(
        direct_vm,
        json.dumps(
            {
                "outcome": "COMPLIANT",
                "final_status": "REJECTED",  # a lie the contract must not adopt
                "violated_rule_ids": [],
                "evidence_citations": [],
                "reasoning": "No violation found on this record.",
            }
        ),
    )
    direct_vm.sender = direct_alice
    contract.rule()

    state = contract.get_state()
    assert state["outcome"] == "COMPLIANT"
    assert state["final_status"] == "CERTIFIED"


def test_a_model_supplied_status_cannot_set_the_lifecycle(
    direct_vm, deploy_case, direct_alice
):
    """`status` is the lifecycle, not a ruling field. A model emitting one must
    not be able to move the case anywhere other than RULED."""
    contract = deploy_case(CASE_TWO_THIRDS)
    mock_case(direct_vm, CASE_TWO_THIRDS)
    mock_raw_ruling(
        direct_vm,
        json.dumps(
            {
                "outcome": "COMPLIANT",
                "status": "OPEN",
                "violated_rule_ids": [],
                "evidence_citations": [],
                "reasoning": "No violation found on this record.",
            }
        ),
    )
    direct_vm.sender = direct_alice
    contract.rule()
    assert contract.get_state()["status"] == "RULED"


def test_an_unmapped_outcome_never_reaches_storage(direct_vm, open_case, direct_alice):
    """An outcome outside the three is rejected before the mapping is consulted,
    so there is no path to a RULED case with an unmappable verdict."""
    serve_ruling(direct_vm, CASE_TWO_THIRDS, "PARTIALLY_COMPLIANT")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("invalid outcome"):
        open_case.rule()

    state = open_case.get_state()
    assert state["status"] == "OPEN"
    assert state["outcome"] == ""
    assert state["final_status"] == ""
