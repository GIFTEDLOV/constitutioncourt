# Most governance disputes are not settled. They are outlasted.

*Building ConstitutionCourt on GenLayer — and what happened when a real dispute
got ruled on-chain.*

---

An organisation votes. Someone says the vote broke the organisation's own rules.
What follows is rarely a review. It is a forum thread, a call, a screenshot, and
eventually silence. The dispute does not resolve — attention moves on.

The failure is structural, not cultural.

There is no neutral reader. The parties who could adjudicate are the parties with
an interest in the answer, and asking them to rule is asking them to rule on
themselves. Evidence is a set of links that can be edited after the argument
starts. Nobody can point to a moment when the question was put to someone
impartial and answered.

So disputes are settled by stamina and standing. The participant with the most
patience, or the most followers, is the one whose reading survives.

## Why this is hard to fix

The obvious instinct is to write a function. Count the votes, compare to the
threshold, done.

It does not work, and it is worth being precise about why.

A constitution says things like *"two-thirds of votes cast"*. Do abstentions
belong in the denominator? Two defensible readings give different answers, and
only the rule's own words settle it. It says *"publicly announced, in full"* —
does a chat reminder count, and does it still count if it landed after voting
opened? It says *"moves assets out of the treasury"* — does this proposal?

These are readings, not calculations. There is no number to compare.

The second instinct is a human arbiter. That works, and it is one party's choice
of reader.

The third is to call a language model off-chain. That produces an answer nobody
can reproduce, from a model nobody agreed on, with no record of what it read.

## What GenLayer changes

GenLayer executes non-deterministic reasoning **under consensus**.

Several validators are drawn independently. Each fetches the evidence itself —
no validator trusts another's copy. Each derives a complete ruling. They must
agree before anything is recorded, and disagreement rotates the validator set and
re-runs the question rather than averaging opinions. A governance verdict has no
meaningful midpoint.

That is a judgement which is subjective in character but reproducible in
procedure, executed by parties with no stake in the answer, and written to a
record nobody involved controls.

It is the entire product. There is no version of ConstitutionCourt that works
without it.

## The design decision that matters most

Pin the evidence. Not to a branch — to a **40-character commit**.

This sounds like housekeeping. It is the load-bearing decision.

The contract stores a URL. It cannot store what that URL serves. Validators fetch
at ruling time, which may be far later than filing. A `main` reference means they
adjudicate whatever the branch says *then*. Worse, if the branch moves *while*
they fetch, two validators legitimately read different bytes and disagree — and
the disagreement is about the evidence, not the question.

A ruling is only as trustworthy as the record it was made against. If the
constitution can be amended after the filing, the verdict describes a document
that no longer exists.

## What actually happened

We filed a real dispute on GenLayer's Bradbury testnet.

**Meridian Collective, proposal MC-2026-021.** A treasury disbursement of 250,000
USDC. The tally: 340,000 for, 180,000 against, 30,000 abstaining. The
organisation published the vote record itself and **declared the proposal
PASSED**.

That declaration was the thing in dispute.

The constitution's Article 4.3 says a treasury disbursement above 100,000 USDC
needs at least two-thirds of votes cast, and that abstentions — which count
toward quorum elsewhere — are excluded from *this* denominator.

Five validators fetched the pinned documents independently. Here is what the
leader recorded, on-chain:

> The proposal requested 250,000 USDC, which exceeds the 100,000 USDC threshold
> specified in ART-4.3... Excluding abstentions, the denominator is 520,000. The
> 'for' fraction is 340,000/520,000 ≈ 0.6538, which is less than the required 2/3
> (≈0.6667). Therefore, the proposal did not meet the supermajority approval
> threshold and violates ART-4.3.

**NON_COMPLIANT. REJECTED. ART-4.3 cited.** Four of five validators agreed; one
returned a non-deterministic disagreement and was outvoted.

65.4% against a 66.7% bar. It failed narrowly, and it failed on an arithmetic
choice — which abstentions to exclude — that a naive threshold check would have
got wrong in either direction depending on how someone happened to write it.

The validators declined to adopt the organisation's claim about its own vote.
That is the whole point.

The result matched the expectation we had written down **before** filing. That
matters: it was a prediction, not a post-hoc description.

## The part I am not going to dress up

The ruling executed. The contract state reads `RULED`. The verdict is on-chain
and you can read it right now.

The ruling **transaction has not finalized.**

A duplicate ruling call went in 8 seconds before the effective one — a double
submission. It timed out at the consensus layer, applied no state, and has been
cycling through validator rounds ever since, expanding to thirteen validators
without converging. Bradbury finalizes transactions per contract in submission
order, so that stuck duplicate holds the queue slot ahead of the real ruling.

So the honest status is: **ruled, accepted, awaiting finalization.** Not final.
Until it finalizes it remains theoretically reversible by appeal.

I could have written "successfully ruled on-chain" and moved on. Nobody would
have checked. But the product's entire claim is that you should not have to trust
the interface — and that claim is worth nothing if the people building it round
the corners when the result is inconvenient.

Two other things I am not claiming. The respondent-response path —
`OPEN → RESPONDED → RULED` — has **not** been run live; Case 002's respondent
stayed silent, so it exercised `OPEN → RULED`. And only `REJECTED` has been
produced on-chain; `CERTIFIED` and `UNRESOLVED` exist as fixture expectations.

An expected fixture outcome is not a ruling.

## What it deliberately cannot do

A ruling moves no money, reverses no vote, and binds no one who does not choose
to be bound by it. The contract holds no balance and has no payable method.

`CERTIFIED` means validators found no constitutional violation in the pinned
evidence. It does not mean the proposal is legal, safe, wise or authorised.

Evidence is only as good as its host. The challenger picks four URLs; the
respondent picks the fifth. Neither is neutral, and a consistently false document
produces a faithful ruling about a false record.

These are not disclaimers bolted on at the end. They are why the rulings are
worth reading. A system that claimed more than it can do would have to be
trusted, and this one is built specifically not to require that.

## Verify it yourself

Contract: `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` on Bradbury.

Read `get_state` on the explorer. Fetch the four pinned evidence URLs. Check each
cited rule id against the constitution document. Compare the deployed contract
source against the repository — the frontend deploys that file byte for byte,
and its SHA-256 is `bf845bc4…`.

You do not have to trust the interface. That was the requirement.

---

*ConstitutionCourt is open source: https://github.com/GIFTEDLOV/constitutioncourt
— 866 automated tests, every evidence fixture published with its hash.*
