# ConstitutionCourt — Architecture

**Status: LOCKED at Stage 1.** Everything in this document is a decision, not a
proposal. Changing anything here after Stage 2 begins requires a new entry in
[BUILD-PLAN.md](BUILD-PLAN.md) under "Architecture change log" and a rerun of
the full direct-mode matrix.

---

## 1. What this application is

A governance-compliance adjudicator for treasury proposals.

A **challenger** believes a DAO's treasury proposal was carried in violation of
that DAO's own constitution. They deploy one contract instance naming a
**respondent** and pinning four public evidence URLs. The respondent may submit
one public response URL. GenLayer validators then independently fetch the
evidence, independently derive a ruling, and the contract records the ruling
that consensus agreed on.

The ruling is an opinion with citations. It moves no money and binds no one.

## 2. What this application is not

These exclusions are load-bearing. Each one is a thing the application could
plausibly grow into, and each one is refused on purpose.

| Excluded                  | Why                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Escrow**                | The contract holds no balance. It cannot be drained, so a wrong ruling costs its subject reputation, not funds. This removes the entire class of value-extraction attacks.       |
| **Transfers**             | No `payable` methods, no external messages, no EVM calls. Nothing in this contract can move an asset.                                                                            |
| **Tokens**                | No fee token, no staking, no bonding. Filing is free; the spam answer is social, not economic — see [THREAT-MODEL](THREAT-MODEL.md#t-6-frivolous-case-spam).                     |
| **Backend database**      | The contract is the only authoritative store. A backend index would immediately become a second source of truth that can disagree with the chain.                                |
| **Custom appeal contract**| GenLayer has native transaction appeal. A bespoke re-ruling method would be a second, weaker consensus mechanism competing with the real one.                                    |
| **Monitoring service**    | Nothing is time-sensitive. No deadline expires, no position liquidates, no keeper is needed for correctness.                                                                     |
| **Multi-case registry**   | One contract instance per case. A registry adds shared mutable state, per-case access control, and unbounded storage growth to buy an indexing convenience the frontend can do.  |
| **Non-treasury disputes** | Membership, elections and constitutional amendment each need different evidence types and different rules. Scope creep here would dilute the schema until it fits nothing well.  |

**Consequence worth stating plainly:** `CERTIFIED` does not mean a proposal is
legal, valid, or safe to execute. It means validators reading the pinned
evidence found no violation of the pinned constitution. It is a finding on a
record, not a warrant.

## 3. Why this needs GenLayer

The honest test: could a deterministic contract, a REST API, or a database job
do this instead? For this application, no — and it is worth being specific about
where the irreducible judgment lives, because the easy version of this product
is one where GenLayer rubber-stamps an answer the frontend already computed.

The constitution is **natural language on purpose**. `schema.md` forbids
machine-readable threshold fields in rules, and `validate.py` enforces that ban.
The adjudication requires reading a rule and deciding:

- **Scope.** Does `ART-2.2` ("moves assets out of the Collective treasury")
  cover this proposal? The proposal declares its own `type`, but a self-declared
  type is a claim by the party being challenged.
- **Tier.** `ART-4.2` governs "100,000 USDC or less", `ART-4.3` "more than
  100,000". Case 002 turns entirely on this: 250,000 USDC passes the first bar
  and fails the second, and the body text describes smaller per-grant amounts
  that a careless reader could anchor on.
- **Basis.** "Votes cast" — does that include abstentions? `ART-4.2` says
  abstentions count toward quorum but not toward the approval denominator. Two
  defensible readings of "cast" give 60.0% and 62.4%.
- **Sufficiency.** `ART-5.4` requires "publicly announced, in full". Does a chat
  reminder count? Does it count if it landed after voting opened?
- **Silence.** Case 004's tally is absent. Deciding that absence is neither
  compliance nor violation is a judgment a threshold function cannot express.

A validator must also weigh a respondent's argument and correctly give it no
evidentiary weight — case 003's response is well-reasoned, sympathetic, and
must lose. That is adjudication, and it is what validator consensus is for.

## 4. Consensus boundary

The single most important table in this document. Everything above the line is
authoritative; everything below it is convenience.

| Layer                | Owns                                                                                                                    | Never does                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Contract**         | Case parties, evidence URLs, lifecycle transitions, the ruling, the outcome→status mapping, the validator agreement rule | Fetch on its own authority; decide anything off-chain decided   |
| **Validators**       | Independently fetching all evidence; independently deriving a ruling; agreeing or disagreeing on decision fields          | Trust the leader's answer; trust `declared_result`              |
| **Evidence sources** | Raw constitution, proposal, vote, notice and response documents                                                           | Anything. They are untrusted input from adversarial parties     |
| **Frontend**         | Case creation UX, URL entry, previews, reading state, rendering rulings, discovery                                        | **Decide.** It never computes an outcome the contract adopts    |

The frontend may show a user a *preview* of what a ruling might look like. That
preview is never submitted, never stored, and carries no weight. If the frontend
could compute the outcome and the contract merely recorded it, this application
would not need GenLayer and should not be built on it.

## 5. Lifecycle — LOCKED

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
  deploy            │  submit_response                         │  rule
  (challenger)      │  (respondent, once)                      │  (permissionless)
       │            │                                          │
       ▼            ▼                                          ▼
   ┌────────┐  ──────────────►  ┌───────────┐  ──────────►  ┌───────┐
   │  OPEN  │                   │ RESPONDED │               │ RULED │
   └────────┘                   └───────────┘               └───────┘
       │                                                        ▲
       │                        rule (permissionless)           │
       └────────────────────────────────────────────────────────┘
                     no response was ever submitted
```

Two paths reach `RULED`, and **both are first-class**:

| Path                          | When                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `OPEN → RULED`                | Respondent did not answer. The response is optional.         |
| `OPEN → RESPONDED → RULED`    | Respondent answered.                                         |

`RULED` is terminal. There is no reopening, no second ruling, and no appeal
method. After `RULED`, **no evidence and no response can be changed** — every
URL field is frozen. A party who disputes the ruling uses GenLayer's **native
transaction appeal** on the `rule` transaction.

### Why `rule` is reachable from `OPEN` — DECIDED

The respondent's response is **optional**. `rule` therefore accepts `OPEN` or
`RESPONDED` and adjudicates whatever evidence exists at that moment.

Requiring `RESPONDED` would hand the respondent — the party with the most to
lose from an adverse ruling — a unilateral veto: never call `submit_response`,
and the case never leaves `OPEN` and is permanently unrulable. With no escrow
and no deadline, nothing else in the system breaks that stalemate.

A respondent's silence is therefore a choice not to argue, not a way to bury the
case.

### Why `rule` is permissionless

Anyone may call `rule`. Restricting it to the two parties reintroduces the
deadlock through a smaller door: if the challenger loses interest and the
respondent prefers no ruling, the case sits in `OPEN` forever. The caller pays
gas and gains nothing — there is no payout to race for and no ordering to
exploit, because the ruling depends only on evidence, not on who triggered it.

`submit_response` is restricted to the respondent address **and to `OPEN`**. It
cannot be called from `RESPONDED` (one response only, so the document cannot be
swapped after seeing how it lands) or from `RULED` (the record is frozen).

### Timestamps

All timestamps come from the deterministic transaction timestamp, which is
identical for every validator. Block height is never used — GenLayer does not
expose it in-contract.

## 6. Contract storage model — LOCKED

One contract instance per case, so no collections keyed by case id and no
per-case access control.

```python
class ConstitutionCourt(gl.Contract):
    # --- Parties (immutable after construction) ---
    challenger: Address
    respondent: Address

    # --- Evidence URLs (four immutable, one write-once) ---
    constitution_url: str
    proposal_url: str
    vote_record_url: str
    notice_record_url: str
    response_url: str            # "" until submit_response

    # --- Lifecycle ---
    status: str                  # OPEN | RESPONDED | RULED
    final_status: str            # "" | CERTIFIED | REJECTED | UNRESOLVED

    # --- Ruling (all empty until RULED) ---
    outcome: str                 # "" | COMPLIANT | NON_COMPLIANT | INSUFFICIENT_EVIDENCE
    violated_rule_ids: DynArray[str]
    evidence_citations: DynArray[str]   # each a JSON-encoded citation object
    reasoning: str

    # --- Audit trail (ISO-8601 UTC strings) ---
    created_at: str
    responded_at: str            # "" until submit_response
    ruled_at: str                # "" until rule

    # --- Case metadata ---
    case_title: str
```

### Type decisions and why

| Decision                                     | Rationale                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status` / `outcome` as `str`, not `Enum`     | GenLayer storage does not support `Enum`. Store the string value.                                                                                              |
| `DynArray[str]` for rule ids and citations    | Python `list` is not persistable.                                                                                                                              |
| Citations JSON-encoded into `DynArray[str]`   | Citations are structured objects. Serializing to a JSON string in a `DynArray[str]` is the documented pattern for structured data and avoids a nested dataclass whose field order would become layout-critical. |
| `""` as the null for optional strings         | There is no `Optional` in storage. `""` is unambiguous here because no valid URL, status or timestamp is empty.                                                 |
| Timestamps as ISO-8601 `str`, not `u256`      | Never compared arithmetically on-chain; only displayed and audited. A string round-trips to the frontend without unit confusion.                                |
| No `u256` fields at all                       | No money, no counters, no arithmetic. Amounts live in evidence documents as decimal strings and are parsed inside the nondet block, never stored.               |
| `final_status` stored, not derived            | Derivation is trivial, but storing it makes the mapping auditable in a single state read and prevents a future frontend from inventing its own mapping.         |

### Storage layout note

Fields are declared in the order above. If upgradability is ever added, new
fields append at the **end** only — GenLayer storage layout is positional, and
inserting a field shifts every subsequent slot. This is recorded now because the
constraint is invisible until it breaks a deployed contract.

## 7. Contract methods — LOCKED

Exactly five. No others in Stage 2.

| Method                  | Kind    | Caller      | From state           | To state    |
| ----------------------- | ------- | ----------- | -------------------- | ----------- |
| `__init__`              | deploy  | challenger  | —                    | `OPEN`      |
| `submit_response`       | write   | respondent  | `OPEN`               | `RESPONDED` |
| `rule`                  | write   | anyone      | `OPEN` \| `RESPONDED`| `RULED`     |
| `get_state`             | view    | anyone      | any                  | —           |
| `get_evidence_sources`  | view    | anyone      | any                  | —           |

### `__init__(respondent, case_title, constitution_url, proposal_url, vote_record_url, notice_record_url)`

Sets `challenger = gl.message.sender_account`, `status = OPEN`, `created_at`.

Deterministic validation, all raising `gl.vm.UserError` with the `[INPUT]`
prefix before any non-deterministic execution:

- Every URL starts with `https://`. Plain HTTP is rejected — an on-path attacker
  could serve different bytes to different validators and split consensus.
- No URL contains `@` before the path (blocks `https://user:pass@host/`) and no
  URL carries a credential-shaped query parameter. Evidence must be public;
  anything requiring a secret is not something validators can all fetch.
- No URL exceeds 2048 characters.
- `respondent` is a valid `Address` and is not the zero address.
- `respondent != challenger`. A case against oneself is either a mistake or an
  attempt to manufacture a favourable ruling.
- `case_title` is non-empty and at most 200 characters.

`respondent` arrives calldata-decoded as an `Address`, not a hex `str`. Tests
must construct it the same way — see App 1's `as_address` helper.

### `submit_response(response_url)`

- Caller must be `respondent`, else `[INPUT]` error.
- State must be `OPEN`. Calling from `RESPONDED` is rejected — one response
  only, so the respondent cannot swap the document after seeing how it lands.
- `response_url` passes the same URL validation as construction.
- Sets `response_url`, `responded_at`, `status = RESPONDED`.

### `rule()`

The only non-deterministic method. Detailed in §8.

- State must be `OPEN` or `RESPONDED`, else `[INPUT]` error. Calling from
  `RULED` is rejected, so a losing party cannot re-roll the adjudication.
- On consensus: writes `outcome`, `violated_rule_ids`, `evidence_citations`,
  `reasoning`, `ruled_at`, `final_status`, and sets `status = RULED`.

### `get_state()` and `get_evidence_sources()`

Pure reads, no side effects, callable in any state. `get_state` returns the
lifecycle, ruling and audit fields; `get_evidence_sources` returns the five
URLs. They are split because the frontend polls state frequently and reads the
URL set once.

## 8. Adjudication and the validator agreement rule — LOCKED

### Equivalence principle

**`gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`** — a custom validator
function.

Not `strict_eq`: LLM output is non-deterministic and `strict_eq` would fail
every time. Not `prompt_non_comparative`: this is a classification decision with
a settlement effect, and a validator that only checks the leader returned an
allowed label lets one leader decide alone.

The validator **re-fetches every evidence URL and independently derives its own
complete ruling**, then compares decision fields. It never inspects the leader's
answer for shape and calls that verification.

### Decision fields — what consensus is actually about

| Field                | Consensus-critical | Comparison rule                                        |
| -------------------- | ------------------ | ------------------------------------------------------ |
| `outcome`            | **yes**            | Exact string equality                                  |
| `violated_rule_ids`  | **yes**            | Set equality — sorted and de-duplicated before compare |
| `evidence_citations` | no                 | Explanatory                                            |
| `reasoning`          | no                 | Explanatory                                            |

`violated_rule_ids` is compared as a **set**, because two validators that both
identify `ART-4.3` may emit it in different positions or list it twice. Order
and multiplicity carry no meaning; membership does. Comparing raw lists would
fail consensus on a formatting difference.

`reasoning` and `evidence_citations` are recorded from the **leader's** result
once consensus is reached. This is stated explicitly because it is a real
limitation: the stored prose is one validator's explanation, not an agreed text.
The agreed part is the outcome and the cited rule ids. Anyone treating the
stored reasoning as consensus-verified is misreading it.

### Fetch discipline

Validators fetch exactly the pinned URLs — four, or five when a response
exists. They **never** follow `notices[].url` or any other link found inside a
document. Following links would let a challenger steer validators to arbitrary
hosts and would make the fetch set unbounded and non-reproducible.

### Validator output schema — LOCKED

The leader function returns, and the validator function independently produces,
this exact structure:

```json
{
  "outcome": "NON_COMPLIANT",
  "violated_rule_ids": ["ART-4.3"],
  "evidence_citations": [
    {
      "source": "vote-record",
      "url": "https://evidence.example/case-002/vote-record.json",
      "locator": "$.tally",
      "quote": "for: 340000, against: 180000, abstain: 30000",
      "supports": "ART-4.3"
    },
    {
      "source": "proposal",
      "url": "https://evidence.example/case-002/proposal.json",
      "locator": "$.requested_amount.amount",
      "quote": "250000",
      "supports": "ART-4.3"
    }
  ],
  "reasoning": "The disbursement of 250,000 USDC exceeds the 100,000 USDC standard tier, so ART-4.3 applies and requires at least two-thirds of votes cast. Excluding the 30,000 abstentions per that Article, 340,000 of 520,000 votes cast were in favour — 65.38%, short of the 66.67% required. The record's declared_result of PASSED reflects a simple-majority calculation that ART-4.3 does not permit at this tier."
}
```

| Field                            | Type            | Required | Constraint                                                       |
| -------------------------------- | --------------- | -------- | ---------------------------------------------------------------- |
| `outcome`                        | string          | yes      | Exactly one of `COMPLIANT`, `NON_COMPLIANT`, `INSUFFICIENT_EVIDENCE` |
| `violated_rule_ids`              | array\<string\> | yes      | May be empty. Each id must resolve in the constitution            |
| `evidence_citations`             | array\<object\> | yes      | At least one when `outcome` is `NON_COMPLIANT`                    |
| `evidence_citations[].source`    | string          | yes      | `constitution` \| `proposal` \| `vote-record` \| `notice-record` \| `response` |
| `evidence_citations[].url`       | string          | yes      | Must be one of the pinned URLs                                    |
| `evidence_citations[].locator`   | string          | yes      | JSONPath-style pointer into the document                          |
| `evidence_citations[].quote`     | string          | yes      | The value or text relied on                                       |
| `evidence_citations[].supports`  | string          | no       | Rule id this citation bears on                                    |
| `reasoning`                      | string          | yes      | Non-empty prose                                                   |

Invariants enforced before a ruling is accepted:

- `outcome == "NON_COMPLIANT"` **iff** `violated_rule_ids` is non-empty. A
  non-compliant ruling that cites no rule is unactionable; a compliant ruling
  that cites violations is self-contradictory.
- `outcome == "INSUFFICIENT_EVIDENCE"` requires `violated_rule_ids` empty. If
  the evidence is too thin to rule, it is too thin to establish a violation.
- Every cited rule id resolves in the fetched constitution. A hallucinated id
  fails the ruling rather than being stored.

Violating any of these raises `[LLM_ERROR]`, the validator disagrees, and
consensus rotates. Malformed output is never stored.

### Final status mapping — LOCKED

| `outcome`               | `final_status` | Meaning                                                     |
| ----------------------- | -------------- | ----------------------------------------------------------- |
| `COMPLIANT`             | `CERTIFIED`    | No violation found on this record                            |
| `NON_COMPLIANT`         | `REJECTED`     | At least one rule violated, cited by id                      |
| `INSUFFICIENT_EVIDENCE` | `UNRESOLVED`   | Evidence read, does not settle the question                  |

Total and injective. Applied inside the contract after consensus — never by the
frontend, and never by the LLM, which returns `outcome` only and is never asked
for `final_status`. Asking a model for a value that is a pure function of
another value it already returned invites the two to disagree.

## 9. Error taxonomy — LOCKED

| Prefix                | Raised when                                                   | Validator behaviour                    |
| --------------------- | ------------------------------------------------------------- | -------------------------------------- |
| `[INPUT]`             | Bad input, wrong state, unauthorized. **Deterministic**        | Reverts before any nondet execution     |
| `[TRANSIENT]`         | 408, 425, 429, 5xx, timeout, DNS failure                       | Disagree → consensus retries            |
| `[INVALID_EVIDENCE]`  | Unexpected 4xx, unparseable JSON, wrong `schema` literal       | Disagree → no ruling recorded           |
| `[LLM_ERROR]`         | Malformed model output, invariant violation, unresolvable id   | Disagree → rotation                     |

All four use `gl.vm.UserError` — the prefix, not the exception class, is what
carries the classification. `[INPUT]` errors are raised **before** the nondet
block and revert the call deterministically; the other three occur inside it and
drive the validator's agree/disagree decision.

Bare `Exception` is never raised in contract code: it becomes an unrecoverable
`VMError` rather than something a validator can classify.

The distinction that matters most: **no error prefix ever becomes an outcome.**
`INSUFFICIENT_EVIDENCE` is a ruling about documents that were successfully read.
A 503 is a fetch failure. Mapping a 503 to `INSUFFICIENT_EVIDENCE` would convert
a retryable blip into a permanent `UNRESOLVED` verdict, and because a 503 is not
reproducible across validators it would also be a consensus hazard. See
[case 004](../evidence/case-004-insufficient-evidence/README.md).

## 10. Runner pin

```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
```

Single-file Python contract, so `py-genlayer`, not `py-genlayer-multi`. No
embeddings, so no `Seq` block. `py-genlayer:test` and `py-genlayer:latest` are
local-Studio aliases that every GenLayer network rejects; they must never appear.

## 11. Repository layout

```
constitutioncourt/
├── contracts/            constitution_court.py — Stage 2
├── docs/                 ARCHITECTURE, THREAT-MODEL, BUILD-PLAN
├── evidence/             schema.md, validate.py, four fixture cases
├── frontend/             Stage 4 — read-only case viewer + case creation
├── tests/direct/         Stage 3 — offline direct-mode suite
└── .github/workflows/    CI
```

## 12. Deployment posture

**Nothing is deployed.** No Bradbury deployment, no wallet signature, no GEN
spent, at Stage 1 or Stage 2. The contract is validated by `genvm-lint` and the
direct-mode suite, both fully offline. Deployment is a Stage 5 decision made
explicitly, with its own approval — see [BUILD-PLAN.md](BUILD-PLAN.md).
