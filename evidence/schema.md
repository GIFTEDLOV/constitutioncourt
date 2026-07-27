# Evidence Schema — v1

Every document ConstitutionCourt adjudicates over is a JSON file served at a
public HTTPS URL. There are five document types. Four are pinned by the
challenger at construction; the fifth is supplied once by the respondent.

| Type            | Supplied by | Pinned at        | Storage field         |
| --------------- | ----------- | ---------------- | --------------------- |
| `constitution`  | challenger  | `__init__`       | `constitution_url`    |
| `proposal`      | challenger  | `__init__`       | `proposal_url`        |
| `vote-record`   | challenger  | `__init__`       | `vote_record_url`     |
| `notice-record` | challenger  | `__init__`       | `notice_record_url`   |
| `response`      | respondent  | `submit_response`| `response_url`        |

## Ground rules

**Every document is untrusted.** The challenger picks four of the five URLs and
the respondent picks the fifth. Neither is a neutral party. The contract stores
URLs; it never stores, caches, or vouches for content. Each validator fetches
every URL independently and derives its own ruling from what it sees.

**Rules are natural language, deliberately.** `constitution.rules[].text` is the
authoritative statement of each rule. There is no machine-readable threshold
field, and adding one would be a design error: if the rule reduced to
`{"min_bps": 6667}` then a three-line deterministic function could decide every
case and the contract would have no reason to run on GenLayer at all. The work
that needs validator consensus is exactly the interpretive part — does this
proposal fall under "treasury disbursement", does a forum post satisfy "public
notice", is the threshold measured against votes cast or total eligible power.

**Declared results are claims, not facts.** `vote-record.declared_result` is the
organization's own assertion that a proposal passed. It is frequently the thing
under dispute. Validators must derive the result from the tally and the
constitution, never adopt the declared value.

