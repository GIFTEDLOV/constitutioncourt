# ConstitutionCourt — Bradbury deployment and pilot runbook

**Authoritative.** This is the only sanctioned procedure for deploying a
ConstitutionCourt case and running a pilot. If a step here disagrees with
another document, this one is wrong or that one is — stop and reconcile them
before signing anything.

Every fact in this runbook was read from its source: chain constants from
`genlayer-js@1.1.8` itself, contract facts from the file's bytes, fixture
hashes from the bytes the published URLs actually serve. Nothing was copied from
an assumption in frontend code.

---

## 1. Scope and safety boundary

### Network

**GenLayer Bradbury Testnet only.** There is no mainnet deployment of this
application, no mainnet procedure in this document, and no plan to add one
without a separate explicit decision recorded in
[BUILD-PLAN.md](BUILD-PLAN.md).

### What a ruling is not

A ConstitutionCourt ruling is an opinion with citations, produced by validators
reading pinned documents. It carries **no legal authority**. It does not bind
any organisation, void any vote, move any asset, or authorise any execution.
`CERTIFIED` means validators found no constitutional violation in the pinned
evidence — not that a proposal is legal, safe, wise, or authorised.

The contract holds no balance, has no payable method, and makes no external
call. Nothing in this procedure can move value other than the gas the signer
spends.

### The four operations, and how they differ

These are distinct and must never be conflated in a log or a report:

| Operation | Signs? | Costs gas? | Changes chain state? | Reversible? |
| --------- | ------ | ---------- | -------------------- | ----------- |
| **Preflight** | No | No | No | n/a — nothing happened |
| **Deployment** | Yes | Yes | Creates one case contract | No |
| **Response** | Yes | Yes | `OPEN → RESPONDED`, pins one URL | No — one response, ever |
| **Ruling** | Yes | Yes | `OPEN`/`RESPONDED → RULED` | No — `RULED` is terminal |

**Preflight** is every read-only check: fetching fixtures, verifying hashes,
running the test suites, reading contract state. It is repeatable and free, and
everything that can be checked before a signature must be checked before a
signature.

**Deployment** creates the case. The respondent and all four evidence URLs
become immutable at that instant — the contract has no method to change them,
not a restricted one, none at all. A wrong URL means filing a new case.

**Response** is the respondent's single document. The contract accepts exactly
one and provides no way to replace, edit, or withdraw it.

**Ruling** is terminal. There is no reopening, no second ruling, and no appeal
method in this contract. The only recourse is GenLayer's **native transaction
appeal** on the ruling transaction.

### The retry rule — the most important line in this document

> **Once a transaction hash exists, never retry that write until its final
> state is known.**

A returned hash means the node accepted the transaction for processing. It is
not success. Consensus and execution are separate later outcomes and either can
still fail. Bradbury commonly takes ~30 minutes to settle a single write.

Resubmitting while the first is in flight risks a second signature, second gas,
and a duplicate write. For `submit_response` and `rule` the contract's guards
make the duplicate revert harmlessly — but it still costs a signature, gas, and
half an hour to discover, which is exactly what happened during App 1's pilot.

Wait for one of: `FINALIZED`, `FINISHED_WITH_ERROR`, a settled non-`AGREE`
consensus result, or an explicit unknown. Section 9 classifies each.

---

## 2. Required environment

### Toolchain — the versions this procedure was validated on

| Component | Version | Notes |
| --------- | ------- | ----- |
| Node.js | `v24.14.0` | |
| npm | `11.9.0` | `npm ci` installs strictly from the lockfile |
| Python | `3.14.3` | contract tests and fixture validation only |
| `genlayer-js` | `1.1.8` | exact pin; asserted by `e2e/reproducibility.mjs` |

Every frontend dependency is an exact pin with no ranges; `npm run repro` fails
if any dependency carries `^`, `~`, or a range, or if `package.json` and
`package-lock.json` disagree.

### Chain — as `genlayer-js@1.1.8` defines it

Read from `chains.testnetBradbury`, not from application config:

| Field | Value |
| ----- | ----- |
| Chain ID | `4221` (`0x107d`) |
| Name | `Genlayer Bradbury Testnet` |
| RPC | `https://rpc-bradbury.genlayer.com` |
| Explorer | `https://explorer-bradbury.genlayer.com/` |
| Native currency | `GEN`, 18 decimals |
| `isStudio` | `false` |
| Default initial validators | `5` |
| Default max consensus rotations | `3` |

`isStudio: false` matters: it decides how the SDK wraps `gen_getContractCode`
parameters. See section 8.

### Wallet

