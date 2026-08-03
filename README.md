<div align="center">

![ConstitutionCourt — on-chain constitutional review through GenLayer validator consensus](docs/assets/submission/cover.png)

# ConstitutionCourt

**Was that treasury proposal carried according to your own constitution? Ask validators, not the party being challenged.**

[![CI](https://github.com/GIFTEDLOV/constitutioncourt/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/GIFTEDLOV/constitutioncourt/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-866%20passing-9a8c34)](#testing)
[![Network](https://img.shields.io/badge/network-Bradbury%20Testnet%20(4221)-8b8cf0)](https://docs.genlayer.com/developers/networks)
[![Accessibility](https://img.shields.io/badge/axe--core-0%20serious%2Fcritical-9a8c34)](#testing)
[![Contract](https://img.shields.io/badge/contract%20sha256-bf845bc4-c9a8d8)](#architecture)

</div>

---

![ConstitutionCourt home page: an oversized marquee reading CONSTITUTION COURT and ON-CHAIN GOVERNANCE, the lead line "Objective constitutional review through decentralized validator consensus", and four live metrics — 4 immutable evidence sources, 3 constitutional outcomes, 5 independent validators, 100% commit-pinned evidence](docs/assets/screenshots/home-desktop.png)

## Live links

| | |
| --- | --- |
| **Application** | **https://constitutioncourt.vercel.app** |
| Repository | https://github.com/GIFTEDLOV/constitutioncourt |
| Live Case 002 | https://constitutioncourt.vercel.app/case/0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc |
| Network | GenLayer Bradbury Testnet, chain `4221` — **testnet only, no mainnet deployment exists** |
| Contract source SHA-256 | `bf845bc43768cb0829157ae9e7dad01a4d15b333c4139255d5018ac6ecf99341` |

## Problem

An organisation votes. Someone says the vote broke the organisation's own
constitution. What follows is rarely a review — it is a forum thread, a call, a
screenshot, and eventually silence. The dispute does not resolve; attention
moves on.

The failure is structural, not cultural:

- **There is no neutral reader.** The parties who could adjudicate are the
  parties with an interest in the answer.
- **The evidence can move.** Links are edited after the argument starts.
- **The challenged party publishes the record.** The organisation's own vote
  record usually contains its own declaration that the proposal *passed* — and
  that declaration is the thing in dispute, not evidence for it.

So disputes are settled by stamina and standing rather than by review.

## Solution

ConstitutionCourt gives a dispute one neutral reading against a record that
cannot move.

A challenger deploys **one contract per case**, naming a respondent and pinning
four public evidence URLs to an immutable commit. The respondent may publish one
permanent response. Then **any account** may trigger adjudication: GenLayer
validators each re-fetch the same documents, each derive a complete ruling, and
consensus is reached on the verdict — which is written to the contract with the
violated rule ids and the leader validator's citations.

The result is a verdict you can **re-derive**, not one you are asked to believe.

## Why GenLayer is necessary

Applying a constitution to a vote is a **reading**, not a calculation.

| Approach | Why it fails |
| --- | --- |
| A threshold function | Cannot decide whether abstentions belong in the denominator when the rule says "votes cast". Two defensible readings give different answers. It cannot decide whether a chat reminder is a public announcement "in full". It cannot decide that a missing tally settles nothing. |
| A single human arbiter | Can decide all of it, and is one party's choice of reader. |
| A centralized AI call | Produces an answer nobody can reproduce, from a model nobody agreed on, with no record of what it read, chosen by whoever is paying for the API key. |

The evidence schema **deliberately forbids machine-readable threshold fields**,
so there is no number to compare. The judgment is irreducible by construction.

GenLayer executes non-deterministic reasoning **under consensus**: validators are
drawn independently, each fetches the evidence itself, and disagreement rotates
the set and re-runs the question rather than averaging opinions — a governance
verdict has no meaningful midpoint.

**The frontend never decides.** This interface computes no outcome the contract
adopts. If it could, the contract would merely be recording an answer produced
off-chain, and the application would not need GenLayer at all.

## How ConstitutionCourt works

```
  1. File       challenger deploys one contract, pins 4 evidence URLs at a commit
  2. Respond    respondent may publish one permanent response      (optional)
  3. Rule       any account triggers adjudication                  (permissionless)
  4. Consensus  validators independently fetch, read, and must agree
  5. Record     outcome + violated rule ids written immutably, with citations
```

## Lifecycle

```mermaid
stateDiagram-v2
    [*] --> OPEN: deploy
    OPEN --> RESPONDED: submit_response()
    OPEN --> RULED: rule()
    RESPONDED --> RULED: rule()
    RULED --> [*]
```

Two paths reach a ruling. **A silent respondent cannot block adjudication** —
a locked property of the contract, not a policy choice.

| Status | Meaning |
| --- | --- |
| `OPEN` | An allegation is on the record. It carries no weight until validators have ruled. |
| `RESPONDED` | The respondent published their one permanent response. |
| `RULED` | Terminal. No reopening, no second ruling. |

Public contract methods: `submit_response(response_url)` and `rule()` are
writes; `get_state()` and `get_evidence_sources()` are views. Ruling is
permissionless so neither party can leave a case unruled forever.

## Evidence model

| Role | Required | Schema |
| --- | --- | --- |
| Constitution | yes | `constitutioncourt/constitution@1` |
| Proposal | yes | `constitutioncourt/proposal@1` |
| Vote record | yes | `constitutioncourt/vote-record@1` |
| Notice record | yes | `constitutioncourt/notice-record@1` |
| Respondent response | no | `constitutioncourt/response@1` |

**URLs are pinned to a 40-character commit, never a branch.** This is
load-bearing, not housekeeping. The contract stores the URL; it cannot store
what that URL serves. Validators fetch at ruling time, which may be far later
than filing — a `main` reference would mean they adjudicate whatever the branch
says *then*, and if it moves *while* they fetch, two validators legitimately
read different bytes and disagree about the evidence rather than the question.

## Validator consensus model

```mermaid
flowchart TD
    A["01 Submission — one contract per dispute"] --> B
    B["02 Pinned evidence — commit-fixed, not a branch"] --> C
    C["03 Independent fetch — each validator reads it itself"] --> D
    D["04 Consensus — disagreement rotates the set and re-runs"] --> E
    E["05 Immutable ruling — outcome, rule ids, citations, reasoning"]
```

Consensus covers **two fields and only two**: the `outcome`, compared as an exact
string, and the **set** of violated rule ids, compared as a set so ordering and
duplicates cannot fail consensus over formatting.

Citations and written reasoning are recorded from the **leader** validator as an
audit record, so a reader can check a finding against its basis. Treating the
stored prose as consensus-verified is a misreading.

## Outcomes and final-status mapping

| Outcome | Final status | What it means | What it does **not** mean |
| --- | --- | --- | --- |
| `COMPLIANT` | `CERTIFIED` | Validators found no constitutional violation in the pinned evidence. | **Not legal approval.** Not that the proposal is safe, wise, or authorised for execution. |
| `NON_COMPLIANT` | `REJECTED` | A constitutional-compliance result over the pinned evidence: at least one applicable rule was violated, cited by id. | Nothing is voided, reversed or executed. **ConstitutionCourt does not execute proposals.** |
| `INSUFFICIENT_EVIDENCE` | `UNRESOLVED` | The documents were read but do not settle the question. | Neither exoneration nor condemnation. A fetch failure is never recorded as this outcome. |

## Product walkthrough

### File a case — six steps, every URL fetched and schema-checked first

![The create-case wizard on step one, an editorial filing layout with a large step number, a single dominant heading, hairline separators and no cards](docs/assets/screenshots/create-wizard-desktop.png)

### Case explorer — browser-local, full-width rows

![The case explorer listing cases known to this browser as full-width hairline-separated rows with oversized status typography](docs/assets/screenshots/cases-desktop.png)

### How consensus works — five stages, each with its limits

![The consensus page showing numbered editorial stages, each stating what the stage does and what it does not guarantee](docs/assets/screenshots/consensus-desktop.png)

### About and Help

| | |
| --- | --- |
| ![The about page explaining why governance disputes fail, why immutable evidence matters and why GenLayer makes this possible](docs/assets/screenshots/about-desktop.png) | ![The help page with hairline-separated FAQ rows and the locked outcome vocabulary](docs/assets/screenshots/help-desktop.png) |

### Mobile

| | | |
| --- | --- | --- |
| ![ConstitutionCourt home page on a phone](docs/assets/screenshots/home-mobile.png) | ![Live Case 002 on a phone showing RULED and REJECTED](docs/assets/screenshots/case-002-mobile.png) | ![The create-case wizard on a phone](docs/assets/screenshots/create-wizard-mobile.png) |

## Case 002 — live evidence

**Status: RULED ON-CHAIN, AWAITING FINALIZATION.** Not "pilot complete".

![Live Case 002 read from Bradbury, showing the case title with RULED and REJECTED set at display scale](docs/assets/screenshots/case-002-overview-desktop.png)

| | |
| --- | --- |
| Contract | `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` |
| Deploy tx | `0x59d661867b1f4ffb93d8673523ccc36496ea7997727585c0f3d3e7570d7c9400` — **finalized** (30m 22s) |
| Ruling tx (effective) | `0xe22b0ff6743c3b29082f463365f2999a4f90da4eea462a434ef1983eec3bc406` — executed `FINISHED_WITH_RETURN`, **accepted, not finalized** |
| Duplicate ruling tx | `0x42b6a679116050aee83fb4e96bf4ae0b4f683809bdf128c0be2a906e68ae6e9d` — `TIMEOUT`, **not terminal** |
| Outcome | `NON_COMPLIANT` |
| Final status | `REJECTED` |
| Violated rules | `ART-4.3` |
| `ruled_at` | `2026-08-02T10:13:02Z` |
| Validator vote | 4 of 5 `finished_with_return`, 1 `nondet_disagree` → `majority_agree` |

![Ruling detail showing violated rule ART-4.3 supermajority approval threshold, the consensus-scope note, and two citations anchored to commit-pinned evidence URLs](docs/assets/screenshots/case-002-ruling-detail-desktop.png)

Validators declined to adopt the organisation's own declaration that the vote
had passed, and did the abstention arithmetic the rule's words require:
340,000 / 520,000 ≈ **65.4%**, short of the two-thirds bar of 66.7%.

### Precisely what is and is not proven

| Claim | Status |
| --- | --- |
| Contract deployed live on Bradbury | **Yes** — deploy transaction finalized |
| Case 002 ruled on-chain | **Yes** — contract state reads `RULED` |
| Case 002 ruling transaction **finalized** | **No** — `ReadyToFinalize`, queued behind the duplicate |
| Case 003 deployed | **No — not deployed.** No contract, no on-chain ruling |
| Respondent-response path (`OPEN → RESPONDED → RULED`) | **Tested, not live-proven.** Covered by the offline suite only |
| `CERTIFIED` / `UNRESOLVED` produced on-chain | **No** — fixture expectations only |

### Why the remaining workflow was not completed

**Bradbury write-side instability prevented completion of the remaining live
workflow.** The network's transaction-acceptance path has been unavailable, and
the per-contract finalization queue for Case 002 is held by a duplicate ruling
submission that has not reached a terminal state.

**This is a network condition, not an application or contract defect.** The
contract executed correctly and returned `FINISHED_WITH_RETURN` with a 4/5
majority; the deploy finalized normally in 30 minutes; every offline gate passes.
Nothing in this repository needs to change for the remaining workflow to
complete — it needs Bradbury writes to be available again.

No further transaction was submitted, no signature requested, and no GEN spent.

### Fixture expectations are not live rulings

| Fixture | Expected outcome | On-chain status |
| --- | --- | --- |
| `case-001-compliant-simple-majority` | `COMPLIANT` → `CERTIFIED` | not deployed |
| `case-002-non-compliant-two-thirds` | `NON_COMPLIANT` → `REJECTED` | **ruled live — matches the expectation** |
| `case-003-non-compliant-notice-period` | `NON_COMPLIANT` → `REJECTED` | **not deployed** |
| `case-004-insufficient-evidence` | `INSUFFICIENT_EVIDENCE` → `UNRESOLVED` | not deployed |

An expected outcome is what the evidence was *constructed* to produce and what
the offline suite asserts. A ruling exists only once validators have reached
consensus on a real contract. The application labels these distinctly and never
presents a fixture as a live verdict.

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
32,043 bytes) **byte for byte** — there is no compilation step. Line endings are
pinned to LF because GenLayer derives a contract's address from the bytes of its
source, so a CRLF checkout would deploy a *different contract at a different
address from the same commit*. The GenVM runner is pinned to a version hash,
never `:test` or `:latest`.

## Security and trust boundaries

| Boundary | Property |
| --- | --- |
| **Custody** | None. The contract holds no balance, has no payable method, and cannot move an asset. |
| **Keys** | Never held by the application. Signing happens in the user's browser wallet; the pilot harness reads keystore selectors from the environment and never logs, persists or defaults a credential. |
| **Frontend authority** | Zero. The interface computes no outcome the contract adopts. Reads work with no wallet installed. |
| **Evidence integrity** | URLs pinned to a 40-character commit. The app refuses branch URLs and warns on mutable sources. |
| **Rule ids** | The contract rejects a ruling citing an id the constitution does not contain, so every id you see resolved at ruling time. |
| **Supply chain** | 21 exact dependency pins, lockfile agreement, and contract byte-identity all enforced in CI. |
| **Transport** | Strict CSP (`default-src 'self'`, no CDN scripts or fonts), HSTS preload, `X-Frame-Options: DENY`, nosniff, restrictive Permissions-Policy. |
| **Write gating** | Live runs are opt-in twice over; spending GEN requires a third, separate opt-in. Reading an environment variable is not consent to spend. |

## Repository structure

```
contracts/            the GenLayer intelligent contract (791 lines, LF-pinned)
frontend/             React + Vite app; embeds and deploys the contract verbatim
  src/pages/          the six reading routes and the filing wizard
  src/lib/            validation, evidence probing, postconditions, registry
  e2e/                smoke, accessibility, overflow sweep, encoding, repro
evidence/             18 fixture documents across 4 cases, each with a SHA-256
pilot/                read-only Bradbury harness; three opt-in gates before GEN
tests/                direct-mode, harness and (opt-in) integration suites
docs/                 architecture, deploy runbook, threat model, pilot, submission
```

## Local development

```bash
git clone https://github.com/GIFTEDLOV/constitutioncourt
cd constitutioncourt

# Contract suite — no network, no wallet
pip install -r requirements.txt
python -m pytest -q                 # 392 tests

# Frontend
cd frontend
npm ci
npm run dev                         # http://localhost:3100
```

Read-only Bradbury preflight — signs nothing, spends nothing:

```bash
python -m pilot preflight
```

## Testing

| Suite | Count | In CI |
| --- | --- | --- |
| Contract / direct-mode (pytest) | **392 passed** (49 live-only deselected) | yes |
| Frontend unit (vitest) | **474 passed**, 21 files | yes |
| **Total automated** | **866** | |
| Accessibility (axe-core) | 9 routes × 2 viewports, **0 serious/critical** | yes |
| Overflow sweep | 4 viewports + tap targets | yes |
| Reproducibility | contract byte-identity, exact pins, lockfile | yes |
| Encoding | calldata `Address` round-trip | yes |
| Evidence fixtures | schema v1 + re-fetched and re-hashed | yes |
| GenVM lint · line endings · secret scan | | yes |

```bash
cd frontend
npm run lint && npm run typecheck && npm test
npm run repro && npm run build
npm run e2e && npm run e2e:encoding && npm run a11y && npm run sweep
```

## Known limitations

- **No enforcement, and no execution.** A ruling moves no money, reverses no
  transfer and binds no one. **ConstitutionCourt does not execute proposals.**
- **`CERTIFIED` is not legal approval.** It means validators found no
  constitutional violation in the pinned evidence — nothing about legality,
  safety, wisdom or authorisation.
- **Evidence is only as good as its host.** The challenger picks four URLs and
  the respondent picks the fifth. Neither is neutral. A consistently false
  document produces a faithful ruling about a false record.
- **No content pinning.** The contract stores URLs, not hashes. Content hashing
  was considered and deferred: the challenger would pick the hash too, so it
  attests to what the challenger pinned rather than what the organisation
  published.
- **One case per contract.** No registry, no cross-case search; the case list is
  local to your browser.
- **Scope is treasury proposals.** Membership, elections and constitutional
  amendments need different evidence types and rules.
- **Settlement is slow, and currently unreliable.** Bradbury serialises
  transactions per contract and each step waits on the previous one's finality;
  a single write commonly takes ~30 minutes. Write-side availability is a
  network property outside this application's control.
- **Bradbury Testnet only.** There is no mainnet deployment.
- Not a legal court, not a treasury executor, not a voting platform, not escrow,
  not a chatbot, and not a replacement for GenLayer's native transaction appeal.

## Documentation index

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and locked decisions |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Bradbury deployment and pilot runbook |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | Adversaries, failure modes, mitigations |
| [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) | Build stages and their gates |
| [docs/pilot/PILOT-RUN.md](docs/pilot/PILOT-RUN.md) | Case 002 live pilot record |
| [docs/submission/SUBMISSION.md](docs/submission/SUBMISSION.md) | Submission summary |
| [docs/submission/DEMO-SCRIPT.md](docs/submission/DEMO-SCRIPT.md) | Video walkthrough script |
| [docs/submission/X-ARTICLE.md](docs/submission/X-ARTICLE.md) | Long-form write-up |
| [evidence/README.md](evidence/README.md) | Fixture manifest with SHA-256 for every document |
| [evidence/schema.md](evidence/schema.md) | Evidence schema v1 |

---

<div align="center">

Built on [GenLayer](https://genlayer.com). Source and every evidence fixture are
public — **you do not have to trust this interface.**

</div>
