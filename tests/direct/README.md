# tests/direct/

**Empty by design at Stage 1.** The suite is written in Stage 3, against the
[test matrix](../../docs/BUILD-PLAN.md#test-matrix).

Direct mode runs offline with no GenLayer node: fast (tens of milliseconds),
deterministic, and suitable for CI on every push. It exercises business logic,
input validation, state transitions and the ruling invariants. It does **not**
exercise real validator consensus — that needs integration tests against a live
network, which are deferred to Stage 5.

## What lands here

`conftest.py` plus thirteen test modules. `conftest.py` carries three pieces of
shared machinery:

**The SDK-loader dance.** Direct mode only wires up the GenVM SDK during
`deploy_contract` and tears it down after each test — but an `Address`-typed
constructor argument has to exist *before* the deploy call. Obtaining `Address`
and the `calldata` codec therefore requires calling
`gltest.direct.sdk_loader.setup_sdk_paths` first. It is idempotent. App 1's
`as_address` helper is the reference implementation.

This matters more than it looks: `respondent` arrives calldata-decoded as an
`Address`. A hex *string* survives the round trip as a `str`, so a test that
passes a string is testing a different signature than production uses.

**Fixture loading.** The four cases in [`../../evidence/`](../../evidence/) are
read from disk. Direct-mode tests never touch the network.

**Mocked evidence fetches**, keyed by URL, so a test can serve a 503, a 404,
unparseable bytes, or a document with the wrong `schema` literal — the error
paths in [T-4](../../docs/THREAT-MODEL.md#t-4-transient-failure-recorded-as-a-verdict).

## Running

```
pytest tests/direct
```

`pytest.ini` excludes the `integration` marker by default, so the bare `pytest`
command stays fast and offline.
