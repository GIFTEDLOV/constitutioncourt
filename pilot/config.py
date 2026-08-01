"""Live-run configuration, read only from the environment.

**No credential is ever embedded, defaulted, logged or persisted.** Private keys
are read from environment variables at the moment they are needed, handed to the
SDK, and never written anywhere. `describe()` deliberately reports only whether
a key is *present*, never its value or any prefix of it.

A run is opt-in twice over: the `integration` pytest marker is deselected by
default, and every live test additionally requires `CONSTITUTIONCOURT_LIVE=1`.
Write operations require a third, separate opt-in. Reading an environment
variable is not consent to spend GEN.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

CHAIN_ID = 4221
CHAIN_NAME = "Genlayer Bradbury Testnet"
RPC_URL = "https://rpc-bradbury.genlayer.com"
EXPLORER_URL = "https://explorer-bradbury.genlayer.com/"

#: Gate 1 — run live tests at all (reads only, unless gate 2 is also set).
ENV_LIVE = "CONSTITUTIONCOURT_LIVE"
#: Gate 2 — permit transactions that spend GEN and require a signature.
ENV_WRITES = "CONSTITUTIONCOURT_ALLOW_WRITES"
#: Gate 3 — permit resuming a case that already has a record.
ENV_RESUME = "CONSTITUTIONCOURT_RESUME"

ENV_CHALLENGER_KEY = "CONSTITUTIONCOURT_CHALLENGER_KEY"
ENV_RESPONDENT_KEY = "CONSTITUTIONCOURT_RESPONDENT_KEY"
ENV_RPC = "CONSTITUTIONCOURT_RPC_URL"

#: Minimum balances, in GEN, before a write run is permitted. Headroom figures,
#: not measurements — the pilot records actual gas and these get revised.
MIN_CHALLENGER_GEN = 5.0
MIN_RESPONDENT_GEN = 2.0

WEI_PER_GEN = 10 ** 18


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def live_enabled() -> bool:
    return _flag(ENV_LIVE)


def writes_enabled() -> bool:
    """Writes need both gates. Enabling live reads never enables spending."""
    return live_enabled() and _flag(ENV_WRITES)


def resume_enabled() -> bool:
    return _flag(ENV_RESUME)


def rpc_url() -> str:
    return os.environ.get(ENV_RPC, "").strip() or RPC_URL


@dataclass(frozen=True)
class Credentials:
    """Presence of signing material, never the material itself."""

    challenger_present: bool
    respondent_present: bool

    @property
    def both_present(self) -> bool:
        return self.challenger_present and self.respondent_present


def credentials() -> Credentials:
    return Credentials(
        challenger_present=bool(os.environ.get(ENV_CHALLENGER_KEY, "").strip()),
        respondent_present=bool(os.environ.get(ENV_RESPONDENT_KEY, "").strip()),
    )


def challenger_key() -> Optional[str]:
    """The challenger's key, straight from the environment. Never cached."""
    return os.environ.get(ENV_CHALLENGER_KEY, "").strip() or None


def respondent_key() -> Optional[str]:
    return os.environ.get(ENV_RESPONDENT_KEY, "").strip() or None


def describe() -> dict:
    """A loggable summary. Contains no secret and no fragment of one."""
    creds = credentials()
    return {
        "chain": CHAIN_NAME,
        "chain_id": CHAIN_ID,
        "rpc_url": rpc_url(),
        "live_enabled": live_enabled(),
        "writes_enabled": writes_enabled(),
        "resume_enabled": resume_enabled(),
        "challenger_key_present": creds.challenger_present,
        "respondent_key_present": creds.respondent_present,
    }


def gen_to_wei(amount: float) -> int:
    return int(amount * WEI_PER_GEN)


def wei_to_gen(amount: int) -> float:
    return amount / WEI_PER_GEN


# --------------------------------------------------------------- timing

#: Bradbury serialises transactions per contract and each step waits on the
#: previous one's finality. A single write commonly takes ~30 minutes, and
#: `rule` runs a non-deterministic block across five validators with up to three
#: rotations, so it is the slowest.
POLL_INTERVAL_SECONDS = 15
DEPLOY_TIMEOUT_SECONDS = 45 * 60
WRITE_TIMEOUT_SECONDS = 45 * 60
RULE_TIMEOUT_SECONDS = 90 * 60
