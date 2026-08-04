# ConstitutionCourt — submission

![ConstitutionCourt — on-chain constitutional review through GenLayer validator consensus](../assets/submission/cover.png)

Every URL, address, transaction hash, outcome and test count in this document is
real and verified. Nothing here is a placeholder.

---

## One-line pitch

**ConstitutionCourt asks GenLayer validators — not the party being challenged —
whether a treasury proposal was carried according to the organisation's own
constitution.**

| | |
| --- | --- |
| Live application | **https://constitutioncourt.vercel.app** |
| Repository | https://github.com/GIFTEDLOV/constitutioncourt |
| Network | GenLayer Bradbury Testnet, chain `4221` — **testnet only** |
| Live contract | `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` |
| Contract source SHA-256 | `bf845bc43768cb0829157ae9e7dad01a4d15b333c4139255d5018ac6ecf99341` |
| Automated tests | **866** (392 contract + 474 frontend) |

## Problem

An organisation votes. Someone says the vote broke the organisation's own
constitution. What follows is rarely a review — it is a forum thread, a
screenshot, and eventually silence.

The failure is structural. There is no neutral reader: the parties who could
adjudicate are the parties with an interest in the answer. The evidence is a set
of links that can be edited after the argument starts. And the organisation being
challenged usually publishes the vote record itself — including its own
declaration that the proposal *passed*, which is the thing in dispute rather than
evidence for it.

So disputes are settled by stamina and standing.

## Target users

| User | Need |
| --- | --- |
| **DAO members and token holders** challenging a treasury disbursement they believe broke the charter | A neutral reading they did not pay for and cannot be accused of buying |
| **DAO stewards and multisig signers** who want cover before executing | A defensible, citable record that the vote met the constitution |
| **Delegates and governance analysts** | A verdict they can re-derive from public evidence rather than take on trust |
| **Auditors, journalists and grant committees** reviewing an organisation's governance history | A permanent, addressable record with citations |

## Why centralized AI is insufficient

Ask an API. You get an answer nobody can reproduce, from a model version nobody
agreed on, with no record of what it actually read, chosen and paid for by one
side of the dispute.

That is not adjudication — it is one party's consultant. Every property a
governance verdict needs is absent:

- **Neutrality** — the caller picks the model, the prompt and the moment.
- **Reproducibility** — re-running later gives a different answer, and nothing
  records what the first run saw.
- **Evidentiary fixity** — nothing stops the evidence changing between the
  question and the answer.
- **Independence** — one reader, however good, is still one reader.

## Why GenLayer is essential

Applying a constitution to a vote is a **reading**, not a calculation. The rule
says "two-thirds of votes cast" — do abstentions belong in the denominator? It
says "publicly announced, in full" — does a chat reminder count, and does it
count if it landed after voting opened? The evidence schema **deliberately
forbids machine-readable threshold fields**, so there is no number to compare.

GenLayer executes non-deterministic reasoning **under consensus**. Validators are
drawn independently, each fetches the evidence itself, each derives a complete
ruling, and they must agree before anything is recorded. Disagreement rotates the
set and re-runs the question rather than averaging opinions — a governance
verdict has no meaningful midpoint.

**The frontend never decides.** It computes no outcome the contract adopts. If it
could, the contract would merely be recording an answer produced off-chain, and
the application would not need GenLayer at all.

There is no version of this product that works without GenLayer.

## Architecture

```mermaid
flowchart LR
    UI["React frontend — reads without a wallet"]
    W["Browser wallet — signs, never custodial"]
    RPC["GenLayer RPC — gen_* plus proxied eth_*"]
    C["ConstitutionCourt contract — one instance per case"]
    V["Validator set — independent fetch and consensus"]
    EV["Pinned evidence — commit-fixed HTTPS URLs"]

    UI -->|read_contract| RPC
    W -->|eth_sendRawTransaction| RPC
    RPC --> C
    C --> V
    V -->|fetch at ruling time| EV
    UI -.->|verify independently| EV
```