- A GenLayer-compatible wallet exposing an **EIP-1193 injected provider** at
  `window.ethereum`. The application uses the injected provider only — no
  WalletConnect, no bundled key, no custody of any kind.
- The wallet must be **on chain 4221**. The UI shows a persistent banner and
  disables every write control when it is not.
- Reading requires no wallet at all. A reviewer can audit any case with nothing
  installed.

### Testnet GEN

Recommend **at least 5 GEN** in the challenger wallet and **at least 2 GEN** in
the respondent wallet before starting.

That is a headroom recommendation, not a measured figure — actual gas is
recorded during the pilot and added to [BUILD-PLAN.md](BUILD-PLAN.md) afterwards.
The reasoning: the deploy carries the full 32,043-byte contract source, which is
the most expensive of the three writes; `submit_response` and `rule` are
gas-only with no value transfer; and `rule` runs a non-deterministic block
across five validators with up to three rotations, so its cost is the least
predictable. Running out of gas mid-pilot wastes a full ~30-minute settlement
cycle.

All three writes send `value: 0n`. This contract is never payable.

### Two browser profiles — required

The challenger and respondent **must be different addresses**: the constructor
rejects `respondent == challenger` with `[INPUT] challenger and respondent must
differ`, because a case against oneself is either a mistake or an attempt to
manufacture a favourable ruling.

Use two separate browser profiles, each with its own wallet:

| Profile | Role | Signs |
| ------- | ---- | ----- |
| **A — challenger** | deploys the case | deployment |
| **B — respondent** | answers it | response |
| either, or a third | ruling is permissionless | ruling |

Two profiles rather than two accounts in one profile: the injected provider
exposes one active account at a time, and switching accounts mid-flow is exactly
how the wrong wallet ends up signing. Separate profiles also let both roles be
open simultaneously, which is what surfaces the stale-tab behaviour the UI
guards against.

---

## 3. Canonical contract source

| Property | Value |
| -------- | ----- |
| Path | `contracts/constitution_court.py` |
| Byte length | **32,043 bytes** |
| Line count | 791 |
| SHA-256 | `bf845bc43768cb0829157ae9e7dad01a4d15b333c4139255d5018ac6ecf99341` |
| Line endings | **LF only.** No CRLF anywhere |
| Runner pin | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |

### Why LF is not a style preference

GenLayer derives a contract's address from the bytes of its source, and the
deploy payload is this file byte-for-byte — there is no compilation step to
normalise it. A Windows checkout with `core.autocrlf=true` materialises CRLF and
produces a **different contract at a different address from the same commit**.
App 1 hit exactly this. `.gitattributes` pins `contracts/**/*.py` and
`frontend/src/contract/*.py` to LF, and CI proves the pin is in effect.

The runner pin is a version hash, never `:test` or `:latest` — those are
local-Studio aliases that every GenLayer network rejects, so a contract carrying
one is undeployable.

### Verify the embedded frontend source is byte-identical

The frontend deploys `frontend/src/contract/constitution_court.py`, imported
with Vite's `?raw`. It must be identical to the canonical file:

```bash
cd frontend && npm run repro
```

That asserts byte-identity, absence of CRLF in both copies, that
`CONTRACT_SOURCE_SHA256` in `src/config.ts` is the real hash, the runner pin and
absence of aliases, exact dependency pins, and lockfile agreement. It runs on
Windows and on Linux CI and both must produce the same hash.

A one-line manual equivalent:

```bash
cmp contracts/constitution_court.py frontend/src/contract/constitution_court.py && echo identical
sha256sum contracts/constitution_court.py frontend/src/contract/constitution_court.py
```

---

## 4. Canonical pilot fixture

### Primary: `case-002-non-compliant-two-thirds`

Chosen as instructed. It is the richest adjudication in the set: 250,000 USDC
clears the simple-majority bar and fails the two-thirds bar its tier requires,
and the vote record **declares `PASSED`** — so the case turns on validators
refusing to adopt the organisation's own claim about its own vote.

| Property | Value |
| -------- | ----- |
| Proposal id | `MC-2026-021` |
| Requested amount | `250000 USDC` |
| Tally | for `340000`, against `180000`, abstain `30000` |
| Declared result | `PASSED` — the thing in dispute |
| **Expected outcome** | **`NON_COMPLIANT`** |
| **Expected final status** | **`REJECTED`** |
| Expected violated rule ids | `["ART-4.3"]` |
| Lifecycle exercised | `OPEN → RULED` |

All URLs are pinned to commit `1d1174e9f30e8674c28ab41272125ea11d691d84`.
Base: `https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-002-non-compliant-two-thirds/`

