# Case 002 — live pilot record

**Status: ruled on-chain, ruling transaction awaiting finalization.**

This is the record of the first real ConstitutionCourt dispute filed,
adjudicated and ruled on GenLayer Bradbury Testnet. Every figure here was read
back from the chain, read-only. Nothing in this document is projected.

Last verified: **2026-08-02 21:58 UTC**.

---

## 1. What was filed

| | |
| --- | --- |
| Case | `case-002-non-compliant-two-thirds` |
| Title | `Meridian Collective — MC-2026-021 two-thirds threshold challenge` |
| Proposal id | `MC-2026-021` |
| Requested amount | 250,000 USDC |
| Tally | for 340,000 · against 180,000 · abstain 30,000 |
| Declared result | `PASSED` — **the thing in dispute** |
| Lifecycle exercised | `OPEN → RULED` (respondent silent, by design) |

The case turns on validators refusing to adopt the organisation's own claim
about its own vote.

## 2. Chain identifiers

| | |
| --- | --- |
| Network | GenLayer Bradbury Testnet, chain `4221` |
| Contract | `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` |
| Challenger | `0x456Ccff0d33463E1834F724C5C5971D6cff6f1dc` |
| Respondent | `0x79DD8260773C7D5DEA701dfC2D3dD804FF041bf2` |
| Deployed source SHA-256 | `bf845bc43768cb0829157ae9e7dad01a4d15b333c4139255d5018ac6ecf99341` |

The on-chain contract source was read back with `gen_getContractCode` and hashes
to **exactly the canonical repository file** — 32,043 bytes, LF only.

## 3. Transactions

| Purpose | Hash | Submitted (UTC) | Consensus state | Execution |
| --- | --- | --- | --- | --- |
| Deploy | `0x59d661867b1f4ffb93d8673523ccc36496ea7997727585c0f3d3e7570d7c9400` | 09:32:02 | **`FINALIZED`** at 10:02:24 | `FINISHED_WITH_RETURN` |
| **Ruling (effective)** | `0xe22b0ff6743c3b29082f463365f2999a4f90da4eea462a434ef1983eec3bc406` | 10:13:02 | `ReadyToFinalize` (code 11) | `FINISHED_WITH_RETURN` |
| Duplicate ruling | `0x42b6a679116050aee83fb4e96bf4ae0b4f683809bdf128c0be2a906e68ae6e9d` | 10:12:54 | `AppealRevealing` (code 9) | `TIMEOUT` |

Deploy finalized in **30 minutes 22 seconds**, matching the documented Bradbury
norm.

### 3.1 The duplicate submission

Two ruling calls were submitted **8 seconds apart**. This was a double
submission, not a retry — the harness never resent anything.

The earlier one (`0x42b6a679`) executed to `TIMEOUT` and **applied no state**.
The later one (`0xe22b0ff6`) executed successfully and is the ruling now
recorded on the contract: `ruled_at` is `2026-08-02T10:13:02Z`, which matches
its submission second for second.

The duplicate cannot double-rule. Ruling is terminal, and the contract rejects
ruling an already-`RULED` case with a `UserError` that changes nothing.

## 4. Validator votes

### Effective ruling — `0xe22b0ff6`

One round, result `majority_agree`:

| Vote | Count | Validators |
| --- | --- | --- |
| `finished_with_return` | 4 | `0x4FC292d5…` (leader), `0x7c23E702…`, `0x4f36CB2C…`, `0xa856ae1b…` |
| `nondet_disagree` | 1 | `0xA58D6FcC…` |

`leader_timeout: 0`, `validator_timeout: 0`. A single `nondet_disagree` is
ordinary non-determinism across independent readings and was outvoted 4–1.

### Duplicate — `0x42b6a679`

Four rounds, never reaching a terminal state:

| Round | Result | Votes |
| --- | --- | --- |
| 0 | `idle` | 5 × `not_voted` |
| 0 (retry) | `idle` | — |
| 0 (retry) | `majority_timeout` | 2 × `nondet_disagree`, 3 × `timeout` |
| 3 | `idle` | 5 × `finished_with_return`, 4 × `nondet_disagree`, 3 × `timeout`, 1 × `not_voted` |

The set expanded to 13 validators on rotation and still did not converge.

## 5. Authoritative case state

Read from the contract with `gen_call` (`type: read`), no wallet:

```json
{
  "status": "RULED",
  "outcome": "NON_COMPLIANT",
  "final_status": "REJECTED",
  "violated_rule_ids": ["ART-4.3"],
  "created_at": "2026-08-02T09:32:02Z",
  "ruled_at":   "2026-08-02T10:13:02Z",
  "has_response": false,
  "responded_at": ""
}
```

**This matches the fixture's expected outcome exactly.** The expectation was
recorded in `docs/DEPLOY.md` before the case was filed, not after it ruled.

### Leader reasoning, as stored

> The proposal requested 250,000 USDC, which exceeds the 100,000 USDC threshold
> specified in ART-4.3, requiring a supermajority of at least two-thirds of votes
> cast. The vote tally shows 340,000 for, 180,000 against, and 30,000 abstain.
> Excluding abstentions, the denominator is 520,000 (340,000 + 180,000). The
> 'for' fraction is 340,000/520,000 ≈ 0.6538, which is less than the required 2/3
> (≈0.6667). Therefore, the proposal did not meet the supermajority approval
> threshold and violates ART-4.3.

The arithmetic is correct and the abstention handling follows the rule's own
words. Two citations were recorded, both anchored to commit-pinned URLs.

This reasoning is the **leader validator's audit record**, not a
consensus-verified artefact. Consensus covered the outcome and the rule-id set.

## 6. Finalization — open

Neither ruling transaction has finalized.

- `0xe22b0ff6` has sat at `ReadyToFinalize` since **10:23:17 UTC**, unchanged for
  over 11 hours.
- `0x42b6a679` last advanced at **16:12:47 UTC** and has been static since.

Bradbury serialises transactions per contract and each step waits on the
previous one's finality. The duplicate holds the queue slot ahead of the
effective ruling, so the effective ruling cannot finalize until the duplicate
reaches a terminal state.

### What this means

| Question | Answer |
| --- | --- |
| Did the ruling execute? | **Yes** — `FINISHED_WITH_RETURN`, 4/5 consensus. |
| Is the case state authoritative? | **Yes** — the contract reads `RULED`. |
| Has the ruling transaction finalized? | **No.** |
| Has the duplicate reached a terminal state? | **No.** |
| Can this be persisted as *final* pilot evidence? | **Not yet.** |

Until finalization, the ruling remains theoretically reversible by a successful
appeal. It should be cited as **"ruled, accepted, awaiting finalization"** — not
as final.

No pilot record was written to `deploy/bradbury/case-002/`, because the record
format is reserved for a finalized run.

### Not doing

- No resubmission. The rejection path left nothing orphaned; a third ruling call
  would simply queue behind the two already in flight.
- No appeal. An appeal would restart consensus on a ruling that already passed
  4–1.

## 7. What this pilot demonstrates

- A real governance dispute was adjudicated by independent validators reading
  commit-pinned evidence, with no privileged reader and no off-chain decision.
- The verdict matched the expectation written before the filing.
- Silence did not block adjudication: the respondent never answered and the case
  ruled from `OPEN` anyway.
- The deployed bytes were verifiably the audited source.

## 8. What it does not demonstrate

- **The respondent-response flow.** Case 002 has no `response.json` by design.
  Exercising `OPEN → RESPONDED → RULED` live requires Case 003, **which has not
  been run.** No contract is deployed for it and no ruling exists on-chain. That
  path is covered by the offline suite only.
- **Finalization end to end.** The deploy finalized; the ruling has not.
- **`CERTIFIED` or `UNRESOLVED` outcomes live.** Only `REJECTED` has been
  produced on-chain. The other two exist as fixture expectations.