The frontend embeds and deploys `contracts/constitution_court.py` (791 lines,
32,043 bytes) byte for byte — there is no compilation step. LF line endings are
pinned because GenLayer derives a contract's address from its source bytes; a
CRLF checkout deploys a different contract from the same commit. The GenVM runner
is pinned to a version hash, never `:test` or `:latest`.

## Workflow

```
  1. File       challenger deploys one contract, pins 4 evidence URLs at a commit
  2. Respond    respondent may publish one permanent response      (optional)
  3. Rule       any account triggers adjudication                  (permissionless)
  4. Consensus  validators independently fetch, read, and must agree
  5. Record     outcome + violated rule ids written immutably, with citations
```

```mermaid
stateDiagram-v2
    [*] --> OPEN: deploy
    OPEN --> RESPONDED: submit_response()
    OPEN --> RULED: rule()
    RESPONDED --> RULED: rule()
    RULED --> [*]
```

**A silent respondent cannot block adjudication.** Ruling is permissionless, so
neither party can leave a case unruled forever.

## Contract methods

| Method | Kind | Notes |
| --- | --- | --- |
| constructor | deploy | `(respondent: Address, case_title, constitution_url, proposal_url, vote_record_url, notice_record_url)` — order is locked; the address argument must reach GenVM as a calldata `Address`, not a string |
| `submit_response(response_url)` | `@gl.public.write` | Respondent only, once, while `OPEN` |
| `rule()` | `@gl.public.write` | Permissionless, from `OPEN` or `RESPONDED`. Terminal |
| `get_state()` | `@gl.public.view` | Full case record including outcome, rule ids, citations, reasoning |
| `get_evidence_sources()` | `@gl.public.view` | The pinned URLs and schema version |

## Consensus fields

Consensus covers **two fields and only two**:

| Field | Comparison |
| --- | --- |
| `outcome` | Exact string |
| `violated_rule_ids` | **Set** — ordering and duplicates cannot fail consensus over formatting |

Citations and written reasoning are recorded from the **leader** validator as an
audit record so a reader can check a finding against its basis. They are
explanatory, not consensus-verified: two validators reaching the same verdict for
the same reason will word it differently, so requiring agreement on prose would
fail consensus for no gain in correctness.

## Evidence model

| Role | Required | Schema |
| --- | --- | --- |
| Constitution | yes | `constitutioncourt/constitution@1` |
| Proposal | yes | `constitutioncourt/proposal@1` |
| Vote record | yes | `constitutioncourt/vote-record@1` |
| Notice record | yes | `constitutioncourt/notice-record@1` |
| Respondent response | no | `constitutioncourt/response@1` |

URLs are pinned to a **40-character commit, never a branch**. The contract stores
the URL; it cannot store what that URL serves. Validators fetch at ruling time,
which may be far later than filing — a branch reference would let them adjudicate
whatever it says then, and if it moves *while* they fetch, two validators
legitimately read different bytes and disagree about the evidence rather than the
question.

## Security properties

| Boundary | Property |
| --- | --- |
| Custody | None. No balance, no payable method, no asset movement. |
| Keys | Never held by the application. Browser wallet signs; the pilot harness never logs, persists or defaults a credential. |
| Frontend authority | Zero. Reads work with no wallet installed. |
| Evidence integrity | Commit-pinned URLs; branch URLs are refused and mutable sources warned. |
| Rule ids | The contract rejects a ruling citing an id the constitution does not contain. |
| Supply chain | 21 exact dependency pins, lockfile agreement, contract byte-identity — all enforced in CI. |
| Transport | Strict CSP (`default-src 'self'`, no CDN scripts or fonts), HSTS preload, `X-Frame-Options: DENY`, nosniff. |
| Write gating | Live runs opt-in twice; spending GEN requires a third, separate opt-in. |

## Test evidence

