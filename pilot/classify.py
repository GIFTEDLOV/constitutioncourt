"""Transaction outcome classification and retry safety.

Pure functions over a receipt dict. No network, no SDK, no I/O — so every rule
below is exercised by the offline suite rather than discovered on a funded
network.

The rules are the ones locked in docs/DEPLOY.md §9, and they exist because App 1
learned each of them the expensive way:

* A returned hash means *submitted*. It is not success.
* Consensus ACCEPTED with execution FINISHED_WITH_ERROR is a failure.
* FINALIZED with no execution result, or an unrecognised one, is **unknown** —
  not success, and not a licence to retry.
* A settled consensus result that is not AGREE is a failure whatever the status
  says.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

# --- vocabulary, mirrored from genlayer_py.types.transactions ----------------
# Verified against genlayer-py 0.16.3 rather than assumed: ExecutionResult has
# exactly three members, and NOT_VOTED is one of them.
STATUS_FINALIZED = "FINALIZED"
STATUS_ACCEPTED = "ACCEPTED"

PENDING_STATUSES = frozenset({
    "UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING",
    "APPEAL_COMMITTING", "APPEAL_REVEALING", "READY_TO_FINALIZE",
})

FAILED_STATUSES = frozenset({
    "CANCELED", "UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
})

EXECUTION_SUCCESS = "FINISHED_WITH_RETURN"
EXECUTION_ERROR = "FINISHED_WITH_ERROR"
EXECUTION_NOT_VOTED = "NOT_VOTED"

#: The only execution result that means a contract ran to completion.
#: `FINISHED_WITH_NO_RETURN` does **not** exist in genlayer-py 0.16.3 — it is
#: not accepted here on the strength of another SDK's vocabulary.
SUCCESSFUL_EXECUTION = frozenset({EXECUTION_SUCCESS})

CONSENSUS_AGREE = "AGREE"
#: Not a verdict — the consensus result field before there is one to report.
CONSENSUS_IDLE = "IDLE"


class Phase:
    """Terminal and non-terminal outcomes of a submitted transaction."""

    PENDING = "pending"
    FINALIZED = "finalized"
    ACCEPTED = "consensus-accepted"
    EXECUTION_ERROR = "execution-error"
    CONSENSUS_FAILED = "consensus-failed"
    UNKNOWN = "unknown"


#: Phases after which nothing more will change on its own.
TERMINAL_PHASES = frozenset({
    Phase.FINALIZED, Phase.EXECUTION_ERROR, Phase.CONSENSUS_FAILED, Phase.UNKNOWN,
})


class Retry:
    """Whether resubmitting the *same intent* is safe."""

    #: Nothing was committed — no hash was ever issued.
    SAFE = "safe"
    #: A hash exists and has not settled. Never resubmit.
    FORBIDDEN_IN_FLIGHT = "forbidden-in-flight"
    #: Settled, and nothing took effect, but read live state before acting.
    SAFE_AFTER_READ = "safe-after-read"
    #: Settled, and retrying the same call fails the same way.
    POINTLESS = "pointless"
    #: Outcome unestablished. A human must inspect before anything else.
    REQUIRES_INSPECTION = "requires-inspection"


@dataclass(frozen=True)
class Classification:
    phase: str
    retry: str
    succeeded: bool
    detail: str
    status: str = ""
    execution: str = ""
    consensus: str = ""
    #: True when the outcome will not change without another transaction.
    terminal: bool = field(default=False)


def _s(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "value"):  # str Enum
        value = value.value
    return str(value)


# --- field naming -----------------------------------------------------------
#
# genlayer-py's own types are camelCase, but the Bradbury RPC answers in
# snake_case. A receipt read straight from the node therefore has none of the
# camelCase keys this module originally looked for, and every lookup fell
# through to the numeric `status` — which is how a plainly FINALIZED transaction
# came back as "Unrecognised transaction status '7'" and was recorded as a
# failure. Both spellings are accepted here; neither is assumed.


def _field(receipt: Mapping[str, Any], *names: str) -> Any:
    """First present, non-None value among `names`. Order is preference."""
    for name in names:
        if name in receipt and receipt[name] is not None:
            return receipt[name]
    return None


# --- numeric codes ----------------------------------------------------------
#
# The node reports `status`, `tx_execution_result` and `result` as integers and
# the matching `*_name` string alongside. The names are preferred; these maps
# are the fallback for a response that carries only the code.
#
# The values are the declaration order of genlayer-py's TransactionStatus,
# ExecutionResult and TransactionResult enums. Four of them are confirmed
# against real Bradbury transactions rather than taken on trust:
#
#   7  FINALIZED         the case-002 deploy, and the 2026-08-04 ruling
#   8  CANCELED          both 2026-08-02 ruling transactions
#   9  APPEAL_REVEALING  the duplicate ruling, recorded 2026-08-02
#   11 READY_TO_FINALIZE the first effective ruling, recorded 2026-08-02
#
# `tests/harness/test_classify.py` cross-checks every entry against the
# installed SDK enums, so a reordering upstream fails loudly here rather than
# silently mislabelling a transaction.
STATUS_CODES = {
    0: "UNINITIALIZED", 1: "PENDING", 2: "PROPOSING", 3: "COMMITTING",
    4: "REVEALING", 5: "ACCEPTED", 6: "UNDETERMINED", 7: "FINALIZED",
    8: "CANCELED", 9: "APPEAL_REVEALING", 10: "APPEAL_COMMITTING",
    11: "READY_TO_FINALIZE", 12: "VALIDATORS_TIMEOUT", 13: "LEADER_TIMEOUT",
}

EXECUTION_CODES = {
    0: "NOT_VOTED", 1: "FINISHED_WITH_RETURN", 2: "FINISHED_WITH_ERROR",
}

RESULT_CODES = {
    0: "IDLE", 1: "AGREE", 2: "DISAGREE", 3: "TIMEOUT",
    4: "DETERMINISTIC_VIOLATION", 5: "NO_MAJORITY", 6: "MAJORITY_AGREE",
    7: "MAJORITY_DISAGREE",
}


def _named(value: Any, codes: Mapping[int, str]) -> str:
    """Resolve a field that may be a name, a numeric code, or a numeric string.

    A name is returned as-is. `7` and `"7"` both resolve through `codes`. An
    unrecognised code is returned as its own string so the caller reports
    something specific rather than silently treating it as absent.
    """
    text = _s(value).strip()
    if not text:
        return ""
    try:
        return codes.get(int(text), text).upper()
    except (TypeError, ValueError):
        return text.upper()


def status_of(receipt: Mapping[str, Any]) -> str:
    """The transaction's consensus status as a name, whatever the node called it."""
    name = _field(receipt, "status_name", "statusName")
    if name is not None and _s(name).strip():
        return _named(name, STATUS_CODES)
    return _named(_field(receipt, "status"), STATUS_CODES)