| Role | File | Bytes | SHA-256 |
| ---- | ---- | ----- | ------- |
| Constitution | [constitution.json](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-002-non-compliant-two-thirds/constitution.json) | 2611 | `08ea34a2b415aa94608a6f009ec5353b4e3decdd8eb094416929e31fb3023b99` |
| Proposal | [proposal.json](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-002-non-compliant-two-thirds/proposal.json) | 662 | `638b7882dd48000681e14ade81e500185a1efacf752195cecedd002eaf5c2be9` |
| Vote record | [vote-record.json](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-002-non-compliant-two-thirds/vote-record.json) | 372 | `52e330445a9177278bcc4a26d61582007b67a2d5ec59510068f41c50cac533b1` |
| Notice record | [notice-record.json](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-002-non-compliant-two-thirds/notice-record.json) | 476 | `f7b5d2d04316bccc3519d72e63858efa229af1b2a1b1aecee3f487d879c32e30` |

**Respondent response: none.** `case-002` has no `response.json`, by design —
its respondent stayed silent, which is a first-class path. The case is therefore
ruled directly from `OPEN`, exercising the locked decision that a respondent
cannot deadlock adjudication by refusing to answer.

### Secondary: `case-003-non-compliant-notice-period`

Because the primary fixture has no response document, the respondent-response
procedure in section 10 cannot be exercised on it. A second pilot case is
therefore run on `case-003`, which **has** a response and reaches the same
`NON_COMPLIANT → REJECTED` verdict by a different route.

Borrowing another case's response document instead would be incoherent: each
response names its own `proposal_id`, so pinning case-003's response to a
case-002 filing would put a document about `MC-2026-027` into a dispute about
`MC-2026-021` and invite validators to adjudicate a mismatch.

| Property | Value |
| -------- | ----- |
| Proposal id | `MC-2026-027` |
| Requested amount | `30000 USDC` |
| **Expected outcome** | **`NON_COMPLIANT`** |
| **Expected final status** | **`REJECTED`** |
| Expected violated rule ids | `["ART-5.4"]` |
| Lifecycle exercised | `OPEN → RESPONDED → RULED` |

Base: `https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/`

| Role | File | Bytes | SHA-256 |
| ---- | ---- | ----- | ------- |
| Constitution | [constitution.json](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/constitution.json) | 2611 | `08ea34a2b415aa94608a6f009ec5353b4e3decdd8eb094416929e31fb3023b99` |
| Proposal | [proposal.json](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/proposal.json) | 663 | `c272e34dda0dc9a053196e70d262254f69373ba73f5da5df0c19705b480210e9` |
| Vote record | [vote-record.json](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/vote-record.json) | 372 | `6bad9c983ec282bb9ea568751d8eebc75127959d9ce44043078939fadf41c55f` |
| Notice record | [notice-record.json](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/notice-record.json) | 714 | `6665af3892d7e9fd1df0b9954aa31afbc49a5a06ad82d7b8535fe0c69d269194` |
| Response (optional) | [response.json](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/response.json) | 1179 | `cc0a4f088658a395e0e25d4cc2d53ba7703187a1221c463d36d3bcec7dd4048e` |

Case-003's response is deliberately well-reasoned and sympathetic, and must
still lose. That is the point of including it: a validator has to weigh an
argument and correctly give it no evidentiary weight.

Both cases share one constitution (`08ea34a2…`), which is correct — four
disputes argued against the same rules.

Every hash above is over the bytes the URL serves, and is recorded identically
in [evidence/README.md](../evidence/README.md). `npm run fixtures` re-fetches
all eighteen documents and re-checks every hash.

---

## 5. Constructor arguments — exact order

`__init__` takes six positional arguments. Order is locked and the frontend
submits them exactly so:

| # | Argument | Type | Pilot value |
| - | -------- | ---- | ----------- |
| 0 | `respondent` | **`Address`** | profile B's wallet address |
| 1 | `case_title` | `str` | see below |
| 2 | `constitution_url` | `str` | case-002 constitution URL from section 4 |
| 3 | `proposal_url` | `str` | case-002 proposal URL |
| 4 | `vote_record_url` | `str` | case-002 vote record URL |
| 5 | `notice_record_url` | `str` | case-002 notice record URL |

### Exact pilot case titles

Primary case:

```
Meridian Collective — MC-2026-021 two-thirds threshold challenge
```

Secondary case:

```
Meridian Collective — MC-2026-027 notice period challenge
```

Both are well under the 200-character limit. The contract trims surrounding
whitespace, so verification compares against the trimmed string.

