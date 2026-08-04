# Case 002 — live pilot record

# RULING CANCELED BY THE NETWORK — CASE IS BACK TO `OPEN`

**This is not "pilot complete", and it is no longer "ruled on-chain".** A ruling
executed on 2026-08-02 and the contract read `RULED` for about a day. On
2026-08-04 a read-only re-check found that **Bradbury canceled both ruling
transactions** and the contract state has reverted to `OPEN`.

Sections 1–7 record the run **as it stood on 2026-08-02**. Section 8 records the
current state and supersedes them wherever they conflict. Nothing has been
deleted: the run happened, and the record of what it produced is worth keeping
even though the chain no longer attests to it.

Every figure below was read back from the chain, read-only. Nothing here is
projected or estimated.

| | |
| --- | --- |
| Pilot date | **2026-08-02** |
| Last verified | **2026-08-04** — see §8 |
| Current contract state | **`OPEN`** — no ruling on-chain |
| Network | GenLayer Bradbury Testnet, chain `4221` — testnet only |
| RPC | `https://rpc-bradbury.genlayer.com` |
| Explorer | `https://explorer-bradbury.genlayer.com` |

---

## 1. Case filed

| | |
| --- | --- |
| Fixture | `case-002-non-compliant-two-thirds` |
| Title | `Meridian Collective — MC-2026-021 two-thirds threshold challenge` |
| Proposal id | `MC-2026-021` |
| Requested amount | 250,000 USDC |
| Tally | for 340,000 · against 180,000 · abstain 30,000 |
| Declared result | `PASSED` — **the thing in dispute** |
| Lifecycle exercised | `OPEN → RULED` (respondent silent, by design) |

## 2. Accounts

| Role | Address |
| --- | --- |
| Challenger | `0x456Ccff0d33463E1834F724C5C5971D6cff6f1dc` |
| Respondent | `0x79DD8260773C7D5DEA701dfC2D3dD804FF041bf2` |

Signing was performed in a browser wallet. The harness ran in browser-pilot mode
and **never held a key, never signed, and never submitted**.

## 3. Evidence

**Pinned commit:** `1d1174e9f30e8674c28ab41272125ea11d691d84` (40 hex, never a
branch)

Base: `https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-002-non-compliant-two-thirds/`

| Role | File | Bytes | SHA-256 |
| --- | --- | --- | --- |
| Constitution | `constitution.json` | 2611 | `08ea34a2b415aa94608a6f009ec5353b4e3decdd8eb094416929e31fb3023b99` |
| Proposal | `proposal.json` | 662 | `638b7882dd48000681e14ade81e500185a1efacf752195cecedd002eaf5c2be9` |
| Vote record | `vote-record.json` | 372 | `52e330445a9177278bcc4a26d61582007b67a2d5ec59510068f41c50cac533b1` |
| Notice record | `notice-record.json` | 476 | `f7b5d2d04316bccc3519d72e63858efa229af1b2a1b1aecee3f487d879c32e30` |

**No response document.** Case 002 has none by design — its respondent stayed
silent, which is a first-class path.

All four URLs were re-fetched and re-hashed by the read-only preflight
immediately before filing, and are re-verified in CI on every push.

## 4. Deployment

| | |
| --- | --- |
| Contract address | `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` |
| Deploy transaction | `0x59d661867b1f4ffb93d8673523ccc36496ea7997727585c0f3d3e7570d7c9400` |
| Submitted | `2026-08-02 09:32:02 UTC` |
| **Finalized** | **`2026-08-02 10:02:24 UTC` — 30m 22s** |
| Execution result | `FINISHED_WITH_RETURN` |
| Deployed source SHA-256 | `bf845bc43768cb0829157ae9e7dad01a4d15b333c4139255d5018ac6ecf99341` |
| Deployed source size | 32,043 bytes, LF only |

