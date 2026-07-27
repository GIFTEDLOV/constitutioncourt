# ConstitutionCourt

**Governance-compliance adjudication for treasury proposals, on GenLayer.**

A challenger files a case alleging that a DAO's treasury proposal was carried in
violation of that DAO's own constitution. GenLayer validators independently
fetch the public evidence, independently derive a ruling, and the contract
records what consensus agreed on — with the violated rules cited by id.

No escrow. No transfers. No tokens. The ruling is an opinion with citations.

> **Stage 1 of 5 — architecture locked, contract not yet implemented.**
> Nothing is deployed. No wallet signature has been requested and no GEN spent.

---

## How a case works

```
  Challenger deploys a case                            OPEN
  ├─ names a respondent
  └─ pins four public HTTPS evidence URLs
        constitution · proposal · vote-record · notice-record
                    │
                    │  respondent may submit one response URL
                    ▼
                                                    RESPONDED
                    │
                    │  anyone calls rule()
                    │  validators independently fetch and adjudicate
                    ▼
                                                       RULED
```

If the respondent never answers, `rule` proceeds directly from `OPEN` — silence
is a choice not to argue, not a way to bury the case.

## Rulings

Validators return a structured ruling:

```json
{
  "outcome": "NON_COMPLIANT",
  "violated_rule_ids": ["ART-4.3"],
  "evidence_citations": [
    { "source": "vote-record", "url": "…", "locator": "$.tally",
      "quote": "for: 340000, against: 180000, abstain: 30000", "supports": "ART-4.3" }
  ],
  "reasoning": "250,000 USDC exceeds the standard tier, so ART-4.3 applies and requires two-thirds. 340,000 of 520,000 votes cast were in favour — 65.38%, short of 66.67%."
}
```

Which maps to a final status:

| Outcome                 | Final status | Means                                             |
| ----------------------- | ------------ | ------------------------------------------------- |
| `COMPLIANT`             | `CERTIFIED`  | No violation found on this record                  |
| `NON_COMPLIANT`         | `REJECTED`   | At least one rule violated, cited by id            |
| `INSUFFICIENT_EVIDENCE` | `UNRESOLVED` | Evidence read; it does not settle the question     |

Consensus is reached on **`outcome` and the set of `violated_rule_ids`** only.
`reasoning` and `evidence_citations` are the leader validator's explanation —
recorded for audit, not agreed text.

## What a ruling is not

`CERTIFIED` is a finding about bytes served at five URLs at ruling time. It is
**not** a statement that a proposal is legal, valid, or safe to execute, and not
an endorsement by anyone. `UNRESOLVED` is neither exoneration nor condemnation.