| Suite | Result |
| --- | --- |
| Contract / direct-mode (pytest) | **392 passed** (49 live-only deselected) |
| Frontend unit (vitest) | **474 passed**, 21 files |
| **Total** | **866** |
| Accessibility (axe-core) | 9 routes × 2 viewports, **0 serious/critical** |
| Overflow sweep | 4 viewports + tap targets, pass |
| Reproducibility | contract byte-identity, exact pins, lockfile — pass |
| Encoding | calldata `Address` round-trip — pass |
| Evidence fixtures | schema v1, re-fetched and re-hashed — pass |
| GenVM lint · line endings · secret scan | pass |

All nine CI jobs run on every push to `main`.

## Case 002 — live evidence

**RULED AND FINALIZED ON-CHAIN.** Verified read-only on 2026-08-04, identical
across `latest-final` and `latest-nonfinal`.

| | |
| --- | --- |
| Contract | `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` |
| Deploy tx | `0x59d661867b1f4ffb93d8673523ccc36496ea7997727585c0f3d3e7570d7c9400` — **`FINALIZED`**, 30m 22s |
| Deployed source | 32,043 bytes, SHA-256 `bf845bc4…` — **byte-identical to the repository source** |
| **Ruling tx** | `0x868c28dc9c2686a8a9ccffa7f05e9137e88082da11f968bcfd7e9e6c75460a16` |
| Consensus status | **`FINALIZED`** (7) |
| Execution result | **`FINISHED_WITH_RETURN`** |
| Consensus result | **`AGREE`**, 0 rounds, 5/5 committed and revealed |
| Outcome | `NON_COMPLIANT` |
| Final status | `REJECTED` |
| Violated rules | `ART-4.3` |
| `ruled_at` | `2026-08-04T15:19:21Z` |
| Validator vote | 3 `AGREE`, 1 `DETERMINISTIC_VIOLATION`, 1 `TIMEOUT` |
| Citations recorded | 3 — proposal, constitution rule text, vote record |

The dispute: Meridian Collective proposal MC-2026-021, a 250,000 USDC treasury
disbursement. The tally was 340,000 for, 180,000 against, 30,000 abstaining — and
the organisation **declared it PASSED**.

Article 4.3 requires two-thirds of votes cast above a 100,000 USDC tier, with
abstentions excluded from *that* denominator. Validators did the arithmetic:
340,000 / 520,000 ≈ **65.4%**, short of 66.7%. They declined to adopt the
organisation's own declaration about its own vote.

The verdict matched the expectation recorded **before** the case was filed.

### It took two attempts

| | |
| --- | --- |
| **2026-08-02** | A ruling executed and the contract read `RULED` for about a day, but never finalized — a duplicate submission 8 seconds earlier held the per-contract queue slot, and Bradbury eventually **canceled both** ruling transactions. The case reverted to `OPEN` and the claim was withdrawn from these documents. |
| **2026-08-04** | Write-side availability recovered. **One** `rule()` call against the same contract — no redeploy, no new case — finalized. |

The two rulings came from **different validator sets two days apart** and reached
the **same outcome and rule id**; only one validator sat in both. That is a
reproducibility result a single successful attempt would not have produced.

It is also the sharpest possible demonstration of why this project separates
`accepted` from `finalized`: the first ruling was accepted, and was still lost.
**Only `FINALIZED` is durable.**

## Honest live-pilot status

Case 002 is complete. The pilot as a whole is not. Stated precisely:

| Claim | Status |
| --- | --- |
| Contract deployed live on Bradbury | **Yes** — deploy `FINALIZED` |
| Deployed bytes match the audited source | **Yes** — re-read 2026-08-04, SHA-256 matches |
| Evidence URLs pinned and reachable | **Yes** — all 18 fixtures verified in CI |
| Case 002 ruled on-chain | **Yes** — contract state reads `RULED` |
| Case 002 ruling transaction **finalized** | **Yes** — `FINALIZED`, `FINISHED_WITH_RETURN` |
| Verdict matches the pre-recorded expectation | **Yes** — `NON_COMPLIANT` → `REJECTED`, `ART-4.3` |
| Verdict reproducible across independent validator sets | **Yes** — two sets, two days apart |
| Case 003 deployed | **No — not deployed** |
| Respondent-response path live-proven | **No — tested, not live-proven** |
| `CERTIFIED` / `UNRESOLVED` produced on-chain | **No** — fixture expectations only |
| Live pilot complete for all four fixtures | **No** — Case 002 only |

