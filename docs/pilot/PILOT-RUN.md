# Case 002 — live pilot record

# CASE 002 LIVE RULING COMPLETE — FINALIZED ON-CHAIN

**The ruling transaction reached `FINALIZED` with `FINISHED_WITH_RETURN`, and the
contract reads `RULED` / `NON_COMPLIANT` / `REJECTED`, citing `ART-4.3`.**

This took two attempts, and the record keeps both:

| | |
| --- | --- |
| **2026-08-02** | First ruling executed and the contract read `RULED` for about a day. It never finalized — a duplicate submission held the per-contract queue slot ahead of it, and Bradbury eventually **canceled both** ruling transactions. The case reverted to `OPEN`. |
| **2026-08-04** | Bradbury write-side availability recovered. **One** new `rule()` call was submitted against the same contract — no redeploy, no new case — and **finalized**. |

Sections 1–4 describe the deployment, which is unchanged throughout. Sections
5–7 record the **first, canceled** attempt as history and are marked superseded.
**Section 8 is the current, finalized state and is authoritative.**

Every figure below was read back from the chain, read-only. Nothing here is
projected or estimated.

| | |
| --- | --- |
| Case filed | **2026-08-02** |
| **Ruled and finalized** | **2026-08-04** — `ruled_at` `2026-08-04T15:19:21Z` |
| Last verified | **2026-08-04** — see §8 |
| Current contract state | **`RULED`** — `NON_COMPLIANT` → `REJECTED`, `ART-4.3` |
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

## 5. First ruling attempt — as observed on 2026-08-02 (superseded)

> **Superseded.** Both transactions below were later **`CANCELED`** by the
> network and applied no state. The effective ruling is the 2026-08-04
> transaction in §8. The consensus states in this table are what the chain
> reported on 2026-08-02.

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

## 6. Validator votes, first attempt — as observed on 2026-08-02 (superseded)

> **Superseded.** The canceled transaction now reports zero rounds and
> `NOT_VOTED` for all five validators, with no leader receipt. The votes below
> are what the chain reported on 2026-08-02. For the votes that actually carried
> the ruling, see §8.

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

> **This is not the contract's current state.** It reverted to `OPEN` when the
> ruling transactions were canceled, and was re-established by the 2026-08-04
> ruling in §8. Kept because the two independent rulings reached the **same
> verdict**, which is worth being able to compare.

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

## 8. The finalized ruling — 2026-08-04 (authoritative)

**One `rule()` call, submitted against the existing contract. No redeploy, no
new case. It finalized.**

### Preconditions checked before submitting

All read-only, all passed:

| Check | Result |
| --- | --- |
| State on **both** `latest-final` and `latest-nonfinal` | identical: `OPEN`, outcome/final_status/ruled_at/response_url all empty |
| Deploy `0x59d661867b…` | still `FINALIZED` |
| Both prior rulings terminal | both `CANCELED` (8) |
| Pending transaction or persisted unresolved hash | none |
| Bradbury accepting **and finalizing** writes | yes — 54 `FINALIZED` / 4 `ACCEPTED` in a 60-transaction sample of recent `ConsensusMain` `NewTransaction` events |
| Four evidence URLs re-fetched and re-hashed | all HTTP 200, all SHA-256 match |

The write-health check is worth recording precisely, because the naive version
of it is wrong: sampling transaction hashes out of EVM blocks returns
`UNINITIALIZED` for all of them and reads as a total outage. Those are consensus
plumbing hashes, not GenLayer transaction ids. The ids have to come from
`ConsensusMain` events.

### The transaction

| | |
| --- | --- |
| Hash | `0x868c28dc9c2686a8a9ccffa7f05e9137e88082da11f968bcfd7e9e6c75460a16` |
| Sender | `0x456Ccff0d33463E1834F724C5C5971D6cff6f1dc` (challenger) |
| Recipient | `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` |
| **Consensus status** | **`FINALIZED`** (7) |
| **Execution result** | **`FINISHED_WITH_RETURN`** (1) |
| **Consensus result** | **`AGREE`** (1) |
| Rounds | **0** — no rotation, no appeal |
| Transaction slot | 3 |
| Leader | `0xC32bD21E1506Ab4954BA1EE8FBD50271Ca61b7DE` |
| Votes committed / revealed | 5 / 5 |

Consensus and execution are recorded **separately and deliberately**: consensus
`AGREE` says the validator set agreed; execution `FINISHED_WITH_RETURN` says the
contract ran to completion. Neither implies the other, and `FINALIZED` is what
makes both durable.