def execution_of(receipt: Mapping[str, Any]) -> str:
    name = _field(receipt, "tx_execution_result_name", "txExecutionResultName")
    if name is not None and _s(name).strip():
        return _named(name, EXECUTION_CODES)
    return _named(_field(receipt, "tx_execution_result", "txExecutionResult"),
                  EXECUTION_CODES)


def consensus_of(receipt: Mapping[str, Any]) -> str:
    name = _field(receipt, "result_name", "resultName")
    if name is not None and _s(name).strip():
        return _named(name, RESULT_CODES)
    return _named(_field(receipt, "result"), RESULT_CODES)


def classify(receipt: Optional[Mapping[str, Any]]) -> Classification:
    """Classify a transaction receipt.

    `receipt` is whatever `client.get_transaction` returned, or None when the
    transaction could not be read at all. Both the camelCase spelling of
    genlayer-py's types and the snake_case spelling the Bradbury RPC returns are
    accepted.
    """
    if receipt is None:
        return Classification(
            phase=Phase.PENDING,
            retry=Retry.FORBIDDEN_IN_FLIGHT,
            succeeded=False,
            detail="The transaction could not be read. It may not be indexed yet. "
                   "A hash exists, so it must not be resubmitted.",
        )

    status = status_of(receipt)
    execution = execution_of(receipt)
    consensus = consensus_of(receipt)
    base = {"status": status, "execution": execution, "consensus": consensus}

    if status in FAILED_STATUSES:
        return Classification(
            phase=Phase.CONSENSUS_FAILED,
            retry=Retry.SAFE_AFTER_READ,
            succeeded=False,
            terminal=True,
            detail=f"Consensus did not accept this transaction ({status}). The write did not "
                   "take effect. Read live state, then retry if still required.",
            **base,
        )

    # Execution error is checked before status: consensus can be ACCEPTED while
    # the contract refused the call, and that is a failure of the attempt.
    if execution == EXECUTION_ERROR:
        return Classification(
            phase=Phase.EXECUTION_ERROR,
            retry=Retry.POINTLESS,
            succeeded=False,
            terminal=True,
            detail="Consensus accepted the transaction but the contract refused the call. "
                   "A guard reverted and nothing changed. Retrying the same call fails the "
                   "same way — read live state to find out what already happened.",
            **base,
        )

    # `IDLE` is the absence of a consensus result, not a settled disagreement.
    # It matters now that snake_case is read: `result` is frequently present as
    # 0/IDLE on a transaction that has not reached a verdict, and treating that
    # as a refusal would fail transactions that are merely still working.
    if (consensus and consensus not in (CONSENSUS_AGREE, CONSENSUS_IDLE)
            and status in (STATUS_FINALIZED, STATUS_ACCEPTED)):
        return Classification(
            phase=Phase.CONSENSUS_FAILED,
            retry=Retry.SAFE_AFTER_READ,
            succeeded=False,
            terminal=True,
            detail=f"Validators did not agree ({consensus}). The write did not take effect.",
            **base,
        )

    if status in (STATUS_FINALIZED, STATUS_ACCEPTED):
        if not execution:
            return Classification(
                phase=Phase.UNKNOWN,
                retry=Retry.REQUIRES_INSPECTION,
                succeeded=False,
                terminal=True,
                detail=f"The transaction is {status} but the node reported no execution result. "
                       "Do not assume it succeeded and do not resend. Confirm on-chain state "
                       "before anything else.",
                **base,
            )
        if execution not in SUCCESSFUL_EXECUTION:
            return Classification(
                phase=Phase.UNKNOWN,
                retry=Retry.REQUIRES_INSPECTION,
                succeeded=False,
                terminal=True,
                detail=f"Unrecognised execution result {execution!r}. Confirm on-chain state "
                       "before retrying.",
                **base,
            )
        if status == STATUS_FINALIZED:
            return Classification(
                phase=Phase.FINALIZED,
                retry=Retry.POINTLESS,
                succeeded=True,
                terminal=True,
                detail="Finalized, and the contract ran to completion.",
                **base,
            )
        return Classification(
            phase=Phase.ACCEPTED,
            retry=Retry.FORBIDDEN_IN_FLIGHT,
            succeeded=True,
            terminal=False,
            detail="Consensus accepted and execution completed. Awaiting finalization.",
            **base,
        )

    if status in PENDING_STATUSES or not status:
        return Classification(
            phase=Phase.PENDING,
            retry=Retry.FORBIDDEN_IN_FLIGHT,
            succeeded=False,
            detail=f"Still settling ({status or 'no status reported'}). Never resubmit while a "
                   "hash is in flight.",
            **base,
        )

    return Classification(
        phase=Phase.UNKNOWN,
        retry=Retry.REQUIRES_INSPECTION,
        succeeded=False,
        terminal=True,
        detail=f"Unrecognised transaction status {status!r}. Inspect before acting.",
        **base,
    )


