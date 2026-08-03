/**
 * About — the argument for the product, told as editorial prose.
 *
 * Three movements: what fails today, what pinning changes, and why this is
 * newly buildable. The section that matters most is the last one, which states
 * what ConstitutionCourt is *not*. A page that only argues for itself is a
 * brochure; the exclusions are what make the rest credible.
 */

import { Link } from 'react-router-dom';
import { Ext } from '../components/Primitives';
import { CHAIN_NAME, REPO } from '../config';
import { FIRST_ROUND_VALIDATORS } from '../lib/metrics';

export function About() {
  return (
    <div className="page ed-page">
      <header className="ed-head">
        <h1>About ConstitutionCourt</h1>
        <p className="ed-lead">
          Most governance disputes are not settled. They are outlasted.
        </p>
      </header>

      <section className="ed-section" aria-labelledby="why-disputes-fail">
        <h2 id="why-disputes-fail">Why governance disputes fail today</h2>
        <p>
          An organisation votes. Someone says the vote broke the rules. What follows is rarely a
          review — it is a forum thread, a call, a screenshot, and eventually silence. The dispute
          does not resolve; attention moves on.
        </p>
        <p>
          The failure is structural rather than cultural. There is no neutral reader. The parties
          who could adjudicate are the parties with an interest in the answer, and asking them to
          rule is asking them to rule on themselves. Evidence is a set of links that can be edited
          after the argument starts. Nobody can point to a moment where the question was put to
          someone impartial and answered.
        </p>
        <p>
          So disputes are settled by stamina and standing. The participant with the most patience,
          or the most followers, is the one whose reading survives.
        </p>
      </section>

      <section className="ed-section" aria-labelledby="why-evidence">
        <h2 id="why-evidence">Why immutable evidence matters</h2>
        <p>
          A ruling is only as trustworthy as the record it was made against. If the constitution
          can be amended after the filing, or the vote record corrected while the question is being
          considered, then the verdict describes a document that no longer exists.
        </p>
        <p>
          ConstitutionCourt pins every evidence URL to a 40-character commit. Not a branch — a
          branch is a moving target, and two validators reading a branch seconds apart can read
          different bytes and legitimately disagree. Pinning makes the evidence one fixed thing
          that any reader can fetch afterwards and check for themselves.
        </p>
        <p>
          This is the difference between a verdict you are asked to believe and a verdict you can
          re-derive. The reasoning cites rule ids. The citations carry the URLs they came from. A
          reviewer who distrusts this interface entirely can read the contract directly and reach
          the same place.
        </p>
      </section>

      <section className="ed-section" aria-labelledby="why-genlayer">
        <h2 id="why-genlayer">Why GenLayer makes this possible</h2>
        <p>
          Applying a constitution to a vote is not a calculation. It is a reading. It requires
          weighing an argument, noticing that a threshold applies to a tier, and deciding whether a
          notice period was met in substance. Ordinary smart contracts cannot do this, which is why
          on-chain governance has always stopped at counting.
        </p>
        <p>
          GenLayer executes non-deterministic reasoning under consensus. {FIRST_ROUND_VALIDATORS}{' '}
          validators independently fetch the same pinned evidence, reach their own reading, and
          must agree before anything is recorded. Disagreement rotates the set and re-runs the
          question rather than splitting the difference.
        </p>
        <p>
          That is the capability this product is built on: a judgement that is subjective in
          character but reproducible in procedure, executed by parties with no stake in the answer,
          and written to a record nobody involved controls. Running on {CHAIN_NAME}.
        </p>
      </section>

      <section className="ed-section" aria-labelledby="what-this-is-not">
        <h2 id="what-this-is-not">What this is not</h2>
        <p>
          ConstitutionCourt is a governance-compliance adjudicator. It is not a legal court. It has
          no enforcement: a ruling moves no funds, reverses no vote, and binds no one who does not
          choose to be bound by it. It holds no assets.
        </p>
        <p>
          A CERTIFIED result means validators found no constitutional violation in the pinned
          evidence. It does not mean the proposal is legal, safe, wise or authorised. An open case
          is an allegation, not a finding.
        </p>
        <p>
          These limits are not disclaimers bolted on at the end. They are why the rulings are worth
          reading: a system that claimed more than it can do would have to be trusted, and this one
          is designed not to require trust.
        </p>
      </section>

      <section className="ed-section" aria-labelledby="read-further">
        <h2 id="read-further">Read further</h2>
        <p>
          <Link to="/consensus">How consensus works</Link> walks the five stages between a filing
          and a ruling. <Link to="/demo">Worked examples</Link> show four cases with their expected
          outcomes stated before the fact. <Ext href={REPO}>The source</Ext> is public, and so is
          every evidence fixture it ships with.
        </p>
      </section>
    </div>
  );
}