### Validator votes

| Vote | Count | Validators |
| --- | --- | --- |
| `AGREE` | **3** | `0x96298d41…`, `0x4f36CB2C…`, `0xC32bD21E…` (leader) |
| `DETERMINISTIC_VIOLATION` | 1 | `0x8E7765267…` |
| `TIMEOUT` | 1 | `0x3f5cAED6…` |

Three of five agreeing carried it in a single round with no rotation. One
dissent and one timeout are ordinary across independent readings — the design
point is that disagreement rotates and re-runs rather than averaging, and here
it did not need to.

Note `0x4f36CB2C…` appears in both this validator set and the canceled
2026-08-02 set; the other four are different validators.

### Contract state — identical on both variants

```json
{
  "status": "RULED",
  "outcome": "NON_COMPLIANT",
  "final_status": "REJECTED",
  "violated_rule_ids": ["ART-4.3"],
  "created_at": "2026-08-02T09:32:02Z",
  "ruled_at":   "2026-08-04T15:19:21Z",
  "has_response": false,
  "responded_at": ""
}
```

**This matches the fixture's expected outcome exactly** — and the expectation was
recorded in `docs/DEPLOY.md` before the case was first filed, not after it ruled.

`get_evidence_sources` is unchanged: all four URLs still pinned to commit
`1d1174e9f30e8674c28ab41272125ea11d691d84`, `response_url` empty.

### Citations recorded (3)

| Source | Locator | Quoted | Bears on |
| --- | --- | --- | --- |
| `proposal` | `$.requested_amount` | `{"amount":"250000","asset":"USDC"}` | `ART-4.3` |
| `constitution` | `$.rules[3].text` | the full text of ART-4.3 | `ART-4.3` |
| `vote-record` | `$.tally` | `{"abstain":"30000","against":"180000","for":"340000"}` | `ART-4.3` |

All three resolve to the commit-pinned URLs in §3. This ruling cites the
constitution rule text itself, which the canceled 2026-08-02 ruling did not.

### Leader reasoning, as stored

> The proposal is a treasury disbursement of 250,000 USDC, so the supermajority
> threshold in ART-4.3 applies. Excluding abstentions as required, votes cast are
> 340,000 for and 180,000 against, for a denominator of 520,000; two-thirds
> requires at least 346,666.67 votes in favour, but only 340,000 were in favour.
> Quorum, notice, and the single-disbursement cap are satisfied on the record,
> but ART-4.3 was violated.

Different leader, different wording, **same verdict** as 2026-08-02 — which is
exactly what "reasoning is the leader's audit record, not a consensus-verified
artefact" predicts. Consensus covered the outcome and the rule-id set, and those
matched.

### Prior transactions, re-read

| Transaction | Status |
| --- | --- |
| `0x59d661867b…` (deploy) | **`FINALIZED`** (7), `FINISHED_WITH_RETURN` |
| `0xe22b0ff6…` (first ruling) | **`CANCELED`** (8), `NOT_VOTED` |
| `0x42b6a679…` (duplicate) | **`CANCELED`** (8), `NOT_VOTED` |

Both canceled transactions remain terminal and applied no state. The finalized
ruling is the only one that took effect.

### What this run establishes

| Claim | Status |
| --- | --- |
| Contract deployed live on Bradbury | **Yes** — deploy `FINALIZED` |
| Deployed bytes match the audited source | **Yes** — 32,043 B, SHA-256 `bf845bc4…` |
| Case 002 ruled on-chain | **Yes** — `RULED` |
| Case 002 ruling transaction **finalized** | **Yes** — `FINALIZED`, `FINISHED_WITH_RETURN` |
| Verdict matches the pre-recorded expectation | **Yes** — `NON_COMPLIANT` → `REJECTED`, `ART-4.3` |
| Verdict reproducible across independent validator sets | **Yes** — two sets, two days apart, same outcome and rule id |
| Case 003 deployed | **No — not deployed** |
| Respondent-response path live-proven | **No — tested, not live-proven** |
| `CERTIFIED` / `UNRESOLVED` produced on-chain | **No** — fixture expectations only |

## 9. Submission discipline

### Stop decision — taken 2026-08-03, while the first attempt was in flight

> Historical. The reasoning below was correct for the state at the time. Both
> ruling transactions later reached a terminal `CANCELED` state, which is what
> made a fresh attempt safe — see §8.

