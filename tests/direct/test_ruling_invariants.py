"""Ruling invariants and malformed validator output.

These checks live in contract code rather than in the prompt, and that placement
is the whole point: a prompt injection can produce well-formed output, but it
cannot satisfy a check made outside the model's reach. Every failure here raises
`[LLM_ERROR]`, the validator disagrees, and nothing is stored — a malformed
ruling is never recorded as a verdict.
"""

import json

import pytest

from conftest import (
    CASE_TWO_THIRDS,
    serve_payload,
    serve_ruling,
)

REAL_RULE = "ART-4.3"
OTHER_REAL_RULE = "ART-5.4"

CITATION = {
    "source": "vote-record",
    "locator": "$.tally",
    "quote": "for: 340000",
    "supports": REAL_RULE,
}


def _expect_llm_error(direct_vm, contract, sender, fragment, payload=None, **ruling):
    if payload is None:
        serve_ruling(direct_vm, CASE_TWO_THIRDS, **ruling)
    else:
        serve_payload(direct_vm, CASE_TWO_THIRDS, payload)
    direct_vm.sender = sender
    with direct_vm.expect_revert(fragment):
        contract.rule()


# ------------------------------------ outcome ↔ violated_rule_ids coupling ----


def test_non_compliant_with_no_rule_ids_is_rejected(direct_vm, open_case, direct_alice):
    """A violation nobody can name is unactionable."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "cites no violated rule",
        outcome="NON_COMPLIANT", rule_ids=[],
    )


def test_compliant_that_cites_violations_is_rejected(direct_vm, open_case, direct_alice):
    """Self-contradictory: nothing was violated, yet here is a violation."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "must not cite violated rules",
        outcome="COMPLIANT", rule_ids=[REAL_RULE],
    )


def test_insufficient_evidence_that_cites_violations_is_rejected(
    direct_vm, open_case, direct_alice
):
    """If the evidence is too thin to rule, it is too thin to establish a
    violation."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "must not cite violated rules",
        outcome="INSUFFICIENT_EVIDENCE", rule_ids=[REAL_RULE],
    )


def test_non_compliant_with_a_real_rule_is_accepted(direct_vm, open_case, direct_alice):
    serve_ruling(direct_vm, CASE_TWO_THIRDS, "NON_COMPLIANT", rule_ids=[REAL_RULE])
    direct_vm.sender = direct_alice
    open_case.rule()
    assert open_case.get_state()["violated_rule_ids"] == [REAL_RULE]


# ------------------------------------------------- rule ids must resolve ------


def test_a_hallucinated_rule_id_is_rejected(direct_vm, open_case, direct_alice):
    """ART-9.9 is not in the constitution. Storing it would attribute a finding
    to a rule that does not exist, and no reader could check it."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "absent from the constitution",
        outcome="NON_COMPLIANT", rule_ids=["ART-9.9"],
    )


def test_one_real_and_one_invented_rule_id_is_rejected(direct_vm, open_case, direct_alice):
    """A partly-hallucinated citation list fails whole. Storing the real half
    would silently launder the invented half."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "absent from the constitution",
        outcome="NON_COMPLIANT", rule_ids=[REAL_RULE, "ART-9.9"],
    )


def test_a_rejected_ruling_leaves_the_case_open(direct_vm, open_case, direct_alice):
    """No error class ever becomes a verdict."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "absent from the constitution",
        outcome="NON_COMPLIANT", rule_ids=["ART-9.9"],
    )
    state = open_case.get_state()
    assert state["status"] == "OPEN"
    assert state["outcome"] == ""
    assert state["final_status"] == ""
    assert state["violated_rule_ids"] == []
    assert state["ruled_at"] == ""


def test_rule_ids_are_stored_sorted_and_deduplicated(direct_vm, open_case, direct_alice):
    """Order and multiplicity are formatting artifacts. Normalizing on the way in
    is what makes the consensus comparison a set comparison."""
    serve_ruling(
        direct_vm, CASE_TWO_THIRDS, "NON_COMPLIANT",
        rule_ids=[OTHER_REAL_RULE, REAL_RULE, REAL_RULE],
    )
    direct_vm.sender = direct_alice
    open_case.rule()
    assert open_case.get_state()["violated_rule_ids"] == [REAL_RULE, OTHER_REAL_RULE]


