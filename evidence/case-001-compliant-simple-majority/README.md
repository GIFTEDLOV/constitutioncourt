# Case 001 — Compliant, simple-majority proposal

**Expected ruling:** `COMPLIANT` → final status `CERTIFIED`
**Expected `violated_rule_ids`:** `[]`
**Lifecycle path exercised:** `OPEN → RESPONDED → RULED`

## The dispute

The challenger alleges MC-2026-014 was carried improperly. The respondent
answers that every applicable Article was satisfied. The respondent is correct.

## Why it resolves as compliant

| Article   | Requirement                             | Record                                                | Result |
| --------- | --------------------------------------- | ----------------------------------------------------- | ------ |
| `ART-2.2` | Treasury rules apply                    | `type: treasury_disbursement`, 45,000 USDC out         | in scope |
| `ART-3.1` | ≥ 20% of eligible power participates    | 520,000 / 1,000,000 = **52%**                          | pass   |
| `ART-4.2` | ≤ 100,000 USDC ⇒ > 50% of votes cast    | 312,000 for / (312,000 + 188,000) = **62.4%**          | pass   |
| `ART-4.3` | Two-thirds tier                         | Not applicable — 45,000 ≤ 100,000                      | n/a    |
| `ART-5.4` | ≥ 72 hours notice before voting opens   | 2026-03-01T09:00Z → 2026-03-05T09:00Z = **96 hours**   | pass   |
| `ART-6.1` | ≤ 500,000 USDC per disbursement         | 45,000 USDC                                            | pass   |

## What this case is testing

The abstention rule. `ART-4.2` says abstentions count toward quorum but are
excluded from the approval denominator. A validator that includes the 20,000
abstentions gets 312,000 / 520,000 = 60.0%; excluding them gives 62.4%. Both
clear 50%, so **this case does not turn on the distinction** — that is
deliberate. Case 001 must be unambiguously compliant so that a `NON_COMPLIANT`
ruling here is always a real defect, never a close call.

It also exercises the tier boundary from the compliant side: a validator that
misreads 45,000 as a supermajority-tier proposal would apply `ART-4.3`, find
62.4% < 66.67%, and wrongly return `NON_COMPLIANT`.

## Documents

| File                 | Role                                             |
| -------------------- | ------------------------------------------------ |
| `constitution.json`  | Shared across all four cases, byte-identical     |
| `proposal.json`      | 45,000 USDC — standard tier                      |
| `vote-record.json`   | 52% participation, 62.4% in favour of votes cast |
| `notice-record.json` | Two notices, earliest 96 hours before voting      |
| `response.json`      | Respondent's answer; case is `RESPONDED` before ruling |
