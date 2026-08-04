"""Record generation for the finalized Case 002 ruling — offline.

Reconstructs the real 2026-08-04 run from receipts shaped exactly as the
Bradbury RPC returned them, and asserts the record that comes out says what the
chain said.

This is the end-to-end regression for the two defects together. Before the fix
this same input produced a record claiming `succeeded: false`, `phase:
"unknown"`, `consensus_status: "7"`, empty execution and consensus results, and
`submitted_at` set to whenever the operator happened to run the command. That
record was briefly committed, and asserting against it is cheaper than noticing
it again by eye.
"""

import pytest

from pilot.browser_pilot import BrowserPilotInputs, reconstruct
from pilot.fixtures import CASE_002
from pilot.record import PilotRecord

CONTRACT = "0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc"
CHALLENGER = "0x456Ccff0d33463E1834F724C5C5971D6cff6f1dc"
RESPONDENT = "0x79DD8260773C7D5DEA701dfC2D3dD804FF041bf2"
LEADER = "0xC32bD21E1506Ab4954BA1EE8FBD50271Ca61b7DE"

DEPLOY_TX = "0x59d661867b1f4ffb93d8673523ccc36496ea7997727585c0f3d3e7570d7c9400"
RULE_TX = "0x868c28dc9c2686a8a9ccffa7f05e9137e88082da11f968bcfd7e9e6c75460a16"

#: The five validators drawn for the 2026-08-04 ruling, in round order.
VALIDATORS = [
    "0x96298d411a2D622945BEACa6112374583b501d52",
    "0x8E7765267023F88d4155d52F4ce2319aDDf1dc33",
    "0x4f36CB2C58385575fafb443d80E3c290b12DA6aE",
    "0x3f5cAED686336ED9cF3Dede61154B0Cd67Fb9bD7",
    LEADER,
]
VOTES = ["AGREE", "DETERMINISTIC_VIOLATION", "AGREE", "TIMEOUT", "AGREE"]

DEPLOY_RECEIPT = {
    "status": 7,
    "status_name": "FINALIZED",
    "tx_execution_result": 1,
    "tx_execution_result_name": "FINISHED_WITH_RETURN",
    "result": 1,
    "result_name": "AGREE",
    "num_of_rounds": 0,
    "sender": CHALLENGER,
    "recipient": CONTRACT,
    "tx_data_decoded": None,          # Bradbury returns null here
    "created_timestamp": "1785663122",   # 2026-08-02T09:32:02Z
    "last_vote_timestamp": "1785663140",
}

RULE_RECEIPT = {
    "status": 7,
    "status_name": "FINALIZED",
    "tx_execution_result": 1,
    "tx_execution_result_name": "FINISHED_WITH_RETURN",
    "result": 1,
    "result_name": "AGREE",
    "num_of_rounds": 0,
    "sender": CHALLENGER,
    "recipient": CONTRACT,
    "last_leader": LEADER,
    "tx_slot": 3,
    "created_timestamp": "1785856761",   # 2026-08-04T15:19:21Z
    "last_vote_timestamp": "1785856803",
    "last_round": {
        "round": 0,
        "leader_index": 4,
        "votes_committed": 5,
        "votes_revealed": 5,
        "rotations_left": 3,
        "result": 1,
        "round_validators": VALIDATORS,
        "validator_votes_name": VOTES,
    },
}

RULED_STATE = {
    "case_title": CASE_002.title,
    "challenger": CHALLENGER,
    "respondent": RESPONDENT,
    "status": "RULED",
    "outcome": "NON_COMPLIANT",
    "final_status": "REJECTED",
    "violated_rule_ids": ["ART-4.3"],
    "created_at": "2026-08-02T09:32:02Z",
    "ruled_at": "2026-08-04T15:19:21Z",
    "responded_at": "",
    "has_response": False,
    "reasoning": "Two-thirds of votes cast were required and not reached.",
    "evidence_citations": [
        {"source": "proposal", "url": CASE_002.proposal_url,
         "locator": "$.requested_amount", "quote": "250000",
         "supports": "ART-4.3"},
        {"source": "vote-record", "url": CASE_002.vote_record_url,
         "locator": "$.tally", "quote": "340000", "supports": "ART-4.3"},
    ],
}

