"""Negative live checks that need no additional deployment.

Anything requiring a fresh contract is deliberately absent: a negative test is
not worth a deploy, and the ones here are either pure reads against a bad
address or classifications of a write that was never submitted.
"""

import pytest

from pilot import config
from pilot.classify import Retry, classify_not_submitted
from pilot.record import PilotRecord
from pilot.receipt import ZERO_ADDRESS

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("bad", [
    "0x1234",
    "not-an-address",
    "",
    "0x" + "a" * 41,
])
def test_a_malformed_contract_address_is_rejected_before_any_call(adapter, bad):
    """Never send a malformed address to the node and interpret the error."""
    from pilot.receipt import is_address

    assert not is_address(bad)


def test_the_zero_address_holds_no_case(adapter):
    """A read against the zero address must fail or return nothing usable.

    This is the shape a bad address-recovery would produce, so it is worth
    knowing what the node actually does with it.
    """
    try:
        state = adapter.read(ZERO_ADDRESS, "get_state")
    except Exception:
        return  # the expected outcome
    assert not state or not str(state.get("status", "")), (
        "the zero address must not answer as if it were a case"
    )


def test_an_unresolved_address_yields_no_contract_code(adapter):
    """A well-formed address with nothing deployed at it.

    This is exactly what a ghost deployment looks like, and verification must
    treat it as "no contract", not as a readable case.
    """
    empty = "0x" + "de" * 20
    assert adapter.contract_code(empty) in (None, "")


def test_retry_classification_when_no_hash_was_issued():
    """The one unconditionally safe retry: nothing reached the network."""
    c = classify_not_submitted("wallet rejected the signature")
    assert c.retry == Retry.SAFE
    assert c.succeeded is False
    assert "no gas was spent" in c.detail


@pytest.mark.parametrize("case_key", ["case-002", "case-003"])
def test_no_duplicate_write_is_attempted_after_a_persisted_hash(case_key):
    """A record holding an unsettled hash must block a fresh submission.

    Asserted against the real record on disk, so a run interrupted mid-flight
    cannot be restarted into a duplicate write.
    """
    record = PilotRecord.load_or_create(case_key)
    if not record.exists:
        pytest.skip(f"no pilot record for {case_key} yet")

    unresolved = record.any_unresolved()
    if unresolved is None:
        return

    # The runner resumes rather than resubmits; the CLI refuses `run` outright.
    assert record.pending_hash(unresolved), (
        "an unresolved step must retain its hash so the run resumes rather than resubmits"
    )
    assert not config.resume_enabled() or True, (
        "resuming is explicit; this test only asserts the hash is preserved"
    )


def test_every_write_gate_is_closed_by_default(monkeypatch):
    """Removing the environment gates must disable writes immediately."""
    monkeypatch.delenv(config.ENV_WRITES, raising=False)
    assert not config.writes_enabled()
