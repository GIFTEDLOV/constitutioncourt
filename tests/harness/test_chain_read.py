"""Read-only contract calls through GenLayerAdapter — offline.

`GenLayerAdapter.read` used to call `client.read_contract` with no account, and
genlayer-py refuses that outright: *"No account provided and no account is
connected"*. Every read through this adapter therefore raised, which is what
stopped `pilot record` from ever writing a record for the case-002 run.

Reads now issue `gen_call` directly with an explicit caller address. These tests
pin three things: a caller is always sent, it holds no key material, and both
`gen_call` response shapes decode — including the Bradbury one that made
`read_contract` raise `TypeError` even once an account was supplied.

No network. The provider is a fake that records what it was asked.
"""

import pytest

from pilot.chain import READ_ONLY_CALLER, GenLayerAdapter


class FakeProvider:
    """Records requests; returns whatever the test queued."""

    def __init__(self, result):
        self.result = result
        self.requests = []

    def make_request(self, method, params):
        self.requests.append((method, params))
        return {"result": self.result}


class FakeClient:
    def __init__(self, result):
        self.provider = FakeProvider(result)


def adapter_with(result, caller=READ_ONLY_CALLER):
    """An adapter wired to a fake client.

    Built without `__init__` on purpose: the constructor's job is to create a
    real SDK client, which is exactly the network dependency this suite must not
    have. The read path under test is everything after that.
    """
    a = object.__new__(GenLayerAdapter)
    a._client = FakeClient(result)
    a._caller = caller
    return a


def encoded_state(payload):
    """`payload` encoded the way the node returns it, as a hex string."""
    from genlayer_py.abi import calldata

    return calldata.encode(payload).hex()


ADDRESS = "0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc"
STATE = {"status": "RULED", "outcome": "NON_COMPLIANT"}


# -------------------------------------------------------- the from field ----


def test_a_read_always_sends_a_caller_address():
    a = adapter_with({"data": encoded_state(STATE)})
    a.read(ADDRESS, "get_state")

    method, params = a._client.provider.requests[0]
    assert method == "gen_call"
    assert params[0]["from"] == READ_ONLY_CALLER
    assert params[0]["to"] == ADDRESS
    assert params[0]["type"] == "read"


def test_the_default_caller_is_the_zero_address():
    """A read must never need a key.

    The zero address satisfies the node's requirement for a caller while
    holding nothing: no keystore is opened, no account is minted, and there is
    no private key in the process to leak. It also fails closed rather than
    open if a view ever inspects its caller.
    """
    assert READ_ONLY_CALLER == "0x" + "0" * 40


def test_an_explicit_caller_is_honoured():
    caller = "0x456Ccff0d33463E1834F724C5C5971D6cff6f1dc"
    a = adapter_with({"data": encoded_state(STATE)}, caller=caller)
    a.read(ADDRESS, "get_state")
    assert a._client.provider.requests[0][1][0]["from"] == caller


def test_the_hash_variant_is_explicit_and_overridable():
    a = adapter_with({"data": encoded_state(STATE)})
    a.read(ADDRESS, "get_state")
    assert a._client.provider.requests[0][1][0]["transaction_hash_variant"] \
        == "latest-nonfinal"

    a.read(ADDRESS, "get_state", variant="latest-final")
    assert a._client.provider.requests[1][1][0]["transaction_hash_variant"] \
        == "latest-final"


def test_a_read_never_asks_the_client_to_write():
    a = adapter_with({"data": encoded_state(STATE)})
    a.read(ADDRESS, "get_state")
    assert all(m == "gen_call" for m, _ in a._client.provider.requests)


# ------------------------------------------------------- response shapes ----


def test_the_bradbury_envelope_decodes():
    """Bradbury answers `gen_call` with an object carrying `data`.

    genlayer-py's `read_contract` does `"0x" + result` on that object and raises
    `TypeError: can only concatenate str (not "dict") to str` — so supplying an
    account alone would not have been enough to make reads work.
    """
    a = adapter_with({"data": encoded_state(STATE), "status": "success",
                      "stdout": "", "eqOutputs": {}})
    assert a.read(ADDRESS, "get_state") == STATE


def test_a_bare_hex_string_response_decodes():
    # The older/simpler shape, still supported.
    a = adapter_with(encoded_state(STATE))
    assert a.read(ADDRESS, "get_state") == STATE


def test_a_0x_prefixed_response_decodes():
    a = adapter_with("0x" + encoded_state(STATE))
    assert a.read(ADDRESS, "get_state") == STATE


# --------------------------------------------------- malformed responses ----


@pytest.mark.parametrize("result", [
    None,
    {},
    "",
    {"data": None},
    {"data": ""},
    {"status": "error"},
    {"unexpected": "shape"},
    [1, 2, 3],
    42,
])
def test_a_malformed_response_reads_as_no_answer_not_a_crash(result):
    """A reconstruction must record "the node did not answer", not die.

    browser_pilot treats a falsy read as a missing answer and records it as a
    failed check. An exception here would abort the whole reconstruction and
    lose the steps already verified.
    """
    a = adapter_with(result)
    assert a.read(ADDRESS, "get_state") is None


def test_undecodable_payload_raises_rather_than_inventing_state():
    # Not the same as "no answer": the node said something, and it was not
    # valid calldata. Silently returning None would look like an empty contract.
    a = adapter_with({"data": "zzzz"})
    with pytest.raises(Exception):
        a.read(ADDRESS, "get_state")


@pytest.mark.parametrize("raw,expected", [
    ("abcd", "abcd"),
    ({"data": "abcd"}, "abcd"),
    ({"result": "abcd"}, "abcd"),
    ({"payload": "abcd"}, "abcd"),
    ({"data": "", "result": "abcd"}, "abcd"),
    (None, None),
    ({}, None),
    ({"data": 5}, None),
])
def test_envelope_extraction(raw, expected):
    assert GenLayerAdapter._decode_envelope(raw) == expected
