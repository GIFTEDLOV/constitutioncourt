"""Construction: parties, initial state, and the stored evidence URLs."""

from conftest import CASE_TWO_THIRDS, addr_hex, case_urls


def test_new_case_starts_open(open_case):
    state = open_case.get_state()
    assert state["status"] == "OPEN"


def test_ruling_fields_are_empty_before_a_ruling(open_case):
    state = open_case.get_state()
    assert state["outcome"] == ""
    assert state["final_status"] == ""
    assert state["reasoning"] == ""
    assert state["violated_rule_ids"] == []
    assert state["evidence_citations"] == []
    assert state["ruled_at"] == ""


def test_challenger_is_the_deploying_sender(open_case, direct_alice):
    assert open_case.get_state()["challenger"].lower() == addr_hex(direct_alice)


def test_respondent_is_stored_from_the_constructor(open_case, direct_bob):
    assert open_case.get_state()["respondent"].lower() == addr_hex(direct_bob)


def test_case_title_is_stored(deploy_case):
    contract = deploy_case(CASE_TWO_THIRDS, case_title="Meridian MC-2026-021")
    assert contract.get_state()["case_title"] == "Meridian MC-2026-021"


def test_all_four_evidence_urls_are_pinned(open_case):
    sources = open_case.get_evidence_sources()
    expected = case_urls(CASE_TWO_THIRDS)
    assert sources["constitution_url"] == expected["constitution_url"]
    assert sources["proposal_url"] == expected["proposal_url"]
    assert sources["vote_record_url"] == expected["vote_record_url"]
    assert sources["notice_record_url"] == expected["notice_record_url"]


def test_response_url_is_empty_until_submitted(open_case):
    assert open_case.get_evidence_sources()["response_url"] == ""
    assert open_case.get_state()["has_response"] is False


def test_created_at_is_recorded(open_case):
    created = open_case.get_state()["created_at"]
    # ISO-8601 UTC with an explicit Z — never a local time or an offset.
    assert created.endswith("Z")
    assert len(created) == len("2026-07-27T00:00:00Z")


def test_responded_at_is_empty_before_a_response(open_case):
    assert open_case.get_state()["responded_at"] == ""
