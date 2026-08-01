"""Thin adapter over genlayer-py 0.16.3.

Every call shape here was read from the installed SDK, not assumed:

* ``client.deploy_contract(code=..., args=[...], account=...)`` returns a hash.
* ``client.write_contract(address=..., function_name=..., args=[...],
  account=..., value=0)`` returns a hash.
* ``client.read_contract(address=..., function_name=..., args=[...])``.
* ``client.get_transaction(transaction_hash=...)``.
* There is **no** ``get_contract_code`` on the Python client — unlike the JS
  SDK — so contract code is fetched with a raw ``gen_getContractCode`` request.
  Bradbury is not Studio, so the parameter shape is ``[{"address": …}]``.

The protocol at the bottom is what the runner depends on, so the offline suite
substitutes a fake and exercises every failure branch without a network.
"""

from __future__ import annotations

import base64
from typing import Any, Dict, List, Mapping, Optional, Protocol

from . import config


class ChainAdapter(Protocol):
    """What the runner needs from a chain. Implemented live and in tests."""

    def chain_id(self) -> int: ...
    def balance_wei(self, address: str) -> int: ...
    def deploy(self, code: str, args: List[Any], account: Any) -> str: ...
    def write(self, address: str, method: str, args: List[Any], account: Any) -> str: ...
    def read(self, address: str, method: str) -> Any: ...
    def transaction(self, tx_hash: str) -> Optional[Mapping[str, Any]]: ...
    def contract_code(self, address: str) -> Optional[str]: ...


class GenLayerAdapter:
    """The live adapter. Constructed only when a live run is requested."""

    def __init__(self, rpc_url: Optional[str] = None):
        import genlayer_py as gl

        self._gl = gl
        self._chain = gl.testnet_bradbury
        if rpc_url and rpc_url != config.RPC_URL:
            # Honour an override without mutating the shared chain object.
            import copy

            self._chain = copy.deepcopy(self._chain)
            self._chain.rpc_urls["default"]["http"] = [rpc_url]
        self._client = gl.create_client(chain=self._chain)

    # -- accounts ----------------------------------------------------------

    def account(self, private_key: str):
        """Build a signing account. The key is used and not retained here."""
        return self._gl.create_account(account_private_key=private_key)

    # -- reads -------------------------------------------------------------

    def chain_id(self) -> int:
        return int(self._chain.id)

    def balance_wei(self, address: str) -> int:
        return int(self._client.w3.eth.get_balance(address))

    def read(self, address: str, method: str) -> Any:
        return self._client.read_contract(
            address=address, function_name=method, args=[]
        )

    def transaction(self, tx_hash: str) -> Optional[Mapping[str, Any]]:
        try:
            tx = self._client.get_transaction(transaction_hash=tx_hash)
        except Exception:
            # Not indexed yet, or a transient RPC fault. The caller keeps
            # waiting rather than concluding anything.
            return None
        if tx is None:
            return None
        return dict(tx) if not isinstance(tx, dict) else tx

    def contract_code(self, address: str) -> Optional[str]:
        """Raw ``gen_getContractCode``.

        Bradbury has ``is_studio == False``, so the parameter is a single-element
        list containing an object. Passing a bare address there, or an object
        where the SDK expects a bare address, is the exact class of mistake the
        Stage 5 audit found in the JS client.
        """
        try:
            resp = self._client.provider.make_request(
                "gen_getContractCode", [{"address": address}]
            )
        except Exception:
            return None
        result = resp.get("result") if isinstance(resp, Mapping) else None
        if not result:
            return None
        if isinstance(result, str):
            try:
                return base64.b64decode(result).decode("utf-8")
            except Exception:
                return result
        return str(result)

    # -- writes ------------------------------------------------------------

    def deploy(self, code: str, args: List[Any], account: Any) -> str:
        return str(self._client.deploy_contract(code=code, args=args, account=account))

    def write(self, address: str, method: str, args: List[Any], account: Any) -> str:
        return str(self._client.write_contract(
            address=address, function_name=method, args=args, account=account, value=0,
        ))

    # -- helpers -----------------------------------------------------------

    def address_arg(self, hex_address: str):
        """Encode an address as the SDK's calldata Address type.

        A plain ``"0x…"`` string would be encoded as a 42-character ``str`` and
        handed to a parameter annotated ``respondent: Address``; the contract's
        ``isinstance`` check then fails ~30 minutes and one signature later.
        """
        from genlayer_py.types import Address  # imported lazily, live runs only

        return Address(hex_address)


def normalize_state(raw: Any) -> Dict[str, Any]:
    """Coerce a decoded `get_state` payload into a plain dict.

    Calldata decodes a contract ``dict`` to a mapping; if a future SDK returns
    something Mapping-like but not a ``dict``, attribute access would silently
    yield nothing and a case would look blank rather than erroring.
    """
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, Mapping):
        return dict(raw)
    return {}