def classify_not_submitted(reason: str) -> Classification:
    """The one case where retry is unconditionally safe: no hash was ever issued.

    Nothing reached the network, so nothing was committed and no gas was spent.
    """
    return Classification(
        phase=Phase.CONSENSUS_FAILED,
        retry=Retry.SAFE,
        succeeded=False,
        terminal=True,
        detail=f"Not submitted: {reason}. No transaction hash was issued, so nothing was "
               "committed and no gas was spent. Safe to retry.",
    )


def consensus_votes(receipt: Optional[Mapping[str, Any]]) -> dict:
    """Extract per-validator votes and rotation detail, for the pilot record.

    Reads the last round under either spelling — `lastRound` as genlayer-py's
    types declare it, or `last_round` as the Bradbury RPC answers. Absent fields
    are recorded as absent rather than guessed.

    Vote names are resolved through `RESULT_CODES`, because the node returns
    `validator_votes` as integers alongside `validator_votes_name` as strings and
    a record holding `[0, 0, 1]` tells a reader nothing.
    """
    if not receipt:
        return {}
    last_round = _field(receipt, "last_round", "lastRound") or {}
    if not isinstance(last_round, Mapping):
        last_round = {}

    votes = _field(last_round, "validator_votes_name", "validatorVotesName")
    if not votes:
        votes = _field(last_round, "validator_votes", "validatorVotes") or []

    out = {
        "numOfRounds": _s(_field(receipt, "num_of_rounds", "numOfRounds")),
        "consensusResult": consensus_of(receipt),
        "leaderIndex": _s(_field(last_round, "leader_index", "leaderIndex")),
        "leader": _s(_field(receipt, "last_leader", "lastLeader")),
        "votesCommitted": _s(_field(last_round, "votes_committed", "votesCommitted")),
        "votesRevealed": _s(_field(last_round, "votes_revealed", "votesRevealed")),
        "rotationsLeft": _s(_field(last_round, "rotations_left", "rotationsLeft")),
        "roundValidators": [_s(v) for v in
                            (_field(last_round, "round_validators", "roundValidators") or [])],
        "validatorVotes": [_named(v, RESULT_CODES) for v in votes],
    }
    return {k: v for k, v in out.items() if v not in ("", [], None)}


