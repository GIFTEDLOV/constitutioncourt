# Most governance disputes are not settled. They are outlasted.

*We built ConstitutionCourt on GenLayer, filed a real dispute, and got a ruling
that contradicted the organisation's own claim about its own vote. Here is what
worked, and what did not.*

---

An organisation votes. Someone says the vote broke the organisation's own
constitution. What follows is rarely a review. It is a forum thread, a call, a
screenshot, and eventually silence. The dispute does not resolve — attention
moves on.

The failure is structural, not cultural.

**There is no neutral reader.** The parties who could adjudicate are the parties
with an interest in the answer. Asking them to rule is asking them to rule on
themselves.

**The evidence can move.** It is a set of links. Links get edited after the
argument starts.

**And the challenged party publishes the record.** The organisation's own vote
record usually contains its own declaration that the proposal *passed*. That
declaration is the thing in dispute, not evidence for it.

So disputes are settled by stamina and standing. The participant with the most
patience, or the most followers, is the one whose reading survives.

## What ConstitutionCourt is

One contract per dispute.

A challenger deploys it, names a respondent, and pins four public documents — the
constitution, the proposal, the vote record, the notice record — to an immutable
commit. The respondent may publish one permanent response. Then **any account**
can trigger adjudication, and GenLayer validators each re-fetch the evidence,
each derive a complete ruling, and must agree before anything is written.

What lands on-chain is the outcome, the violated rule ids, and the leader
validator's citations and reasoning.

The point is not that a verdict exists. It is that you can **re-derive** it.

## Why a normal smart contract cannot do this

The obvious instinct is to write a function. Count the votes, compare to the
threshold, done.

It does not work, and it is worth being precise about why.

A constitution says *"two-thirds of votes cast"*. Do abstentions belong in the
denominator? Two defensible readings give different answers, and only the rule's
own words settle it. It says *"publicly announced, in full"* — does a chat
reminder count, and does it still count if it landed after voting opened? It says
*"moves assets out of the treasury"* — does this particular proposal?

These are readings, not calculations.

Our evidence schema **deliberately forbids machine-readable threshold fields**.
There is no number to compare, by construction. If we had allowed one, the
interesting part of the problem would have been smuggled into the fixture instead
of adjudicated.

## Why centralized AI is insufficient

The second instinct is to call a model.

You get an answer nobody can reproduce, from a model version nobody agreed on,
with no record of what it actually read, chosen and paid for by one side of the
dispute.

That is not adjudication. It is one party's consultant with a confident tone.
Every property a governance verdict needs is missing: neutrality, because the
caller picks the model and the moment; reproducibility, because re-running gives
a different answer and nothing recorded the first one; evidentiary fixity,
because nothing stopped the documents changing in between; and independence,
because one reader is still one reader.

## What GenLayer changes

GenLayer executes non-deterministic reasoning **under consensus**.

Validators are drawn independently. Each fetches the evidence itself — no
validator trusts another's copy, and none trusts our interface. Each derives a
complete ruling. They must agree before anything is recorded, and disagreement
rotates the validator set and re-runs the question rather than averaging
opinions. A governance verdict has no meaningful midpoint.

Our frontend never decides. It computes no outcome the contract adopts. If it
could, the contract would just be recording an answer produced off-chain, and we
would not need GenLayer at all.

Consensus covers exactly two fields: the outcome, compared as a string, and the
**set** of violated rule ids, compared as a set so that ordering and duplicates
cannot fail consensus over formatting. The prose reasoning is the leader
validator's audit record — kept so a reader can check a finding against its
basis, not treated as consensus-verified. Two validators reaching the same
verdict for the same reason will word it differently.

## Immutable evidence

Pin the evidence to a **40-character commit**. Not a branch.

This sounds like housekeeping. It is the load-bearing decision.

The contract stores a URL. It cannot store what that URL serves. Validators fetch
at ruling time, which may be far later than filing. A `main` reference means they
adjudicate whatever the branch says *then*. Worse: if the branch moves *while*
they fetch, two validators legitimately read different bytes and disagree — and
the disagreement is about the evidence, not the question.

A ruling is only as trustworthy as the record it was made against. If the
constitution can be amended after the filing, the verdict describes a document
that no longer exists.

