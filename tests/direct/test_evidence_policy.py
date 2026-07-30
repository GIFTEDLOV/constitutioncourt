"""Fetch-failure classification, and the line between a failure and a verdict.

The distinction that matters most in this file: **no error prefix ever becomes an
outcome.** `INSUFFICIENT_EVIDENCE` is a ruling about documents that were
successfully read. A 503 is a fetch failure. Mapping a 503 to
`INSUFFICIENT_EVIDENCE` would convert a retryable blip into a permanent
`UNRESOLVED` verdict on a case that has a real answer — and because a 503 is not
reproducible across validators, it would also be a consensus hazard.

Every failure here leaves the case exactly where it was.
"""

import json

import pytest

from conftest import (
    CASE_INSUFFICIENT,
    CASE_TWO_THIRDS,
    doc_url,
    load_doc,
    mock_case,
    mock_case_ruling,
    mock_document,
    mock_http_status,
    mock_ruling,
    reset_mocks,
)

SOURCES = ("constitution", "proposal", "vote-record", "notice-record")


def _serve_all_but(direct_vm, case, broken_source, *, status=None, body=None, doc=None):
    """Serve every document for a case, with one of them broken."""
    reset_mocks(direct_vm)
    for source in SOURCES:
        if source == broken_source:
            continue
        mock_document(direct_vm, case, source)
    if status is not None:
        mock_http_status(direct_vm, case, broken_source, status, body or "{}")
    else:
        mock_document(direct_vm, case, broken_source, doc=doc)
    mock_ruling(direct_vm, "COMPLIANT")


def _expect(direct_vm, contract, sender, fragment):
    direct_vm.sender = sender
    with direct_vm.expect_revert(fragment):
        contract.rule()


def _assert_unchanged_and_open(contract):
    """A failed fetch is not a verdict."""
    state = contract.get_state()
    assert state["status"] == "OPEN"
    assert state["outcome"] == ""
    assert state["final_status"] == ""
    assert state["violated_rule_ids"] == []
    assert state["evidence_citations"] == []
    assert state["reasoning"] == ""
    assert state["ruled_at"] == ""


# --------------------------------------------------------- [TRANSIENT] --------


@pytest.mark.parametrize("status", [500, 502, 503, 504])
def test_server_errors_are_transient(direct_vm, open_case, direct_alice, status):
    """A validator that saw a 5xx cannot know whether the others saw it too, so
    it must disagree rather than record an outcome."""
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, "vote-record", status=status)
    _expect(direct_vm, open_case, direct_alice, "[TRANSIENT]")


@pytest.mark.parametrize("status", [408, 425, 429])
def test_timeout_and_rate_limit_statuses_are_transient(
    direct_vm, open_case, direct_alice, status
):
    """408 request timeout, 425 too early, 429 rate limited — all retryable, and
    429 in particular is what a popular case looks like, not a broken one."""
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, "constitution", status=status)
    _expect(direct_vm, open_case, direct_alice, "[TRANSIENT]")


def test_a_network_fault_is_transient(direct_vm, open_case, direct_alice):
    """No mock for the URL stands in for a DNS failure or a connection timeout:
    the fetch raises rather than returning a status."""
    reset_mocks(direct_vm)
    for source in ("constitution", "proposal", "vote-record"):
        mock_document(direct_vm, CASE_TWO_THIRDS, source)
    mock_ruling(direct_vm, "COMPLIANT")
    _expect(direct_vm, open_case, direct_alice, "[TRANSIENT] fetch failed")


def test_a_transient_failure_leaves_the_case_rulable(direct_vm, open_case, direct_alice):
    """The whole point of the classification: come back and try again."""
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, "vote-record", status=503)
    _expect(direct_vm, open_case, direct_alice, "[TRANSIENT]")
    _assert_unchanged_and_open(open_case)

    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        # The 503 mock still wins for the vote record, being registered first.
        open_case.rule()

    reset_mocks(direct_vm)
    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_alice
    open_case.rule()
    assert open_case.get_state()["final_status"] == "REJECTED"


# ---------------------------------------------------- [INVALID_EVIDENCE] ------


@pytest.mark.parametrize("status", [400, 401, 403, 404, 410, 451])
def test_client_errors_are_invalid_evidence(direct_vm, open_case, direct_alice, status):
    """These mean the pinned URL does not serve the pinned document — not that
    the network hiccuped. Retrying will not help."""
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, "proposal", status=status)
    _expect(direct_vm, open_case, direct_alice, "[INVALID_EVIDENCE]")


def test_unparseable_json_is_invalid_evidence(direct_vm, open_case, direct_alice):
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, "vote-record", doc="<html>not json</html>")
    _expect(direct_vm, open_case, direct_alice, "not valid JSON")


def test_a_json_array_document_is_invalid_evidence(direct_vm, open_case, direct_alice):
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, "vote-record", doc="[1, 2, 3]")
    _expect(direct_vm, open_case, direct_alice, "not a JSON object")


def test_an_empty_body_is_invalid_evidence(direct_vm, open_case, direct_alice):
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, "notice-record", doc="")
    _expect(direct_vm, open_case, direct_alice, "[INVALID_EVIDENCE]")