# ---------------------------------------------------- citations required ------


def test_non_compliant_with_no_citations_is_rejected(direct_vm, open_case, direct_alice):
    """A ruling a reader cannot check against its basis is a bare verdict badge."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "cites no evidence",
        outcome="NON_COMPLIANT", rule_ids=[REAL_RULE], citations=[],
    )


def test_a_citation_to_an_unpinned_url_is_dropped(direct_vm, open_case, direct_alice):
    """Citations may only point at documents that were actually pinned; a source
    label nobody agreed to look at is discarded rather than stored."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "cites no evidence",
        outcome="NON_COMPLIANT",
        rule_ids=[REAL_RULE],
        citations=[{"source": "twitter", "locator": "$", "quote": "trust me"}],
    )


def test_a_response_citation_is_dropped_when_no_response_was_pinned(
    direct_vm, open_case, direct_alice
):
    """Case 002 has no response. A citation to one cannot be honoured."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "cites no evidence",
        outcome="NON_COMPLIANT",
        rule_ids=[REAL_RULE],
        citations=[{"source": "response", "locator": "$.statement", "quote": "we complied"}],
    )


def test_a_valid_citation_survives_alongside_an_invalid_one(
    direct_vm, open_case, direct_alice
):
    serve_ruling(
        direct_vm, CASE_TWO_THIRDS, "NON_COMPLIANT",
        rule_ids=[REAL_RULE],
        citations=[
            {"source": "elsewhere", "locator": "$", "quote": "dropped"},
            CITATION,
        ],
    )
    direct_vm.sender = direct_alice
    open_case.rule()

    citations = open_case.get_state()["evidence_citations"]
    assert len(citations) == 1
    assert citations[0]["source"] == "vote-record"


# --------------------------------------------------------- reasoning ----------


def test_an_empty_reasoning_is_rejected(direct_vm, open_case, direct_alice):
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "empty reasoning",
        outcome="COMPLIANT", reasoning="",
    )


def test_a_whitespace_only_reasoning_is_rejected(direct_vm, open_case, direct_alice):
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "empty reasoning",
        outcome="COMPLIANT", reasoning="   \n  ",
    )


def test_an_overlong_reasoning_is_truncated_not_rejected(
    direct_vm, open_case, direct_alice
):
    """Verbosity is not a consensus problem — the prose is explanatory. Clamping
    keeps storage bounded without discarding a valid decision."""
    serve_ruling(direct_vm, CASE_TWO_THIRDS, "COMPLIANT", reasoning="x" * 9000)
    direct_vm.sender = direct_alice
    open_case.rule()
    assert len(open_case.get_state()["reasoning"]) == 4000


# ----------------------------------------------- malformed model output -------


def test_prose_instead_of_json_is_rejected(direct_vm, open_case, direct_alice):
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "no JSON object",
        payload="I would say this proposal looks broadly compliant.",
    )


def test_unparseable_json_is_rejected(direct_vm, open_case, direct_alice):
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "not valid JSON",
        payload='here you go {"outcome": COMPLIANT, oops} thanks',
    )


def test_a_json_array_is_rejected(direct_vm, open_case, direct_alice):
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "non-dict ruling",
        payload='["COMPLIANT"]',
    )


def test_json_wrapped_in_prose_and_fences_is_recovered(
    direct_vm, open_case, direct_alice
):
    """Models add code fences even when told not to. Recovering the outermost
    object handles that without accepting arbitrary junk."""
    body = json.dumps(
        {
            "outcome": "COMPLIANT",
            "violated_rule_ids": [],
            "evidence_citations": [],
            "reasoning": "No violation found on this record.",
        }
    )
    serve_payload(direct_vm, CASE_TWO_THIRDS, f"Sure! ```json\n{body}\n``` Hope that helps.")
    direct_vm.sender = direct_alice
    open_case.rule()
    assert open_case.get_state()["final_status"] == "CERTIFIED"


def test_a_missing_outcome_is_rejected(direct_vm, open_case, direct_alice):
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "invalid outcome",
        payload=json.dumps({"violated_rule_ids": [], "reasoning": "hmm"}),
    )


@pytest.mark.parametrize(
    "bad",
    ["MAYBE", "compliant-ish", "PASSED", "REJECTED", "CERTIFIED", ""],
)
def test_an_out_of_vocabulary_outcome_is_rejected(direct_vm, open_case, direct_alice, bad):
    """`CERTIFIED` and `REJECTED` are final statuses, not outcomes. A model
    returning one has confused the two vocabularies."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "invalid outcome",
        payload=json.dumps(
            {
                "outcome": bad,
                "violated_rule_ids": [],
                "evidence_citations": [],
                "reasoning": "ok",
            }
        ),
    )