### Argument 0 must be an `Address`, not a string

`calldata.encode()` dispatches on `instanceof CalldataAddress`. A plain `"0x…"`
string encodes as a 42-character `str`, and GenVM hands that to a parameter
annotated `respondent: Address`; the contract's `isinstance` check then fails
with `[INPUT] respondent must be an Address` — roughly 30 minutes and one
signature after the mistake. App 1 lost a deployment to exactly this.

`chain.ts` `addressArg()` builds the `CalldataAddress`. The encodings are
measurably different and `npm run e2e:encoding` asserts it: **22 bytes** as an
`Address` versus **45 bytes** as a string.

---

## 6. Pre-deployment checklist

Every line must be satisfied. No signature until all are.

- [ ] **All CI jobs green** on the commit being deployed — all nine:
      evidence fixtures, dependency pins, line endings, direct-mode tests,
      frontend, frontend-browser, published fixtures, genvm-lint, secret scan.
- [ ] **`fixtures` job green** specifically — all eighteen published documents
      reachable and unchanged.
- [ ] **Every pilot URL returns HTTP 200**, checked from the machine that will
      deploy (`npm run fixtures`, or `curl -sS -o /dev/null -w '%{http_code}\n'`
      per URL).
- [ ] **Every hash matches** the table in section 4 and in `evidence/README.md`.
- [ ] **Contract source parity passes** — `npm run repro` green, canonical and
      embedded copies byte-identical, hash `bf845bc4…`, no CRLF.
- [ ] **Wallet on chain 4221** in the profile that will sign; the UI shows no
      wrong-network banner.
- [ ] **Challenger and respondent addresses recorded** in the pilot log, and
      confirmed different from each other.
- [ ] **No pending transaction for this deployment** — the create wizard shows
      no in-flight hash, and no prior deploy attempt is unresolved. If one is,
      resolve it via section 9 first.
- [ ] **Screenshot and log capture ready** — see section 12 for the required
      artefacts. Capture starts before the first signature, not after.

---

## 7. Browser deployment procedure

### Route and form sequence

Start the built application (`npm run build && npm run preview`, or the deployed
frontend) in **profile A (challenger)**.

1. Navigate to **`/create`**.
2. **Step 1 — Case.** Enter the case title from section 5 and profile B's
   address as respondent. `Continue` stays disabled until both validate.
3. **Step 2 — Constitution.** Paste the constitution URL. Press **Test URL**.
   It must report the schema literal matched and show a document preview.
4. **Step 3 — Proposal.** Same, with the proposal URL.
5. **Step 4 — Governance records.** Enter the vote record and notice record
   URLs and press **Test URL** on each independently. A notice record that
   fetches is not evidence that the vote record does.
6. **Step 5 — Review.** Read every field. See below.
7. **Step 6 — Deploy.**

### What must be reviewed before signing

At step 5, confirm against section 4 **character by character**:

- the respondent address is profile B, not profile A;
- all four URLs carry the 40-character commit `1d1174e9f30e…`, not a branch;
- all four URLs point at `case-002-non-compliant-two-thirds`;
- all four show `✓ schema verified`;
- the case title matches section 5 exactly;
- no mutable-source warning is displayed. A commit-pinned
  `raw.githubusercontent.com` URL raises none. **If a warning appears, the URL
  is wrong — stop.**

Step 6 shows the source hash that will be submitted. It must read `bf845bc4…`.

Everything on this screen becomes immutable the moment the transaction is
signed. There is no method to change any of it afterwards.

### After pressing Deploy

The wallet prompts for one signature. After signing, the UI must display:

1. the transaction hash;
2. a panel stating **Submitted — not yet deployed**, explaining that the node
   accepted the transaction and that consensus and execution are separate later
   outcomes;
3. a **Verify deployment** control.

### Expected transaction phases

| Phase | Meaning |
| ----- | ------- |
| `awaiting-signature` | wallet prompt open; nothing submitted |
| `submitted` | hash issued; **not success** |
| `pending-consensus` | validators processing; ~30 minutes is normal |
| `consensus-accepted` | agreed and executed; awaiting finalization |
| `finalized` | `FINALIZED` + `FINISHED_WITH_RETURN` |

Failure phases — `execution-error`, `failed`, `unknown` — are section 9.

### Prohibited after a hash exists

- **Do not close the tab** until the transaction settles or the hash is written
  into the pilot log. The hash is persisted to browser storage before the await,
  so tracking resumes on reload — but the log is the durable record.
- **Do not press Deploy again.** A second deploy creates a *second contract*,
  not a retry. Unlike `submit_response` and `rule`, nothing on-chain prevents
  it — the guard is this instruction.