def _iso(unix_seconds: Any) -> str:
    """Unix seconds -> `YYYY-MM-DDTHH:MM:SSZ`, or "" if it isn't a time."""
    text = _s(unix_seconds).strip()
    if not text:
        return ""
    try:
        seconds = int(text)
    except (TypeError, ValueError):
        return ""
    if seconds <= 0:  # the node uses 0 for "not set"
        return ""
    return datetime.fromtimestamp(seconds, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def chain_timestamps(receipt: Optional[Mapping[str, Any]]) -> dict:
    """When the chain says the transaction was submitted and last voted on.

    A pilot record should carry these rather than the wall-clock time the tool
    happened to run: a record reconstructed two days after the fact would
    otherwise stamp a 2026-08-02 deploy with the afternoon someone typed a
    command, which is not evidence of anything.

    `last_vote_at` is named for exactly what it is. **It is not the finalization
    time** — the case-002 deploy took its last vote at 09:32:20 and did not
    finalize until 10:02:24, half an hour later — and the node exposes no
    finalization timestamp to record instead. Calling this `settled_at` would
    quietly understate finalization by that gap.

    Keys absent from the receipt are absent from the result, never guessed.
    """
    if not receipt:
        return {}
    out = {
        "submitted_at": _iso(_field(receipt, "created_timestamp", "createdTimestamp")),
        "last_vote_at": _iso(_field(receipt, "last_vote_timestamp", "lastVoteTimestamp")),
    }
    return {k: v for k, v in out.items() if v}


def vote_tally(receipt: Optional[Mapping[str, Any]]) -> dict:
    """Per-vote counts, e.g. `{"AGREE": 3, "TIMEOUT": 1}`.

    A summary a reader can check at a glance against the validator list.
    """
    votes = consensus_votes(receipt).get("validatorVotes") or []
    tally: dict = {}
    for vote in votes:
        tally[vote] = tally.get(vote, 0) + 1
    return tally
