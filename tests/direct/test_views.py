"""`get_state` and `get_evidence_sources` in every lifecycle state.

Both are pure reads and callable in any state. They are split because the
frontend polls state frequently and reads the URL set once.

The empty-string nulls matter more than they look. There is no `Optional` in
GenLayer storage, so `""` is the null for every optional string — and it is
unambiguous here only because no valid URL, status or timestamp is ever empty. A
reader must be able to tell "not yet set" from "set to nothing", and these tests
pin that down at each stage.
"""

import json

import pytest

from conftest import (
    CASE_COMPLIANT,
    addr_hex,
    doc_url,
    mock_case_ruling,
)

STATE_KEYS = {
    "case_title",
    "challenger",
    "respondent",
    "status",
    "final_status",
    "outcome",
    "violated_rule_ids",
    "evidence_citations",
    "reasoning",
    "created_at",
    "responded_at",
    "ruled_at",
    "has_response",
}

SOURCE_KEYS = {
    "constitution_url",
    "proposal_url",
    "vote_record_url",
    "notice_record_url",
    "response_url",
    "schema_version",
}

RESPONSE_URL = doc_url(CASE_COMPLIANT, "response")


@pytest.fixture
def in_state(direct_vm, deploy_case, from_scratch, direct_alice, direct_bob):
    """A contract parked in a requested lifecycle state.

    One deployment, rolled back between calls, so a single test may ask for
    several states in any order. Case 001 throughout, because it is the fixture
    that has a response document — the same instance can therefore reach all
    three states.

    RULED is reached directly from OPEN, not via RESPONDED, so the response
    fields stay empty and the null-handling tests below have something to check.
    """
    contract = deploy_case(CASE_COMPLIANT)
    reset = from_scratch()

    def _in_state(status):
        reset()
        if status == "OPEN":
            return contract
        if status == "RESPONDED":
            direct_vm.sender = direct_bob
            contract.submit_response(RESPONSE_URL)
            return contract
        mock_case_ruling(direct_vm, CASE_COMPLIANT)
        direct_vm.sender = direct_alice
        contract.rule()
        return contract

    return _in_state


ALL_STATES = ("OPEN", "RESPONDED", "RULED")


# ------------------------------------------------------------ shape -----------


@pytest.mark.parametrize("status", ALL_STATES)
def test_get_state_has_the_same_keys_in_every_state(in_state, status):
    """A caller must not have to branch on status to know which keys exist."""
    assert set(in_state(status).get_state()) == STATE_KEYS


@pytest.mark.parametrize("status", ALL_STATES)
def test_get_evidence_sources_has_the_same_keys_in_every_state(in_state, status):
    assert set(in_state(status).get_evidence_sources()) == SOURCE_KEYS


@pytest.mark.parametrize("status", ALL_STATES)
def test_get_state_reports_the_state_it_is_in(in_state, status):
    assert in_state(status).get_state()["status"] == status


@pytest.mark.parametrize("status", ALL_STATES)
def test_views_do_not_mutate(in_state, status):
    """Pure reads: calling twice returns the same thing, and calling one does not
    disturb the other."""
    contract = in_state(status)
    first = contract.get_state()
    contract.get_evidence_sources()
    assert contract.get_state() == first


def test_the_schema_version_is_reported(open_case):
    """So a frontend can tell which field set it is looking at."""
    assert open_case.get_evidence_sources()["schema_version"] == (
        "constitutioncourt/evidence@1"
    )


# ------------------------------------------------- empty-string nulls ---------


def test_open_state_nulls(in_state):
    state = in_state("OPEN").get_state()
    assert state["final_status"] == ""
    assert state["outcome"] == ""
    assert state["reasoning"] == ""
    assert state["responded_at"] == ""
    assert state["ruled_at"] == ""
    assert state["violated_rule_ids"] == []
    assert state["evidence_citations"] == []
    assert state["has_response"] is False
    assert in_state("OPEN").get_evidence_sources()["response_url"] == ""


def test_responded_state_nulls(in_state):
    """Responding sets the response fields and nothing else."""
    contract = in_state("RESPONDED")
    state = contract.get_state()
    assert state["responded_at"] != ""
    assert state["has_response"] is True
    assert contract.get_evidence_sources()["response_url"] == RESPONSE_URL
    # Still unruled.
    assert state["final_status"] == ""
    assert state["outcome"] == ""
    assert state["reasoning"] == ""
    assert state["ruled_at"] == ""


def test_ruled_state_has_no_remaining_nulls_on_the_ruling(in_state):
    state = in_state("RULED").get_state()
    assert state["outcome"] != ""
    assert state["final_status"] != ""
    assert state["reasoning"] != ""
    assert state["ruled_at"] != ""


def test_a_case_ruled_from_open_keeps_the_response_nulls(in_state):
    """RULED does not imply a response existed. Both response fields stay empty,
    which is how a reader tells silence from an answer."""
    contract = in_state("RULED")
    assert contract.get_state()["responded_at"] == ""
    assert contract.get_state()["has_response"] is False
    assert contract.get_evidence_sources()["response_url"] == ""


# ----------------------------------------------------------- field types ------


def test_addresses_are_reported_as_hex(open_case, direct_alice, direct_bob):
    state = open_case.get_state()
    assert state["challenger"].lower() == addr_hex(direct_alice)
    assert state["respondent"].lower() == addr_hex(direct_bob)
    assert state["challenger"].startswith("0x")


def test_citations_are_returned_as_objects_not_json_strings(in_state):
    """They are stored JSON-encoded in a DynArray[str] because storage has no
    nested dataclass, but a caller should never have to know that."""
    citations = in_state("RULED").get_state()["evidence_citations"]
    assert citations
    for citation in citations:
        assert isinstance(citation, dict)
        assert set(citation) >= {"source", "url", "locator", "quote"}


def test_the_whole_state_is_json_serializable(in_state):
    """The frontend reads this over the wire; a value that will not serialize is
    a bug the contract should not be able to ship."""
    for status in ALL_STATES:
        json.dumps(in_state(status).get_state())


def test_rule_ids_are_returned_as_a_plain_list(in_state):
    ids = in_state("RULED").get_state()["violated_rule_ids"]
    assert isinstance(ids, list)
    assert all(isinstance(rid, str) for rid in ids)


# --------------------------------------------- the two views stay consistent ---


def test_has_response_agrees_with_the_response_url(in_state):
    for status in ALL_STATES:
        contract = in_state(status)
        state = contract.get_state()
        sources = contract.get_evidence_sources()
        assert state["has_response"] is bool(sources["response_url"])


def test_get_state_does_not_leak_the_urls(open_case):
    """The split is deliberate: state is polled, URLs are not. If URLs appeared in
    both, the two views could drift."""
    state_values = [v for v in open_case.get_state().values() if isinstance(v, str)]
    assert not any(v.startswith("https://") for v in state_values)
