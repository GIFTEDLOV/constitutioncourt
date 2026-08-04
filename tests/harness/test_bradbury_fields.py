"""Bradbury field naming and numeric codes — offline.

The Bradbury RPC answers in snake_case; genlayer-py's own types are camelCase.
`pilot.classify` originally read only the camelCase spelling, so every field on
a real receipt came back absent and the lookup fell through to the numeric
`status`. A plainly FINALIZED transaction was therefore classified as
"Unrecognised transaction status '7'" and recorded as phase `unknown`,
`succeeded: false`, `requires-inspection` — the exact inversion of what had
happened on-chain, written into a pilot record as fact.

These tests exist so that cannot recur, in either spelling.
"""

import pytest

from pilot.classify import (
    EXECUTION_CODES, RESULT_CODES, STATUS_CODES, Phase, Retry, chain_timestamps,
    classify, consensus_votes, vote_tally,
)


def bradbury(**over):
    """A receipt shaped the way the Bradbury RPC actually answers."""
    base = {
        "status": 7,
        "status_name": "FINALIZED",
        "tx_execution_result": 1,
        "tx_execution_result_name": "FINISHED_WITH_RETURN",
        "result": 1,
        "result_name": "AGREE",
        "num_of_rounds": 0,
    }
    base.update(over)
    return base


# ------------------------------------------------------------ snake_case ----


def test_snake_case_finalized_with_return_and_agree_is_a_success():
    c = classify(bradbury())
    assert c.phase == Phase.FINALIZED
    assert c.succeeded is True
    assert c.terminal is True
    assert c.status == "FINALIZED"
    assert c.execution == "FINISHED_WITH_RETURN"
    assert c.consensus == "AGREE"


def test_snake_case_canceled_is_a_consensus_failure():
    c = classify(bradbury(status=8, status_name="CANCELED",
                          tx_execution_result=0,
                          tx_execution_result_name="NOT_VOTED"))
    assert c.phase == Phase.CONSENSUS_FAILED
    assert c.succeeded is False
    assert c.terminal is True


def test_snake_case_execution_error_is_still_a_failure():
    c = classify(bradbury(tx_execution_result=2,
                          tx_execution_result_name="FINISHED_WITH_ERROR"))
    assert c.phase == Phase.EXECUTION_ERROR
    assert c.succeeded is False


def test_camel_case_still_works_unchanged():
    # genlayer-py's types use camelCase, and a localnet or a future node may
    # answer that way. Supporting snake_case must not cost the old spelling.
    c = classify({"statusName": "FINALIZED",
                  "txExecutionResultName": "FINISHED_WITH_RETURN",
                  "resultName": "AGREE"})
    assert c.phase == Phase.FINALIZED
    assert c.succeeded is True


def test_a_name_wins_over_a_disagreeing_code():
    # The node sends both. The name is authoritative; the code is the fallback.
    c = classify({"status": 8, "status_name": "FINALIZED",
                  "tx_execution_result_name": "FINISHED_WITH_RETURN"})
    assert c.status == "FINALIZED"
    assert c.succeeded is True


# --------------------------------------------------------- numeric codes ----


def test_numeric_status_7_is_finalized_not_unrecognised():
    """The regression itself: status 7, with no status_name at all."""
    c = classify({"status": 7, "tx_execution_result": 1})
    assert c.status == "FINALIZED"
    assert c.execution == "FINISHED_WITH_RETURN"
    assert c.phase == Phase.FINALIZED
    assert c.succeeded is True
    assert "Unrecognised" not in c.detail


def test_numeric_status_as_a_string_resolves_too():
    c = classify({"status": "7", "tx_execution_result": "1"})
    assert c.status == "FINALIZED"
    assert c.succeeded is True


@pytest.mark.parametrize("code,name", [
    (7, "FINALIZED"),
    (8, "CANCELED"),
    (9, "APPEAL_REVEALING"),
    (11, "READY_TO_FINALIZE"),
])
def test_status_codes_observed_on_bradbury(code, name):
    """The four codes this project has actually seen on-chain.

    7 on the case-002 deploy and the 2026-08-04 ruling; 8 on both 2026-08-02
    ruling transactions; 9 and 11 as recorded in docs/pilot/PILOT-RUN.md.
    """
    assert classify({"status": code}).status == name


