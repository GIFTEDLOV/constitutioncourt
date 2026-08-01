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


def classify(receipt: Optional[Mapping[str, Any]]) -> Classification:
    """Classify a transaction receipt.

    `receipt` is whatever `client.get_transaction` returned, or None when the
    transaction could not be read at all.
    """
    if receipt is None:
        return Classification(
            phase=Phase.PENDING,
            retry=Retry.FORBIDDEN_IN_FLIGHT,
            succeeded=False,
            detail="The transaction could not be read. It may not be indexed yet. "
                   "A hash exists, so it must not be resubmitted.",
        )

    status = _s(receipt.get("statusName") or receipt.get("status")).upper()
    execution = _s(receipt.get("txExecutionResultName")).upper()
    consensus = _s(receipt.get("resultName")).upper()
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

    if consensus and consensus != CONSENSUS_AGREE and status in (STATUS_FINALIZED, STATUS_ACCEPTED):
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

    Reads `lastRound` as genlayer-py returns it. Absent fields are recorded as
    absent rather than guessed.
    """
    if not receipt:
        return {}
    last_round = receipt.get("lastRound") or {}
    out = {
        "numOfRounds": _s(receipt.get("numOfRounds")),
        "consensusResult": _s(receipt.get("resultName")),
        "leaderIndex": _s(last_round.get("leaderIndex")),
        "votesCommitted": _s(last_round.get("votesCommitted")),
        "votesRevealed": _s(last_round.get("votesRevealed")),
        "rotationsLeft": _s(last_round.get("rotationsLeft")),
        "roundValidators": [_s(v) for v in (last_round.get("roundValidators") or [])],
        "validatorVotes": [_s(v) for v in (last_round.get("validatorVotesName")
                                           or last_round.get("validatorVotes") or [])],
    }
    return {k: v for k, v in out.items() if v not in ("", [], None)}