@pytest.mark.parametrize("source", SOURCES)
def test_a_wrong_schema_literal_is_invalid_evidence(
    direct_vm, open_case, direct_alice, source
):
    """A document that fetches and parses but carries the wrong `schema` is not
    the document that was pinned, and adjudicating it would silently answer a
    different question."""
    doc = load_doc(CASE_TWO_THIRDS, source)
    doc["schema"] = "something/else@9"
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, source, doc=doc)
    _expect(direct_vm, open_case, direct_alice, "expected")


@pytest.mark.parametrize("source", SOURCES)
def test_a_missing_schema_literal_is_invalid_evidence(
    direct_vm, open_case, direct_alice, source
):
    doc = load_doc(CASE_TWO_THIRDS, source)
    doc.pop("schema", None)
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, source, doc=doc)
    _expect(direct_vm, open_case, direct_alice, "[INVALID_EVIDENCE]")


def test_a_proposal_served_as_a_vote_record_is_rejected(
    direct_vm, open_case, direct_alice
):
    """Swapping two real documents is the subtle version of the attack: both are
    valid, so only the schema literal catches it."""
    _serve_all_but(
        direct_vm, CASE_TWO_THIRDS, "vote-record",
        doc=load_doc(CASE_TWO_THIRDS, "proposal"),
    )
    _expect(direct_vm, open_case, direct_alice, "[INVALID_EVIDENCE]")


def test_a_constitution_with_no_rules_is_invalid_evidence(
    direct_vm, open_case, direct_alice
):
    """With no rule ids there is nothing a ruling could cite, so every finding
    would be unverifiable."""
    doc = load_doc(CASE_TWO_THIRDS, "constitution")
    doc["rules"] = []
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, "constitution", doc=doc)
    _expect(direct_vm, open_case, direct_alice, "declares no rule ids")


def test_a_broken_response_document_blocks_the_ruling(
    direct_vm, deploy_case, direct_alice, direct_bob
):
    """The respondent's own document gets the same treatment as the challenger's.
    A response that cannot be read is not silently skipped — it was pinned, so it
    is part of the record every validator must be able to fetch."""
    from conftest import CASE_COMPLIANT

    contract = deploy_case(CASE_COMPLIANT)
    direct_vm.sender = direct_bob
    contract.submit_response(doc_url(CASE_COMPLIANT, "response"))

    reset_mocks(direct_vm)
    mock_case(direct_vm, CASE_COMPLIANT, include_response=False)
    mock_http_status(direct_vm, CASE_COMPLIANT, "response", 404)
    mock_ruling(direct_vm, "COMPLIANT")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("[INVALID_EVIDENCE]"):
        contract.rule()
    assert contract.get_state()["status"] == "RESPONDED"


# ------------------------- no error class ever becomes an outcome -------------


@pytest.mark.parametrize(
    "status,prefix",
    [(503, "[TRANSIENT]"), (404, "[INVALID_EVIDENCE]")],
)
def test_a_fetch_failure_never_becomes_unresolved(
    direct_vm, open_case, direct_alice, status, prefix
):
    """The case that motivated the taxonomy: a 503 is not
    INSUFFICIENT_EVIDENCE, and must not become a permanent UNRESOLVED verdict."""
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, "vote-record", status=status)
    _expect(direct_vm, open_case, direct_alice, prefix)

    state = open_case.get_state()
    assert state["final_status"] != "UNRESOLVED"
    assert state["outcome"] != "INSUFFICIENT_EVIDENCE"
    _assert_unchanged_and_open(open_case)


def test_insufficient_evidence_is_a_real_verdict_not_a_failure(
    direct_vm, deploy_case, direct_alice
):
    """The mirror image: case 004's documents all fetch and parse cleanly. The
    tally is simply absent, and that is a finding, not an error."""
    contract = deploy_case(CASE_INSUFFICIENT)
    mock_case_ruling(direct_vm, CASE_INSUFFICIENT)
    direct_vm.sender = direct_alice
    contract.rule()

    state = contract.get_state()
    assert state["outcome"] == "INSUFFICIENT_EVIDENCE"
    assert state["final_status"] == "UNRESOLVED"
    assert state["status"] == "RULED"
    assert state["reasoning"] != ""


def test_an_error_message_is_never_stored_as_reasoning(
    direct_vm, open_case, direct_alice
):
    _serve_all_but(direct_vm, CASE_TWO_THIRDS, "vote-record", status=503)
    _expect(direct_vm, open_case, direct_alice, "[TRANSIENT]")
    state = open_case.get_state()
    assert "[TRANSIENT]" not in state["reasoning"]
    assert state["reasoning"] == ""


@pytest.mark.parametrize("prefix", ["[TRANSIENT]", "[INVALID_EVIDENCE]", "[LLM_ERROR]"])
def test_no_error_prefix_is_ever_a_valid_outcome(
    direct_vm, open_case, direct_alice, prefix
):
    """Belt and braces: even if a model returned an error prefix as its outcome,
    the vocabulary check rejects it."""
    reset_mocks(direct_vm)
    mock_case(direct_vm, CASE_TWO_THIRDS)
    from conftest import mock_raw_ruling

    mock_raw_ruling(
        direct_vm,
        json.dumps(
            {
                "outcome": prefix,
                "violated_rule_ids": [],
                "evidence_citations": [],
                "reasoning": "something went wrong",
            }
        ),
    )
    _expect(direct_vm, open_case, direct_alice, "invalid outcome")
    _assert_unchanged_and_open(open_case)