## The optional response, and why silence does not win

The respondent may publish one permanent response while the case is open. One —
not a thread.

They may also say nothing. And it does not matter, because **ruling is
permissionless**: any account can trigger adjudication from `OPEN` or
`RESPONDED`. A respondent who refuses to answer cannot deadlock the case, and a
challenger who loses interest cannot leave an allegation sitting on the record
forever.

That property is locked in the contract, not a policy we could relax.

## The outcomes

| Outcome | Final status | Meaning |
| --- | --- | --- |
| `COMPLIANT` | `CERTIFIED` | No constitutional violation found in the pinned evidence |
| `NON_COMPLIANT` | `REJECTED` | At least one applicable rule violated, cited by id |
| `INSUFFICIENT_EVIDENCE` | `UNRESOLVED` | Documents read, question not settled |

The vocabulary is closed. Validators cannot invent a fourth verdict. And a fetch
failure is never recorded as `INSUFFICIENT_EVIDENCE` — a 503 is a retryable
network condition, not an evidentiary finding, and mapping it to a verdict would
turn a blip into a permanent judgement about a case that has a real answer.

## What happened when we filed a real one

*This is what the run produced on 2026-08-02. Bradbury has since canceled the
ruling transaction and the case has reverted to `OPEN` — see "The part I am not
going to dress up" below. Read this section as history.*

**Meridian Collective, proposal MC-2026-021.** A treasury disbursement of 250,000
USDC. The tally: 340,000 for, 180,000 against, 30,000 abstaining. The
organisation published the vote record itself and **declared the proposal
PASSED**.

That declaration was the thing in dispute.

Article 4.3 requires at least two-thirds of votes cast for any treasury
disbursement above 100,000 USDC — and specifies that abstentions, which count
toward quorum under Article 3.1, are **excluded from this denominator**.

Five validators fetched the pinned documents independently. Here is what the
leader recorded at the time:

> The proposal requested 250,000 USDC, which exceeds the 100,000 USDC threshold
> specified in ART-4.3... Excluding abstentions, the denominator is 520,000
> (340,000 + 180,000). The 'for' fraction is 340,000/520,000 ≈ 0.6538, which is
> less than the required 2/3 (≈0.6667). Therefore, the proposal did not meet the
> supermajority approval threshold and violates ART-4.3.

**`NON_COMPLIANT` → `REJECTED`, citing `ART-4.3`.** Four of five validators
returned `finished_with_return`; one returned `nondet_disagree` and was outvoted.
`majority_agree`.

**65.4% against a 66.7% bar.** It failed narrowly, and it failed on precisely the
choice a naive threshold check would have got wrong in one direction or the other
depending on how whoever wrote it happened to feel about abstentions that morning.

The validators declined to adopt the organisation's claim about its own vote.
That is the whole product.

And the result matched the expectation we had written down **before** filing. It
was a prediction, not a description.

## The part I am not going to dress up

The ruling executed on 2026-08-02, and for about a day the contract state read
`RULED`. **It doesn't any more.**

A duplicate ruling call went in **8 seconds before** the effective one — a double
submission from the client. It timed out at the consensus layer, applied no
state, and cycled through validator rounds without converging. Bradbury finalizes
transactions per contract in submission order, so that stuck duplicate held the
queue slot ahead of the real ruling. On top of that, Bradbury's **write side has
been unavailable** — a confirmed general network condition, not something
specific to this contract.

Neither ruling transaction ever finalized. On 2026-08-04 I re-checked, read-only,
and found the network had **canceled both of them**. The effective ruling now
reports status `CANCELED`, zero rounds, no leader receipt and `NOT_VOTED` from
all five validators — the chain no longer attests to the 4/5 majority it
reported two days earlier. The contract state has reverted to **`OPEN`**.

So the honest status is: **deployed and finalized, currently `OPEN`, no live
ruling.** The run happened. The record of it did not survive the network.