- **Do not clear site data**, which discards the persisted pending hash.

---

## 8. Deployment verification

Press **Verify deployment**. Fourteen checks run in order, each independently:

| # | Check | Passes when |
| - | ----- | ----------- |
| 1 | Receipt finalized | `statusName` is `FINALIZED` |
| 2 | Execution succeeded | `txExecutionResultName` is `FINISHED_WITH_RETURN` |
| 3 | Address recovered | `txDataDecoded.contractAddress` is present and **non-zero** |
| 4 | Contract code exists | `gen_getContractCode` returns non-empty source |
| 5 | Deployed source matches | its SHA-256 equals `bf845bc4…` |
| 6 | Contract readable | `get_state` answers with a recognisable shape |
| 7 | Challenger matches signer | `challenger` is profile A's address |
| 8 | Respondent matches input | `respondent` is the submitted address |
| 9 | Case title matches | equals the trimmed title from section 5 |
| 10 | All four URLs match | each equals the submitted URL exactly |
| 11 | Status is `OPEN` | |
| 12 | `response_url` empty | and `has_response` is false |
| 13 | `outcome` and `final_status` empty | both `""` |
| 14 | `created_at` populated | non-empty ISO-8601 UTC |

### Address recovery — only one field is valid

The deployed address comes from **`txDataDecoded.contractAddress` and nowhere
else**. Two traps, both verified against `genlayer-js@1.1.8`:

- `GenLayerTransaction` has **no top-level `contractAddress`** field.
- `deployContract` submits with `recipient: zeroAddress`, so a deploy receipt's
  `recipient` is always `0x0000000000000000000000000000000000000000` and is
  **never** the contract. It must not be used as a fallback, and the zero
  address is rejected explicitly.

### Contract code — the call shape matters

`getContractCode` takes the address **positionally**; the SDK wraps it into
`[{ address }]` itself because `isStudio` is `false`. Passing an object produces
a doubly nested parameter the node rejects, and a throw here is reported as "no
contract exists" — so a wrong call shape makes **every** genuine deployment look
like a ghost deployment. This was a real defect, found and fixed in the Stage 5
audit and now asserted by `src/sdk-contract.test.ts`.

### Failure of any check

> **If any of the fourteen checks fails, the deployment is NOT VERIFIED and the
> case must not proceed.**

Do not submit a response against it. Do not rule on it. Do not record its
address as a case. The UI enforces this: it exposes the address only when every
check passes, and reports checks after a failure as *not reached* rather than as
passing. Diagnose with section 9 and file a new case if required.

---

## 9. Failure classification and recovery

| Situation | How it presents | Retry safe? | Action |
| --------- | --------------- | ----------- | ------ |
| **No signature / no hash** | Wallet rejected, or an error before submission. UI: `failed`, "Not submitted". | **Yes — safe.** | Nothing was committed and no gas spent. Fix and retry. |
| **Hash issued, pending** | `submitted` or `pending-consensus`. | **No.** | Wait. ~30 minutes is normal. Never resubmit while in flight. |
| **Consensus rejected** | `statusName` `CANCELED`, `UNDETERMINED`, `VALIDATORS_TIMEOUT`, `LEADER_TIMEOUT`; or `resultName` a settled non-`AGREE` value (`DISAGREE`, `TIMEOUT`, `NO_MAJORITY`, `DETERMINISTIC_VIOLATION`). UI: `failed`. | **Yes, after reading state.** | The write did not take effect. Confirm on-chain state, then retry. For `rule`, repeated disagreement means validators cannot agree — investigate the evidence rather than retrying blindly. |
| **`FINISHED_WITH_ERROR`** | Consensus accepted, contract refused. UI: `execution-error` plus a rejection summary. | **No — not as-is.** | The contract's guard worked and **nothing changed**. Retrying the same call fails the same way. Read the live state: usually the action was already performed (duplicate response, already ruled). |
| **Finalized success, contract unreadable** | Checks 1–2 pass, check 4 or 6 fails. | **No.** | Do not retry the deploy against the same expectation. This is the materialization failure below — treat the deployment as failed and file a new case. |
| **Zero-address or absent-address receipt** | Check 3 fails: `txDataDecoded.contractAddress` missing, or `0x000…0`. | **No.** | No contract was created. Record the hash, then file a new case. Never probe the zero address as if it were the contract. |
| **RPC read failure** | Reads throw; UI shows a degraded banner and keeps the last good state. | **Yes — reads only.** | Retry the read. **Never** submit a write on unread state: the preflight refuses, deliberately. |
| **Ghost / materialization failure** | Receipt `FINALIZED` + `FINISHED_WITH_RETURN`, validators agreed, an address named — but `gen_getContractCode` reports nothing there, hours later. | **No retry of the same hash.** | The receipt is right about what it claims; the chain has no contract. Exactly what App 1 saw. Record the hash and named address as evidence, file a new case, and report it. |

