"""Deploy-receipt field extraction and contract-address recovery.

Pure functions over a receipt dict.

The address rule is the one that matters, and the Stage 5 audit established it
against genlayer-py 0.16.3 and genlayer-js 1.1.8:

* The deployed address comes from ``txDataDecoded.contractAddress`` and nowhere
  else. There is no top-level ``contractAddress`` on a GenLayer transaction.
* ``recipient`` is **not** a fallback. A deploy is submitted with the zero
  address as recipient, so a deploy receipt's recipient is always ``0x000…0``
  and is never the contract. Falling back to it hands verification a
  syntactically valid address belonging to no contract.
* The zero address is rejected explicitly, because "absent" and "zero" are the
  same fact wearing different clothes and both mean nothing was deployed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping, Optional

ZERO_ADDRESS = "0x" + "0" * 40
ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


class AddressRecoveryError(Exception):
    """The receipt does not name a usable contract address."""


@dataclass(frozen=True)
class DeployReceipt:
    status: str
    execution: str
    consensus: str
    #: Only ever from txDataDecoded.contractAddress.
    contract_address: Optional[str]
    #: Carried for diagnostics. For a deploy this is the zero address.
    recipient: Optional[str]
    raw: Mapping[str, Any]


def _s(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "value"):
        value = value.value
    return str(value)


def parse_deploy_receipt(receipt: Optional[Mapping[str, Any]]) -> Optional[DeployReceipt]:
    if receipt is None:
        return None
    decoded = receipt.get("txDataDecoded") or {}
    if not isinstance(decoded, Mapping):
        decoded = {}
    return DeployReceipt(
        status=_s(receipt.get("statusName") or receipt.get("status")).upper(),
        execution=_s(receipt.get("txExecutionResultName")).upper(),
        consensus=_s(receipt.get("resultName")).upper(),
        contract_address=(_s(decoded.get("contractAddress")) or None),
        recipient=(_s(receipt.get("recipient")) or None),
        raw=receipt,
    )


def recover_contract_address(parsed: Optional[DeployReceipt]) -> str:
    """Return the deployed address, or raise with a reason.

    Never returns the zero address, and never falls back to `recipient`.
    """
    if parsed is None:
        raise AddressRecoveryError(
            "The deploy transaction could not be read, so no address can be recovered."
        )

    address = parsed.contract_address
    if not address:
        extra = ""
        if parsed.recipient:
            extra = (f" Its recipient is {parsed.recipient}, which for a deploy is the zero "
                     "address and never the deployed contract.")
        raise AddressRecoveryError(
            "The finalized receipt names no contract address in txDataDecoded." + extra
        )

    if not ADDRESS_RE.match(address):
        raise AddressRecoveryError(
            f"The receipt names {address!r}, which is not a 20-byte address."
        )

    if address.lower() == ZERO_ADDRESS:
        raise AddressRecoveryError(
            "The receipt names the zero address as the contract. Nothing was deployed."
        )

    return address


def is_address(value: Any) -> bool:
    return isinstance(value, str) and bool(ADDRESS_RE.match(value.strip()))


def same_address(a: Optional[str], b: Optional[str]) -> bool:
    """Case-insensitive comparison.

    Required, not optional: the contract returns EIP-55 checksummed mixed case
    from ``Address.as_hex`` while wallets and RPC payloads commonly return
    lowercase. A case-sensitive compare would make a party look like an observer.
    """
    return bool(a) and bool(b) and a.strip().lower() == b.strip().lower()
