"""The validator agreement rule, and what happens when validators disagree.

`rule()` uses `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`. The validator
**re-fetches every evidence URL and independently derives its own complete
ruling**, then compares decision fields. It never inspects the leader's answer
for shape and calls that verification — a schema check on someone else's answer
proves only that they formatted it correctly.

Agreement is on `outcome` and the **set** of `violated_rule_ids`, and on nothing
else. `reasoning` and `evidence_citations` are explanatory; requiring agreement
on free prose would fail consensus every time for no gain in correctness.

Direct mode runs only the leader, then hands the captured validator back through
``direct_vm.run_validator(...)``. Mocks still apply, so swapping them between the
call and the check is how a validator that saw different data is simulated.
"""

from conftest import (
    CASE_COMPLIANT,
    CASE_TWO_THIRDS,
    doc_url,
    mock_case,
    mock_document,
    mock_http_status,
    mock_ruling,
    reset_mocks,
    serve_ruling,
)

REAL_RULE = "ART-4.3"
OTHER_REAL_RULE = "ART-5.4"

CITATION = {
    "source": "vote-record",
    "url": doc_url(CASE_TWO_THIRDS, "vote-record"),
    "locator": "$.tally",
    "quote": "for: 340000",
    "supports": REAL_RULE,
}


def _ruled_non_compliant(direct_vm, deploy_case, direct_alice):
    """A case ruled NON_COMPLIANT / [ART-4.3], with mocks left in place.

    The validator re-derives from those same mocks, so it agrees unless the test
    changes either the mocks or the leader's answer.
    """
    contract = deploy_case(CASE_TWO_THIRDS)
    serve_ruling(direct_vm, CASE_TWO_THIRDS, "NON_COMPLIANT", rule_ids=[REAL_RULE])
    direct_vm.sender = direct_alice
    contract.rule()
    return contract


def _leader(outcome, rule_ids, **overrides):
    payload = {
        "outcome": outcome,
        "violated_rule_ids": rule_ids,
        "evidence_citations": [CITATION],
        "reasoning": "Derived from the pinned record.",
    }
    payload.update(overrides)
    return payload


# ------------------------------------------------------------- agreement ------


def test_a_validator_deriving_the_same_ruling_agrees(
    direct_vm, deploy_case, direct_alice
):
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    assert direct_vm.run_validator() is True


def test_rule_id_order_does_not_matter(direct_vm, deploy_case, direct_alice):
    """Two validators that both identify the same rules may list them in any
    order. Comparing raw lists would fail consensus on a formatting difference."""
    contract = deploy_case(CASE_TWO_THIRDS)
    serve_ruling(
        direct_vm, CASE_TWO_THIRDS, "NON_COMPLIANT",
        rule_ids=[REAL_RULE, OTHER_REAL_RULE],
    )
    direct_vm.sender = direct_alice
    contract.rule()

    reversed_ids = _leader("NON_COMPLIANT", [OTHER_REAL_RULE, REAL_RULE])
    assert direct_vm.run_validator(leader_result=reversed_ids) is True


def test_duplicate_rule_ids_do_not_matter(direct_vm, deploy_case, direct_alice):
    """Membership carries meaning; multiplicity does not."""
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    dupes = _leader("NON_COMPLIANT", [REAL_RULE, REAL_RULE, REAL_RULE])
    assert direct_vm.run_validator(leader_result=dupes) is True


def test_a_single_rule_id_sent_as_a_bare_string_still_agrees(
    direct_vm, deploy_case, direct_alice
):
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    as_string = _leader("NON_COMPLIANT", REAL_RULE)
    assert direct_vm.run_validator(leader_result=as_string) is True


def test_different_reasoning_does_not_break_consensus(
    direct_vm, deploy_case, direct_alice
):
    """The prose is one validator's explanation, not agreed text. Two validators
    reaching the same verdict for the same reason will still word it differently."""
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    other_prose = _leader(
        "NON_COMPLIANT", [REAL_RULE],
        reasoning="Entirely different wording, same finding.",
    )
    assert direct_vm.run_validator(leader_result=other_prose) is True


def test_different_citations_do_not_break_consensus(
    direct_vm, deploy_case, direct_alice
):
    """Two validators may cite different parts of the record for the same
    conclusion. Citations are explanatory, not consensus-critical."""
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    other_citations = _leader(
        "NON_COMPLIANT", [REAL_RULE],
        evidence_citations=[
            {
                "source": "proposal",
                "url": doc_url(CASE_TWO_THIRDS, "proposal"),
                "locator": "$.requested_amount.amount",
                "quote": "250000",
                "supports": REAL_RULE,
            }
        ],
    )
    assert direct_vm.run_validator(leader_result=other_citations) is True


def test_agreement_on_a_compliant_ruling(direct_vm, deploy_case, direct_alice):
    contract = deploy_case(CASE_COMPLIANT)
    serve_ruling(direct_vm, CASE_COMPLIANT, "COMPLIANT")
    direct_vm.sender = direct_alice
    contract.rule()
    assert direct_vm.run_validator() is True


