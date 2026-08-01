# deploy/bradbury/case-002/

Resumable pilot record for **case-002**. Written by `python -m pilot run case-002`.

`record.json` appears here on the first submission and is updated as the run
progresses. It is written **before** each transaction hash can be lost, not
after a step succeeds — a hash persisted a moment before the await survives a
crashed process, a closed laptop, or a 30-minute settlement nobody waited out.

## What it holds

| Key | Contents |
| --- | -------- |
| `inputs` | case key, title, lifecycle, expected outcome and rule ids |
| `accounts` | challenger and respondent **addresses** — never keys |
| `evidence` | every pinned URL with its SHA-256 and byte length |
| `steps.<name>` | method, transaction hash, consensus status, execution result, consensus result, phase, retry classification, validator votes, verification checks |
| `contract` | deployed address and deployed-source SHA-256 |
| `state_snapshots` | full `get_state` and `get_evidence_sources` at each stage |
| `events` | an append-only log of submissions, settlements and resumes |

## What it never holds

No private key, mnemonic, seed phrase, password or keystore content. `PilotRecord.save`
refuses to write anything credential-shaped and the offline suite asserts it —
including a bare 64-character hex value, which is what a raw key looks like.

## Resuming

If a step holds a hash with no settled outcome, the run **stops**. Nothing is
resent. Inspect the transaction, then:

```bash
CONSTITUTIONCOURT_LIVE=1 CONSTITUTIONCOURT_ALLOW_WRITES=1 CONSTITUTIONCOURT_RESUME=1 python -m pilot resume case-002
```

The runner picks up the persisted hash and continues tracking it rather than
submitting again.
