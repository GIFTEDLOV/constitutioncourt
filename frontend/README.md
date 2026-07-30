# frontend/

Case viewer and creation wizard for ConstitutionCourt. React 18 + TypeScript +
Vite 6, no backend, no database.

**Nothing here deploys a contract, requests a wallet signature, or spends GEN at
Stage 4.** The deployment code is built and unit-tested against mocked wallet
and RPC responses; every browser suite blocks all outbound requests except
localhost, so the GenLayer network is unreachable by construction.

## Commands

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | Dev server on :3100 |
| `npm run build` | Typecheck, then production build |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (vitest, jsdom) |
| `npm run repro` | Reproducibility + exact-pin check — offline |
| `npm run e2e:encoding` | Calldata encoding check — offline |
| `npm run e2e` | Browser smoke test against the production build |
| `npm run a11y` | axe-core audit; zero serious/critical required |
| `npm run sweep` | Overflow and console sweep across five viewports |

## Routes

| Route | Purpose |
| ----- | ------- |
| `/` | What the problem is, what a ruling means, and what this is not |
| `/create` | Six-step filing wizard: case · constitution · proposal · governance records · review · deploy |
| `/cases` | Browser-local registry of cases created or imported here |
| `/case/:contractAddress` | Live case view driven entirely by contract state |
| `/demo` | The four evidence fixtures and what each one turns on |
| `/help` | Lifecycle, evidence rules, outcome definitions, limitations, verification |

## The parts that carry incident lessons

**`lib/preflight.ts`** — availability is re-derived from a fresh read twice:
before the confirmation dialog opens, and again immediately before the write is
submitted. In App 1's pilot a stale tab offered an action the contract had
already made impossible; the duplicate reverted and changed nothing, but it cost
a signature, gas and half an hour to find out.

**`lib/postconditions.ts`** — a postcondition is bound to an exact transaction
hash *and* method *and* contract address. Held against a method name alone, it
gets re-displayed under whatever transaction comes next.

**`lib/deployment.ts`** — fourteen checks before a deployment is treated as
real. A finalized deploy transaction is not proof a contract exists.

**`chain.ts` `classifyTx`** — a hash means submitted. `FINISHED_WITH_ERROR` is a
failure. FINALIZED with no execution result is *unknown*, and the reader is told
to confirm on-chain state rather than retry.

**`chain.ts` `addressArg`** — the respondent must reach GenVM as a calldata
`Address`. A plain `"0x…"` string encodes as a 42-character `str`, which the
contract rejects — 30 minutes and one signature after the mistake.

## Requirements carried from the threat model

- The contract source is embedded via `?raw` and deployed byte-for-byte, so
  `src/contract/*.py` is LF-pinned in `.gitattributes` and `e2e/reproducibility.mjs`
  asserts its hash on Windows and on Linux CI ([T-3](../docs/THREAT-MODEL.md#t-3-consensus-split-through-non-determinism)).
- Pinned evidence URLs are displayed alongside every ruling; a ruling is never a
  bare verdict badge ([T-7](../docs/THREAT-MODEL.md#t-7-misreading-certified-as-a-warrant)).
- Stored `reasoning` and citations are labelled as the leader validator's audit
  record, not agreed text. Only `outcome` and the rule-id set were consensus-verified.
- An `OPEN` case is presented as an unadjudicated claim, never as an accusation
  with weight ([T-6](../docs/THREAT-MODEL.md#t-6-frivolous-case-spam)).
- The frontend computes no outcome the contract adopts.
- Rule text is resolved from the constitution or is honestly absent. It is never
  invented — a paraphrase beside a consensus-backed finding would put words in
  the validators' mouths.

## Design

A restrained institutional identity: serif display face, generous measure, rules
rather than shadows, colour only where it carries meaning. Every status colour is
paired with a text label, so `CERTIFIED` and `REJECTED` are never distinguishable
by hue alone — an accessibility requirement and, here, a correctness one.