**In every "no" row, the correct action is to read live state first.** The
contract is the only authority on what happened; a transaction tracker is a
description of a transaction, not of the case.

---

## 10. Respondent response procedure

Exercised on the **secondary** case (`case-003`), which has a response document.

1. **Switch to profile B (respondent).** Confirm the wallet's active account is
   the address submitted as `respondent`, and that it is on chain 4221.
2. **Open the exact contract.** Navigate to `/cases`, paste the verified
   contract address, add it, and open it. Confirm the address in the URL matches
   the verified deployment character for character. Never rely on a bookmark
   from another profile.
3. **Verify role from live state.** The case view must show your role as
   `respondent`. That is derived from the contract's own `respondent` field, not
   from local metadata. If it shows `observer`, the wrong wallet is connected —
   stop.
4. **Confirm the case is `OPEN`.** `submit_response` is permitted only while
   `OPEN`. If it shows `RESPONDED`, a response already exists and the contract
   will refuse another.
5. **Enter the commit-pinned response URL** from section 4. It must show no
   mutability warning.
6. **Press Submit response.** The UI re-reads live state and re-derives
   availability *before* opening the dialog, and again immediately *before*
   submitting. If the case moved in between, the write is abandoned with nothing
   signed.
7. **Read the confirmation dialog.** It states the response is permanent and
   cannot be replaced, and shows the exact URL. Confirm the URL, then sign.
8. **Wait for finalization.** Do not resubmit. One response, ever.
9. **Verify after finalization:**
   - `status` is `RESPONDED`;
   - `response_url` in `get_evidence_sources` equals the submitted URL exactly;
   - `responded_at` is populated;
   - `has_response` is true.

The UI evaluates this postcondition automatically and binds it to that exact
transaction hash and method, so it cannot be shown under a later transaction.

---

## 11. Ruling procedure

Applies to both pilot cases: `case-002` from `OPEN`, `case-003` from
`RESPONDED`.

1. **Any wallet may call `rule`.** It is permissionless by design — restricting
   it to the parties would let a disinterested challenger and an unwilling
   respondent leave a case unruled forever. Use profile A, profile B, or a third
   wallet; record which.
2. **Refresh live state before signing.** Open the case and let it read. The UI
   re-derives availability before the dialog and again before submit; a case
   already ruled from another tab is caught here with nothing signed.
3. **Understand what is about to happen.** Every validator independently
   re-fetches all pinned evidence — four documents, or five when a response
   exists — and derives its own complete ruling. Validators never follow links
   found *inside* documents; the fetch set is exactly the pinned URLs.
   Consensus is on the **outcome** and the **set of violated rule ids**.
   Citations and reasoning are recorded from the leader and are explanatory, not
   agreed text.
4. **Sign once and wait for finalization.** This is the most expensive write:
   five validators each fetching five documents and running a model, with up to
   three rotations. Never resubmit.
5. **Verify after finalization:**
   - `status` is `RULED`;
   - `outcome` is **`NON_COMPLIANT`**;
   - `final_status` is **`REJECTED`**;
   - `violated_rule_ids` are **unique** and equal the expected set — `["ART-4.3"]`
     for case-002, `["ART-5.4"]` for case-003;
   - `ruled_at` is populated;
   - citations decode to structured objects and every citation URL is one of the
     pinned evidence URLs;
   - each cited rule id resolves in the pinned constitution and its title and
     text are displayed.
6. **Record consensus detail** from the ruling transaction: `resultName`,
   `lastRound.validatorVotesName` (per-validator `AGREE` / `DISAGREE` /
   `TIMEOUT` / `NOT_VOTED` / `DETERMINISTIC_VIOLATION`), `numOfRounds`, and any
   rotation. A ruling that needed rotations is still valid; it is worth
   recording because it indicates validators disagreed at least once.

If `outcome` is anything other than `NON_COMPLIANT`, the pilot has produced an
unexpected result. That is a finding, not a failure to hide — record the full
state payload, the reasoning, the citations and the votes, and report it before
drawing any conclusion.

---

## 12. Pilot evidence capture

Record all of the following in `docs/pilot/PILOT-RUN.md`, per case:

**Transactions**
- deployment transaction hash
- response transaction hash (secondary case only)
- ruling transaction hash
- for each: `statusName`, `txExecutionResultName`, `resultName`, `numOfRounds`

