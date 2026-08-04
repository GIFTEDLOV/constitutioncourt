# ConstitutionCourt — demo script

**Target duration: 2:45.** Read-only throughout — **no wallet interaction, no
signature, no transaction.** Everything shown is live at
https://constitutioncourt.vercel.app.

| | |
| --- | --- |
| Recording resolution | 1600 × 1000 (desktop), scaled to 1080p |
| Case to open | `https://constitutioncourt.vercel.app/case/0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc` |
| Explorer | `https://explorer-bradbury.genlayer.com` |
| Prep | Load both tabs before recording so nothing shows a loading state. Scroll each page once to settle the reveal animations, then return to top. |

---

### 0:00 – 0:20 · Homepage and the problem

**Screen** — Home page at the top. Let the marquee run for two seconds, then
scroll slowly to "A governance dispute has no neutral reader".

**Voice-over**
> A DAO votes. Someone says the vote broke the DAO's own constitution. What
> follows is a forum thread, a screenshot, and then silence. There's no neutral
> reader — and the organisation being challenged is usually the one publishing
> the vote record.

**Caption** — `Governance disputes aren't settled. They're outlasted.`

---

### 0:20 – 0:40 · Why this can't be a function

**Screen** — Stay on "Why the obvious fixes do not work".

**Voice-over**
> You can't fix this with a threshold function. When the rule says "two-thirds of
> votes cast", whether abstentions belong in the denominator is a reading, not a
> calculation. And a single human arbiter is always one party's choice of reader.

**Caption** — `A reading, not a calculation.`

---

### 0:40 – 1:05 · Filing a case, and the four evidence sources

**Screen** — Navigate to `/create`. Show step 1, then step 2. **Do not sign
anything.** Highlight the four URL fields.

**Voice-over**
> Filing pins four documents: the constitution, the proposal, the vote record and
> the notice record. Each one is fetched and schema-checked before you can
> continue — and each is pinned to a forty-character commit, never a branch. The
> contract stores a URL; it can't store what that URL serves. Pinning is what
> stops the evidence moving after the argument starts.

**Caption** — `4 immutable evidence sources · commit-pinned`

---

### 1:05 – 1:20 · The respondent cannot block a ruling

**Screen** — Scroll to the lifecycle on the case page or `/consensus` showing
both paths: `OPEN → RESPONDED → RULED` and `OPEN → RULED`.

**Voice-over**
> The respondent may publish one permanent response. They may also say nothing —
> and it doesn't matter. Ruling is permissionless: any account can trigger
> adjudication from either state. Silence cannot stall a case.

**Caption** — `OPEN → RULED · silence cannot block adjudication`

---

### 1:20 – 1:40 · Consensus

**Screen** — `/consensus`. Scroll through stages 01 to 05 without stopping long.

**Voice-over**
> Five validators are drawn independently. Each fetches the evidence itself — no
> validator trusts another's copy, and none trusts this interface. They must
> agree before anything is recorded, and disagreement rotates the set and re-runs
> the question rather than averaging opinions. A governance verdict has no
> meaningful midpoint.

**Caption** — `5 independent validators · consensus, not averaging`

---

### 1:40 – 2:15 · The live case — Case 002

**Screen** — Open the live case URL. The page reads `OPEN`. Hold on the case
title and the evidence sources, then scroll through the four commit-pinned URLs.

> **The page no longer shows a ruling.** Bradbury canceled both ruling
> transactions and the case reverted to `OPEN`. Do not read this beat from the
> old script, and do not cut in the 2026-08-02 screenshots as if they were live.

**Voice-over**
> This is a real case, read live from Bradbury. Meridian Collective, proposal
> MC-2026-021 — a 250,000 USDC disbursement. Three-forty thousand for, one-eighty
> against, thirty thousand abstaining. The organisation declared it passed.
>
> Article 4.3 requires two-thirds above the hundred-thousand tier, with
> abstentions excluded from that denominator. Three-forty over five-twenty is
> sixty-five point four percent. Two-thirds is sixty-six point seven. It fails —
> narrowly. That is the reading the validators have to make, and it is why this
> cannot be a threshold function.
>
> This case was ruled that way on August second — `NON_COMPLIANT`, `REJECTED`,
> citing `ART-4.3`, four of five validators agreeing. The network then canceled
> the ruling transaction, so the case reads `OPEN` again. What you can still
> check right now is the evidence: four URLs pinned to a commit, the deployed
> contract byte-identical to the source, and nothing here that asks you to take
> my word for a verdict.

**Caption** — `Ruled 2026-08-02 · canceled by the network · currently OPEN`

---

### 2:15 – 2:30 · The explorer, and an honest limitation

**Screen** — Switch to the Bradbury explorer tab showing the two ruling
transactions, both `CANCELED`.

**Voice-over**
> Here are the ruling transactions on the explorer. The deploy finalized in
> thirty minutes and is still good. The ruling executed on August second and the
> contract read `RULED` for about a day — but it never finalized, and Bradbury
> then canceled both ruling transactions. The case is back to `OPEN`.
>
> That's a network condition, not a contract defect, and ruling is
> permissionless — so the case can be adjudicated again without redeploying. But
> right now there is no verdict on-chain, and I'm not going to show you one.

**Caption** — `Ruling canceled by the network · case is OPEN · no live verdict`

---

### 2:30 – 2:45 · Close

**Screen** — Return to the home page, resting on the hero.

**Voice-over**
> ConstitutionCourt doesn't execute proposals and it isn't a legal court.
> `CERTIFIED` is not legal approval. It gives a dispute one neutral reading
> against a record that cannot move — and you can re-derive every verdict
> yourself, without trusting this interface.
>
> Live at constitutioncourt.vercel.app. Source and every evidence fixture are
> public. Case 002 is on Bradbury at `0x4C8BC901…`.

**Caption**
```
constitutioncourt.vercel.app
github.com/GIFTEDLOV/constitutioncourt
0x4C8BC901732c4b158AF3Bb9f92041e6fC78648Bc
```

---

## Rules for the recording

- **No wallet.** Do not connect one, do not open one, do not sign. The header
  correctly reads "No wallet detected — reading works without one"; leave it.
- **No transaction is submitted** at any point.
- Do not present a **fixture** expectation as a ruling. Only Case 002 is live.
- **Do not claim a live ruling.** Case 002 reads `OPEN`. The 2026-08-02 ruling
  was canceled by the network; describe it in the past tense or not at all.
- Do not say Case 002 is "final", "complete", "ruled", or "finalized".
- Do not claim the respondent-response path has been demonstrated live — it has
  not; Case 003 is not deployed.
- Keep the finalization limitation in. It is 15 seconds and it is the reason the
  rest of the video is credible.

## If asked afterwards

**"Why isn't there a ruling?"**
There was one, on 2026-08-02. A duplicate ruling call was submitted 8 seconds
before the effective one; it timed out at the consensus layer, applied no state,
and held the per-contract queue slot ahead of the real ruling. Neither finalized,
and Bradbury subsequently canceled both — status `CANCELED`, terminal. The
contract reverted to `OPEN`. Separately, Bradbury's write side has been
unavailable. Ruling is permissionless and the case is `OPEN`, so it can be
adjudicated again on the same contract once the network recovers.

**"Has the response path been demonstrated?"**
Not live. Case 002's respondent stayed silent, exercising `OPEN → RULED`. Case
003 covers `OPEN → RESPONDED → RULED` and **is not deployed**; that path is
covered by the offline suite only.

**"Could the frontend fake a ruling?"**
It computes no outcome the contract adopts. Read `get_state` on the explorer and
you get the same answer.