def test_status_code_map_matches_the_installed_sdk():
    """Numeric codes are the SDK enum's declaration order.

    classify.py deliberately holds no SDK import, so the map is duplicated
    there. This is the tripwire: if genlayer-py reorders its enum, the copy
    silently mislabels every status by one place.
    """
    from genlayer_py.types.transactions import TransactionStatus

    assert STATUS_CODES == {i: m.name for i, m in enumerate(TransactionStatus)}


def test_execution_and_result_code_maps_match_the_installed_sdk():
    from genlayer_py.types.transactions import ExecutionResult, TransactionResult

    assert EXECUTION_CODES == {i: m.name for i, m in enumerate(ExecutionResult)}
    assert RESULT_CODES == {i: m.name for i, m in enumerate(TransactionResult)}


def test_an_unmapped_numeric_status_is_reported_not_swallowed():
    c = classify({"status": 99})
    assert c.phase == Phase.UNKNOWN
    assert "99" in c.detail


# ------------------------------------------------------------------ IDLE ----


def test_idle_consensus_is_not_treated_as_disagreement():
    """`result: 0` (IDLE) means "no verdict yet", not "validators refused".

    Before snake_case was read this field was invisible. Now that it is visible,
    treating IDLE as a refusal would fail transactions that are merely still
    working.
    """
    c = classify({"status_name": "ACCEPTED", "result": 0,
                  "tx_execution_result_name": "FINISHED_WITH_RETURN"})
    assert c.phase == Phase.ACCEPTED
    assert c.succeeded is True


def test_a_real_disagreement_is_still_a_failure():
    c = classify({"status_name": "FINALIZED", "result_name": "DISAGREE",
                  "tx_execution_result_name": "FINISHED_WITH_RETURN"})
    assert c.phase == Phase.CONSENSUS_FAILED
    assert c.succeeded is False


# --------------------------------------------------- malformed responses ----


@pytest.mark.parametrize("receipt", [
    {},
    {"status": None},
    {"status": ""},
    {"status_name": ""},
    {"status": "not-a-status-at-all"},
    {"status_name": None, "status": None},
    {"status": 7},  # finalized, but no execution result reported
])
def test_incomplete_receipts_never_report_success(receipt):
    assert classify(receipt).succeeded is False


def test_an_empty_receipt_is_pending_and_must_not_be_resubmitted():
    c = classify({})
    assert c.phase == Phase.PENDING
    assert c.retry == Retry.FORBIDDEN_IN_FLIGHT


def test_finalized_with_a_malformed_execution_result_is_unknown():
    c = classify({"status": 7, "tx_execution_result_name": "SOMETHING_NEW"})
    assert c.phase == Phase.UNKNOWN
    assert c.succeeded is False
    assert c.retry == Retry.REQUIRES_INSPECTION


@pytest.mark.parametrize("last_round", ["unexpected", None, 42, []])
def test_a_malformed_last_round_does_not_crash_vote_extraction(last_round):
    votes = consensus_votes({"status": 7, "last_round": last_round})
    assert "validatorVotes" not in votes


# ------------------------------------------------------- validator votes ----


def test_snake_case_validator_votes_are_extracted():
    votes = consensus_votes({
        "num_of_rounds": 0,
        "result_name": "AGREE",
        "last_leader": "0xC32bD21E1506Ab4954BA1EE8FBD50271Ca61b7DE",
        "last_round": {
            "leader_index": 4,
            "votes_committed": 5,
            "votes_revealed": 5,
            "rotations_left": 3,
            "round_validators": ["0xaa", "0xbb", "0xcc", "0xdd", "0xee"],
            "validator_votes_name": ["AGREE", "DETERMINISTIC_VIOLATION",
                                     "AGREE", "TIMEOUT", "AGREE"],
        },
    })
    assert votes["validatorVotes"] == ["AGREE", "DETERMINISTIC_VIOLATION",
                                       "AGREE", "TIMEOUT", "AGREE"]
    assert votes["votesRevealed"] == "5"
    assert votes["consensusResult"] == "AGREE"
    assert votes["leader"] == "0xC32bD21E1506Ab4954BA1EE8FBD50271Ca61b7DE"