The on-chain source was read back with `gen_getContractCode` and hashes to
**exactly** the canonical repository file. The deployment finalized normally,
matching the documented Bradbury norm of roughly 30 minutes.

## 5. Ruling transactions — as observed on 2026-08-02

> **Superseded.** Both transactions have since been **`CANCELED`** by the
> network. The consensus states in this table are what the chain reported on
> 2026-08-02; see §8 for what it reports now.

Two ruling calls were submitted **8 seconds apart**. This was a double submission
from the client, not a retry — the harness never resent anything.

| Purpose | Hash | Submitted | Consensus state | Execution |
| --- | --- | --- | --- | --- |
| **Effective ruling** | `0xe22b0ff6743c3b29082f463365f2999a4f90da4eea462a434ef1983eec3bc406` | 10:13:02 | `ReadyToFinalize` (code 11) | `FINISHED_WITH_RETURN` |
| Duplicate | `0x42b6a679116050aee83fb4e96bf4ae0b4f683809bdf128c0be2a906e68ae6e9d` | 10:12:54 | `AppealRevealing` (code 9) | `TIMEOUT` |

The earlier call executed to `TIMEOUT` and **applied no state**. The later one
executed successfully and is the ruling recorded on the contract: `ruled_at` is
`2026-08-02T10:13:02Z`, matching its submission second for second.

The duplicate cannot double-rule. Ruling is terminal, and the contract rejects
ruling an already-`RULED` case with a `UserError` that changes nothing.

## 6. Validator votes — as observed on 2026-08-02

> **Superseded.** The canceled effective-ruling transaction now reports zero
> rounds and `NOT_VOTED` for all five validators, with no leader receipt. The
> votes below are what the chain reported on 2026-08-02.

### Effective ruling — `0xe22b0ff6`

One round, result **`majority_agree`**:

| Vote | Count | Validators |
| --- | --- | --- |
| `finished_with_return` | **4** | `0x4FC292d5…` (leader), `0x7c23E702…`, `0x4f36CB2C…`, `0xa856ae1b…` |
| `nondet_disagree` | 1 | `0xA58D6FcC…` |

`leader_timeout: 0`, `validator_timeout: 0`. A single `nondet_disagree` is
ordinary non-determinism across independent readings; it was outvoted 4–1.

### Duplicate — `0x42b6a679`

Four rounds, never reaching a terminal state:

| Round | Result | Votes |
| --- | --- | --- |
| 0 | `idle` | 5 × `not_voted` |
| 0 (retry) | `idle` | — |
| 0 (retry) | `majority_timeout` | 2 × `nondet_disagree`, 3 × `timeout` |
| 3 | `idle` | 5 × `finished_with_return`, 4 × `nondet_disagree`, 3 × `timeout`, 1 × `not_voted` |

The validator set expanded to 13 on rotation and still did not converge. Last
state change: `2026-08-02 16:12:47 UTC`.

## 7. Contract state on 2026-08-02 — superseded, see §8

> **This is no longer the contract's state.** It reverted to `OPEN` when the
> ruling transactions were canceled. Kept as the record of what the ruling
> produced while it stood.

Read with `gen_call` (`type: read`), no wallet:

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

| Field | Value |
| --- | --- |
| Status | `RULED` |
| Outcome | `NON_COMPLIANT` |
| Final status | `REJECTED` |
| Violated rule ids | `["ART-4.3"]` |
| `ruled_at` | `2026-08-02T10:13:02Z` |

**This matches the fixture's expected outcome exactly** — and the expectation was
recorded in `docs/DEPLOY.md` before the case was filed, not after it ruled.

### Citations recorded (2)

| Source | Locator | Quoted | Bears on |
| --- | --- | --- | --- |
| `proposal` | `$.requested_amount.amount` | `250000` | `ART-4.3` |
| `vote-record` | `$.tally` | `{'abstain': '30000', 'against': '180000', 'for': '340000'}` | `ART-4.3` |

