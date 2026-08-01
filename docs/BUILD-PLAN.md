# ConstitutionCourt — Build Plan

Five stages. Each has an explicit exit condition; nothing in a later stage
starts before the earlier stage's exit condition is met.

| Stage | Scope                                      | Status         |
| ----- | ------------------------------------------ | -------------- |
| 1     | Repository, pins, architecture lock         | ✅ **Complete** |
| 2     | Contract implementation                     | ✅ **Complete** |
| 3     | Direct-mode test suite                      | ✅ **Complete** |
| 4     | Frontend                                    | ✅ **Complete** |
| 5     | Deployment                                  | Not started — requires explicit approval |

---

## Stage 1 — Repository and architecture lock ✅

**Delivered**

- Repository initialized, LF normalization pinned from commit 1
- Exact dependency pins (`requirements.txt`)
- [ARCHITECTURE.md](ARCHITECTURE.md) — lifecycle, storage model, method set,
  validator output schema, consensus boundary, error taxonomy
- [THREAT-MODEL.md](THREAT-MODEL.md) — eight threats, mitigations, accepted risks
- [Evidence schema](../evidence/schema.md) and four validated fixture cases
- `evidence/validate.py`, verified to catch real defects, wired into CI
- Directory scaffold: `contracts/`, `tests/direct/`, `evidence/`, `frontend/`,
  `.github/workflows/`

**Exit condition met:** architecture locked, `python evidence/validate.py`
exits 0, git status clean, CI green.

**No contract code was written.** `contracts/` holds a README only.

## Stage 2 — Contract implementation

