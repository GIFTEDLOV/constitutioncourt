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

#: Signing mode for a run. `browser` hard-disables harness signing: the operator
#: signs in a browser wallet and the harness stays read-only, verifying and
#: recording only. Set it and no `run`/`resume` can submit anything, whatever
#: else is configured — a belt to the write gates' braces.
ENV_SIGNING_MODE = "CONSTITUTIONCOURT_SIGNING_MODE"
SIGNING_MODE_BROWSER = "browser"


def browser_signing() -> bool:
    """True when the operator signs in a browser and the harness must not."""
    return os.environ.get(ENV_SIGNING_MODE, "").strip().lower() == SIGNING_MODE_BROWSER

#: Preferred: a keystore account **name** or **address**. Both are public and
#: safe to store, log and commit. The password is never here — it is entered
#: interactively at the moment of signing.
ENV_CHALLENGER_ACCOUNT = "CONSTITUTIONCOURT_CHALLENGER_ACCOUNT"
ENV_RESPONDENT_ACCOUNT = "CONSTITUTIONCOURT_RESPONDENT_ACCOUNT"
ENV_KEYSTORE_DIR = "CONSTITUTIONCOURT_KEYSTORE_DIR"

#: The address each account is expected to unlock to. Public, and the safety
#: catch that makes selection-by-name trustworthy: unlocking the wrong keystore
#: fails instead of signing as somebody else.
ENV_CHALLENGER_ADDRESS = "CONSTITUTIONCOURT_CHALLENGER_ADDRESS"
ENV_RESPONDENT_ADDRESS = "CONSTITUTIONCOURT_RESPONDENT_ADDRESS"

#: Discouraged fallback: a raw private key in the environment.
#:
#: Retained only for an unattended runner that has no terminal to prompt on. It
#: is strictly worse than a keystore — an environment variable lands in shell
#: history, `env` dumps, process listings and any crash reporter that serialises
#: os.environ, and it stays usable for the whole session rather than for the
#: moment of signing. `describe()` reports only whether one is present.
ENV_CHALLENGER_KEY = "CONSTITUTIONCOURT_CHALLENGER_KEY"
ENV_RESPONDENT_KEY = "CONSTITUTIONCOURT_RESPONDENT_KEY"

ENV_RPC = "CONSTITUTIONCOURT_RPC_URL"

#: Minimum balances, in GEN, before a write run is permitted.
#:
#: MEASURED (2026-08-01, read-only, from App 1's own Bradbury transactions via
#: the explorer index and EVM receipts):
#:
#:   74 paid transactions from the App 1 challenger wallet
#:   gas per transaction   775,485 – 26,316,488
#:   fee per transaction   0.00010 – 0.05486 GEN
#:   total for the whole App 1 pilot          0.35135 GEN
#:
#: DERIVED requirement for this pilot. Two cases need 5 writes (2 deploys,
#: 1 response, 2 rulings); the live suite's negative checks add up to ~5 more
#: that are submitted and revert. Call it 12 writes worst case:
#:
#:   12 × 0.05486 (the measured maximum) = 0.659 GEN
#:
#: HEADROOM, stated separately from the measurement: the thresholds below are
#: roughly 1.5× that worst case for the challenger, which signs everything, and
#: 0.5 GEN for the respondent, which signs one response. Gas price is not fixed
#: — it was 0.13–0.19 gwei across the measured sample — so the multiple absorbs
#: price movement rather than an unknown cost model.
#:
#: The earlier 5.0 / 2.0 figures were a guess made before any measurement
#: existed. They are revised down here because the measurement contradicted
#: them, not because a run was inconvenient.
MIN_CHALLENGER_GEN = 1.0
MIN_RESPONDENT_GEN = 0.5

#: Measured references, for the pilot record and for revising the above.
MEASURED_MAX_FEE_GEN = 0.05486
MEASURED_APP1_PILOT_TOTAL_GEN = 0.35135

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


class SigningMode:
    KEYSTORE = "keystore"
    RAW_KEY = "raw-key"
    NONE = "none"


@dataclass(frozen=True)
class Credentials:
    """How each party will sign, and whether it is configured at all.

    Holds selectors and modes — never a password, never key material.
    """

    challenger_mode: str
    respondent_mode: str
    challenger_selector: Optional[str]
    respondent_selector: Optional[str]

    @property
    def challenger_present(self) -> bool:
        return self.challenger_mode != SigningMode.NONE

    @property
    def respondent_present(self) -> bool:
        return self.respondent_mode != SigningMode.NONE

    @property
    def both_present(self) -> bool:
        return self.challenger_present and self.respondent_present

    @property
    def uses_raw_keys(self) -> bool:
        return SigningMode.RAW_KEY in (self.challenger_mode, self.respondent_mode)


def _mode_for(account_env: str, key_env: str) -> tuple:
    account = os.environ.get(account_env, "").strip()
    if account:
        return SigningMode.KEYSTORE, account
    if os.environ.get(key_env, "").strip():
        return SigningMode.RAW_KEY, None
    return SigningMode.NONE, None


def credentials() -> Credentials:
    c_mode, c_sel = _mode_for(ENV_CHALLENGER_ACCOUNT, ENV_CHALLENGER_KEY)
    r_mode, r_sel = _mode_for(ENV_RESPONDENT_ACCOUNT, ENV_RESPONDENT_KEY)
    return Credentials(
        challenger_mode=c_mode, respondent_mode=r_mode,
        challenger_selector=c_sel, respondent_selector=r_sel,
    )


def challenger_account_selector() -> Optional[str]:
    return os.environ.get(ENV_CHALLENGER_ACCOUNT, "").strip() or None


def respondent_account_selector() -> Optional[str]:
    return os.environ.get(ENV_RESPONDENT_ACCOUNT, "").strip() or None


def challenger_expected_address() -> Optional[str]:
    return os.environ.get(ENV_CHALLENGER_ADDRESS, "").strip() or None


def respondent_expected_address() -> Optional[str]:
    return os.environ.get(ENV_RESPONDENT_ADDRESS, "").strip() or None


def challenger_key() -> Optional[str]:
    """Discouraged fallback. Read at the moment of use, never cached or logged."""
    return os.environ.get(ENV_CHALLENGER_KEY, "").strip() or None


def respondent_key() -> Optional[str]:
    return os.environ.get(ENV_RESPONDENT_KEY, "").strip() or None


def describe() -> dict:
    """A loggable summary. Contains no secret and no fragment of one.

    Selectors and expected addresses are included deliberately: they are public,
    and seeing which account is about to sign is exactly what an operator needs
    before authorising a write.
    """
    creds = credentials()
    return {
        "chain": CHAIN_NAME,
        "chain_id": CHAIN_ID,
        "rpc_url": rpc_url(),
        "live_enabled": live_enabled(),
        "writes_enabled": writes_enabled(),
        "resume_enabled": resume_enabled(),
        "challenger_signing": creds.challenger_mode,
        "respondent_signing": creds.respondent_mode,
        "challenger_account": creds.challenger_selector,
        "respondent_account": creds.respondent_selector,
        "challenger_expected_address": challenger_expected_address(),
        "respondent_expected_address": respondent_expected_address(),
        "uses_raw_keys": creds.uses_raw_keys,
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
