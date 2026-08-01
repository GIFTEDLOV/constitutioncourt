"""Receipt parsing, address recovery, and every deployment invariant — offline."""

import pytest

from pilot.classify import classify
from pilot.receipt import (
    AddressRecoveryError, ZERO_ADDRESS, parse_deploy_receipt,
    recover_contract_address, same_address,
)
from pilot.verify import (
    DeployInputs, resolve_rule_ids, verify_citations_pinned, verify_deployment,
    verify_responded, verify_ruled,
)

ADDRESS = "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc"
CHALLENGER = "0x1111111111111111111111111111111111111111"
RESPONDENT = "0x2222222222222222222222222222222222222222"
SHA = "f" * 64


# ------------------------------------------------------ address recovery ----


def test_address_comes_from_txdatadecoded():
    parsed = parse_deploy_receipt({
        "statusName": "FINALIZED",
        "txExecutionResultName": "FINISHED_WITH_RETURN",
        "txDataDecoded": {"contractAddress": ADDRESS},
        "recipient": ZERO_ADDRESS,
    })
    assert recover_contract_address(parsed) == ADDRESS


def test_recipient_is_never_used_as_a_fallback():
    # A deploy is submitted with recipient=zeroAddress, so falling back to it
    # would hand verification an address belonging to no contract.
    parsed = parse_deploy_receipt({
        "statusName": "FINALIZED",
        "txExecutionResultName": "FINISHED_WITH_RETURN",
        "recipient": ZERO_ADDRESS,
    })
    with pytest.raises(AddressRecoveryError) as exc:
        recover_contract_address(parsed)
    assert "names no contract address" in str(exc.value)
    assert "zero address" in str(exc.value)


def test_zero_address_named_outright_is_rejected():
    parsed = parse_deploy_receipt({
        "txDataDecoded": {"contractAddress": ZERO_ADDRESS},
    })
    with pytest.raises(AddressRecoveryError, match="Nothing was deployed"):
        recover_contract_address(parsed)


def test_malformed_address_is_rejected():
    parsed = parse_deploy_receipt({"txDataDecoded": {"contractAddress": "0x1234"}})
    with pytest.raises(AddressRecoveryError, match="not a 20-byte address"):
        recover_contract_address(parsed)


def test_unreadable_receipt_yields_no_address():
    assert parse_deploy_receipt(None) is None
    with pytest.raises(AddressRecoveryError):
        recover_contract_address(None)


def test_address_comparison_is_case_insensitive():
    # The contract returns EIP-55 checksummed mixed case; wallets return
    # lowercase. A case-sensitive compare would make a party an observer.
    assert same_address(ADDRESS, ADDRESS.lower())
    assert not same_address(ADDRESS, RESPONDENT)
    assert not same_address(None, None)


# ------------------------------------------------------ deploy invariants ---


def good_state(**over):
    base = {
        "case_title": "MC-2026-021 challenge",
        "challenger": CHALLENGER,
        "respondent": RESPONDENT,
        "status": "OPEN",
        "final_status": "",
        "outcome": "",
        "violated_rule_ids": [],
        "evidence_citations": [],
        "reasoning": "",
        "created_at": "2026-08-01T00:00:00Z",
        "responded_at": "",
        "ruled_at": "",
        "has_response": False,
    }
    base.update(over)
    return base


def good_sources(**over):
    base = {
        "constitution_url": "https://e/c.json",
        "proposal_url": "https://e/p.json",
        "vote_record_url": "https://e/v.json",
        "notice_record_url": "https://e/n.json",
        "response_url": "",
        "schema_version": "constitutioncourt/evidence@1",
    }
    base.update(over)
    return base


INPUTS = DeployInputs(
    signer=CHALLENGER, respondent=RESPONDENT, title="MC-2026-021 challenge",
    constitution_url="https://e/c.json", proposal_url="https://e/p.json",
    vote_record_url="https://e/v.json", notice_record_url="https://e/n.json",
    source_sha256=SHA,
)


def run_verify(**over):
    kw = dict(
        classification=classify({"statusName": "FINALIZED",
                                 "txExecutionResultName": "FINISHED_WITH_RETURN"}),
        address=ADDRESS, address_error=None,
        code="# source", code_error=None, deployed_source_sha=SHA,
        state=good_state(), state_error=None,
        sources=good_sources(), sources_error=None,
        inputs=INPUTS,
    )
    kw.update(over)
    return verify_deployment(**kw)


def test_a_correct_deployment_passes_all_fifteen_checks():
    v = run_verify()
    assert v.ok
    assert len(v.checks) == 15
    assert all(c.ok is True for c in v.checks)


def test_ghost_deployment_is_caught():
    v = run_verify(code=None, code_error="no code at this address")
    assert not v.ok
    assert v.failed.id == "code"


def test_non_finalized_stops_immediately():
    v = run_verify(classification=classify({"statusName": "PENDING"}))
    assert v.failed.id == "finalized"


def test_execution_error_stops_at_execution():
    v = run_verify(classification=classify(
        {"statusName": "FINALIZED", "txExecutionResultName": "FINISHED_WITH_ERROR"}))
    assert v.failed.id == "execution"


def test_absent_address_stops_at_address():
    v = run_verify(address=None, address_error="receipt names no address")
    assert v.failed.id == "address"


def test_source_hash_mismatch_is_caught():
    v = run_verify(deployed_source_sha="e" * 64)
    assert v.failed.id == "source"


def test_wrong_challenger_is_caught():
    v = run_verify(state=good_state(challenger=RESPONDENT))
    assert v.failed.id == "challenger"