Three of the four fixtures have never been deployed, and two of the three
outcomes have never been produced on-chain. Case 002 proves the `OPEN → RULED`
path end to end and nothing beyond it.

### Fixture expectations are not live rulings

| Fixture | Expected outcome | On-chain status |
| --- | --- | --- |
| `case-001-compliant-simple-majority` | `COMPLIANT` → `CERTIFIED` | not deployed |
| `case-002-non-compliant-two-thirds` | `NON_COMPLIANT` → `REJECTED` | **ruled and finalized live — matches expectation** |
| `case-003-non-compliant-notice-period` | `NON_COMPLIANT` → `REJECTED` | **not deployed** |
| `case-004-insufficient-evidence` | `INSUFFICIENT_EVIDENCE` → `UNRESOLVED` | not deployed |

## Limitations

- **No enforcement, no execution.** A ruling moves no money and binds no one.
  **ConstitutionCourt does not execute proposals.**
- **`CERTIFIED` is not legal approval.** It means validators found no
  constitutional violation in the pinned evidence — nothing about legality,
  safety, wisdom or authorisation. **`REJECTED` is a constitutional-compliance
  result over the pinned evidence**, not a legal finding.
- **Evidence is only as good as its host.** Neither party is neutral; a
  consistently false document yields a faithful ruling about a false record.
- **No content pinning.** URLs, not hashes — the challenger would pick the hash
  too, so it would attest to what the challenger pinned.
- **One case per contract.** No registry, no cross-case search.
- **Scope is treasury proposals** only.
- **Settlement is slow and currently unreliable** — a network property outside
  this application's control. **An accepted-but-unfinalized ruling can still be
  canceled**, as Case 002's first ruling was; it took a second attempt two days
  later to reach `FINALIZED`.
- **Bradbury Testnet only.** No mainnet deployment exists.

## Roadmap

| Next | Why |
| --- | --- |
| Complete Case 003 live | Proves `OPEN → RESPONDED → RULED` on-chain rather than only in tests |
| Produce `CERTIFIED` and `UNRESOLVED` on-chain | All three outcomes demonstrated live, not just `REJECTED` |
| Idempotent submission guard in the filing UI | The duplicate ruling came from a double submission; the client should make that impossible |
| Optional content hashing as a challenger-declared extra | Does not fix neutrality, but detects post-hoc edits by a cooperating host |
| Widen scope beyond treasury proposals | Membership, elections and amendments need their own evidence types |

## Why this project should be highlighted

**It answers a question that could not be answered on-chain before.** Governance
tooling stops at counting because counting is all a deterministic contract can
do. ConstitutionCourt does the part that was previously impossible: reading a
natural-language rule and deciding whether a real vote met it — under consensus,
against evidence that cannot move, with citations anyone can check.

**It has a real, finalized ruling — twice over.** Independent validators read the
Meridian Collective dispute and produced a verdict that contradicted the
organisation's own public claim about its own vote. The arithmetic is checkable,
the citations resolve, and the expectation was written down before the filing.
When the network canceled the first ruling, a second set of validators two days
later reached **the same outcome and the same rule id** — a reproducibility
result the project did not plan and could not have faked.

**It is honest about its limits, in the product itself.** Every consensus display
states what consensus did *not* cover. Every stage of the consensus page states
what it does not guarantee. This submission does not call the pilot complete,
because three fixtures remain undeployed and two outcomes have never been
produced on-chain. And when a re-check found the first ruling had been canceled,
the claim was withdrawn from every document and only restored once a transaction
actually reached `FINALIZED`. The distinction between `accepted` and `finalized`
that this project insisted on throughout is exactly the distinction that turned
out to matter.

**It is engineered to be checked.** 866 automated tests, contract byte-identity
enforced in CI, every evidence fixture published with its SHA-256, zero
serious/critical accessibility violations, and a frontend with no authority over
any outcome. You do not have to trust the interface — which was the requirement.
