"""Transaction classification and retry safety — offline.

Every rule here was learned expensively on a funded network by App 1. Asserting
them against fabricated receipts costs nothing and is the only way to exercise
the failure branches without causing the failures.
"""

import pytest

from pilot.classify import (
    Phase, Retry, classify, classify_not_submitted, consensus_votes,
)


def receipt(**over):
    base = {"statusName": "FINALIZED", "txExecutionResultName": "FINISHED_WITH_RETURN"}
    base.update(over)
    return base


# ------------------------------------------------------------- success ------


def test_finalized_with_return_is_the_only_success():
    c = classify(receipt())
    assert c.phase == Phase.FINALIZED
    assert c.succeeded is True
    assert c.terminal is True


def test_accepted_is_not_yet_finalized_and_must_not_be_resubmitted():
    c = classify(receipt(statusName="ACCEPTED"))
    assert c.phase == Phase.ACCEPTED
    assert c.succeeded is True
    assert c.terminal is False
    assert c.retry == Retry.FORBIDDEN_IN_FLIGHT


# ------------------------------------------------------ execution error -----


def test_execution_error_is_a_failure_not_an_acceptance():
    c = classify(receipt(statusName="ACCEPTED", txExecutionResultName="FINISHED_WITH_ERROR"))
    assert c.phase == Phase.EXECUTION_ERROR
    assert c.succeeded is False
    assert c.terminal is True


def test_execution_error_retry_is_pointless_not_dangerous():
    # A guard reverted; nothing changed. Retrying the same call fails the same
    # way, so the advice is to read state rather than to try again.
    c = classify(receipt(txExecutionResultName="FINISHED_WITH_ERROR"))
    assert c.retry == Retry.POINTLESS
    assert "nothing changed" in c.detail


# ---------------------------------------------------------- unknown ---------


def test_finalized_with_no_execution_result_is_unknown_never_success():
    c = classify({"statusName": "FINALIZED"})
    assert c.phase == Phase.UNKNOWN
    assert c.succeeded is False
    assert c.retry == Retry.REQUIRES_INSPECTION
    assert "do not assume it succeeded" in c.detail.lower()


def test_unrecognised_execution_result_is_unknown():
    c = classify(receipt(txExecutionResultName="SOMETHING_NEW"))
    assert c.phase == Phase.UNKNOWN
    assert c.retry == Retry.REQUIRES_INSPECTION


def test_finished_with_no_return_is_not_accepted_as_success():
    # It exists in the JS SDK's vocabulary but not in genlayer-py 0.16.3. This
    # harness must not accept it on another SDK's authority.
    c = classify(receipt(txExecutionResultName="FINISHED_WITH_NO_RETURN"))
    assert c.succeeded is False
    assert c.phase == Phase.UNKNOWN


def test_not_voted_is_not_success():
    c = classify(receipt(txExecutionResultName="NOT_VOTED"))
    assert c.succeeded is False


def test_unrecognised_status_is_unknown():
    c = classify({"statusName": "SOMETHING_ELSE"})
    assert c.phase == Phase.UNKNOWN
    assert c.retry == Retry.REQUIRES_INSPECTION


# ------------------------------------------------ consensus rejection -------


@pytest.mark.parametrize(
    "status", ["CANCELED", "UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"]
)
def test_failed_statuses_are_consensus_failures(status):
    c = classify({"statusName": status})
    assert c.phase == Phase.CONSENSUS_FAILED
    assert c.succeeded is False
    assert c.retry == Retry.SAFE_AFTER_READ


@pytest.mark.parametrize("result", ["DISAGREE", "TIMEOUT", "NO_MAJORITY",
                                    "DETERMINISTIC_VIOLATION"])
def test_settled_non_agree_is_a_failure_whatever_the_status_says(result):
    c = classify(receipt(resultName=result))
    assert c.phase == Phase.CONSENSUS_FAILED
    assert c.succeeded is False


def test_agree_does_not_block_success():
    assert classify(receipt(resultName="AGREE")).succeeded is True


# ------------------------------------------------------------- pending ------


@pytest.mark.parametrize(
    "status", ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "READY_TO_FINALIZE"]
)
def test_pending_statuses_forbid_resubmission(status):
    c = classify({"statusName": status})
    assert c.phase == Phase.PENDING
    assert c.terminal is False
    assert c.retry == Retry.FORBIDDEN_IN_FLIGHT


def test_unreadable_transaction_is_pending_not_failed():
    # A hash exists. Not being able to read it is not permission to resend.
    c = classify(None)
    assert c.phase == Phase.PENDING
    assert c.retry == Retry.FORBIDDEN_IN_FLIGHT


# ------------------------------------------------------- not submitted ------


def test_no_hash_is_the_only_unconditionally_safe_retry():
    c = classify_not_submitted("wallet rejected the signature")
    assert c.retry == Retry.SAFE
    assert c.succeeded is False
    assert "no gas was spent" in c.detail


# --------------------------------------------------------------- votes ------


def test_consensus_votes_are_extracted_for_the_record():
    votes = consensus_votes({
        "numOfRounds": "2",
        "resultName": "MAJORITY_AGREE",
        "lastRound": {
            "leaderIndex": "1",
            "votesCommitted": "5",
            "votesRevealed": "5",
            "rotationsLeft": "2",
            "roundValidators": ["0xaa", "0xbb"],
            "validatorVotesName": ["AGREE", "DISAGREE"],
        },
    })
    assert votes["numOfRounds"] == "2"
    assert votes["validatorVotes"] == ["AGREE", "DISAGREE"]
    assert votes["consensusResult"] == "MAJORITY_AGREE"


def test_consensus_votes_omit_absent_fields_rather_than_inventing_them():
    assert consensus_votes({"statusName": "FINALIZED"}) == {}
    assert consensus_votes(None) == {}
