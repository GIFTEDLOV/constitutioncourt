# ConstitutionCourt — Build Plan

Five stages. Each has an explicit exit condition; nothing in a later stage
starts before the earlier stage's exit condition is met.

| Stage | Scope                                      | Status         |
| ----- | ------------------------------------------ | -------------- |
| 1     | Repository, pins, architecture lock         | ✅ **Complete** |
| 2     | Contract implementation                     | Not started    |
| 3     | Direct-mode test suite                      | Not started    |
| 4     | Frontend                                    | Not started    |
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

## Stage 5 — Deployment

**Requires explicit approval. Not authorized as of Stage 1.**

Blocked on Stages 2–4 complete and green. Involves spending GEN and requesting a
wallet signature, neither of which happens without a direct instruction.

Preconditions before deployment is even proposed:

1. Evidence fixtures published at stable HTTPS URLs, recorded in
   `evidence/README.md`
2. Integration tests written and passing against a live network
3. Contract source hash recorded and verified identical across platforms
4. `docs/DEPLOY.md` written with the exact command sequence and the expected
   contract address derivation

---

## Deferred decisions

Recorded so they are not silently rediscovered later.

| Decision                    | Deferred to | Rationale                                                                                                          |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| Evidence content hashing    | Stage 5     | The challenger picks the hash, so it attests to what the challenger pinned, not what the DAO published — it moves trust rather than removing it. Only worthwhile paired with a neutral archival source. See [T-1](THREAT-MODEL.md#t-1-evidence-mutation-after-pinning). |
| Integration test suite      | Stage 5     | Needs a funded account and live network. The `integration` pytest marker is registered now so adding it later cannot introduce an unregistered-marker warning. |
| Multi-case registry         | Never       | Out of scope. One instance per case is a locked constraint.                                                          |
| Strict `OPEN→RESPONDED→RULED` chain | Open  | Flagged for user review. Currently `rule` is reachable from `OPEN` to prevent respondent deadlock. Reverting is a one-line guard change. See [ARCHITECTURE §5](ARCHITECTURE.md#why-rule-is-reachable-from-open). |

## Dependency pin log

| Date       | Change                                           | Rationale                                                                 |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| 2026-07-27 | `genlayer-test==0.29.2`                          | Current PyPI latest; the direct-mode harness                               |
| 2026-07-27 | `genlayer-py==0.16.3`                            | **Not** 0.18.0. `genlayer-test` declares `genlayer-py<0.17.0,>=0.13.0`, so the latest release is not installable alongside it. Pinned to the version the resolver actually selects. Revisit when the cap lifts. |
| 2026-07-27 | `pytest==9.0.3`                                  | `genlayer-test` depends on pytest with no upper bound; pinning here is what actually fixes the version. Verified on CPython 3.14.3. |
| 2026-07-27 | Runner `py-genlayer:1jb45aa8…jpz09h6`            | Pinned hash. `:test` and `:latest` are local-Studio aliases that all GenLayer networks reject. |

## Architecture change log

Nothing yet. Any change to a LOCKED section of
[ARCHITECTURE.md](ARCHITECTURE.md) after Stage 2 begins is recorded here with
its rationale and requires a rerun of the full direct-mode matrix.