Both resolve to the commit-pinned URLs in section 3.

### Leader reasoning, as stored

> The proposal requested 250,000 USDC, which exceeds the 100,000 USDC threshold
> specified in ART-4.3, requiring a supermajority of at least two-thirds of votes
> cast. The vote tally shows 340,000 for, 180,000 against, and 30,000 abstain.
> Excluding abstentions, the denominator is 520,000 (340,000 + 180,000). The
> 'for' fraction is 340,000/520,000 ≈ 0.6538, which is less than the required 2/3
> (≈0.6667). Therefore, the proposal did not meet the supermajority approval
> threshold and violates ART-4.3.

The arithmetic is correct and the abstention handling follows the rule's own
words. This is the **leader validator's audit record**, not a consensus-verified
artefact — consensus covered the outcome and the rule-id set.

## 8. Current state — read-only re-check, 2026-08-04

**Both ruling transactions were canceled by the network. The case is `OPEN`.**

Read with `gen_call` (`type: read`) using an ephemeral throwaway address as the
`from` field. No keystore was opened, no configured credential was read, no
transaction was built, nothing was signed and no GEN was spent. The state read
was repeated **six times** — three attempts × both `latest-final` and
`latest-nonfinal` — and was identical every time.

### Transactions

| Transaction | Status | Execution | Rounds | Leader receipt |
| --- | --- | --- | --- | --- |
| `0x59d661867b…` (deploy) | **`FINALIZED`** (7) | `FINISHED_WITH_RETURN` | 0 | — |
| `0xe22b0ff6…` (effective ruling) | **`CANCELED`** (8) | `NOT_VOTED` | 0 | `null` |
| `0x42b6a679…` (duplicate ruling) | **`CANCELED`** (8) | `NOT_VOTED` | 4 | `null` |

The effective ruling now reports `tx_receipt: "0x"`, `num_of_rounds: 0` and
`NOT_VOTED` for all five of its round validators. **The chain no longer attests
to the 4/5 `majority_agree` recorded in §6.**

### Contract state

```json
{
  "status": "OPEN",
  "outcome": "",
  "final_status": "",
  "violated_rule_ids": [],
  "created_at": "2026-08-02T09:32:02Z",
  "ruled_at": "",
  "has_response": false,
  "responded_at": ""
}
```

`get_evidence_sources` is unchanged: all four URLs still pinned to commit
`1d1174e9f30e8674c28ab41272125ea11d691d84`, `response_url` empty.

### What survived and what did not

| Fact | State on 2026-08-04 |
| --- | --- |
| Contract deployed and finalized | **Intact** — deploy status `FINALIZED` |
| Deployed bytes | **Intact** — 32,043 B, SHA-256 `bf845bc4…`, matches the repository source |
| Pinned evidence URLs | **Intact** — all four, commit-pinned |
| The ruling | **Gone** — both ruling transactions `CANCELED`, state back to `OPEN` |

### This is a network condition, not a defect

| Evidence | Reading |
| --- | --- |
| Contract returned `FINISHED_WITH_RETURN` with 4/5 `majority_agree` when it ran | The contract executed correctly |
| Deploy finalized normally in 30m 22s and its bytes still verify | The pipeline works when the network is healthy |
| Cancellation hit **both** ruling transactions, including one that had already executed | A consensus-layer outcome, not a contract-layer one |
| 866 automated tests pass; all CI jobs green | No application defect is implicated |

`CANCELED` is a **failed, terminal** status under `pilot/classify.py`. Both calls
settled and applied no state, so nothing is in flight and nothing is orphaned.

**Nothing in this repository needs to change for the case to be ruled again.**
Ruling is permissionless and the case is `OPEN`, so it needs no redeploy — only
a working network.

## 9. Stop decision — taken 2026-08-03, while the transactions were still in flight

**Stopped deliberately. No further transaction was submitted.**