@pytest.mark.parametrize("spelling", ["compliant", "Compliant", " COMPLIANT "])
def test_outcome_case_and_padding_are_normalized(
    direct_vm, deploy_case, direct_alice, spelling
):
    """Casing is a formatting artifact, not a different decision."""
    contract = deploy_case(CASE_TWO_THIRDS)
    serve_payload(
        direct_vm, CASE_TWO_THIRDS,
        json.dumps(
            {
                "outcome": spelling,
                "violated_rule_ids": [],
                "evidence_citations": [],
                "reasoning": "No violation found on this record.",
            }
        ),
    )
    direct_vm.sender = direct_alice
    contract.rule()
    assert contract.get_state()["outcome"] == "COMPLIANT"


def test_a_hyphenated_outcome_is_normalized(direct_vm, deploy_case, direct_alice):
    contract = deploy_case(CASE_TWO_THIRDS)
    serve_payload(
        direct_vm, CASE_TWO_THIRDS,
        json.dumps(
            {
                "outcome": "non-compliant",
                "violated_rule_ids": [REAL_RULE],
                "evidence_citations": [CITATION],
                "reasoning": "ART-4.3 was not met.",
            }
        ),
    )
    direct_vm.sender = direct_alice
    contract.rule()
    assert contract.get_state()["outcome"] == "NON_COMPLIANT"


def test_a_rule_id_list_that_is_a_bare_string_is_accepted(
    direct_vm, deploy_case, direct_alice
):
    """A single id emitted as a string rather than a one-element list is a
    formatting slip, not a different finding."""
    contract = deploy_case(CASE_TWO_THIRDS)
    serve_payload(
        direct_vm, CASE_TWO_THIRDS,
        json.dumps(
            {
                "outcome": "NON_COMPLIANT",
                "violated_rule_ids": REAL_RULE,
                "evidence_citations": [CITATION],
                "reasoning": "ART-4.3 was not met.",
            }
        ),
    )
    direct_vm.sender = direct_alice
    contract.rule()
    assert contract.get_state()["violated_rule_ids"] == [REAL_RULE]


def test_a_non_list_rule_ids_field_is_rejected(direct_vm, open_case, direct_alice):
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "violated_rule_ids is not a list",
        payload=json.dumps(
            {
                "outcome": "NON_COMPLIANT",
                "violated_rule_ids": {"first": REAL_RULE},
                "evidence_citations": [CITATION],
                "reasoning": "ART-4.3 was not met.",
            }
        ),
    )


def test_a_non_list_citations_field_is_rejected(direct_vm, open_case, direct_alice):
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "evidence_citations is not a list",
        payload=json.dumps(
            {
                "outcome": "COMPLIANT",
                "violated_rule_ids": [],
                "evidence_citations": "none",
                "reasoning": "No violation found.",
            }
        ),
    )


def test_an_absurdly_long_rule_id_list_is_rejected(direct_vm, open_case, direct_alice):
    """Unbounded storage growth driven by model output."""
    _expect_llm_error(
        direct_vm, open_case, direct_alice,
        "exceeds",
        payload=json.dumps(
            {
                "outcome": "NON_COMPLIANT",
                "violated_rule_ids": [REAL_RULE] * 40,
                "evidence_citations": [CITATION],
                "reasoning": "ART-4.3 was not met.",
            }
        ),
    )