| Action | Decision |
| --- | --- |
| Resubmit the ruling | **No.** Nothing was orphaned; a third call would queue behind the two in flight. |
| Appeal the effective ruling | **No.** An appeal would restart consensus on a ruling that already passed 4–1. |
| Deploy Case 003 | **No.** Bradbury writes are unavailable. |
| Request a wallet signature | **No.** |
| Spend GEN | **No.** |
| Write a pilot record to `deploy/bradbury/case-002/` | **No.** That format is reserved for a finalized run. |

### Re-ruling decision — taken 2026-08-04, after both had gone terminal

| Action | Decision |
| --- | --- |
| Redeploy the contract | **No.** The case was `OPEN` and ruling is permissionless, so a redeploy would have been pointless and would have created a second contract for one dispute. |
| Create a new case | **No.** |
| Submit Case 003 | **No.** Out of scope for this attempt. |
| Appeal either canceled transaction | **No.** Both were terminal; there was nothing to appeal. |
| Submit **one** `rule()` call | **Yes**, after all preconditions in §8 passed. |
| Submit more than one | **No.** The 2026-08-02 failure was caused by a double submission; exactly one call was made. |

Total transactions submitted for this pilot: **four** — one deploy, two rulings
on 2026-08-02 (one of them an unintended duplicate, both later canceled), and one
ruling on 2026-08-04 that finalized.

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
   **Only `FINALIZED` is durable** — that is the whole lesson, and the 2026-08-04
   run is the one that earned the word.
4. **Read-only verification carried the whole investigation.** Every fact in this
   record was obtained without signing anything. Designing the harness so reads
   never require a wallet made it possible to diagnose a stalled write with zero
   additional risk.
5. **Measure before budgeting.** The GEN thresholds were derived from 74 measured
   transactions rather than guessed; actual fees landed inside the measured band.
6. **Pin line endings before the first deploy.** LF pinning was in place from
   commit one, so the deployed bytes matched the audited source on the first
   attempt.
7. **A canceled ruling is recoverable, and cheaply.** Because ruling is
   permissionless and terminal-only-on-success, a canceled ruling left the case
   `OPEN` and re-rulable with a single call — no redeploy, no new contract, no
   migration. A design that had made ruling once-only, or that had bound the
   verdict to the transaction rather than to contract state, would have needed a
   new case and a new address.
8. **Measure network health on the right layer.** "Is Bradbury finalizing
   writes?" sampled from EVM block transactions says *no* — every hash reads
   `UNINITIALIZED`, because those are consensus plumbing, not GenLayer
   transaction ids. Sampled from `ConsensusMain` `NewTransaction` events it says
   *yes*, with 54 of 60 `FINALIZED`. The wrong layer gives a confident,
   completely wrong answer.

## 12. Remaining workflow

**Case 002 is complete.** Deployed, ruled, and finalized on-chain. Nothing
further is required for it.

Still outstanding, and **not** claimed anywhere as done:

1. **Run Case 003 end to end** to demonstrate `OPEN → RESPONDED → RULED` live,
   exercising the respondent-response path that is currently tested only.
2. **Produce `CERTIFIED` and `UNRESOLVED` on-chain** via case-001 and case-004,
   so all three outcomes exist as live rulings rather than fixture expectations.
3. **Write the machine-readable pilot record** to `deploy/bradbury/case-002/`.
   Blocked on a harness defect, not on the network — see §13.

Case 002 may now be described as **deployed, ruled and finalized**. The other
three fixtures may not be described as ruled at all.

## 13. Known harness defect — `pilot record` cannot write this run

`python -m pilot record case-002 …` fails against Bradbury, so
`deploy/bradbury/case-002/record.json` does not exist despite the run having
finalized. Two independent causes, both in the harness rather than the network:

1. **`GenLayerAdapter.read` has no account.** `pilot/chain.py` builds the client
   with `gl.create_client(chain=…)` and no account, but genlayer-py's
   `read_contract` raises `"No account provided and no account is connected"` —
   it requires a `from` address even for a read. Reads in this record were done
   by passing an ephemeral throwaway address to `gen_call` directly.
2. **`classify()` reads camelCase keys the RPC does not return.**
   `pilot/classify.py` looks for `statusName`, `txExecutionResultName` and
   `resultName`; Bradbury returns `status_name`, `tx_execution_result_name` and
   `result_name`. The lookup falls through to the numeric `status`, producing
   *"Unrecognised transaction status '7'"* for a transaction that is plainly
   `FINALIZED`.

Both are read-path bugs in operator tooling. Neither affects the contract, the
frontend, or anything deployed — this run finalized correctly and every figure in
§8 was verified read-only against the chain. They are recorded here rather than
patched in the same change that documents the run.
