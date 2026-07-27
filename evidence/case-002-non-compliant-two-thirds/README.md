# Case 002 — Non-compliant, two-thirds threshold not met

**Expected ruling:** `NON_COMPLIANT` → final status `REJECTED`
**Expected `violated_rule_ids`:** `["ART-4.3"]`
**Lifecycle path exercised:** `OPEN → RULED` (no response submitted)

## The dispute

MC-2026-021 disbursed 250,000 USDC. The organization declared it `PASSED`
because 65.4% of votes cast were in favour — a comfortable simple majority. But
a disbursement above 100,000 USDC falls under `ART-4.3`, which requires
two-thirds. It fell short by 1.28 percentage points.

The respondent never answered. The case is ruled from `OPEN`.

## Why it resolves as non-compliant

| Article   | Requirement                            | Record                                              | Result   |
| --------- | -------------------------------------- | --------------------------------------------------- | -------- |
| `ART-2.2` | Treasury rules apply                   | `type: treasury_disbursement`, 250,000 USDC out      | in scope |
| `ART-3.1` | ≥ 20% of eligible power participates   | 550,000 / 1,000,000 = **55%**                        | pass     |
| `ART-4.2` | Standard tier                          | Not applicable — 250,000 > 100,000                   | n/a      |
| `ART-4.3` | > 100,000 USDC ⇒ ≥ 66.67% of votes cast | 340,000 / (340,000 + 180,000) = **65.38%**          | **fail** |
| `ART-5.4` | ≥ 72 hours notice before voting opens  | 2026-04-10T10:00Z → 2026-04-14T10:00Z = **96 hours** | pass     |
| `ART-6.1` | ≤ 500,000 USDC per disbursement        | 250,000 USDC                                         | pass     |

## What this case is testing

**Tier selection is the whole case.** The vote passes `ART-4.2` and fails
`ART-4.3`; nothing else in the record is in dispute. A validator that picks the
wrong Article returns the opposite outcome. This is the interpretive judgment
that justifies running the adjudication on GenLayer instead of in a deterministic
function — the rule text says "more than 100,000 USDC" and the validator has to
decide that 250,000 USDC crosses it and that the requested amount, not the
per-grant amount described in the body, is the figure that matters.

**The margin is deliberately narrow.** 65.38% against a 66.67% bar is close
enough that a validator doing arithmetic sloppily — including the 30,000
abstentions in the denominator gives 61.8%, still failing, but by a different
margin — reaches the right outcome for the wrong reason. Both readings fail, so
the outcome is stable; only the reasoning differs, and reasoning is explicitly
not consensus-critical.

**`declared_result` must be ignored.** The record asserts `PASSED`. A validator
that adopts the organization's own claim rules `COMPLIANT` and gets the case
exactly backwards. This is the primary test that declared results are treated as
claims rather than facts.

## Documents

| File                 | Role                                                       |
| -------------------- | ---------------------------------------------------------- |
| `constitution.json`  | Shared across all four cases, byte-identical               |
| `proposal.json`      | 250,000 USDC — supermajority tier                          |
| `vote-record.json`   | 65.38% in favour, self-declared `PASSED`                   |
| `notice-record.json` | One notice, 96 hours before voting — not in dispute        |
| *(no `response.json`)* | Respondent stayed silent; ruling proceeds from `OPEN`    |