def test_an_omitted_rule_id_field_equals_an_empty_set(
    direct_vm, deploy_case, direct_alice
):
    """A validator that found no violations and a leader that omitted the field
    entirely have said the same thing."""
    contract = deploy_case(CASE_COMPLIANT)
    serve_ruling(direct_vm, CASE_COMPLIANT, "COMPLIANT")
    direct_vm.sender = direct_alice
    contract.rule()

    omitted = {
        "outcome": "COMPLIANT",
        "evidence_citations": [],
        "reasoning": "No violation found.",
    }
    assert direct_vm.run_validator(leader_result=omitted) is True


# ---------------------------------------------------------- disagreement ------


def test_a_different_outcome_breaks_consensus(direct_vm, deploy_case, direct_alice):
    """The decision field that matters most. Disagreement here means the ruling
    is not committed and consensus rotates to another leader."""
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    assert direct_vm.run_validator(leader_result=_leader("COMPLIANT", [])) is False


def test_insufficient_evidence_against_non_compliant_breaks_consensus(
    direct_vm, deploy_case, direct_alice
):
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    disagreeing = _leader("INSUFFICIENT_EVIDENCE", [])
    assert direct_vm.run_validator(leader_result=disagreeing) is False


def test_a_different_rule_id_set_breaks_consensus(direct_vm, deploy_case, direct_alice):
    """Same verdict, different basis. Recording it would attribute the finding to
    a rule this validator did not find violated."""
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    other_rule = _leader("NON_COMPLIANT", [OTHER_REAL_RULE])
    assert direct_vm.run_validator(leader_result=other_rule) is False


def test_a_superset_of_rule_ids_breaks_consensus(direct_vm, deploy_case, direct_alice):
    """Set equality, not containment: an extra cited rule is a different finding."""
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    superset = _leader("NON_COMPLIANT", [REAL_RULE, OTHER_REAL_RULE])
    assert direct_vm.run_validator(leader_result=superset) is False


def test_a_leader_error_breaks_consensus(direct_vm, deploy_case, direct_alice):
    """Any leader failure — transient, invalid evidence, malformed output — means
    no ruling should be committed."""
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    error = RuntimeError("[TRANSIENT] vote-record returned 503")
    assert direct_vm.run_validator(leader_error=error) is False


def test_a_non_dict_leader_result_breaks_consensus(direct_vm, deploy_case, direct_alice):
    """The validator never trusts the shape of the leader's answer."""
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    assert direct_vm.run_validator(leader_result="NON_COMPLIANT") is False


def test_a_malformed_rule_id_field_breaks_consensus(
    direct_vm, deploy_case, direct_alice
):
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    malformed = _leader("NON_COMPLIANT", {"id": REAL_RULE})
    assert direct_vm.run_validator(leader_result=malformed) is False


# ----------------------- the validator's own view of the evidence -------------


def test_a_validator_that_cannot_fetch_the_evidence_disagrees(
    direct_vm, deploy_case, direct_alice
):
    """Its own failure to read the record is the safe failure: disagree, so
    consensus retries and nothing is recorded."""
    contract = _ruled_non_compliant(direct_vm, deploy_case, direct_alice)
    assert contract.get_state()["status"] == "RULED"

    # This validator now sees a 503 on the vote record.
    reset_mocks(direct_vm)
    for source in ("constitution", "proposal", "notice-record"):
        mock_document(direct_vm, CASE_TWO_THIRDS, source)
    mock_http_status(direct_vm, CASE_TWO_THIRDS, "vote-record", 503)
    mock_ruling(direct_vm, "NON_COMPLIANT", rule_ids=[REAL_RULE])

    assert direct_vm.run_validator() is False


def test_a_validator_seeing_a_different_document_disagrees(
    direct_vm, deploy_case, direct_alice
):
    """The consensus hazard this rule exists for: an evidence host that serves
    different bytes to different validators cannot get a ruling committed."""
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)

    reset_mocks(direct_vm)
    mock_case(direct_vm, CASE_TWO_THIRDS)
    # This validator's model reads the same documents and concludes otherwise.
    mock_ruling(direct_vm, "COMPLIANT")

    assert direct_vm.run_validator() is False


def test_a_validator_whose_own_ruling_is_malformed_disagrees(
    direct_vm, deploy_case, direct_alice
):
    """An invariant breach in the validator's *own* derivation is not evidence
    that the leader was right."""
    _ruled_non_compliant(direct_vm, deploy_case, direct_alice)

    reset_mocks(direct_vm)
    mock_case(direct_vm, CASE_TWO_THIRDS)
    mock_ruling(direct_vm, "NON_COMPLIANT", rule_ids=["ART-9.9"])

    assert direct_vm.run_validator() is False
