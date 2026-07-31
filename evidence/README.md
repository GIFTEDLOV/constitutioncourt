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

## Published URLs — PINNED, immutable

Direct-mode tests mock the fetch and never touch the network, so those read from
disk. The URLs below are the ones a real case pins, and the ones validators
fetch. Nothing in the contract depends on where they are hosted — the URL is a
constructor argument.

**Every URL is pinned to commit `1d1174e`, a full 40-character SHA. Never a
branch.** That is the whole point of this section:

- The contract stores a URL. It cannot store what the URL serves.
- Validators fetch at *ruling* time, which can be far later than filing. A
  `main` URL would let the adjudicated document change after the case was filed.
- Worse, a document that moves *while* validators are fetching can give
  different validators different bytes, and consensus splits on a difference
  nobody intended.

A `raw.githubusercontent.com` URL carrying a commit SHA is content-addressed:
the bytes cannot change without the URL changing. This application's own URL
validator warns whenever an evidence URL uses a branch or tag, so anything less
than a pinned commit here would mean shipping evidence links the product itself
tells users not to use.

### Verification

Each SHA-256 below is over the exact bytes the URL serves, confirmed by
fetching it. All eighteen documents returned **HTTP 200** with a matching hash
and no CRLF, from a clean environment on 2026-07-30.

Re-check them at any time — this needs only `curl` and `sha256sum`:

```bash
curl -sS <raw url> | sha256sum      # must equal the SHA-256 in the table
node frontend/e2e/fixtures.mjs      # re-fetches and re-checks all eighteen
```

The hashes are over LF bytes. `.gitattributes` pins `evidence/**/*.json` to LF,
so the served bytes are a property of the commit rather than of whoever last
checked the repository out — the same discipline the contract source is under.

#### `case-001-compliant-simple-majority`

| File | Commit | Raw URL | SHA-256 |
| ---- | ------ | ------- | ------- |
| `constitution.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-001-compliant-simple-majority/constitution.json) | `08ea34a2b415aa94608a6f009ec5353b4e3decdd8eb094416929e31fb3023b99` |
| `proposal.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-001-compliant-simple-majority/proposal.json) | `090c6f48969f34f165ab7e425f91a73a05dcb8cfc2ab9374d841ff705f685993` |
| `vote-record.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-001-compliant-simple-majority/vote-record.json) | `857566c12ef3dd99d0246c6e455894c3b8ca82aadc69d9e9b450eab183808f94` |
| `notice-record.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-001-compliant-simple-majority/notice-record.json) | `d373036c1840f2b42e257cfe610e041b6e19f97f55abedf41a5dd732c01089b3` |
| `response.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-001-compliant-simple-majority/response.json) | `dd87947495febc541394d0e5f1be2eb6a062335cfaec19a6a96665da15b21bdd` |

#### `case-002-non-compliant-two-thirds`

| File | Commit | Raw URL | SHA-256 |
| ---- | ------ | ------- | ------- |
| `constitution.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-002-non-compliant-two-thirds/constitution.json) | `08ea34a2b415aa94608a6f009ec5353b4e3decdd8eb094416929e31fb3023b99` |
| `proposal.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-002-non-compliant-two-thirds/proposal.json) | `638b7882dd48000681e14ade81e500185a1efacf752195cecedd002eaf5c2be9` |
| `vote-record.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-002-non-compliant-two-thirds/vote-record.json) | `52e330445a9177278bcc4a26d61582007b67a2d5ec59510068f41c50cac533b1` |
| `notice-record.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-002-non-compliant-two-thirds/notice-record.json) | `f7b5d2d04316bccc3519d72e63858efa229af1b2a1b1aecee3f487d879c32e30` |

#### `case-003-non-compliant-notice-period`

| File | Commit | Raw URL | SHA-256 |
| ---- | ------ | ------- | ------- |
| `constitution.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/constitution.json) | `08ea34a2b415aa94608a6f009ec5353b4e3decdd8eb094416929e31fb3023b99` |
| `proposal.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/proposal.json) | `c272e34dda0dc9a053196e70d262254f69373ba73f5da5df0c19705b480210e9` |
| `vote-record.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/vote-record.json) | `6bad9c983ec282bb9ea568751d8eebc75127959d9ce44043078939fadf41c55f` |
| `notice-record.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/notice-record.json) | `6665af3892d7e9fd1df0b9954aa31afbc49a5a06ad82d7b8535fe0c69d269194` |
| `response.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-003-non-compliant-notice-period/response.json) | `cc0a4f088658a395e0e25d4cc2d53ba7703187a1221c463d36d3bcec7dd4048e` |

#### `case-004-insufficient-evidence`

| File | Commit | Raw URL | SHA-256 |
| ---- | ------ | ------- | ------- |
| `constitution.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-004-insufficient-evidence/constitution.json) | `08ea34a2b415aa94608a6f009ec5353b4e3decdd8eb094416929e31fb3023b99` |
| `proposal.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-004-insufficient-evidence/proposal.json) | `44a6bbed50b8b6923b952b663dced5fd7bb0864dcf0508405bbc8aff6508b1c6` |
| `vote-record.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-004-insufficient-evidence/vote-record.json) | `2792a4b7e10d8ee6c29fa60f8e18a5ba0fa32af658d2390c9de381dd6d58114b` |
| `notice-record.json` | `1d1174e` | [raw](https://raw.githubusercontent.com/GIFTEDLOV/constitutioncourt/1d1174e9f30e8674c28ab41272125ea11d691d84/evidence/case-004-insufficient-evidence/notice-record.json) | `38bfbbcb76c7e50f41eee481d65869c96d414d5e2b51a58397bbd2481fa6bb67` |

⚠️ These are **fictional fixtures**. "Meridian Collective", its proposals and
its addresses are invented for testing. They are not a record of any real
organization's governance.