SOURCES = {
    "constitution_url": CASE_002.constitution_url,
    "proposal_url": CASE_002.proposal_url,
    "vote_record_url": CASE_002.vote_record_url,
    "notice_record_url": CASE_002.notice_record_url,
    "response_url": "",
    "schema_version": "constitutioncourt/evidence@1",
}


class BradburyChain:
    """A chain answering exactly as Bradbury did, and refusing every write."""

    def __init__(self):
        self.receipts = {DEPLOY_TX: DEPLOY_RECEIPT, RULE_TX: RULE_RECEIPT}
        self.calls = []

    def transaction(self, tx_hash):
        self.calls.append(("transaction", tx_hash))
        return self.receipts.get(tx_hash)

    def read(self, address, method):
        self.calls.append(("read", method))
        return RULED_STATE if method == "get_state" else SOURCES

    def contract_code(self, address):
        self.calls.append(("contract_code", address))
        return "# ConstitutionCourt"

    def deploy(self, *a, **k):
        raise AssertionError("reconstruction must never deploy")

    def write(self, *a, **k):
        raise AssertionError("reconstruction must never write")

    def account(self, *a, **k):
        raise AssertionError("reconstruction must never unlock an account")


@pytest.fixture
def built(tmp_path):
    record = PilotRecord.load_or_create("case-002", root=tmp_path)
    chain = BradburyChain()
    results = reconstruct(chain, BrowserPilotInputs(
        case=CASE_002, contract_address=CONTRACT,
        challenger_address=CHALLENGER, respondent_address=RESPONDENT,
        deploy_tx=DEPLOY_TX, rule_tx=RULE_TX,
    ), record)
    return record, results, chain


# ------------------------------------------------------------- the steps ----


def test_both_steps_succeeded(built):
    record, _, _ = built
    for step in ("deploy", "rule"):
        s = record.data["steps"][step]
        assert s["succeeded"] is True, f"{step} must not be recorded as a failure"
        assert s["status"] == "settled"
        assert s["phase"] == "finalized"


def test_the_consensus_status_is_a_name_not_the_number_seven(built):
    record, _, _ = built
    for step in ("deploy", "rule"):
        s = record.data["steps"][step]
        assert s["consensus_status"] == "FINALIZED"
        assert "Unrecognised" not in s["detail"]


def test_execution_and_consensus_results_are_recorded_separately(built):
    record, _, _ = built
    s = record.data["steps"]["rule"]
    assert s["execution_result"] == "FINISHED_WITH_RETURN"
    assert s["consensus_result"] == "AGREE"


def test_the_finalized_hashes_are_recorded(built):
    record, _, _ = built
    assert record.data["steps"]["deploy"]["tx_hash"] == DEPLOY_TX
    assert record.data["steps"]["rule"]["tx_hash"] == RULE_TX


def test_no_step_is_left_unresolved(built):
    record, _, _ = built
    assert record.any_unresolved() is None
    assert record.pending_hash("rule") is None
    assert record.settled_hash("rule") == RULE_TX
    assert record.step_succeeded("rule") is True


# -------------------------------------------------------- validator votes ---


def test_the_validator_vote_summary_is_recorded(built):
    record, _, _ = built
    votes = record.data["steps"]["rule"]["validator_votes"]
    assert votes["roundValidators"] == VALIDATORS
    assert votes["validatorVotes"] == VOTES
    assert votes["votesCommitted"] == "5"
    assert votes["votesRevealed"] == "5"
    assert votes["leader"] == LEADER
    assert votes["consensusResult"] == "AGREE"


