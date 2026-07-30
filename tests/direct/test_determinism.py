"""Determinism: everything that must be byte-identical across validators.

Consensus does not merely require that validators agree on the verdict — it
requires that the parts of the computation *outside* the model produce identical
bytes on every machine. Anything that varies by host, locale, dict ordering or
float representation is a consensus split that no amount of validator agreement
can rescue.

Four properties are pinned here:

* timestamps come from the deterministic transaction timestamp, never the wall
  clock, and are formatted one way only;
* no float ever reaches storage, so no reader ever sees `0.6240000000000001`;
* rule ids are stored in a canonical order, so two validators that found the same
  violations store the same bytes;
* document key order does not change the prompt.
"""

import json
from datetime import datetime

import pytest

from conftest import (
    CASE_COMPLIANT,
    CASE_TWO_THIRDS,
    load_doc,
    mock_case,
    mock_case_ruling,
    mock_document,
    mock_ruling,
    reset_mocks,
    ruling_json,
    serve_ruling,
)

REAL_RULE = "ART-4.3"
OTHER_REAL_RULE = "ART-5.4"

FIXED_TIME = "2026-07-30T12:34:56Z"


# ----------------------------------------------------------- timestamps -------


def test_created_at_comes_from_the_transaction_timestamp(direct_vm, deploy_case):
    """Not the wall clock. Every validator executing this transaction sees the
    same value, which is the only reason a stored timestamp is safe at all."""
    direct_vm.warp(FIXED_TIME)
    contract = deploy_case(CASE_TWO_THIRDS)
    assert contract.get_state()["created_at"] == FIXED_TIME


def test_created_at_is_fixed_at_construction_not_read_from_the_clock(
    direct_vm, deploy_case
):
    """Advancing the clock after construction must not move a stored timestamp.
    If `created_at` were computed at read time, two validators reading the same
    case at different moments would report different histories."""
    direct_vm.warp(FIXED_TIME)
    contract = deploy_case(CASE_TWO_THIRDS)
    assert contract.get_state()["created_at"] == FIXED_TIME

    direct_vm.warp("2027-01-01T00:00:00Z")
    assert contract.get_state()["created_at"] == FIXED_TIME


def test_responded_at_and_ruled_at_come_from_the_transaction_timestamp(
    direct_vm, deploy_case, direct_alice, direct_bob
):
    from conftest import doc_url

    direct_vm.warp("2026-07-30T01:00:00Z")
    contract = deploy_case(CASE_COMPLIANT)

    direct_vm.warp("2026-07-30T02:00:00Z")
    direct_vm.sender = direct_bob
    contract.submit_response(doc_url(CASE_COMPLIANT, "response"))

    direct_vm.warp("2026-07-30T03:00:00Z")
    mock_case_ruling(direct_vm, CASE_COMPLIANT)
    direct_vm.sender = direct_alice
    contract.rule()

    state = contract.get_state()
    assert state["created_at"] == "2026-07-30T01:00:00Z"
    assert state["responded_at"] == "2026-07-30T02:00:00Z"
    assert state["ruled_at"] == "2026-07-30T03:00:00Z"


@pytest.mark.parametrize("field", ["created_at", "responded_at", "ruled_at"])
def test_timestamps_are_canonical_iso_8601_utc(
    direct_vm, deploy_case, direct_alice, direct_bob, field
):
    """One format, always: `YYYY-MM-DDTHH:MM:SSZ`. No offset, no microseconds, no
    local time. A second format would be a second thing to parse and a second
    thing to get wrong."""
    from conftest import doc_url

    contract = deploy_case(CASE_COMPLIANT)
    direct_vm.sender = direct_bob
    contract.submit_response(doc_url(CASE_COMPLIANT, "response"))
    mock_case_ruling(direct_vm, CASE_COMPLIANT)
    direct_vm.sender = direct_alice
    contract.rule()

    value = contract.get_state()[field]
    assert len(value) == 20
    assert value.endswith("Z")
    assert "+" not in value
    assert "." not in value
    # Round-trips through the stdlib parser.
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert parsed.tzinfo is not None
    assert parsed.strftime("%Y-%m-%dT%H:%M:%SZ") == value


