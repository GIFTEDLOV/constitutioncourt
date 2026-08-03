# ConstitutionCourt — submission

**Objective constitutional review through decentralized validator consensus.**

| | |
| --- | --- |
| Live application | https://constitutioncourt-10k54frri-kolofahkelvin16-6437s-projects.vercel.app |
| Repository | https://github.com/GIFTEDLOV/constitutioncourt |
| Network | GenLayer Bradbury Testnet, chain `4221` |
| Live contract | `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` |
| Contract source SHA-256 | `bf845bc43768cb0829157ae9e7dad01a4d15b333c4139255d5018ac6ecf99341` |
| Automated tests | 866 (392 contract + 474 frontend) |

---

## One paragraph

Governance disputes are not settled today; they are outlasted. When someone
claims a DAO's treasury vote broke the DAO's own constitution, there is no
neutral reader — the parties who could adjudicate are the parties with an
interest in the answer, and the evidence is a set of links that can be edited
after the argument starts. ConstitutionCourt fixes both halves. Evidence is
pinned to an immutable commit before adjudication, and the reading is performed
by independently drawn GenLayer validators who each fetch the documents
themselves and must agree before anything is recorded.

## Why this needs GenLayer specifically

Applying a constitution to a vote is a **reading**, not a calculation. It
requires deciding whether abstentions belong in the denominator when the rule
says "votes cast", whether a chat reminder is a public announcement "in full",
and whether a missing tally settles nothing rather than implying guilt. The
evidence schema deliberately forbids machine-readable threshold fields, so there
is no number to compare — a threshold function cannot produce these answers.

A single human arbiter can, and is one party's choice of reader. An off-chain
model call can, and produces an answer nobody can reproduce.

GenLayer executes non-deterministic reasoning **under consensus**: several
validators independently reach a reading, and disagreement rotates the set and
re-runs the question rather than averaging opinions. That is the whole product.
There is no version of ConstitutionCourt that works without it.

## What was built

- **A GenLayer intelligent contract** (`contracts/constitution_court.py`, 32,043
  bytes, LF-pinned, runner pinned to a version hash) — one instance per dispute,
  three-state lifecycle, closed outcome vocabulary, permissionless ruling.
- **A production frontend** — six reading routes plus a six-step filing wizard,
  deploys the contract byte for byte, reads every case directly from the chain,
  and works read-only with no wallet installed.
- **Eighteen evidence fixtures** across four cases, each with a published
  SHA-256, re-fetched and re-hashed in CI.
- **A read-only pilot harness** with three independent opt-in gates before any
  GEN can be spent.

## Live result

A real dispute was filed and ruled on Bradbury.

| | |
| --- | --- |
| Outcome | `NON_COMPLIANT` |
| Final status | `REJECTED` |
| Violated rule | `ART-4.3` (supermajority approval threshold) |
| Validator vote | 4 of 5 `finished_with_return`, 1 `nondet_disagree` |
| Deploy tx | **finalized** in 30m 22s |
| Ruling tx | executed and accepted, **awaiting finalization** |

The verdict matched the expectation recorded **before** the case was filed.
Validators declined to adopt the organisation's own declaration that its
proposal had passed, and did the abstention arithmetic the rule's own words
require: 340,000 / 520,000 ≈ 65.4%, short of two-thirds.

Full record, including validator votes and the finalization state: **[../pilot/PILOT-RUN.md](../pilot/PILOT-RUN.md)**.

## Status — stated precisely

| Claim | Status |
| --- | --- |
| Contract deployed live on Bradbury | **Yes**, finalized |
| Case 002 ruled on-chain | **Yes** — contract state reads `RULED` |
| Case 002 ruling transaction finalized | **No** — `ReadyToFinalize`, queued behind a duplicate submission |
| Case 003 respondent-response flow run live | **No** — fixture only, not deployed |
| `CERTIFIED` / `UNRESOLVED` produced on-chain | **No** — fixture expectations only |
| Frontend deployed to production | **Yes**, byte-verified against the gated build |

An **expected fixture outcome is not a ruling.** Three of the four fixtures have
never been deployed; the application labels them as expectations and never
presents one as a live verdict.

## What it deliberately is not

Not a legal court. Not a treasury executor. Not a voting platform. Not escrow.
Not a chatbot. Not a replacement for GenLayer's native transaction appeal.

A ruling moves no money, reverses no transfer and binds no one. `CERTIFIED`
means validators found no constitutional violation in the pinned evidence — not
that the proposal is legal, safe, wise or authorised.

These limits are not disclaimers bolted on at the end. They are why the rulings
are worth reading: a system that claimed more than it can do would have to be
trusted, and this one is designed not to require trust.

## Engineering gates

Every one of these runs in CI on every push:

| Gate | Result |
| --- | --- |
| Contract direct-mode tests | 392 passed |
| Frontend unit tests | 474 passed |
| Lint, typecheck, build | pass |
| Reproducibility — contract byte-identity, exact pins, lockfile | pass |
| Encoding — calldata `Address` round-trip | pass |
| Browser smoke | pass |
| Accessibility (axe-core), 9 routes × 2 viewports | 0 serious/critical |
| Overflow sweep, 4 viewports + tap targets | pass |
| Evidence fixtures re-fetched and re-hashed | pass |
| GenVM lint · line endings · secret scan | pass |

## Verify it yourself

You do not have to trust the interface.

```bash
# Read the live case straight from the chain
python -m pilot preflight          # read-only, signs nothing

# Confirm the deployed bytes are the audited source
cd frontend && npm run repro
```

Or open the contract in the [Bradbury
explorer](https://explorer-bradbury.genlayer.com/contract/0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc),
fetch the four pinned evidence URLs yourself, and check each cited rule id
against the constitution document.

## Placeholders remaining

- **Production URL** is the current Vercel deployment URL; a custom domain has
  not been assigned.
- **Case 003 live run** is outstanding — the respondent-response path is proven
  by tests, not by chain.
- **Case 002 finalization** is outstanding and outside our control; it resolves
  when the duplicate ahead of it in the per-contract queue terminates.
