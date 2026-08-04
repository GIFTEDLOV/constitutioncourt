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


#: The `from` address used for reads.
#
# `gen_call` requires a caller even for a view, and genlayer-py's
# `read_contract` refuses outright without one ("No account provided and no
# account is connected") — which is why every read through this adapter used to
# fail. The zero address satisfies the node, was verified to work against
# Bradbury for both `get_state` and `get_evidence_sources`, and keeps the
# promise this harness makes everywhere else: **a read never involves a key.**
#
# Minting a throwaway account would also work and is what an operator reaching
# for the SDK would do, but it creates key material to answer a question that
# needs none. The contract's views do not inspect their caller; if one ever
# did, the zero address fails closed rather than open.
READ_ONLY_CALLER = "0x" + "0" * 40


class GenLayerAdapter:
    """The live adapter. Constructed only when a live run is requested."""

    def __init__(self, rpc_url: Optional[str] = None,
                 caller: str = READ_ONLY_CALLER):
        import genlayer_py as gl

        self._gl = gl
        self._caller = caller
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

    def read(self, address: str, method: str,
             variant: str = "latest-nonfinal") -> Any:
        """Call a view, read-only, with an explicit caller address.

        Issues `gen_call` directly rather than going through
        `client.read_contract`, for two reasons found against Bradbury and
        genlayer-py 0.16.3:

        * `read_contract` requires a connected account and raises without one,
          even though a view needs no signer. This adapter is used by the
          browser-pilot path, which by design never holds an account.
        * `read_contract` then does ``"0x" + result`` on the response. Bradbury
          answers `gen_call` with an object (``{"data": …, "status": …, …}``),
          not a bare hex string, so that concatenation raises ``TypeError: can
          only concatenate str (not "dict") to str`` before the caller sees
          anything. Both response shapes are handled below.

        Nothing here signs, spends, or mutates.
        """
        from genlayer_py.abi import calldata
        from genlayer_py.abi.transactions import serialize
        from genlayer_py.contracts.utils import make_calldata_object
        import eth_utils

        payload = [
            calldata.encode(make_calldata_object(method=method, args=[], kwargs=None)),
            b"\x00",
        ]
        raw = self._client.provider.make_request("gen_call", [{
            "type": "read",
            "to": address,
            "from": self._caller,
            "data": serialize(payload),
            "transaction_hash_variant": variant,
        }])["result"]

        encoded = self._decode_envelope(raw)
        if encoded is None:
            return None
        return calldata.decode(
            eth_utils.hexadecimal.decode_hex("0x" + encoded.removeprefix("0x"))
        )

    @staticmethod
    def _decode_envelope(raw: Any) -> Optional[str]:
        """The hex payload out of a `gen_call` result, or None if there isn't one.

        Bradbury returns an object carrying `data`; older/other nodes return the
        hex directly. A malformed or empty response yields None rather than an
        exception, so a caller records "the node did not answer" instead of
        crashing a read-only reconstruction.
        """
        if isinstance(raw, str):
            return raw or None
        if isinstance(raw, Mapping):
            for key in ("data", "result", "payload", "return"):
                value = raw.get(key)
                if isinstance(value, str) and value:
                    return value
        return None

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
