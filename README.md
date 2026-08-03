# ConstitutionCourt

**Objective constitutional review through decentralized validator consensus.**

ConstitutionCourt adjudicates one question: *was this treasury proposal carried
according to the organisation's own constitution?* A challenger pins the
constitution, the proposal, the vote record and the notice record to immutable
URLs. GenLayer validators independently re-fetch every document, each derive a
complete ruling, and reach consensus on the verdict — which is then written to
the contract with citations.

**Live application:** https://constitutioncourt-10k54frri-kolofahkelvin16-6437s-projects.vercel.app

**Network:** GenLayer Bradbury Testnet (chain 4221) · **Contract source SHA-256:** `bf845bc43768cb0829157ae9e7dad01a4d15b333c4139255d5018ac6ecf99341`

---

## The problem

A DAO's constitution is natural language: *"two-thirds of votes cast"*,
*"publicly announced, in full"*, *"moves assets out of the treasury"*. Deciding
whether a given proposal met those words is a **reading question**, and every
party to the dispute has an interest in the answer.

Worse, the organisation being challenged usually publishes the vote record
itself — including its own declaration that the proposal *passed*. That
declaration is the thing in dispute, not evidence for it.

So disputes are settled by stamina and standing rather than by review. The
participant with the most patience, or the most followers, is the one whose
reading survives.

### Why the obvious fixes do not work

| Approach | Why it fails |
| --- | --- |
| A threshold function | Cannot decide whether abstentions belong in the denominator when the rule says "votes cast". Two defensible readings give different answers. |
| A single human arbiter | Can decide all of it, and is one party's choice of reader. |
| An off-chain AI call | Produces an answer nobody can reproduce, from a model nobody agreed on, with no record of what it read. |

## The solution

One contract instance per case. It stores the two parties, four immutable
evidence URLs, and — after adjudication — the ruling, the violated rule ids, the
leader validator's citations and its written reasoning.

Validators each fetch the same pinned documents, each derive a **complete**
ruling independently, and consensus is reached on the decision fields. A
validator that merely checked the leader's answer had the right *shape* would be
verifying formatting, not reasoning.

## Why GenLayer is required

1. **The judgment is irreducible.** Scope, tier, basis, sufficiency and silence
   each require reading a rule and deciding what it covers. The evidence schema
   deliberately forbids machine-readable threshold fields, so there is no number
   to compare.
2. **No single reader is trusted.** Every validator fetches the evidence itself.
   Disagreement rotates the validator set and re-runs the question rather than
   averaging opinions — a governance verdict has no meaningful midpoint.
3. **The frontend never decides.** This interface computes no outcome the
   contract adopts. If it could, the contract would merely be recording an
   answer produced off-chain, and the application would not need GenLayer at all.

GenLayer executes non-deterministic reasoning *under consensus*. That is the
capability this product is built on, and there is no version of it that works
without one.

## Contract lifecycle

```mermaid
stateDiagram-v2
    [*] --> OPEN: deploy
    OPEN --> RESPONDED: submit_response()
    OPEN --> RULED: rule()
    RESPONDED --> RULED: rule()
    RULED --> [*]
```

Two paths reach a ruling. **A silent respondent cannot block adjudication** —
that is a locked property of the contract, not a policy choice.

| Status | Meaning |
| --- | --- |
| `OPEN` | An allegation is on the record. It carries no weight until validators have ruled. |
| `RESPONDED` | The respondent published their one permanent response. |
| `RULED` | Terminal. No reopening, no second ruling. |

Ruling is **permissionless**: any account may trigger adjudication from `OPEN`
or `RESPONDED`, so neither party can leave a case unruled forever.

### Outcomes

| Outcome | Final status | What it means | What it does not mean |
| --- | --- | --- | --- |
| `COMPLIANT` | `CERTIFIED` | Validators found no violation in the pinned evidence. | Not that the proposal is legal, safe, wise or authorised. |
| `NON_COMPLIANT` | `REJECTED` | At least one applicable rule was violated, cited by id. | Nothing is voided, reversed or executed. |
| `INSUFFICIENT_EVIDENCE` | `UNRESOLVED` | The documents were read but do not settle the question. | Neither exoneration nor condemnation. A fetch failure is never recorded as this outcome. |

