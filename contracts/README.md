# contracts/

**Empty by design at Stage 1.** The contract is implemented in Stage 2, against
the locked specification in [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## What lands here

A single file, `constitution_court.py`. Not a package — the contract is one
adjudicator with five methods and no shared modules, so `py-genlayer` applies
rather than `py-genlayer-multi`.

## Constraints fixed before the first line is written

**Runner pin.** The first line must be exactly:

```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
```

`py-genlayer:test` and `py-genlayer:latest` are local-Studio aliases. Every
GenLayer network rejects them, and a contract carrying one is undeployable.

**LF line endings.** `contracts/**/*.py` is pinned to LF in `.gitattributes`.
The source is deployed byte-for-byte and its hash determines the contract
address, so line endings are part of the deployed artifact's identity. See the
README for what went wrong in App 1 when this was not pinned.

**Method set — exactly five.** `__init__`, `submit_response`, `rule`,
`get_state`, `get_evidence_sources`. Adding a sixth is an architecture change
and needs an entry in the
[change log](../docs/BUILD-PLAN.md#architecture-change-log).

**No custody.** No `payable` method, no external message, no EVM call, no
balance access. This is what removes the entire class of value-extraction
attacks from the [threat model](../docs/THREAT-MODEL.md).

**Storage field order is layout-critical.** Declare fields in the order given in
[ARCHITECTURE §6](../docs/ARCHITECTURE.md#6-contract-storage-model--locked).
GenLayer storage layout is positional; inserting a field shifts every subsequent
slot.

## Before committing anything here

```
genvm-lint check contracts/constitution_court.py
```