**Transport rules.** HTTPS only. No credentials in the URL (no `user:pass@`, no
query-string tokens). Content type `application/json`. Documents are expected to
be immutable at their URL for the life of the case — see
[THREAT-MODEL](../docs/THREAT-MODEL.md#t-1-evidence-mutation-after-pinning).

## `constitution@1`

The governing document. Scoped to treasury rules; other governance domains are
out of scope for this application.

```json
{
  "schema": "constitutioncourt/constitution@1",
  "organization": "Meridian Collective",
  "version": "2026-01-15",
  "effective_from": "2026-01-15T00:00:00Z",
  "rules": [
    {
      "id": "ART-4.2",
      "title": "Standard approval threshold",
      "scope": "treasury",
      "text": "A treasury disbursement of 100,000 USDC or less is approved when more than half of all votes cast are in favour. Abstentions count toward quorum but are excluded from the approval calculation."
    }
  ]
}
```

| Field            | Type     | Required | Notes                                                     |
| ---------------- | -------- | -------- | --------------------------------------------------------- |
| `schema`         | string   | yes      | Exact literal `constitutioncourt/constitution@1`           |
| `organization`   | string   | yes      | Human name of the governing body                           |
| `version`        | string   | yes      | Opaque version label                                       |
| `effective_from` | ISO-8601 | yes      | UTC, `Z` suffix. Rules do not bind proposals predating it  |
| `rules`          | array    | yes      | At least one rule                                          |
| `rules[].id`     | string   | yes      | Unique within the document. This is what `violated_rule_ids` cites |
| `rules[].title`  | string   | yes      | Short label                                                |
| `rules[].scope`  | string   | yes      | `treasury` \| `governance` \| `membership`. Only `treasury` is adjudicated |
| `rules[].text`   | string   | yes      | Authoritative natural-language rule                        |

`rules[].id` is the join key for the entire application. A ruling that cites
`ART-4.3` is only meaningful because that id resolves to a rule in this
document. Ids must be stable and unique; validators that cannot resolve a cited
id treat the ruling as malformed.

## `proposal@1`

```json
{
  "schema": "constitutioncourt/proposal@1",
  "proposal_id": "MC-2026-014",
  "title": "Q2 security audit retainer",
  "type": "treasury_disbursement",
  "author": "0x7A3f...c21D",
  "submitted_at": "2026-03-01T09:00:00Z",
  "requested_amount": { "asset": "USDC", "amount": "45000" },
  "recipient": "0x91Be...4F08",
  "body": "Full natural-language proposal text."
}
```

| Field                       | Type     | Required | Notes                                     |
| --------------------------- | -------- | -------- | ----------------------------------------- |
| `schema`                    | string   | yes      | `constitutioncourt/proposal@1`             |
| `proposal_id`               | string   | yes      | Must match the vote and notice records     |
| `title`                     | string   | yes      |                                            |
| `type`                      | string   | yes      | `treasury_disbursement` for in-scope cases |
| `author`                    | string   | yes      | Opaque identifier                          |
| `submitted_at`              | ISO-8601 | yes      | UTC                                        |
| `requested_amount.asset`    | string   | yes      | e.g. `USDC`                                |
| `requested_amount.amount`   | string   | yes      | **Decimal string, never a JSON number.** See below |
| `recipient`                 | string   | yes      | Opaque identifier                          |
| `body`                      | string   | yes      | Natural-language text                      |

Amounts and voting power are decimal **strings**. A JSON number is an IEEE-754
double once parsed, and treasury figures routinely exceed 2^53, so a number
would let two validators read two different values from identical bytes. That is
a silent consensus split, and it is entirely avoidable.

## `vote-record@1`

```json
{
  "schema": "constitutioncourt/vote-record@1",
  "proposal_id": "MC-2026-014",
  "voting_opened_at": "2026-03-05T09:00:00Z",
  "voting_closed_at": "2026-03-12T09:00:00Z",
  "eligible_voting_power": "1000000",
  "participating_voting_power": "520000",
  "tally": { "for": "312000", "against": "188000", "abstain": "20000" },
  "declared_result": "PASSED"
}
```

| Field                        | Type     | Required | Notes                                             |
| ---------------------------- | -------- | -------- | ------------------------------------------------- |
| `schema`                     | string   | yes      | `constitutioncourt/vote-record@1`                  |
| `proposal_id`                | string   | yes      | Must match the proposal                            |
| `voting_opened_at`           | ISO-8601 | yes      | UTC. Notice period is measured **to** this instant |
| `voting_closed_at`           | ISO-8601 | yes      | UTC                                                |
| `eligible_voting_power`      | string   | no       | Absent ⇒ quorum is underivable                     |
| `participating_voting_power` | string   | no       | Absent ⇒ quorum is underivable                     |
| `tally.for`                  | string   | no       | Absent ⇒ threshold is underivable                  |
| `tally.against`              | string   | no       | Absent ⇒ threshold is underivable                  |
| `tally.abstain`              | string   | no       | Absent ⇒ threshold is underivable                  |
| `declared_result`            | string   | no       | `PASSED` \| `FAILED`. An untrusted claim           |

The optional fields are optional on purpose. A vote record whose tally is
redacted or still pending is precisely the `INSUFFICIENT_EVIDENCE` shape, and it
must be representable as valid, fetchable JSON — see the distinction below.

## `notice-record@1`

```json
{
  "schema": "constitutioncourt/notice-record@1",
  "proposal_id": "MC-2026-014",
  "notices": [
    {
      "channel": "forum",
      "url": "https://forum.example.org/t/mc-2026-014",
      "published_at": "2026-03-01T09:00:00Z",
      "content_summary": "Proposal MC-2026-014 announced with full text and vote schedule."
    }
  ]
}
```

| Field                       | Type     | Required | Notes                                              |
| --------------------------- | -------- | -------- | -------------------------------------------------- |
| `schema`                    | string   | yes      | `constitutioncourt/notice-record@1`                 |
| `proposal_id`               | string   | yes      | Must match the proposal                             |
| `notices`                   | array    | yes      | **May be empty.** Empty is evidence, not an error   |
| `notices[].channel`         | string   | yes      | `forum` \| `blog` \| `mailing-list` \| `chat`       |
| `notices[].url`             | string   | yes      | HTTPS. Referenced but **not** fetched by validators |
| `notices[].published_at`    | ISO-8601 | yes      | UTC                                                 |
| `notices[].content_summary` | string   | yes      | What the notice said                                |

Notice-period arithmetic is `voting_opened_at − min(notices[].published_at)`.

Validators do **not** fetch `notices[].url`. Only the five pinned URLs are
fetched. Following links out of a document would let a challenger steer
validators to arbitrary hosts, and it makes the fetch set unbounded and
un-reproducible.

## `response@1`

Optional, submitted once by the respondent.

```json
{
  "schema": "constitutioncourt/response@1",
  "proposal_id": "MC-2026-014",
  "respondent": "0x91Be...4F08",
  "submitted_at": "2026-03-20T11:30:00Z",
  "statement": "The 72-hour notice requirement was satisfied by the 2026-03-01 forum post.",
  "supporting_points": [
    { "rule_id": "ART-5.4", "argument": "Notice published 96 hours before voting opened." }
  ]
}
```

| Field                          | Type     | Required | Notes                              |
| ------------------------------ | -------- | -------- | ---------------------------------- |
| `schema`                       | string   | yes      | `constitutioncourt/response@1`      |
| `proposal_id`                  | string   | yes      | Must match the proposal             |
| `respondent`                   | string   | yes      | Opaque identifier                   |
| `submitted_at`                 | ISO-8601 | yes      | UTC                                 |
| `statement`                    | string   | yes      | Natural-language response           |
| `supporting_points`            | array    | no       | May be empty                        |
| `supporting_points[].rule_id`  | string   | yes      | Should resolve in the constitution  |
| `supporting_points[].argument` | string   | yes      |                                     |

The response is argument, not evidence. It may direct a validator's attention to
a rule or a date, but it cannot introduce facts. Anything asserted in a response
and not visible in the other four documents carries no weight — otherwise the
respondent could win any case by asserting a favourable fact.

## `INSUFFICIENT_EVIDENCE` is not a fetch failure

These are two different conditions and conflating them breaks consensus:

| Condition                | Example                                     | Result                                             |
| ------------------------ | ------------------------------------------- | -------------------------------------------------- |
| **Insufficient evidence**| Document fetches, parses, but the tally is absent | Ruling `INSUFFICIENT_EVIDENCE` → `UNRESOLVED`. A real, final outcome |
| **Fetch failure**        | 503, timeout, DNS failure                   | `[TRANSIENT]` error. Validator disagrees; consensus retries |
| **Invalid evidence**     | 404, 403, unparseable JSON, wrong `schema`  | `[INVALID_EVIDENCE]` error. Validator disagrees; no ruling recorded |

`INSUFFICIENT_EVIDENCE` means *the documents were read and they do not settle
the question*. It is reproducible: every validator fetching the same well-formed
document sees the same missing tally and reaches the same conclusion. A 503 is
not reproducible — one validator may see it and another may not — so it can
never be allowed to become a recorded outcome. Case 004 exercises the first row
only; the other two rows are error paths, tested in `test_evidence_policy.py`.

## Fixture cases

Four cases live under `evidence/`, one directory each. They are the canonical
inputs for direct-mode tests and the Stage 5 demo.

| Directory                              | Expected outcome        | Final status | Cited rules  |
| -------------------------------------- | ----------------------- | ------------ | ------------ |
| `case-001-compliant-simple-majority`   | `COMPLIANT`             | `CERTIFIED`  | —            |
| `case-002-non-compliant-two-thirds`    | `NON_COMPLIANT`         | `REJECTED`   | `ART-4.3`    |
| `case-003-non-compliant-notice-period` | `NON_COMPLIANT`         | `REJECTED`   | `ART-5.4`    |
| `case-004-insufficient-evidence`       | `INSUFFICIENT_EVIDENCE` | `UNRESOLVED` | —            |

All four share one constitution body, so that a difference in outcome is always
attributable to the proposal, vote or notice record — never to a rule that
quietly changed between cases.

Validate the fixtures against this schema with:

```
python evidence/validate.py
```