**Contract**
- deployed contract address, recovered from `txDataDecoded.contractAddress`
- deployed source SHA-256, and confirmation it equals `bf845bc4…`

**Parties**
- challenger address (profile A)
- respondent address (profile B)
- the address that called `rule`

**Timestamps**
- `created_at`, `responded_at`, `ruled_at` from contract state
- wall-clock submission and finalization time for each transaction, so
  settlement duration is recorded

**Consensus**
- per-validator votes (`lastRound.validatorVotesName`)
- leader receipt and any rotations
- execution result for each transaction

**Final state**
- the complete `get_state()` payload
- the complete `get_evidence_sources()` payload
- decoded citations, and the resolved title and text of every cited rule

**Fixtures**
- the four (or five) URLs used, with their SHA-256 values from section 4
- confirmation each returned HTTP 200 at pilot time

**Screenshots**
- create wizard step 5 (review), before signing
- the submitted-not-deployed panel with the hash visible
- the fourteen-check verification panel, all passing
- the case view at `OPEN`, at `RESPONDED` (secondary case), and at `RULED`
- the ruling panel showing outcome, final status, cited rules and citations
- any failure encountered, captured at the moment it appeared

---

## 12a. The live integration suite

The procedures in sections 7, 10 and 11 are implemented as an automated suite in
`tests/integration/`, driven by the harness in `pilot/`. **The pilot execution
is the first live run of that suite** — it has never been run against Bradbury,
because doing so spends testnet GEN and requires unlocked wallets.

### It is opt-in, three times over

| Gate | Effect when unset |
| ---- | ----------------- |
| the `integration` pytest marker | deselected by `pytest.ini`'s `-m "not integration"` |
| `CONSTITUTIONCOURT_LIVE=1` | every live test skips, even under an explicit `-m integration` |
| `CONSTITUTIONCOURT_ALLOW_WRITES=1` | read-only tests run; nothing signs, nothing spends |

Reading an environment variable is not consent to spend GEN, so the read gate
and the write gate are separate. Resuming needs a fourth,
`CONSTITUTIONCOURT_RESUME=1`, because resuming is a decision a human makes after
inspecting a preserved transaction — never something a script does on its own.

**Default CI remains entirely offline.** It sets none of these gates, and the
`fixtures` job's `raw.githubusercontent.com` fetches remain its only network
access. No CI job can reach a GenLayer network.

### Credentials

Signing keys are read from `CONSTITUTIONCOURT_CHALLENGER_KEY` and
`CONSTITUTIONCOURT_RESPONDENT_KEY` at the moment a signature is needed. Nothing
is embedded, defaulted, logged or persisted; `pilot.config.describe()` reports
only whether a key is *present*. `PilotRecord.save` refuses to write anything
credential-shaped, including a bare 64-character hex value.

### The operator command

```bash
python -m pilot preflight                    # read-only; no wallet needed
python -m pilot preflight case-002 --writes  # also check keys and balances
python -m pilot run case-002                 # CASE A: deploy + rule
python -m pilot run case-003                 # CASE B: deploy + respond + rule
python -m pilot resume case-002              # continue an interrupted run
python -m pilot verify case-002 --address 0x…  # verify; writes nothing
```

Records are written to `deploy/bradbury/case-002/` and `deploy/bradbury/case-003/`.

### Serialisation

The two cases share the challenger signer, so they are **never run in parallel**.
Two writes from one account in flight at once is how a nonce collision becomes a
mystery. The suite has no `pytest-xdist` usage and the modules are ordered.

### On timeout or an unknown outcome

The runner stops, preserves the hash in the record, guesses nothing, and resends
nothing. Continuing requires the explicit resume gate after a human has
inspected the transaction. That is the behaviour section 9 demands, implemented
rather than merely described.

---

## 13. Exact commands

All run from the repository root unless stated. Every one has been executed.

### Install

```bash
python -m pip install -r requirements.txt
cd frontend && npm ci
```

### Contract — lint and tests

```bash
genvm-lint contracts/constitution_court.py
python -m pytest tests/direct -q          # 247 offline contract tests
python -m pytest tests/harness -q         # 107 offline pilot-harness tests
python evidence/validate.py
```

### Pilot harness — offline

```bash
python -m pytest -q                       # everything offline; integration deselected
python -m pilot preflight --offline       # artefact checks, no network, no wallet
python -m pilot preflight                 # adds RPC and evidence-URL checks
```

### Pilot harness — live (spends testnet GEN; requires unlocked wallets)

