# frontend/

**Empty by design at Stage 1.** Built in Stage 4.

Read-only case viewer plus case creation. Vite + React + TypeScript, matching
App 1's stack.

## Locked dependency pins

Exact versions, no ranges. Materialized as `package.json` plus a committed
`package-lock.json` when Stage 4 starts. Recorded here now so the choice is
version-controlled rather than made under time pressure later.

| Package        | Version   |
| -------------- | --------- |
| `genlayer-js`  | `1.1.8`   |
| `react`        | `18.3.1`  |
| `react-dom`    | `18.3.1`  |
| `typescript`   | `5.7.2`   |
| `vite`         | `6.0.7`   |
| `vitest`       | `2.1.8`   |

## Requirements carried from Stage 1

These are not UI preferences — each traces to a locked decision or a threat.

**The contract source is embedded and deployed byte-for-byte.** It is imported
with Vite's `?raw` and submitted as the deploy payload, so its hash decides the
deployed contract and therefore its address. `frontend/src/contract/*.py` is
**already** LF-pinned in `.gitattributes`, before the file exists. This is the
App 1 incident pre-empted rather than repeated
([T-3](../docs/THREAT-MODEL.md#t-3-consensus-split-through-non-determinism)).

**The frontend never decides.** It computes no outcome that the contract adopts.
If a preview is shown, it is visibly labelled non-authoritative. A frontend that
could compute the ruling and have the contract record it would mean this
application does not need GenLayer
([consensus boundary](../docs/ARCHITECTURE.md#4-consensus-boundary)).

**Rulings are never bare verdict badges.** The pinned evidence URLs are
displayed alongside every ruling so a reader can check the finding against its
basis ([T-7](../docs/THREAT-MODEL.md#t-7-misreading-certified-as-a-warrant)).

**Stored `reasoning` is labelled as the leader validator's explanation**, not
agreed text. Only `outcome` and `violated_rule_ids` are consensus-verified.
Presenting the prose as consensus output overstates what was agreed.

**An `OPEN` case is an unadjudicated claim.** Filing is free beyond gas, so the
existence of a case means someone paid gas to make an allegation and nothing
more. The UI must not present it as an accusation with weight
([T-6](../docs/THREAT-MODEL.md#t-6-frivolous-case-spam)).

## Exit condition

Typecheck, lint, unit tests and build green; a reproducibility check confirming
the embedded contract hashes identically on Windows and on Linux CI.
