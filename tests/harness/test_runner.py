"""Runner behaviour — offline, with a fake chain.

These cover the properties that cost real money to get wrong: submitting twice,
resending after a timeout, and treating an unknown outcome as either success or
permission to retry.
"""

import pytest

from pilot.classify import Phase, Retry
from pilot.record import PilotRecord
from pilot.runner import PilotRunner, PilotStop


class FakeChain:
    """A scriptable chain. `receipts` is consumed one poll at a time."""

    def __init__(self, receipts=None, submit_result="0x" + "a" * 64, submit_error=None):
        self.receipts = list(receipts or [])
        self.submit_result = submit_result
        self.submit_error = submit_error
        self.submissions = 0
        self.polls = 0
        self._last = None

    def deploy(self, code, args, account):
        return self._submit()

    def write(self, address, method, args, account):
        return self._submit()

    def _submit(self):
        self.submissions += 1
        if self.submit_error:
            raise self.submit_error
        return self.submit_result

    def transaction(self, tx_hash):
        self.polls += 1
        if self.receipts:
            self._last = self.receipts.pop(0)
        return self._last

    def read(self, address, method):
        return {}

    def contract_code(self, address):
        return "# source"

    def chain_id(self):
        return 4221

    def balance_wei(self, address):
        return 10 ** 19


@pytest.fixture
def record(tmp_path):
    return PilotRecord.load_or_create("case-002", root=tmp_path)


def make_runner(chain, record, **kw):
    return PilotRunner(chain, record, sleep=lambda _s: None, poll_interval=0, **kw)


FINALIZED = {"statusName": "FINALIZED", "txExecutionResultName": "FINISHED_WITH_RETURN"}


# --------------------------------------------------------- single flight ----


def test_a_write_is_submitted_exactly_once(record):
    chain = FakeChain(receipts=[FINALIZED])
    runner = make_runner(chain, record)
    result = runner.submit_once("rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert result.classification.succeeded
    assert chain.submissions == 1


def test_the_hash_is_persisted_before_anything_is_awaited(record):
    # The receipt list is empty, so the first poll returns None and the runner
    # keeps waiting — but the hash must already be on disk by then.
    seen = {}

    class Watcher(FakeChain):
        def transaction(self, tx_hash):
            seen["hash_on_disk"] = record.pending_hash("rule")
            return FINALIZED

    chain = Watcher()
    make_runner(chain, record).submit_once(
        "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert seen["hash_on_disk"] == "0x" + "a" * 64


def test_a_persisted_pending_hash_is_resumed_never_resubmitted(record):
    record.record_submission("rule", "0x" + "b" * 64, "rule")
    chain = FakeChain(receipts=[FINALIZED])
    result = make_runner(chain, record).submit_once(
        "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert chain.submissions == 0, "resuming must never resubmit"
    assert result.tx_hash == "0x" + "b" * 64


def test_a_settled_successful_step_is_not_repeated(record):
    from pilot.classify import classify

    record.record_submission("rule", "0x" + "c" * 64, "rule")
    record.record_receipt("rule", classify(FINALIZED), {})
    chain = FakeChain(receipts=[FINALIZED])
    result = make_runner(chain, record).submit_once(
        "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert chain.submissions == 0
    assert result.tx_hash == "0x" + "c" * 64


# ----------------------------------------------------------- no submission --


def test_a_failed_submission_leaves_no_hash_and_is_safe_to_retry(record):
    chain = FakeChain(submit_error=RuntimeError("wallet rejected"))
    with pytest.raises(PilotStop) as exc:
        make_runner(chain, record).submit_once(
            "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert exc.value.classification.retry == Retry.SAFE
    assert record.pending_hash("rule") is None


def test_an_empty_hash_is_treated_as_not_submitted(record):
    chain = FakeChain(submit_result="")
    with pytest.raises(PilotStop) as exc:
        make_runner(chain, record).submit_once(
            "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert exc.value.classification.retry == Retry.SAFE


# -------------------------------------------------------------- timeout -----


def test_timeout_stops_preserves_the_hash_and_does_not_resend(record):
    clock = {"t": 0.0}

    def now():
        clock["t"] += 100
        return clock["t"]

    chain = FakeChain(receipts=[{"statusName": "PENDING"}] * 50)
    runner = PilotRunner(chain, record, sleep=lambda _s: None, now=now, poll_interval=0)

    with pytest.raises(PilotStop) as exc:
        runner.submit_once("rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)

    assert "do not resend" in str(exc.value).lower()
    assert exc.value.tx_hash == "0x" + "a" * 64
    assert chain.submissions == 1
    # The hash survives for an explicit resume.
    assert record.data["steps"]["rule"]["tx_hash"] == "0x" + "a" * 64


def test_unknown_outcome_stops_rather_than_guessing(record):
    chain = FakeChain(receipts=[{"statusName": "FINALIZED"}])  # no execution result
    with pytest.raises(PilotStop) as exc:
        make_runner(chain, record).submit_once(
            "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert exc.value.classification.phase == Phase.UNKNOWN
    assert "resume explicitly" in str(exc.value)


# ------------------------------------------------------ terminal failures ---


def test_execution_error_settles_and_is_recorded(record):
    chain = FakeChain(receipts=[{"statusName": "ACCEPTED",
                                 "txExecutionResultName": "FINISHED_WITH_ERROR"}])
    result = make_runner(chain, record).submit_once(
        "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert result.classification.phase == Phase.EXECUTION_ERROR
    assert record.data["steps"]["rule"]["status"] == "settled"
    assert record.data["steps"]["rule"]["retry_classification"] == Retry.POINTLESS


def test_consensus_rejection_settles_and_is_recorded(record):
    chain = FakeChain(receipts=[{"statusName": "UNDETERMINED"}])
    result = make_runner(chain, record).submit_once(
        "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert result.classification.phase == Phase.CONSENSUS_FAILED
    assert record.data["steps"]["rule"]["retry_classification"] == Retry.SAFE_AFTER_READ


def test_polling_waits_through_pending_then_settles(record):
    chain = FakeChain(receipts=[{"statusName": "PENDING"},
                                {"statusName": "PROPOSING"},
                                FINALIZED])
    result = make_runner(chain, record).submit_once(
        "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert result.classification.succeeded
    assert chain.polls == 3


def test_an_unreadable_transaction_does_not_end_polling(record):
    # None means "not indexed yet", not "failed".
    chain = FakeChain(receipts=[None, None, FINALIZED])
    result = make_runner(chain, record).submit_once(
        "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert result.classification.succeeded


# --------------------------------------------------------------- record -----


def test_validator_votes_are_recorded_when_present(record):
    chain = FakeChain(receipts=[{**FINALIZED, "numOfRounds": "1",
                                 "lastRound": {"validatorVotesName": ["AGREE", "AGREE"]}}])
    make_runner(chain, record).submit_once(
        "rule", "rule", lambda: chain.write("0xa", "rule", [], None), 60)
    assert record.data["steps"]["rule"]["validator_votes"]["validatorVotes"] == ["AGREE", "AGREE"]
