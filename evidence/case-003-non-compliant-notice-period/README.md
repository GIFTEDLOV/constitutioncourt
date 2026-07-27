# Case 003 — Non-compliant, notice period too short

**Expected ruling:** `NON_COMPLIANT` → final status `REJECTED`
**Expected `violated_rule_ids`:** `["ART-5.4"]`
**Lifecycle path exercised:** `OPEN → RESPONDED → RULED`

## The dispute

MC-2026-027 was an emergency 30,000 USDC top-up. The vote itself was clean: the
amount is standard tier, the margin is comfortable, quorum was met. The defect
is procedural — voting opened **42 hours** after the proposal was announced,
against a 72-hour minimum.

The respondent answers on the merits: it was an emergency, notice went out
immediately, nobody was surprised, and the vote was decisive. The answer is
sympathetic and it loses. `ART-5.4` has no emergency exception.

## Why it resolves as non-compliant

| Article   | Requirement                            | Record                                                | Result   |
| --------- | -------------------------------------- | ----------------------------------------------------- | -------- |
| `ART-2.2` | Treasury rules apply                   | `type: treasury_disbursement`, 30,000 USDC out         | in scope |
| `ART-3.1` | ≥ 20% of eligible power participates   | 480,000 / 1,000,000 = **48%**                          | pass     |
| `ART-4.2` | ≤ 100,000 USDC ⇒ > 50% of votes cast   | 300,000 / (300,000 + 150,000) = **66.7%**              | pass     |
| `ART-4.3` | Supermajority tier                     | Not applicable — 30,000 ≤ 100,000                      | n/a      |
| `ART-5.4` | ≥ 72 hours notice before voting opens  | 2026-05-02T14:00Z → 2026-05-04T08:00Z = **42 hours**   | **fail** |
| `ART-6.1` | ≤ 500,000 USDC per disbursement        | 30,000 USDC                                            | pass     |

## What this case is testing

**A procedural violation with a substantively fine vote.** Case 002 fails on
arithmetic; this one fails on process while the arithmetic is impeccable. A
validator that reasons from "did this proposal have support?" rather than "did
it follow the rules?" returns `COMPLIANT`. Compliance is not popularity.

**The second notice is a trap.** `notices[]` contains a 2026-05-04T09:15Z chat
post — published *after* voting opened at 08:00Z. `ART-5.4` measures from the
**earliest** announcement and states explicitly that an announcement made after
voting opened does not satisfy the Article. A validator that takes the latest
notice, or that averages, or that counts two notices as sufficient regardless of
timing, gets this wrong.

**Equitable arguments must not move the outcome.** The response is the strongest
document in the fixture set: it is honest, well-reasoned, and appeals to the
purpose of the rule rather than its text. It is also irrelevant — the response
introduces no fact absent from the other documents, and `ART-5.4` admits no
emergency carve-out. This case is the primary test that a persuasive respondent
cannot talk a validator out of the record.

**Date arithmetic across a day boundary.** 2026-05-02T14:00Z to
2026-05-04T08:00Z spans two calendar days but only 42 hours. A validator that
counts calendar days reads "two days" and may accept it.

## Documents

| File                 | Role                                                          |
| -------------------- | ------------------------------------------------------------- |
| `constitution.json`  | Shared across all four cases, byte-identical                  |
| `proposal.json`      | 30,000 USDC — standard tier, states the expedited schedule    |
| `vote-record.json`   | 48% participation, 66.7% in favour — not in dispute           |
| `notice-record.json` | Earliest notice 42 hours out; a second notice lands too late  |
| `response.json`      | Respondent's emergency argument; correctly given no weight    |