I want to be exact about where the fault lies. The contract executed correctly
when it ran and returned `FINISHED_WITH_RETURN` with a 4/5 majority. The deploy
finalized normally in thirty minutes and its bytes still hash to the audited
source today. All 866 automated tests pass. Cancellation hit both ruling
transactions at the consensus layer, including one that had already executed.
**Nothing in the repository needs to change** for the case to be ruled again —
ruling is permissionless and the case is `OPEN`, so it needs no redeploy, only a
working network.

I could have left "successfully ruled on-chain" standing. Nobody would have
checked; the screenshots were already taken. But the entire claim of the product
is that you should not have to trust the interface — and that claim is worth
nothing if the people building it round the corners when the result is
inconvenient. So the claim is withdrawn, and this is what replaced it.

There is a smaller lesson underneath the embarrassing one. This project insisted
everywhere on the difference between `accepted` and `finalized`, and wrote every
status as "ruled, awaiting finalization" rather than "ruled". That discipline is
the only reason nothing published was untrue at the time it was written. Read
state derived from an unfinalized transaction is provisional. Treating it as
settled is the mistake, and it is an easy one to make when the result is the one
you wanted.

## What is proven, and what is not

**Standing on-chain right now:**

- The contract, deployed and `FINALIZED`, with its bytes verifiably identical to
  the audited source — re-read on 2026-08-04 and still matching.
- Four commit-pinned evidence URLs, intact and reachable.
- Deploy finalization end to end.

**It happened, but the chain no longer attests to it:**

- A real dispute adjudicated by independently drawn validators reading
  commit-pinned evidence, with no privileged reader.
- A verdict that matched an expectation recorded before the filing.
- Silence not blocking adjudication — the respondent never answered and the case
  ruled from `OPEN` anyway.

Those three are recorded in the pilot log with the transaction hashes, and both
of those transactions now read `CANCELED`. I am listing them separately from the
first group on purpose: you can verify the first group yourself today, and you
cannot verify the second.

**Not proven, and I am not claiming it:**

- **A live ruling.** The case reads `OPEN`. There is no verdict on-chain.
- **Ruling finalization.** Never reached; both attempts were canceled.
- **The respondent-response path.** `OPEN → RESPONDED → RULED` needs Case 003,
  which **is not deployed**. That path is covered by the offline suite only —
  tested, not live-proven.
- **`CERTIFIED` and `UNRESOLVED` on-chain.** Neither has been produced live, and
  `REJECTED` no longer stands either. All three exist as fixture expectations,
  and an expected fixture outcome is not a ruling.

Once Bradbury writes recover, the remaining workflow is: re-rule Case 002 on the
existing `OPEN` contract, run Case 003 end to end to demonstrate the response
path, and produce the other two outcomes live.

## What it deliberately cannot do

**ConstitutionCourt does not execute proposals.** A ruling moves no money,
reverses no vote, and binds no one who does not choose to be bound by it. The
contract holds no balance and has no payable method.

**`CERTIFIED` is not legal approval.** It means validators found no
constitutional violation in the pinned evidence. Nothing about legality, safety,
wisdom or authorisation. And `REJECTED` is a constitutional-compliance result
over the pinned evidence — not a legal finding.

Evidence is only as good as its host. The challenger picks four URLs and the
respondent picks the fifth. Neither is neutral, and a consistently false document
produces a faithful ruling about a false record.

This runs on **Bradbury Testnet only**. There is no mainnet deployment.

These are not disclaimers bolted on at the end. They are why the rulings are
worth reading. A system that claimed more than it can do would have to be
trusted, and this one is built specifically not to require that.

## Check it yourself

Contract `0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` on GenLayer Bradbury.

Read `get_state` on the explorer — it will say `OPEN`, and that is the point of
telling you to read it rather than asking you to take my word for the verdict I
wrote about above. Fetch the four pinned evidence URLs; they still resolve.
Compare the deployed source against the repository — the frontend deploys that
file byte for byte, and its SHA-256 is `bf845bc4…`. Look up both ruling
transaction hashes in the pilot log and see `CANCELED` for yourself.

You do not have to trust the interface. That was the requirement, and it is the
reason you can catch this article being out of date rather than having to wonder.

---

**Live:** https://constitutioncourt.vercel.app
**Source:** https://github.com/GIFTEDLOV/constitutioncourt — 866 automated tests,
every evidence fixture published with its hash.
