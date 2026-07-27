# Evidence

Public, immutable JSON documents that GenLayer validators fetch and adjudicate
over. The contract stores URLs; it never stores or vouches for content.

- **[`schema.md`](schema.md)** — the five document types, field by field, and
  the rules that make them safe to reach consensus over.
- **[`validate.py`](validate.py)** — structural validator, run in CI.

## The four cases

| Directory                                                              | Outcome                 | Final status | Cited rules | Lifecycle path            |
| ---------------------------------------------------------------------- | ----------------------- | ------------ | ----------- | ------------------------- |
| [`case-001-compliant-simple-majority`](case-001-compliant-simple-majority/)     | `COMPLIANT`             | `CERTIFIED`  | —           | `OPEN → RESPONDED → RULED` |
| [`case-002-non-compliant-two-thirds`](case-002-non-compliant-two-thirds/)       | `NON_COMPLIANT`         | `REJECTED`   | `ART-4.3`   | `OPEN → RULED`             |
| [`case-003-non-compliant-notice-period`](case-003-non-compliant-notice-period/) | `NON_COMPLIANT`         | `REJECTED`   | `ART-5.4`   | `OPEN → RESPONDED → RULED` |
| [`case-004-insufficient-evidence`](case-004-insufficient-evidence/)             | `INSUFFICIENT_EVIDENCE` | `UNRESOLVED` | —           | `OPEN → RULED`             |

Each directory has a README explaining, article by article, why it resolves the
way it does and what a validator could get wrong.

## How the set is constructed

**One constitution, four disputes.** All four cases carry a byte-identical
`constitution.json` (sha256 `08ea34a2…`, enforced by `validate.py`). A
difference in outcome is therefore always attributable to the proposal, the vote
record or the notice record — never to a rule that quietly changed underneath
the comparison.

**Each case fails on exactly one axis.** 002 fails arithmetic with clean
process; 003 fails process with clean arithmetic; 004 is clean everywhere the
record is complete and silent where it matters. Multi-violation cases would make
a wrong ruling hard to attribute.

**Both lifecycle paths are covered.** Two cases have a `response.json` and two
do not, so the fixture set exercises `OPEN → RESPONDED → RULED` and the
no-response `OPEN → RULED` path without needing synthetic inputs.

**Two outcomes are wrong for opposite reasons.** In 002 a validator that trusts
`declared_result: "PASSED"` rules `COMPLIANT`. In 004 a validator that treats
missing evidence as suspicious rules `NON_COMPLIANT`. Both failure modes are
represented so neither can pass unnoticed.

## Running the validator

```
python evidence/validate.py            # summary table
python evidence/validate.py --quiet    # exit code only, for CI
```

No third-party dependencies — the fixtures stay checkable even when the
GenLayer toolchain is mid-upgrade.

## Where these get served

Direct-mode tests mock the fetch and never touch the network, so for Stage 2
these files are read from disk. Stage 5 publishes them at stable HTTPS URLs so
validators can fetch them for real; the URLs get recorded here when that
happens. Nothing in the contract depends on where they are hosted — the URL is a
constructor argument.

⚠️ These are **fictional fixtures**. "Meridian Collective", its proposals and
its addresses are invented for testing. They are not a record of any real
organization's governance.