def test_the_vote_tally_is_recorded(built):
    record, _, _ = built
    assert record.data["steps"]["rule"]["validator_vote_tally"] == {
        "AGREE": 3, "DETERMINISTIC_VIOLATION": 1, "TIMEOUT": 1,
    }


# ------------------------------------------------------------- timestamps ---


def test_timestamps_come_from_the_chain_not_the_clock(built):
    """The deploy happened on 2026-08-02 and the ruling on 2026-08-04.

    A record reconstructed later must say so. Before the fix both steps were
    stamped with the moment `pilot record` ran, which dated a two-day-old
    deploy to the afternoon someone typed a command.
    """
    record, _, _ = built
    deploy = record.data["steps"]["deploy"]
    rule = record.data["steps"]["rule"]

    assert deploy["submitted_at"] == "2026-08-02T09:32:02Z"
    assert rule["submitted_at"] == "2026-08-04T15:19:21Z"
    assert rule["last_vote_at"] == "2026-08-04T15:20:03Z"


def test_a_reconstruction_stamps_no_step_with_the_current_clock(built):
    """No wall-clock time may appear as a per-step fact.

    `settled_at` is the harness observing a live run settle. A reconstruction
    observes nothing — it reads history — so it records the chain's last-vote
    timestamp and leaves `settled_at` off entirely.
    """
    record, _, _ = built
    for step in ("deploy", "rule"):
        assert "settled_at" not in record.data["steps"][step]
        assert record.data["steps"][step]["last_vote_at"].startswith("2026-08-0")


def test_the_ruling_submission_matches_the_contracts_ruled_at(built):
    # The contract sets ruled_at at execution; the node reports created_timestamp
    # for the same transaction. They should agree, and their agreeing is part of
    # what makes the record checkable.
    record, _, _ = built
    assert record.data["steps"]["rule"]["submitted_at"] == RULED_STATE["ruled_at"]


# ------------------------------------------------------------ final state ---


def test_the_final_state_snapshot_carries_the_verdict(built):
    record, _, _ = built
    snap = record.data["state_snapshots"]["final"]["get_state"]
    assert snap["status"] == "RULED"
    assert snap["outcome"] == "NON_COMPLIANT"
    assert snap["final_status"] == "REJECTED"
    assert snap["violated_rule_ids"] == ["ART-4.3"]
    assert snap["ruled_at"] == "2026-08-04T15:19:21Z"


def test_the_evidence_urls_and_hashes_are_recorded(built):
    record, _, _ = built
    evidence = {d["role"]: d for d in record.data["evidence"]}
    assert set(evidence) == {"constitution", "proposal", "vote-record",
                             "notice-record"}
    for doc in evidence.values():
        assert doc["url"].startswith("https://raw.githubusercontent.com/")
        assert len(doc["sha256"]) == 64
        assert doc["bytes"] > 0


def test_the_evidence_urls_are_commit_pinned(built):
    record, _, _ = built
    for doc in record.data["evidence"]:
        ref = doc["url"].split("/constitutioncourt/")[1].split("/")[0]
        assert len(ref) == 40 and all(c in "0123456789abcdef" for c in ref)


def test_the_contract_address_is_recorded(built):
    record, _, _ = built
    assert record.data["contract"]["address"] == CONTRACT
    assert len(record.data["contract"]["source_sha256"]) == 64


def test_the_ruling_verification_passed(built):
    _, results, _ = built
    assert results["rule"].ok, results["rule"].failed


# ------------------------------------------------------------- read-only ----


def test_reconstruction_stayed_read_only(built):
    _, _, chain = built
    assert {c[0] for c in chain.calls} <= {"transaction", "read", "contract_code"}


def test_the_record_holds_no_credential(built):
    record, _, _ = built
    blob = record.path.read_text(encoding="utf-8").lower()
    assert "private" not in blob
    assert "password" not in blob
    assert "mnemonic" not in blob
