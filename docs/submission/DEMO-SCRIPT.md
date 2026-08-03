# ConstitutionCourt — demo script

A walkthrough that shows the product doing the thing it claims, in about **six
minutes**, without signing anything or spending GEN.

**Live application:** https://constitutioncourt-10k54frri-kolofahkelvin16-6437s-projects.vercel.app

> Everything below is read-only. No wallet is required — reading works without
> one, and that is deliberate: a reviewer must be able to audit a case without
> installing anything.

---

## Before you start

| | |
| --- | --- |
| Browser | Any. A wallet is optional and never needed for this script. |
| Case to open | `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` |
| Expect | The case reads `RULED` · `NON_COMPLIANT` · `REJECTED` · `ART-4.3` |

If the chain read is slow, the page says so rather than showing stale state.
Bradbury settles a write in roughly 30 minutes; reads are immediate.

---

## 0:00 — The problem (45s)

Open the **home page**.

> "A DAO votes. Someone says the vote broke the rules. What follows is a forum
> thread, a screenshot, and eventually silence. The dispute doesn't resolve —
> attention moves on."

Scroll to **"A governance dispute has no neutral reader"**.

Land the point that matters:

> "The organisation being challenged usually publishes the vote record itself,
> including its own declaration that the proposal *passed*. That declaration is
> the thing in dispute — it isn't evidence for it."

## 0:45 — Why the obvious fixes fail (45s)

Stay on the same section.

> "A threshold function can't decide whether abstentions belong in the
> denominator when the rule says 'votes cast'. Two defensible readings give
> different answers. And a single human arbiter can decide all of it — but they're
> one party's choice of reader."

## 1:30 — What the protocol does (60s)

Go to **How consensus works** (`/consensus`).

Walk the five stages. Do not read them out; point at the **limits**:

- 01 Submission — *"filing proves a claim was made, not that it's correct."*
- 02 Pinned evidence — *"pinned to a 40-character commit, never a branch."*
- 03 Independent fetch — *"no validator trusts another's copy, and none trusts
  this interface."*
- 04 Consensus — *"disagreement rotates the set and re-runs. A governance verdict
  has no meaningful midpoint."*
- 05 Immutable ruling — *"RULED is terminal."*

> "Every stage says what it does *and* what it doesn't guarantee. That second
> half is the product."

## 2:30 — The live ruling (2 min) — **the centrepiece**

Open **`/case/0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc`**.

This is read live from Bradbury, not a fixture.

Point out, in order:

1. **The status, at display scale** — `RULED`, then `REJECTED`.
2. **The violated rule** — `ART-4.3`, supermajority approval threshold, quoted
   from the constitution the challenger pinned.
3. **The reasoning**, and do the arithmetic out loud:

   > "250,000 USDC is over the 100,000 tier, so two-thirds applies. 340,000 for,
   > 180,000 against, 30,000 abstain. The rule says abstentions are excluded from
   > this denominator — so it's 340 over 520, which is 65.4%. Two-thirds is 66.7%.
   > It fails, narrowly."

4. **The organisation had declared this vote PASSED.** Validators declined to
   adopt that claim.
5. **The citations** — each anchored to a commit-pinned URL you can fetch now.
6. **The consensus scope callout** — *"consensus covered the outcome and the rule
   ids. The prose is the leader validator's audit record, not a consensus-verified
   artefact."*

### Say this plainly

> "The ruling executed with 4 of 5 validators agreeing. The contract state is
> `RULED`. The ruling **transaction** hasn't finalized yet — a duplicate
> submission is sitting ahead of it in the per-contract queue. So: ruled and
> accepted, awaiting finalization. I'm not going to call it final until it is."

That candour is the demo. Do not skip it.

## 4:30 — Evidence is checkable (45s)

Open one citation URL in a new tab — the raw pinned `proposal.json`.

> "This is the exact byte-for-byte document the validators fetched. Pinned to a
> commit, so it can't have changed underneath the case. You can verify the whole
> ruling without trusting anything I've shown you."

## 5:15 — Filing, briefly (30s)

Go to **`/create`**. Step through the first two steps only. **Do not sign.**

> "Six steps. Every URL is fetched and schema-checked before you can continue,
> because a typo at step two must not become unfixable at step seven. Everything
> pinned here is immutable once the case exists."

Show the **review step**, which reads as a filing record rather than a form.

## 5:45 — Limits (30s)

Go to **Help** or the **About** page's "what this is not".

> "No enforcement — a ruling moves no money and binds no one. Evidence is only as
> good as its host. The contract stores URLs, not hashes. And `CERTIFIED` doesn't
> mean a proposal is legal, safe or wise — only that validators found no
> constitutional violation in the pinned evidence."

Close on:

> "A system that claimed more than it can do would have to be trusted. This one
> is built not to require it."

---

## Questions you should expect

**"Why not just hash the evidence?"**
Considered and deferred. The challenger would pick the hash too, so it attests to
what the challenger pinned rather than what the organisation published. It adds
ceremony without adding neutrality.

**"What if validators disagree?"**
The set rotates and the question re-runs. On this ruling, one of five returned
`nondet_disagree` and was outvoted 4–1. Persistent disagreement escalates to a
larger set rather than splitting the difference.

**"Could the frontend fake a ruling?"**
No — and more importantly, it doesn't compute one. Nothing the interface
calculates is ever adopted by the contract. Read `get_state` on the explorer and
you get the same answer.

**"Has the respondent-response path been demonstrated?"**
Not live. Case 002's respondent stayed silent, which exercises `OPEN → RULED`.
`OPEN → RESPONDED → RULED` needs Case 003, which **has not been run** — it is
covered by the offline suite only. Say so; don't imply otherwise.

**"Why is finalization taking so long?"**
A duplicate ruling call was submitted 8 seconds before the effective one. It
timed out and is still cycling through validator rounds. Bradbury finalizes per
contract in order, so it holds the slot ahead.

---

## Do not do during the demo

- Do not sign a transaction or connect a wallet — nothing in this script needs one.
- Do not present a **fixture** expectation as a ruling. Only Case 002 is live.
- Do not describe Case 002 as "final". It is ruled and accepted, not finalized.