**Scope:** `contracts/constitution_court.py` — one file, five methods, exactly
as specified in [ARCHITECTURE §6–§9](ARCHITECTURE.md#6-contract-storage-model--locked).

Order of work:

1. Runner pin header and storage fields, in the locked declaration order
2. `__init__` with deterministic validation (HTTPS, no credentials, length,
   `respondent != challenger`, non-zero address)
3. `get_state` and `get_evidence_sources` — cheap, and they make everything
   after them testable
4. `submit_response` with the caller and state guards
5. `rule` — `leader_fn`, then `validator_fn`, then the invariant checks, then
   the `outcome → final_status` mapping
6. `genvm-lint check contracts/constitution_court.py` until clean

**Exit condition:** `genvm-lint` clean; every method present with the locked
signature; no `py-genlayer:test` or `:latest`; no `payable`; no external
message; no balance access.

**Not in Stage 2:** no deployment, no wallet, no GEN, no network calls of any
kind.

## Stage 3 — Direct-mode tests

**Scope:** `tests/direct/`, fully offline, evidence fetches mocked.

`conftest.py` provides the SDK-loader dance for `Address` and the `calldata`
codec (constructor arguments must be built as `Address` before `deploy_contract`
wires up the SDK — see App 1's `as_address` helper), the four fixture cases
loaded from disk, and mock HTTP responses keyed by URL.

### Test matrix

| File                             | Covers                                                                                                          | Threats     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------- |
| `test_constructor.py`            | Initial state `OPEN`; challenger set from sender; all four URLs stored; `respondent` decodes as `Address`         | T-5         |
| `test_url_validation.py`         | Rejects `http://`, `user:pass@` credentials, credential-shaped query params, >2048 chars, empty; accepts valid HTTPS | T-1     |
| `test_party_validation.py`       | Rejects zero address, `respondent == challenger`, empty title, title >200 chars                                   | T-5         |
| `test_lifecycle.py`              | `OPEN→RESPONDED→RULED`; `OPEN→RULED`; `RULED` terminal; no re-response; no re-rule; no response after `RULED`     | T-5         |
| `test_access_control.py`         | Only respondent may `submit_response`; challenger and third parties rejected; `rule` is permissionless            | T-5         |
| `test_ruling_mapping.py`         | `COMPLIANT→CERTIFIED`, `NON_COMPLIANT→REJECTED`, `INSUFFICIENT_EVIDENCE→UNRESOLVED`; total and injective; `final_status` never model-supplied | T-7 |
| `test_ruling_invariants.py`      | `NON_COMPLIANT` iff non-empty `violated_rule_ids`; `INSUFFICIENT_EVIDENCE` cites none; unresolvable rule id rejected; `NON_COMPLIANT` requires ≥1 citation | T-2 |
| `test_validator_agreement.py`    | Agreement on `outcome` + rule-id **set**; order and duplicates ignored; disagreement on differing `outcome`; `reasoning`/`citations` differences do not fail consensus | T-3 |
| `test_evidence_policy.py`        | `[TRANSIENT]` on 5xx/408/425/429/timeout; `[INVALID_EVIDENCE]` on 404/unparseable/wrong `schema`; `[LLM_ERROR]` on malformed output; **no error class ever becomes an outcome** | T-4 |
| `test_evidence_cases.py`         | Each of the four fixtures produces its documented outcome, final status and cited rule ids                        | —           |
| `test_prompt_injection.py`       | Injected instructions in `body`, `content_summary`, rule `text` and `statement` do not change `outcome`           | T-2         |
| `test_views.py`                  | `get_state` / `get_evidence_sources` shapes in every lifecycle state; empty-string nulls before they are set      | —           |
| `test_determinism.py`            | Decimal-string amounts survive round-trip without precision loss; ISO-8601 `Z` parsing; no float in storage        | T-3         |

Every threat with a mitigation in [THREAT-MODEL](THREAT-MODEL.md) has at least
one test. T-6 and T-8 are accepted rather than mitigated and have none by design.

**Exit condition:** `pytest tests/direct` green offline; all four fixtures
produce their documented outcomes; every row above implemented.

**Delivered:** all 13 files, 247 tests, green offline in ~45 s.

Two constraints of the direct-mode harness are worth recording, because both are
invisible until they produce a confusing failure:

* **One deployment per test.** The SDK registers the contract class in a
  module-level global and raises `only one contract is allowed` when the module
  is re-executed inside the same activated VM; separately, `deploy_contract`
  derives the contract address from the file path, so a second deploy of the same
  file shares one storage root and would overwrite the first rather than stand
  beside it. Tests that compare two executions deploy once and roll back with
  `direct_vm.snapshot()` / `revert()` — wrapped as the `from_scratch` fixture.
* **First mock wins.** Both mock matchers return the first pattern that matches,
  so re-registering a URL or prompt does not override the earlier registration.
  A test that needs a different answer for the same prompt must clear first —
  `reset_mocks`, and the `serve_*` helpers that call it.

One contract behaviour was discovered rather than specified, and is pinned by
`test_determinism.py`: **a float anywhere in the model's JSON output cannot cross
the calldata boundary at all.** GenLayer calldata has no float type, so a model
that quotes `65.38` as a JSON number rather than a string produces a payload that
decodes to `None`, and the ruling is rejected as malformed. The float can
therefore never reach storage, where its repr could differ between hosts — but
the mechanism is a decode failure, not stringification.

## Stage 4 — Frontend

**Scope:** read-only case viewer plus case creation. Vite + React + TypeScript,
matching App 1's stack.

Locked dependency pins — **exact, no ranges**, materialized as
`frontend/package.json` plus a committed `package-lock.json` when the stage
starts:

| Package        | Version   |
| -------------- | --------- |
| `genlayer-js`  | `1.1.8`   |
| `react`        | `18.3.1`  |
| `react-dom`    | `18.3.1`  |
| `typescript`   | `5.7.2`   |
| `vite`         | `6.0.7`   |
| `vitest`       | `2.1.8`   |

Requirements carried from the threat model:

- The contract source is embedded via Vite's `?raw` import and deployed
  byte-for-byte, so `frontend/src/contract/*.py` is LF-pinned in
  `.gitattributes` **already** — before the file exists. This is the App 1
  incident, pre-empted (T-3).
- Pinned evidence URLs are displayed alongside every ruling. A ruling is never
  a bare verdict badge (T-7).
- Stored `reasoning` is labelled as the leader validator's explanation, not
  agreed text (T-7).
- An `OPEN` case is presented as an unadjudicated claim, never as an accusation
  with weight (T-6).
- The frontend computes no outcome the contract adopts. Previews, if any, are
  visibly labelled non-authoritative (consensus boundary).

**Exit condition:** typecheck, lint, unit tests and build all green; reproducibility
check confirms the embedded contract hashes identically on Windows and Linux CI.

### Delivered

Six locked routes — `/`, `/create`, `/cases`, `/case/:contractAddress`, `/demo`,
`/help` — plus a 404. **334 unit tests** across 17 files, and five offline or
browser suites: reproducibility, calldata encoding, browser smoke, accessibility
(zero serious/critical axe violations at 1280px and 375px), and an
overflow/console sweep across five viewports.

No backend, no database. The case registry is browser-local `localStorage`, and
that is an architectural limit rather than a missing feature: a server-side index
would immediately become a second source of truth that can disagree with the
chain.

**Nothing is deployed.** Every browser suite blocks all outbound requests except
localhost, so the RPC is unreachable by construction — no GenLayer network, no
wallet signature, no GEN. The wallet used in browser tests is a mock that throws
on any request that would need a signature.

### Transaction safety carried forward from App 1

Each of these exists because of a specific pilot incident, and each has a test:

| Rule | Where |
| ---- | ----- |
| A hash means submitted, not successful | `chain.ts` `classifyTx`, `TxPanel` |
| `FINISHED_WITH_ERROR` renders as failure | `classifyTx`, `TxPanel` |
| FINALIZED with no execution result is *unknown*, not success | `classifyTx` |
| Pending hashes persisted before polling; tracking resumes after reload | `registry.ts`, `hooks.ts` |
| Single-flight polling, never `setInterval` with an async callback | `useLiveCase`, `useWriteAction` |
| Availability re-derived before the dialog **and** before submit | `preflight.ts`, `CasePage` |
| Postconditions bound to an exact transaction hash **and** method | `postconditions.ts` `postconditionApplies` |
| Previous postcondition cleared when a new action begins | `CasePage.openDialog` |
| Changing contract address clears all local action and transaction state | `CasePage` address effect |
| An address argument reaches GenVM as `Address`, never a string | `chain.ts` `addressArg`, `e2e/encoding.mjs` |

### Deployment verification

A finalized deploy transaction is not proof a case exists — App 1 saw one
finalize with `FINISHED_WITH_RETURN`, every validator agreeing, and no contract
at the named address. `lib/deployment.ts` therefore runs **fourteen** checks in
order and reports every check after a failure as *not reached* rather than as
passing: finalized · execution · address · code · source hash · state readable ·
challenger · respondent · title · all four evidence URLs · status OPEN · response
empty · outcome and final status empty · `created_at` populated.

### Accessibility fix worth recording

The first axe run found a genuine defect: the horizontally scrollable table
wrappers were unreachable by keyboard at 375px, hiding real content from anyone
not using a mouse. Fixed with a shared `TableWrap` component carrying
`tabIndex={0}`, `role="region"` and an accessible name.

## Stage 5 — Deployment

**Requires explicit approval. Not authorized as of Stage 1.**

Blocked on Stages 2–4 complete and green. Involves spending GEN and requesting a
wallet signature, neither of which happens without a direct instruction.

Preconditions before deployment is even proposed:

1. ~~Evidence fixtures published at stable HTTPS URLs, recorded in
   `evidence/README.md`~~ — ✅ **Closed 2026-07-31.** All eighteen documents are
   served from `raw.githubusercontent.com` pinned to commit `1d1174e`, a full
   40-character SHA. Every URL and its SHA-256 is recorded in
   [evidence/README.md](../evidence/README.md); all eighteen returned HTTP 200
   with matching hashes and no CRLF. `frontend/e2e/fixtures.mjs` re-fetches and
   re-checks them in CI, and also fails if any evidence URL anywhere pins to a
   branch instead of a commit.
2. Integration tests written and passing against a live network — **written
   2026-08-01, not yet run.** The suite is implemented in `tests/integration/`
   over the harness in `pilot/`, covering both canonical paths: CASE A
   (`case-002`, `OPEN → RULED`) and CASE B (`case-003`,
   `OPEN → RESPONDED → RULED`), both expecting `NON_COMPLIANT → REJECTED`.
   107 offline tests exercise the harness itself. **The pilot execution is the
   first live run**, because running it spends testnet GEN and requires unlocked
   wallets — so "passing against a live network" is what the pilot establishes,
   not something that can be claimed beforehand.
3. ~~Contract source hash recorded and verified identical across platforms~~ —
   ✅ `bf845bc4…`, asserted on Windows and Linux CI by `e2e/reproducibility.mjs`
4. ~~`docs/DEPLOY.md` written with the exact command sequence and the expected
   contract address derivation~~ — ✅ **Closed 2026-08-01.**
   [DEPLOY.md](DEPLOY.md) is the authoritative runbook: scope and safety
   boundary, environment, canonical contract source, the canonical pilot
   fixture, constructor argument order, pre-deployment checklist, browser
   procedure, the fourteen verification checks, failure classification with an
   explicit retry-safety column, response and ruling procedures, evidence
   capture, exact commands, stop conditions and post-pilot outputs.
   `frontend/src/deploy-doc.test.ts` asserts it contains no branch-pinned
   evidence URL, no unfilled placeholder, URLs and hashes matching
   `evidence/README.md`, and a contract source hash matching the real file — so
   the runbook cannot drift from the artefacts it describes without failing CI.

### The live suite is opt-in, and default CI stays offline

`tests/integration/` is gated three times: the `integration` marker is
deselected by `pytest.ini`, `CONSTITUTIONCOURT_LIVE=1` is required for the tests
to run at all, and `CONSTITUTIONCOURT_ALLOW_WRITES=1` is required separately
before anything signs or spends. Resuming an interrupted run needs a fourth gate.

Reading an environment variable is not consent to spend GEN, which is why the
read and write gates are distinct. **CI sets none of them**, so no CI job can
reach a GenLayer network; the `fixtures` job's `raw.githubusercontent.com`
fetches remain the only network access in the pipeline.

No credential is embedded, defaulted, logged or persisted. `PilotRecord.save`
refuses to write anything credential-shaped — including a bare 64-character hex
value, since that is exactly what a raw private key looks like — and the offline
suite asserts it.

### Why the fixture pin is a commit and never a branch

The contract stores a URL; it cannot store what that URL serves. Validators
fetch at *ruling* time, which can be far later than filing, so a `main` URL
would let the adjudicated document change after a case was filed — and a
document that moves *while* validators fetch can give different validators
different bytes, splitting consensus on a difference nobody intended.

This is not hypothetical for this product: `checkEvidenceUrl` warns whenever an
evidence URL uses a branch or tag, so shipping branch-pinned fixtures would have
meant publishing links the application itself tells users not to use.
`src/fixtures.test.ts` asserts the published URLs raise no such warning.

---

## Deferred decisions

Recorded so they are not silently rediscovered later.

| Decision                    | Deferred to | Rationale                                                                                                          |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| Evidence content hashing    | Stage 5     | The challenger picks the hash, so it attests to what the challenger pinned, not what the DAO published — it moves trust rather than removing it. Only worthwhile paired with a neutral archival source. See [T-1](THREAT-MODEL.md#t-1-evidence-mutation-after-pinning). |
| Integration test suite      | Stage 5     | Needs a funded account and live network. The `integration` pytest marker is registered now so adding it later cannot introduce an unregistered-marker warning. |
| Multi-case registry         | Never       | Out of scope. One instance per case is a locked constraint.                                                          |
| ~~Strict `OPEN→RESPONDED→RULED` chain~~ | **Resolved 2026-07-27** | **Decided: `rule` may be called from `OPEN` or `RESPONDED`.** The response is optional; requiring `RESPONDED` would let a respondent deadlock the case by refusing to answer. `submit_response` is permitted only while `OPEN`. After `RULED` nothing can change. See [ARCHITECTURE §5](ARCHITECTURE.md#why-rule-is-reachable-from-open--decided). |

## Dependency pin log

| Date       | Change                                           | Rationale                                                                 |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| 2026-07-27 | `genlayer-test==0.29.2`                          | Current PyPI latest; the direct-mode harness                               |
| 2026-07-27 | `genlayer-py==0.16.3`                            | **Not** 0.18.0. `genlayer-test` declares `genlayer-py<0.17.0,>=0.13.0`, so the latest release is not installable alongside it. Pinned to the version the resolver actually selects. Revisit when the cap lifts. |
| 2026-07-27 | `pytest==9.0.3`                                  | `genlayer-test` depends on pytest with no upper bound; pinning here is what actually fixes the version. Verified on CPython 3.14.3. |
| 2026-07-27 | Runner `py-genlayer:1jb45aa8…jpz09h6`            | Pinned hash. `:test` and `:latest` are local-Studio aliases that all GenLayer networks reject. |
| 2026-07-29 | `genvm-linter==0.11.0`                           | Provides the `genvm-lint` console script (package name and script name differ). Stage 2's exit condition is a clean lint, so the tool is pinned like everything else it gates. |
| 2026-07-30 | `vitest==3.2.4` — **not** the 2.1.8 planned at Stage 1 | vitest 2.1.8 depends on `vite ^5.0.0`, so it installs and runs tests through its own nested vite 5.4.21 while `vite build` ships a vite 6.0.7 bundle. Tests would then exercise a different transform pipeline than production, which is the kind of gap a test suite is supposed to close rather than open. vitest 3.x accepts `vite ^6`, so a single vite 6.0.7 serves both. Every other Stage 1 frontend pin is honoured exactly: `genlayer-js` 1.1.8, `react`/`react-dom` 18.3.1, `typescript` 5.7.2, `vite` 6.0.7. |
| 2026-07-30 | `@types/node==22.10.5` added                      | `vitest.setup.ts` imports `node:crypto` to supply WebCrypto, which jsdom lacks. `lib/hash.ts` deliberately has no polyfill — a missing SubtleCrypto in a real browser should fail loudly rather than silently skip the source-hash check — so the shim lives in test setup and needs node types. |
| 2026-07-30 | GenVM SDK `v0.2.16` (`tests/direct/conftest.py`) | **Not** the harness default. Unset, the harness uses the newest version already in `~/.cache/gltest-direct` and falls back to GitHub's "latest" genvm release only when that cache is empty. "latest" currently resolves to a `v0.3.0-rc` candidate that ships no `genvm-universal.tar.xz` asset, so a clean runner 404s and every deploying test fails — which is precisely what the first CI run of this suite did while the same commit was green locally on a cache warmed by App 1. v0.2.16 is the release containing the runner hash pinned in the contract header, so the two pins agree by construction. |

## Architecture change log

No LOCKED section of [ARCHITECTURE.md](ARCHITECTURE.md) has changed. The
contract and test suite were built to the locked specification as written.

## CI change log

Changes to `.github/workflows/ci.yml` that alter what CI enforces, as opposed to
what it merely reports.

| Date       | Change                                                | Rationale                                                                 |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| 2026-07-30 | Custody check strips comment lines before matching     | The guard grepped for `payable` and matched the contract's own sentence documenting that it *has* no payable method, so the job failed on the file that states the rule it enforces. This is the same self-match that broke App 1's secret scanner, and the fix is the same shape: keep the pattern, exclude the line that defines it. Verified against a probe file with a real `@gl.public.payable` — still caught. |
| 2026-07-30 | Direct-mode suite no longer tolerates exit code 5      | Zero collected tests was the expected Stage 1 result. With the suite in place, a collection error that left nothing to run would otherwise turn the job green while testing nothing. |
| 2026-07-30 | `genvm-lint` job added                                 | Stage 2's exit condition is a clean lint and `requirements.txt` already promised CI ran it, but no job did. Offline; it reads the contract and does not deploy it. |
| 2026-07-30 | `frontend` and `frontend-browser` jobs added           | Stage 4's gates: lint, typecheck, unit tests, production build, reproducibility, calldata encoding; then browser smoke, accessibility and the overflow sweep. `npm ci` installs strictly from the lockfile so a package.json/lock disagreement fails rather than resolving silently. The browser suites block every outbound request except localhost, so CI cannot reach a GenLayer network even by accident. |