## Evidence model

Every case pins five documents — four required, one optional.

| Role | Required | Schema |
| --- | --- | --- |
| Constitution | yes | `constitutioncourt/constitution@1` |
| Proposal | yes | `constitutioncourt/proposal@1` |
| Vote record | yes | `constitutioncourt/vote-record@1` |
| Notice record | yes | `constitutioncourt/notice-record@1` |
| Respondent response | no | `constitutioncourt/response@1` |

**URLs are pinned to a 40-character commit, never a branch.** This is
load-bearing. The contract stores the URL; it cannot store what that URL serves.
Validators fetch at ruling time, which may be far later than filing — a `main`
reference would mean they adjudicate whatever the branch says *then*, and if it
moves *while* they fetch, different validators legitimately disagree.

## Validator consensus model

```mermaid
flowchart TD
    A["01 Submission — challenger deploys one contract per dispute"] --> B
    B["02 Pinned evidence — URLs fixed to a commit, not a branch"] --> C
    C["03 Independent fetch — each validator reads the evidence itself"] --> D
    D["04 Consensus — disagreement rotates the set and re-runs"] --> E
    E["05 Immutable ruling — outcome, rule ids, citations, reasoning"]
```

Consensus covers **two fields and only two**: the `outcome`, compared as an
exact string, and the **set** of violated rule ids, compared as a set so that
ordering and duplicates cannot fail consensus over formatting.

Citations and written reasoning are recorded from the **leader** validator. They
are explanatory — an audit record kept so a reader can check a finding against
its basis. Treating the stored prose as consensus-verified is a misreading.

## Screenshots

### Home

![Home](docs/assets/screenshots/home-desktop.png)

### Live Case 002, read from Bradbury

![Live Case 002](docs/assets/screenshots/case-002-live.png)

### Ruling detail — violated rule, consensus scope, citations

![Ruling detail](docs/assets/screenshots/case-002-ruling-detail.png)

### File a case · Case explorer · Mobile

| | | |
| --- | --- | --- |
| ![Create](docs/assets/screenshots/create-wizard.png) | ![Cases](docs/assets/screenshots/cases.png) | ![Mobile](docs/assets/screenshots/home-mobile.png) |
| Six-step wizard | Case explorer | Home on mobile |

### How consensus works · About · Help

| | | |
| --- | --- | --- |
| ![Consensus](docs/assets/screenshots/consensus.png) | ![About](docs/assets/screenshots/about.png) | ![Help](docs/assets/screenshots/help.png) |

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

The frontend embeds and deploys `contracts/constitution_court.py` **byte for
byte** — there is no compilation step. Line endings are pinned to LF because
GenLayer derives a contract's address from the bytes of its source, so a CRLF
checkout would deploy a *different contract at a different address from the same
commit*.

## Test counts

| Suite | Count | In CI |
| --- | --- | --- |
| Contract / direct-mode (pytest) | **392 passed** (49 live-only deselected) | yes |
| Frontend unit (vitest) | **474 passed**, 21 files | yes |
| **Total automated** | **866** | |
| Accessibility (axe-core) | 9 routes × 2 viewports, **0 serious/critical** | yes |
| Overflow sweep | 4 viewports + tap targets | yes |
| Reproducibility | contract byte-identity, pins, lockfile | yes |
| Encoding | calldata `Address` round-trip | yes |
| Evidence fixtures | re-fetched and re-hashed | yes |
| Secret scan | | yes |

## Case 002 pilot evidence — live on Bradbury

A real dispute was filed, adjudicated and ruled on-chain.

| | |
| --- | --- |
| Contract | `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` |
| Deploy tx | `0x59d661867b1f4ffb93d8673523ccc36496ea7997727585c0f3d3e7570d7c9400` — **finalized** |
| Ruling tx | `0xe22b0ff6743c3b29082f463365f2999a4f90da4eea462a434ef1983eec3bc406` — executed, **accepted, awaiting finalization** |
| Outcome | `NON_COMPLIANT` |
| Final status | `REJECTED` |
| Violated rules | `ART-4.3` |
| Ruled at | `2026-08-02T10:13:02Z` |
| Validator vote | 4 of 5 `finished_with_return`, 1 `nondet_disagree` → `majority_agree` |

