"""Resolving the two signing accounts, keystore-first.

One function per party, so the challenger and the respondent are never resolved
from a shared code path and can never accidentally end up as the same account.

Order of preference, most to least safe:

1. **Named keystore account** — the selector is a name or address in the
   environment; the password is entered interactively at the moment of signing.
2. **Raw private key in the environment** — retained only for an unattended
   runner with no terminal, and reported as such wherever it is used.

There is deliberately no third option that reads a password from the
environment or a file: that would recreate the problem the keystore solves.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from . import config
from .keystore import KeystoreError, find_account, keystore_dir, unlock


@dataclass
class ResolvedSigner:
    """A signing account plus how it was obtained. Holds no secret."""

    role: str
    address: str
    mode: str
    #: Keystore name, when a keystore was used.
    account_name: Optional[str]
    #: The `LocalAccount`. Its key material is not logged or persisted.
    account: object

    def describe(self) -> dict:
        return {
            "role": self.role,
            "address": self.address,
            "signing": self.mode,
            "account": self.account_name,
        }


def _resolve(
    role: str,
    selector: Optional[str],
    raw_key: Optional[str],
    expected_address: Optional[str],
    account_factory: Callable[[str], object],
    *,
    password: Optional[str] = None,
    prompt=None,
) -> ResolvedSigner:
    if selector:
        account = find_account(selector)
        kwargs = {"password": password, "expect_address": expected_address}
        if prompt is not None:
            kwargs["prompt"] = prompt
        local = unlock(account, **kwargs)
        return ResolvedSigner(
            role=role, address=local.address, mode=config.SigningMode.KEYSTORE,
            account_name=account.name, account=local,
        )

    if raw_key:
        local = account_factory(raw_key)
        address = getattr(local, "address", None)
        if expected_address and address and address.lower() != expected_address.lower():
            raise KeystoreError(
                f"The {role} raw key resolves to {address}, but {expected_address} was "
                "expected. Refusing to sign with an unexpected account."
            )
        return ResolvedSigner(
            role=role, address=address or "", mode=config.SigningMode.RAW_KEY,
            account_name=None, account=local,
        )

    raise KeystoreError(
        f"No {role} signing account configured. Set "
        f"{config.ENV_CHALLENGER_ACCOUNT if role == 'challenger' else config.ENV_RESPONDENT_ACCOUNT}"
        f" to a keystore account name or address (keystores are read from {keystore_dir()})."
    )


def resolve_challenger(account_factory, *, password=None, prompt=None) -> ResolvedSigner:
    return _resolve(
        "challenger",
        config.challenger_account_selector(),
        config.challenger_key(),
        config.challenger_expected_address(),
        account_factory,
        password=password,
        prompt=prompt,
    )


def resolve_respondent(account_factory, *, password=None, prompt=None) -> ResolvedSigner:
    return _resolve(
        "respondent",
        config.respondent_account_selector(),
        config.respondent_key(),
        config.respondent_expected_address(),
        account_factory,
        password=password,
        prompt=prompt,
    )


def assert_distinct(challenger: ResolvedSigner, respondent: ResolvedSigner) -> None:
    """The constructor rejects a case against oneself; catch it before signing."""
    if challenger.address.lower() == respondent.address.lower():
        raise KeystoreError(
            f"The challenger and respondent resolved to the same address "
            f"({challenger.address}). The contract rejects a case against oneself."
        )
