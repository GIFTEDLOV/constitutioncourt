"""Named local keystore accounts — the safe way to sign.

A raw private key in an environment variable is the wrong shape for this job.
It lands in shell history, in `env` dumps, in process listings on some systems,
in CI logs the moment anything echoes the environment, and in any crash reporter
that serialises `os.environ`. The key is also *usable* for as long as the
variable exists, which is the whole session rather than the moment of signing.

A Web3 Secret Storage v3 keystore inverts all of that: what sits on disk is
encrypted and useless without a password, what sits in the environment is a
**name**, and the plaintext key exists only inside `unlock()` and inside the
`LocalAccount` it returns.

This module therefore:

* stores and logs **names and addresses only** — never a password, never key
  material, never a fragment of either;
* prompts for the password interactively via `getpass`, so it is never echoed,
  never a command-line argument, and never an environment variable;
* verifies the unlocked account is the address the operator expected, so
  unlocking the wrong account fails loudly instead of signing as a stranger;
* keeps the challenger and respondent entirely separate — separate selectors,
  separate prompts, separate `LocalAccount` objects.

The GenLayer CLI keeps its keystores in `~/.genlayer/keystores/<name>.json`,
which is the default location here.
"""

from __future__ import annotations

import getpass
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Optional

DEFAULT_KEYSTORE_DIR = Path.home() / ".genlayer" / "keystores"

ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


class KeystoreError(Exception):
    """Account selection or unlocking failed.

    Messages here are shown to operators and are deliberately specific about
    *what* went wrong — while never quoting a password, a key, or any part of
    either.
    """


@dataclass(frozen=True)
class KeystoreAccount:
    """Public metadata for a keystore file. Holds no secret."""

    name: str
    address: str
    path: Path

    def describe(self) -> str:
        return f"{self.name} ({self.address})"


def _normalise_address(raw: str) -> str:
    a = raw.strip()
    if not a.startswith("0x"):
        a = "0x" + a
    return a


def keystore_dir(override: Optional[str] = None) -> Path:
    if override:
        return Path(override).expanduser()
    env = os.environ.get("CONSTITUTIONCOURT_KEYSTORE_DIR", "").strip()
    if env:
        return Path(env).expanduser()
    return DEFAULT_KEYSTORE_DIR


def list_accounts(directory: Optional[Path] = None) -> List[KeystoreAccount]:
    """Every readable keystore in the directory, as public metadata.

    A file that is not valid JSON, or carries no address, is skipped rather
    than raising: one malformed keystore must not make the others unusable.
    """
    d = directory or keystore_dir()
    if not d.is_dir():
        return []
    out: List[KeystoreAccount] = []
    for path in sorted(d.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        address = data.get("address")
        if not isinstance(address, str) or not address:
            continue
        out.append(KeystoreAccount(
            name=path.stem,
            address=_normalise_address(address),
            path=path,
        ))
    return out


def find_account(
    selector: str, directory: Optional[Path] = None,
) -> KeystoreAccount:
    """Resolve a selector to exactly one account.

    A selector is a **name** (`deployer`) or an **address**
    (`0x456C…f1dc`). Both are safe to store, log and commit.

    Ambiguity is an error rather than a guess: signing with the wrong account is
    not recoverable, so two matches must stop the run.
    """
    accounts = list_accounts(directory)
    if not accounts:
        d = directory or keystore_dir()
        raise KeystoreError(
            f"No keystore accounts found in {d}. Create one with the GenLayer CLI, or set "
            "CONSTITUTIONCOURT_KEYSTORE_DIR to the directory holding them."
        )

    wanted = selector.strip()
    if not wanted:
        raise KeystoreError("No account selector given.")

    if ADDRESS_RE.match(_normalise_address(wanted)):
        target = _normalise_address(wanted).lower()
        matches = [a for a in accounts if a.address.lower() == target]
        kind = "address"
    else:
        matches = [a for a in accounts if a.name == wanted]
        kind = "name"

    if not matches:
        available = ", ".join(a.describe() for a in accounts)
        raise KeystoreError(
            f"No keystore account matches {kind} {wanted!r}. Available: {available}"
        )
    if len(matches) > 1:
        raise KeystoreError(
            f"{len(matches)} keystore accounts match {kind} {wanted!r}: "
            + ", ".join(a.describe() for a in matches)
            + ". Select by address to disambiguate."
        )
    return matches[0]


def unlock(
    account: KeystoreAccount,
    *,
    password: Optional[str] = None,
    expect_address: Optional[str] = None,
    prompt: Callable[[str], str] = getpass.getpass,
):
    """Decrypt a keystore and return a signing account.

    `password` exists for tests only. In normal use it is None and the password
    is read interactively — never echoed, never an argument, never an
    environment variable, never returned, never stored on the result.

    `expect_address` is the safety catch that makes named selection trustworthy:
    unlocking a keystore that turns out to be a different address fails rather
    than signing as somebody else.
    """
    from eth_account import Account

    try:
        keyfile = json.loads(account.path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise KeystoreError(f"Could not read keystore {account.path.name}: {exc}") from exc

    secret = password
    if secret is None:
        secret = prompt(f"Password for keystore account {account.describe()}: ")
    if not secret:
        raise KeystoreError("No password entered; the account was not unlocked.")

    try:
        private_key = Account.decrypt(keyfile, secret)
    except Exception as exc:
        # Deliberately does not echo the password, the reason, or the file body.
        raise KeystoreError(
            f"Could not unlock {account.describe()}: the password did not decrypt the "
            "keystore."
        ) from exc
    finally:
        # The local name is dropped either way; Python cannot zero the buffer,
        # but nothing here retains a reference beyond this frame.
        del secret

    local = Account.from_key(private_key)
    del private_key

    if expect_address and local.address.lower() != _normalise_address(expect_address).lower():
        raise KeystoreError(
            f"Keystore {account.describe()} unlocked to {local.address}, but "
            f"{_normalise_address(expect_address)} was expected. Refusing to sign with an "
            "unexpected account."
        )
    return local


def redact(value: Optional[str], *, keep: int = 0) -> str:
    """Render a value safely for logs.

    Used wherever a caller might otherwise be tempted to print something
    sensitive. With `keep=0` — the default and the only value used in this
    codebase for secrets — nothing of the original survives, because a prefix of
    a private key is still a meaningful reduction in its search space.
    """
    if value is None:
        return "(absent)"
    if not value:
        return "(empty)"
    if keep <= 0:
        return f"<redacted, {len(value)} chars>"
    return f"{value[:keep]}… <redacted, {len(value)} chars>"


def describe_accounts(directory: Optional[Path] = None) -> List[dict]:
    """Loggable account inventory. Names and addresses only."""
    return [{"name": a.name, "address": a.address, "file": a.path.name}
            for a in list_accounts(directory)]