> The reasoning below was correct for the state at the time. Both ruling
> transactions have since reached a terminal `CANCELED` state, so the
> "queued behind two in flight" and "already passed 4–1" conditions no longer
> hold — see §8 and §12.

| Action | Decision |
| --- | --- |
| Resubmit the ruling | **No.** Nothing was orphaned; a third call would queue behind the two in flight. |
| Appeal the effective ruling | **No.** An appeal would restart consensus on a ruling that already passed 4–1. |
| Deploy Case 003 | **No.** Bradbury writes are unavailable. |
| Request a wallet signature | **No.** |
| Spend GEN | **No.** |
| Write a pilot record to `deploy/bradbury/case-002/` | **No.** That format is reserved for a finalized run. |

Total transactions submitted for this pilot: **three** — one deploy, two rulings
(one of them an unintended duplicate). No transaction has been submitted since.

## 10. Case 003 — not run

**Case 003 is not deployed.** No contract exists for it and no ruling exists
on-chain.

Its fixtures are complete and its expected outcome (`NON_COMPLIANT` → `REJECTED`,
citing `ART-5.4`) is asserted by the offline suite, but that is an expectation,
not a ruling. The **respondent-response path `OPEN → RESPONDED → RULED` is
tested, not live-proven.**

## 11. Lessons learned

1. **Guard submission at the client.** The single most costly event in this
   pilot was a double submission 8 seconds apart. It cost nothing in GEN and
   changed no state, but it stalled finalization indefinitely by occupying the
   queue slot ahead of the real ruling. An idempotency guard on the filing and
   ruling controls would have prevented it outright.
2. **Per-contract serialisation makes a stuck transaction contagious.** A
   transaction that never terminates does not merely fail — it blocks every
   later transaction on the same contract. Any operator runbook needs a defined
   wait-and-escalate threshold rather than open-ended waiting.
3. **`accepted` is not `finalized`, and the difference must be visible.**
   Contract state can read `RULED` while the transaction that produced it is
   still awaiting finalization. Conflating the two would have produced a claim we
   could not defend. **This was borne out two days later:** the unfinalized
   ruling was canceled, the contract reverted to `OPEN`, and every claim written
   as "ruled, awaiting finalization" had to be withdrawn — but none of them had
   said "final", so nothing published was ever untrue at the time it was written.
   Read state derived from an unfinalized transaction is provisional, and should
   be re-read before it is relied on rather than cached into a document.
4. **Read-only verification carried the whole investigation.** Every fact in this
   record was obtained without signing anything. Designing the harness so reads
   never require a wallet made it possible to diagnose a stalled write with zero
   additional risk.
5. **Measure before budgeting.** The GEN thresholds were derived from 74 measured
   transactions rather than guessed; actual fees landed inside the measured band.
6. **Pin line endings before the first deploy.** LF pinning was in place from
   commit one, so the deployed bytes matched the audited source on the first
   attempt.

## 12. Remaining workflow after network recovery

In order, once Bradbury writes are available:

1. **Re-rule Case 002.** The case is `OPEN` and ruling is permissionless, so this
   needs no redeploy and no new contract — one `rule()` call on the existing
   address. Both prior ruling transactions are terminal-failed, so there is
   nothing in flight to collide with. Confirm `status == "OPEN"` with a read
   immediately before calling.
2. **Run Case 003 end to end** to demonstrate `OPEN → RESPONDED → RULED` live,
   exercising the respondent-response path that is currently tested only.
3. **Produce `CERTIFIED` and `UNRESOLVED` on-chain** via case-001 and case-004,
   so all three outcomes exist as live rulings rather than fixture expectations.
4. **Write the finalized pilot record** to `deploy/bradbury/case-002/` once a
   ruling transaction actually reaches `FINALIZED` — not merely `ACCEPTED`.

Until a ruling transaction finalizes, Case 002 must be described as **deployed,
`OPEN`, with no live ruling** — never as ruled, final, complete, or finalized.