def test_wrong_respondent_is_caught():
    v = run_verify(state=good_state(respondent=CHALLENGER))
    assert v.failed.id == "respondent"


def test_wrong_title_is_caught():
    v = run_verify(state=good_state(case_title="something else"))
    assert v.failed.id == "title"


@pytest.mark.parametrize(
    "key", ["constitution_url", "proposal_url", "vote_record_url", "notice_record_url"]
)
def test_each_evidence_url_mismatch_is_caught(key):
    v = run_verify(sources=good_sources(**{key: "https://attacker/x.json"}))
    assert v.failed.id == "urls"


def test_non_open_status_is_caught():
    v = run_verify(state=good_state(status="RULED"))
    assert v.failed.id == "status"


def test_prefilled_response_is_caught():
    v = run_verify(sources=good_sources(response_url="https://e/r.json"))
    assert v.failed.id == "response"


def test_prefilled_ruling_is_caught():
    v = run_verify(state=good_state(outcome="COMPLIANT", final_status="CERTIFIED"))
    assert v.failed.id == "ruling"


def test_missing_created_at_is_caught():
    v = run_verify(state=good_state(created_at=""))
    assert v.failed.id == "created"


def test_checks_after_a_failure_are_not_reached_never_passing():
    v = run_verify(code=None)
    later = [c for c in v.checks if c.id in ("state", "challenger", "status")]
    assert all(c.ok is None for c in later)
    assert all("Not reached" in c.detail for c in later)


def test_unreadable_state_is_caught():
    v = run_verify(state=None, state_error="get_state did not answer")
    assert v.failed.id == "state"


def test_title_is_compared_trimmed_as_the_contract_stores_it():
    padded = DeployInputs(**{**INPUTS.__dict__, "title": "  MC-2026-021 challenge  "})
    assert run_verify(inputs=padded).ok


# ------------------------------------------------------------ lifecycle -----


def test_responded_postcondition():
    v = verify_responded(
        good_state(status="RESPONDED", has_response=True,
                   responded_at="2026-08-01T01:00:00Z"),
        good_sources(response_url="https://e/r.json"),
        "https://e/r.json",
    )
    assert v.ok


def test_responded_postcondition_catches_a_url_mismatch():
    v = verify_responded(
        good_state(status="RESPONDED", has_response=True, responded_at="t"),
        good_sources(response_url="https://e/other.json"),
        "https://e/r.json",
    )
    assert not v.ok


def ruled_state(**over):
    base = {
        "status": "RULED",
        "outcome": "NON_COMPLIANT",
        "final_status": "REJECTED",
        "violated_rule_ids": ["ART-4.3"],
        "ruled_at": "2026-08-01T02:00:00Z",
        "evidence_citations": [{"source": "vote-record", "url": "https://e/v.json",
                                "locator": "$.tally", "quote": "340000"}],
    }
    base.update(over)
    return good_state(**base)


def test_ruled_postcondition_passes_on_the_expected_result():
    v = verify_ruled(ruled_state(), "NON_COMPLIANT", "REJECTED", ["ART-4.3"])
    assert v.ok


def test_ruled_postcondition_catches_a_wrong_outcome():
    v = verify_ruled(ruled_state(outcome="COMPLIANT", final_status="CERTIFIED",
                                 violated_rule_ids=[]),
                     "NON_COMPLIANT", "REJECTED", ["ART-4.3"])
    assert not v.ok


def test_ruled_postcondition_catches_a_broken_mapping():
    v = verify_ruled(ruled_state(final_status="CERTIFIED"),
                     "NON_COMPLIANT", "REJECTED", ["ART-4.3"])
    assert not v.ok
    assert any(c.id == "mapping" and c.ok is False for c in v.checks)


def test_ruled_postcondition_catches_duplicate_rule_ids():
    v = verify_ruled(ruled_state(violated_rule_ids=["ART-4.3", "ART-4.3"]),
                     "NON_COMPLIANT", "REJECTED", ["ART-4.3"])
    assert any(c.id == "rule_ids_unique" and c.ok is False for c in v.checks)


def test_ruled_postcondition_catches_an_unexpected_rule_id():
    v = verify_ruled(ruled_state(violated_rule_ids=["ART-5.4"]),
                     "NON_COMPLIANT", "REJECTED", ["ART-4.3"])
    assert any(c.id == "rule_ids" and c.ok is False for c in v.checks)


def test_ruled_postcondition_requires_ruled_at():
    v = verify_ruled(ruled_state(ruled_at=""), "NON_COMPLIANT", "REJECTED", ["ART-4.3"])
    assert any(c.id == "ruled_at" and c.ok is False for c in v.checks)


def test_citations_must_point_at_pinned_urls():
    ok = verify_citations_pinned(ruled_state(), good_sources())
    assert ok.ok

    bad = verify_citations_pinned(
        ruled_state(evidence_citations=[{"source": "vote-record",
                                         "url": "https://attacker/x.json",
                                         "locator": "$", "quote": "q"}]),
        good_sources())
    assert not bad.ok


def test_rule_ids_resolve_against_the_pinned_constitution():
    constitution = {"rules": [{"id": "ART-4.3"}, {"id": "ART-5.4"}]}
    assert resolve_rule_ids(["ART-4.3"], constitution).ok
    assert not resolve_rule_ids(["ART-9.9"], constitution).ok


def test_unfetchable_constitution_never_invents_rule_text():
    v = resolve_rule_ids(["ART-4.3"], None)
    assert not v.ok
    assert "could not be fetched" in v.checks[0].detail