Not run before the pilot. Each gate is deliberate:

```bash
export CONSTITUTIONCOURT_LIVE=1                 # enable live reads
python -m pytest tests/integration -m integration -q   # read-only live checks

export CONSTITUTIONCOURT_ALLOW_WRITES=1         # permit spending
export CONSTITUTIONCOURT_CHALLENGER_KEY=…       # never committed, never logged
export CONSTITUTIONCOURT_RESPONDENT_KEY=…
python -m pilot run case-002                    # CASE A
python -m pilot run case-003                    # CASE B
```

On Windows, `genvm-lint` may not be on `PATH`; resolve it with:

```bash
python -c "import importlib.metadata as m; print([str(f.locate()) for f in m.distribution('genvm-linter').files if f.name=='genvm-lint.exe'][0])"
```

### Frontend — from `frontend/`

```bash
npm run lint          # ESLint, zero warnings tolerated
npm run typecheck     # tsc --noEmit
npm test              # unit tests (vitest, jsdom)
npm run build         # typecheck then production build
```

### Verification suites — from `frontend/`

```bash
npm run repro         # contract parity, source hash, exact pins — offline
npm run fixtures      # published fixture URLs: HTTP 200 + hash parity — network
npm run e2e:encoding  # calldata encoding, Address vs string — offline
npm run e2e           # browser smoke against the production build
npm run a11y          # axe-core; zero serious/critical required
npm run sweep         # overflow and console sweep, five viewports
```

`npm run fixtures` is the only suite that reaches the internet, and it touches
`raw.githubusercontent.com` only. Every other browser suite blocks all outbound
requests except localhost, so no GenLayer network is reachable from them.

### Full pre-deployment gate, in order

```bash
python -m pip install -r requirements.txt
genvm-lint contracts/constitution_court.py
python evidence/validate.py
python -m pytest tests/direct -q
cd frontend
npm ci
npm run lint && npm run typecheck && npm test && npm run build
npm run repro && npm run fixtures && npm run e2e:encoding
npm run e2e && npm run a11y && npm run sweep
```

---

## 14. Pilot stop conditions

**Stop immediately, sign nothing further, and record the state** if any of these
occur:

1. **An evidence URL or hash differs** from section 4 — a document changed under
   a pinned commit, which should be impossible, or the wrong URL was entered.
2. **Contract source parity fails** — `npm run repro` red, or the canonical and
   embedded copies differ, or the hash is not `bf845bc4…`.
3. **Address recovery returns absent or zero** — `txDataDecoded.contractAddress`
   missing or `0x000…0`.
4. **Deployment verification fails** any of the fourteen checks.
5. **The connected wallet or network is wrong** — not chain 4221, or the signing
   account is not the intended role.
6. **Any previous write remains unresolved** — a hash exists whose final state
   is unknown. Resolve it before anything else.
7. **Live state differs from the expected lifecycle** — a case is `RESPONDED`
   when it should be `OPEN`, `RULED` when it should not be, or shows an outcome
   outside the three valid values.

Stopping is cheap. This contract holds no funds, so a halted pilot loses nothing
but time; proceeding past an unexplained state risks recording a result nobody
can interpret afterwards.

---

## 15. Post-pilot outputs

| Output | Location | Contents |
| ------ | -------- | -------- |
| **Pilot record** | `docs/pilot/PILOT-RUN.md` | Everything in section 12, per case, including any failure |
| **README update** | `README.md` | Deployed case addresses, outcomes, and links to the pilot record |
| **Screenshots** | `docs/pilot/screenshots/` | The captures listed in section 12, named by case and step |
| **Deployment record** | `docs/pilot/PILOT-RUN.md` | Contract addresses, transaction hashes, source hash, SDK version, commit deployed |
| **Release tag** | git tag | Annotated tag on the exact commit deployed, naming the contract addresses |
| **Submission material** | separate, later | Not written before the pilot completes — a submission describing an unfinished run would be a claim rather than a record |

The pilot record is written **during** the run, not reconstructed afterwards.
A hash written down at the moment it appeared is evidence; a hash recalled later
is a recollection.

---

## Verification of this document

`frontend/src/deploy-doc.test.ts` asserts that this runbook:

- contains no branch-pinned evidence URL — every `raw.githubusercontent.com` URL
  carries a 40-character commit SHA;
- contains no unfilled placeholder;
- lists URLs and SHA-256 values that match `evidence/README.md` exactly;
- lists a contract source hash that matches the real
  `contracts/constitution_court.py`.

Those checks run in CI with the rest of the frontend suite, so this document
cannot drift from the artefacts it describes without failing the build.
