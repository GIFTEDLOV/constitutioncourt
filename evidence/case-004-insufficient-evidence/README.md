# Case 004 — Insufficient evidence

**Expected ruling:** `INSUFFICIENT_EVIDENCE` → final status `UNRESOLVED`
**Expected `violated_rule_ids`:** `[]`
**Lifecycle path exercised:** `OPEN → RULED` (no response submitted)

## The dispute

MC-2026-033 disbursed 120,000 USDC — just over the `ART-4.3` supermajority
threshold. The challenger alleges the two-thirds bar was not met. The vote
record confirms that voting opened and closed, but the tally itself is absent:
no `tally`, no `eligible_voting_power`, no `participating_voting_power`, no
`declared_result`.

There is no way to rule on the allegation. There is also no way to rule against
it. The correct answer is that the record does not settle the question.

## Why it resolves as insufficient

| Article   | Requirement                            | Record                                                | Result       |
| --------- | -------------------------------------- | ----------------------------------------------------- | ------------ |
| `ART-2.2` | Treasury rules apply                   | `type: treasury_disbursement`, 120,000 USDC out        | in scope     |
| `ART-3.1` | ≥ 20% of eligible power participates   | Eligible and participating power both **absent**       | **underivable** |
| `ART-4.2` | Standard tier                          | Not applicable — 120,000 > 100,000                     | n/a          |
| `ART-4.3` | > 100,000 USDC ⇒ ≥ 66.67% of votes cast | Tally **absent**                                      | **underivable** |
| `ART-5.4` | ≥ 72 hours notice before voting opens  | 2026-06-01T09:00Z → 2026-06-05T09:00Z = **96 hours**   | pass         |
| `ART-6.1` | ≤ 500,000 USDC per disbursement        | 120,000 USDC                                           | pass         |

## What this case is testing

**Insufficiency is a ruling, not a failure.** Every document in this case
fetches cleanly, parses as valid JSON, and carries the right `schema` literal.
Nothing is broken. The evidence is simply incomplete on the point in dispute.
That is a real, final, reproducible outcome — every validator reading the same
well-formed document sees the same absent tally and reaches the same conclusion
— and it maps to `UNRESOLVED`.

Contrast the two conditions that must **not** produce this outcome:

| Condition        | Example                       | Correct handling                             |
| ---------------- | ----------------------------- | -------------------------------------------- |
| Insufficient     | *this case* — tally absent    | Ruling `INSUFFICIENT_EVIDENCE` → `UNRESOLVED` |
| Transient        | 503, timeout, DNS failure     | `[TRANSIENT]` — validator disagrees, retry    |
| Invalid evidence | 404, unparseable, wrong schema | `[INVALID_EVIDENCE]` — validator disagrees   |

A validator that returns `INSUFFICIENT_EVIDENCE` on a 503 converts a retryable
network blip into a permanent `UNRESOLVED` verdict. A validator that raises
`[TRANSIENT]` on this fixture deadlocks a case that has a correct answer. The
split between them is exactly what `test_evidence_policy.py` covers.

**Partial evidence must not be completed by inference.** The notice record here
is complete and compliant, and the proposal is well within the `ART-6.1` cap. A
validator tempted to weigh "most of the record looks fine" into a `COMPLIANT`
ruling has invented the missing tally. Equally, a validator that reasons "the
tally was withheld, which is suspicious" into `NON_COMPLIANT` has invented a
violation. Absence of evidence is neither.

**No respondent to fill the gap.** The respondent stayed silent, so there is no
`response.json`. Even if there were, a response is argument rather than evidence
— a respondent asserting "the vote was 70% in favour" could not cure this,
because the assertion appears in no vote record. This is why the response
document is explicitly non-probative in the schema.

## Documents

| File                   | Role                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `constitution.json`    | Shared across all four cases, byte-identical                |
| `proposal.json`        | 120,000 USDC — supermajority tier, just over the boundary   |
| `vote-record.json`     | Window present, **tally and voting power absent**           |
| `notice-record.json`   | Complete and compliant — 96 hours, not in dispute           |
| *(no `response.json`)* | Respondent stayed silent; ruling proceeds from `OPEN`       |