def test_timestamps_are_never_empty_once_set(direct_vm, open_case, direct_alice):
    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_alice
    open_case.rule()
    state = open_case.get_state()
    assert state["created_at"] != ""
    assert state["ruled_at"] != ""


# ---------------------------------------------------------- no floats ---------


def _walk(value):
    """Yield every scalar inside a nested structure."""
    if isinstance(value, dict):
        for item in value.values():
            yield from _walk(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _walk(item)
    else:
        yield value


def test_no_float_reaches_storage(direct_vm, open_case, direct_alice):
    """The percentages in these cases are the kind of thing that invites a float —
    60.0% versus 62.4%. Nothing numeric is stored at all: amounts stay decimal
    strings in the evidence documents and are parsed inside the nondet block."""
    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_alice
    open_case.rule()

    for scalar in _walk(open_case.get_state()):
        assert not isinstance(scalar, float), f"float in storage: {scalar!r}"
    for scalar in _walk(open_case.get_evidence_sources()):
        assert not isinstance(scalar, float), f"float in storage: {scalar!r}"


def test_a_float_anywhere_in_the_model_output_is_rejected(
    direct_vm, open_case, direct_alice
):
    """A model quoting `65.38` as a JSON number rather than a string does not
    merely get stringified — the ruling never arrives.

    GenLayer calldata has no float type, so a float in the model's output cannot
    cross the boundary out of the nondet block at all; the payload decodes to
    `None` and the ruling is rejected as malformed. The float can therefore never
    reach storage, where its repr could differ between hosts. Worth pinning
    because the failure is loud and early rather than a silently rounded quote.
    """
    serve_ruling(
        direct_vm, CASE_TWO_THIRDS, "NON_COMPLIANT",
        rule_ids=[REAL_RULE],
        citations=[
            {
                "source": "vote-record",
                "locator": "$.tally",
                "quote": 65.38,
                "supports": REAL_RULE,
            }
        ],
    )
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("[LLM_ERROR]"):
        open_case.rule()

    state = open_case.get_state()
    assert state["status"] == "OPEN"
    assert state["evidence_citations"] == []
    for scalar in _walk(state):
        assert not isinstance(scalar, float)


def test_a_numeric_quote_sent_as_a_string_is_stored_verbatim(
    direct_vm, open_case, direct_alice
):
    """The other half of the rule: numbers belong in the output as strings, and
    then they survive untouched."""
    serve_ruling(
        direct_vm, CASE_TWO_THIRDS, "NON_COMPLIANT",
        rule_ids=[REAL_RULE],
        citations=[
            {
                "source": "vote-record",
                "locator": "$.tally",
                "quote": "65.38",
                "supports": REAL_RULE,
            }
        ],
    )
    direct_vm.sender = direct_alice
    open_case.rule()

    citation = open_case.get_state()["evidence_citations"][0]
    assert citation["quote"] == "65.38"
    assert isinstance(citation["quote"], str)


def test_decimal_amounts_are_never_reformatted(direct_vm, open_case, direct_alice):
    """The contract does no arithmetic on amounts, so `250000` stays exactly that
    — it is never parsed to a number and printed back."""
    serve_ruling(
        direct_vm, CASE_TWO_THIRDS, "NON_COMPLIANT",
        rule_ids=[REAL_RULE],
        citations=[
            {
                "source": "proposal",
                "locator": "$.requested_amount.amount",
                "quote": "250000",
                "supports": REAL_RULE,
            }
        ],
    )
    direct_vm.sender = direct_alice
    open_case.rule()

    quote = open_case.get_state()["evidence_citations"][0]["quote"]
    assert quote == "250000"
    assert quote == load_doc(CASE_TWO_THIRDS, "proposal")["requested_amount"]["amount"]


# ------------------------------------------------- canonical stored order -----


@pytest.mark.parametrize(
    "emitted",
    [
        [REAL_RULE, OTHER_REAL_RULE],
        [OTHER_REAL_RULE, REAL_RULE],
        [REAL_RULE, OTHER_REAL_RULE, REAL_RULE],
        [OTHER_REAL_RULE, OTHER_REAL_RULE, REAL_RULE],
    ],
)
def test_rule_ids_are_stored_in_one_canonical_order(
    direct_vm, deploy_case, direct_alice, emitted
):
    """Whatever order and multiplicity the model emitted, storage holds the same
    bytes. Two validators that found the same violations must not disagree on
    formatting."""
    contract = deploy_case(CASE_TWO_THIRDS)
    serve_ruling(direct_vm, CASE_TWO_THIRDS, "NON_COMPLIANT", rule_ids=emitted)
    direct_vm.sender = direct_alice
    contract.rule()
    assert contract.get_state()["violated_rule_ids"] == [REAL_RULE, OTHER_REAL_RULE]


def test_stored_citations_have_stable_key_order(direct_vm, open_case, direct_alice):
    """Citations are JSON-encoded into a DynArray[str], so key order is part of
    the stored bytes. `sort_keys=True` is what keeps it identical everywhere."""
    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_alice
    open_case.rule()

    for citation in open_case.get_state()["evidence_citations"]:
        keys = list(citation)
        assert keys == sorted(keys)


# ------------------------------------------- the prompt is order-independent ---


def test_document_key_order_does_not_change_the_prompt(
    direct_vm, deploy_case, direct_alice
):
    """Two hosts serving the same facts with keys in a different order must
    produce the same prompt, or the model is being asked two different questions.
    `sort_keys=True` in the document block is what guarantees it.

    The mock pattern pins the canonical serialization: if key order leaked
    through, this mock would not match and the call would fail.
    """
    doc = load_doc(CASE_TWO_THIRDS, "vote-record")
    shuffled = dict(reversed(list(doc.items())))
    assert list(shuffled) != list(doc)

    canonical = json.dumps(doc, sort_keys=True, separators=(",", ":"))

    contract = deploy_case(CASE_TWO_THIRDS)
    reset_mocks(direct_vm)
    for source in ("constitution", "proposal", "notice-record"):
        mock_document(direct_vm, CASE_TWO_THIRDS, source)
    # Served with reversed key order...
    mock_document(direct_vm, CASE_TWO_THIRDS, "vote-record", doc=shuffled)
    # ...but the prompt must contain the canonical form.
    import re

    direct_vm.mock_llm(
        r"(?s).*" + re.escape(canonical) + r".*",
        ruling_json("NON_COMPLIANT", rule_ids=[REAL_RULE]),
    )

    direct_vm.sender = direct_alice
    contract.rule()
    assert contract.get_state()["outcome"] == "NON_COMPLIANT"


def test_the_same_evidence_produces_the_same_stored_ruling(
    direct_vm, deploy_case, from_scratch, direct_alice
):
    """The end-to-end determinism claim: same documents, same model answer, same
    stored bytes — including the timestamps, since those come from the
    transaction rather than the wall clock.

    Two full executions from identical state, which is what every validator is
    doing independently when it re-derives the ruling.
    """
    direct_vm.warp(FIXED_TIME)
    contract = deploy_case(CASE_TWO_THIRDS)
    reset = from_scratch()

    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_alice
    contract.rule()
    first_state = contract.get_state()
    first_sources = contract.get_evidence_sources()

    reset()

    mock_case_ruling(direct_vm, CASE_TWO_THIRDS)
    direct_vm.sender = direct_alice
    contract.rule()

    assert contract.get_state() == first_state
    assert contract.get_evidence_sources() == first_sources