The ruling **executed successfully and the contract state reads `RULED`**. The
ruling transaction has not yet reached GenLayer finalization. See
[docs/pilot/PILOT-RUN.md](docs/pilot/PILOT-RUN.md) for the full record,
including a duplicate submission that is still resolving and why it blocks
finalization.

> **Case 003 has not been run.** Its fixtures exist and its expected outcome is
> asserted by the offline suite, but no contract has been deployed for it and no
> ruling exists on-chain. It is a fixture, not a pilot result. The
> respondent-response flow is therefore **covered by tests but not yet
> demonstrated live.**

### Expected fixture outcomes are not rulings

The four fixtures under `evidence/` carry **expected** outcomes — what the
evidence was constructed to produce and what the offline suite asserts. An
expected outcome is not a ruling. A ruling exists only once validators have
reached consensus on a real contract. The application labels these distinctly
and never presents a fixture as a live verdict.

| Fixture | Expected outcome | On-chain status |
| --- | --- | --- |
| `case-001-compliant-simple-majority` | `COMPLIANT` → `CERTIFIED` | not deployed |
| `case-002-non-compliant-two-thirds` | `NON_COMPLIANT` → `REJECTED` | **ruled live — matches expectation** |
| `case-003-non-compliant-notice-period` | `NON_COMPLIANT` → `REJECTED` | not deployed |
| `case-004-insufficient-evidence` | `INSUFFICIENT_EVIDENCE` → `UNRESOLVED` | not deployed |

## Known limitations

- **No enforcement.** A ruling moves no money, reverses no transfer and binds no
  one. The contract holds no balance and has no payable method.
- **Evidence is only as good as its host.** The challenger picks four URLs and
  the respondent picks the fifth. Neither is neutral. A consistently false
  document produces a faithful ruling about a false record.
- **No content pinning.** The contract stores URLs, not hashes. Content hashing
  was considered and deferred: the challenger would pick the hash too, so it
  attests to what the challenger pinned rather than what the organisation
  published.
- **One case per contract.** There is no registry and no cross-case search. The
  case list is local to your browser.
- **Scope is treasury proposals.** Membership, elections and constitutional
  amendments need different evidence types and different rules.
- **Filing is free beyond gas.** Nothing stops a frivolous case except the fact
  that an `OPEN` case is visibly an unadjudicated claim.
- **Settlement is slow.** Bradbury serialises transactions per contract and each
  step waits on the previous one's finality; a single write commonly takes ~30
  minutes.
- **Not a legal court**, not a treasury executor, not a voting platform, not
  escrow, not a chatbot, and not a replacement for GenLayer's native transaction
  appeal.

## Local setup

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

Full gate sequence:

```bash
cd frontend
npm run lint && npm run typecheck && npm test
npm run repro            # contract byte-identity and pins
npm run build
npm run e2e              # browser smoke
npm run e2e:encoding     # calldata Address round-trip
npm run a11y             # axe-core, zero serious/critical
npm run sweep            # horizontal overflow + tap targets
```

Read-only Bradbury preflight — signs nothing, spends nothing:

```bash
python -m pilot preflight
```

> Reading an environment variable is not consent to spend GEN. Live runs are
> opt-in twice over, and write operations require a third, separate opt-in.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and locked decisions |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Bradbury deployment and pilot runbook |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | Adversaries, failure modes, mitigations |
| [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) | Build stages and their gates |
| [docs/pilot/PILOT-RUN.md](docs/pilot/PILOT-RUN.md) | Case 002 live pilot record |
| [docs/submission/SUBMISSION.md](docs/submission/SUBMISSION.md) | Submission summary |
| [docs/submission/DEMO-SCRIPT.md](docs/submission/DEMO-SCRIPT.md) | Walkthrough script |
| [docs/submission/X-ARTICLE.md](docs/submission/X-ARTICLE.md) | Long-form write-up |
| [evidence/README.md](evidence/README.md) | Fixture manifest with SHA-256 for every document |
| [evidence/schema.md](evidence/schema.md) | Evidence schema v1 |

---

Built on [GenLayer](https://genlayer.com). Source and every evidence fixture are
public — you do not have to trust this interface.