If an evidence host serves false documents consistently to every validator, the
ruling will faithfully reflect those documents. The integrity guarantee is that
the opinion was reached independently from evidence anyone can re-fetch — not
that the evidence was true. See
[T-1](docs/THREAT-MODEL.md#t-1-evidence-mutation-after-pinning) and
[T-7](docs/THREAT-MODEL.md#t-7-misreading-certified-as-a-warrant).

## Why GenLayer

The constitution is natural language on purpose — machine-readable threshold
fields are banned by the schema and the ban is enforced in CI. Adjudication
requires judgment a threshold function cannot express: which tier a disbursement
falls in, whether abstentions belong in a denominator, whether a chat post
counts as public notice, and whether missing evidence means innocence, guilt, or
neither.

The fixture cases make this concrete. In
[case 002](evidence/case-002-non-compliant-two-thirds/), a vote passes
`ART-4.2` and fails `ART-4.3` — the entire case is which Article applies. In
[case 003](evidence/case-003-non-compliant-notice-period/), the vote is
impeccable and the process is not, and the respondent's argument is honest,
well-reasoned, and must lose.

## Scope

**Deliberately excluded** — each is refused on purpose, not omitted:

no escrow · no transfers · no tokens · no backend database · no custom appeal
contract · no monitoring service · one contract instance per case ·
treasury-governance disputes only

The contract holds no balance and has no `payable` method. There is no theft
target and no drain path. Appeals use GenLayer's **native transaction appeal**;
a bespoke re-ruling method would be a weaker consensus mechanism competing with
the real one.

## Repository

```
constitutioncourt/
├── README.md
├── requirements.txt              exact pins, no ranges
├── pytest.ini
├── .gitattributes               LF pinned from commit 1 — see below
├── contracts/                   constitution_court.py — Stage 2
├── docs/
│   ├── ARCHITECTURE.md          lifecycle, storage, validator schema — LOCKED
│   ├── THREAT-MODEL.md          8 threats, mitigations, accepted risks
│   └── BUILD-PLAN.md            5 stages, test matrix, pin log
├── evidence/
│   ├── schema.md                5 document types
│   ├── validate.py              fixture validator, runs in CI
│   ├── case-001-compliant-simple-majority/
│   ├── case-002-non-compliant-two-thirds/
│   ├── case-003-non-compliant-notice-period/
│   └── case-004-insufficient-evidence/
├── frontend/                    Stage 4
├── tests/direct/                Stage 3
└── .github/workflows/ci.yml
```

## Evidence fixtures

| Case                                                                            | Outcome                 | Status       | Cites     |
| ------------------------------------------------------------------------------- | ----------------------- | ------------ | --------- |
| [001 compliant simple-majority](evidence/case-001-compliant-simple-majority/)     | `COMPLIANT`             | `CERTIFIED`  | —         |
| [002 two-thirds threshold](evidence/case-002-non-compliant-two-thirds/)           | `NON_COMPLIANT`         | `REJECTED`   | `ART-4.3` |
| [003 notice period](evidence/case-003-non-compliant-notice-period/)              | `NON_COMPLIANT`         | `REJECTED`   | `ART-5.4` |
| [004 insufficient evidence](evidence/case-004-insufficient-evidence/)            | `INSUFFICIENT_EVIDENCE` | `UNRESOLVED` | —         |

All four share a byte-identical constitution, so a difference in outcome is
always attributable to the proposal, vote or notice record. Each fails on
exactly one axis. Fixtures are fictional; "Meridian Collective" is invented.

```
python evidence/validate.py
```

## Why `.gitattributes` exists at commit 1

GenLayer derives a contract's address from the transaction carrying its source
bytes. There is no compilation step to normalize line endings away, so a Windows
checkout with `core.autocrlf=true` and a Linux CI checkout produce **different
deployed contracts from the same commit**. App 1
([`uptimebond`](https://github.com/GIFTEDLOV/uptimebond)) hit exactly this and
only caught it because a reproducibility check hashed the file on both. Pinning
LF now makes the deployed bytes a property of the commit rather than of whoever
built it — cheap today, expensive to retrofit after addresses are published.

## Development

```
python -m pip install -r requirements.txt
python evidence/validate.py            # validate fixtures
pytest tests/direct                    # Stage 3
```

Pins are exact (`==`). Note that `genlayer-py` is held at `0.16.3` rather than
the current `0.18.0`: `genlayer-test==0.29.2` declares `genlayer-py<0.17.0`, so
the latest release is not installable alongside it. See the
[pin log](docs/BUILD-PLAN.md#dependency-pin-log).

## Status

| Stage | Scope                        | Status         |
| ----- | ---------------------------- | -------------- |
| 1     | Repository, pins, architecture | ✅ Complete   |
| 2     | Contract implementation       | Not started    |
| 3     | Direct-mode tests             | Not started    |
| 4     | Frontend                      | Not started    |
| 5     | Deployment                    | Requires explicit approval |

---

App 2 of the GenLayer build programme. App 1:
[`uptimebond`](https://github.com/GIFTEDLOV/uptimebond) — SLA adjudication with
escrow settlement.