def test_numeric_validator_votes_are_resolved_to_names():
    # The node sends validator_votes as integers alongside the names. A record
    # holding `[1, 4, 1, 3, 1]` tells a reader nothing.
    votes = consensus_votes({"last_round": {"validator_votes": [1, 4, 1, 3, 1]}})
    assert votes["validatorVotes"] == ["AGREE", "DETERMINISTIC_VIOLATION",
                                       "AGREE", "TIMEOUT", "AGREE"]


def test_vote_tally_counts_each_outcome():
    tally = vote_tally({"last_round": {"validator_votes_name": [
        "AGREE", "AGREE", "AGREE", "DETERMINISTIC_VIOLATION", "TIMEOUT",
    ]}})
    assert tally == {"AGREE": 3, "DETERMINISTIC_VIOLATION": 1, "TIMEOUT": 1}


def test_vote_tally_of_nothing_is_empty():
    assert vote_tally(None) == {}
    assert vote_tally({}) == {}


# --------------------------------------------------------- chain clocks -----


def test_chain_timestamps_come_from_the_receipt():
    # The real case-002 ruling: created 1785856761, last vote 1785856803.
    t = chain_timestamps({"created_timestamp": "1785856761",
                          "last_vote_timestamp": "1785856803"})
    assert t["submitted_at"] == "2026-08-04T15:19:21Z"
    assert t["last_vote_at"] == "2026-08-04T15:20:03Z"


def test_the_last_vote_is_not_called_a_settlement_time():
    """The deploy's last vote was 09:32:20; it finalized at 10:02:24.

    Naming that half-hour-early moment `settled_at` would understate
    finalization by exactly the interval this project keeps insisting matters.
    """
    t = chain_timestamps({"created_timestamp": "1785663122",
                          "last_vote_timestamp": "1785663140"})
    assert t == {"submitted_at": "2026-08-02T09:32:02Z",
                 "last_vote_at": "2026-08-02T09:32:20Z"}
    assert "settled_at" not in t


def test_a_zero_timestamp_is_absent_not_1970():
    # The node uses 0 for "not set". Recording 1970-01-01 would be a falsehood
    # with a very confident shape.
    assert chain_timestamps({"created_timestamp": 0, "last_vote_timestamp": 0}) == {}


def test_unparseable_timestamps_are_omitted():
    assert chain_timestamps({"created_timestamp": "soon"}) == {}
    assert chain_timestamps(None) == {}


# ------------------------------------------------------- deploy receipts ----


def test_deploy_receipt_parses_snake_case():
    from pilot.receipt import parse_deploy_receipt

    parsed = parse_deploy_receipt(bradbury(
        tx_data_decoded={"contract_address": "0x" + "ab" * 20},
        recipient="0x" + "cd" * 20,
    ))
    assert parsed.status == "FINALIZED"
    assert parsed.execution == "FINISHED_WITH_RETURN"
    assert parsed.consensus == "AGREE"
    assert parsed.contract_address == "0x" + "ab" * 20


def test_deploy_receipt_still_parses_camel_case():
    from pilot.receipt import parse_deploy_receipt

    parsed = parse_deploy_receipt({
        "statusName": "FINALIZED",
        "txExecutionResultName": "FINISHED_WITH_RETURN",
        "txDataDecoded": {"contractAddress": "0x" + "ab" * 20},
    })
    assert parsed.status == "FINALIZED"
    assert parsed.contract_address == "0x" + "ab" * 20


def test_recipient_is_still_never_an_address_fallback():
    """Unchanged safety rule, re-asserted because snake_case touched this file.

    Bradbury returns `tx_data_decoded: null` for the case-002 deploy while its
    `recipient` happens to be the contract address. Accepting recipient as a
    fallback would make address recovery appear to work by coincidence, and
    would hand verification a wrong address for any deploy where it does not.
    """
    from pilot.receipt import AddressRecoveryError, parse_deploy_receipt, \
        recover_contract_address

    parsed = parse_deploy_receipt(bradbury(
        tx_data_decoded=None,
        recipient="0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc",
    ))
    assert parsed.contract_address is None
    with pytest.raises(AddressRecoveryError):
        recover_contract_address(parsed)
