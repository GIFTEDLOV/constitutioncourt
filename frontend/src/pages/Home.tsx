/**
 * Home — the marquee editorial front page.
 *
 * Structure follows the fixed hierarchy: eyebrow → headline → lead → hairline
 * separated rows or stats. There are no cards and no illustrations; the
 * numerals do the work a chart would otherwise do.
 *
 * The positioning copy near the bottom ("what this is not") is not marketing
 * hedging and must not be trimmed for visual balance — it is the product's
 * central claim about its own limits, and the route tests pin every line of it.
 */

import { Link } from 'react-router-dom';
import { OUTCOME_MEANINGS } from '../config';
import { Lifecycle } from '../components/Lifecycle';
import { Badge, Notice, Panel, TableWrap } from '../components/Primitives';
import { CountUp, Marquee, Reveal } from '../components/Motion';
import { HOME_METRICS } from '../lib/metrics';

/** The four things the product does, in the order a case moves through them. */
const PRODUCT_ROWS = [
  {
    n: '01',
    title: 'File a case',
    body:
      'Pin the respondent, title, constitution, proposal, vote record, and notice record.',
  },
  {
    n: '02',
    title: 'Respond once',
    body: 'The respondent may publish one permanent response while the case is OPEN.',
  },
  {
    n: '03',
    title: 'Rule in consensus',
    body: 'Any account may trigger adjudication from OPEN or RESPONDED.',
  },
  {
    n: '04',
    title: 'Record the outcome',
    body: 'The contract maps validator consensus to CERTIFIED, REJECTED, or UNRESOLVED.',
  },
];

export function Home() {
  return (
    <div>
      {/* Hero: two counter-running marquee bands, bleeding past both edges. */}
      <section className="page" style={{ paddingBottom: 0 }} aria-labelledby="hero-h">
        <Marquee text="CONSTITUTION COURT · " dir="rtl" className="grad-hero" />
        <Marquee text="ON-CHAIN GOVERNANCE · " dir="ltr" className="grad-hero" />

        <div className="grid12" style={{ marginTop: 'var(--s6)' }}>
          <div className="col-2-8">
            <h1 id="hero-h" className="lead grad-lead" style={{ maxWidth: '22ch' }}>
              Objective constitutional review through decentralized validator consensus.
            </h1>
            <div className="btn-row" style={{ marginTop: 'var(--s4)' }}>
              <Link className="btn btn-primary" to="/create">File a case</Link>
              <Link className="btn" to="/demo">See four worked examples</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Live application metrics, every figure derived in src/lib/metrics.ts. */}
      <section className="page" style={{ paddingBlock: 'var(--s6)' }} aria-label="Key figures">
        <ul className="stats">
          {HOME_METRICS.map((m, i) => (
            <Reveal as="li" className="stat" delay={i * 80} key={m.label}>
              <span className="stat-num">
                <CountUp value={m.value} suffix={m.suffix ?? ''} />
              </span>
              <p className="stat-label">{m.label}</p>
              <p className="stat-basis">{m.basis}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      <div className="page">
        <Reveal as="section" className="section">
          <span className="eyebrow">Why it exists</span>
          <div className="grid12">
            <div className="col-2-8">
              <h2>Every governance dispute deserves deterministic review.</h2>
              <p className="lead lead-wide">
                ConstitutionCourt pins the constitution, proposal, vote record, and notice record
                before adjudication. GenLayer validators independently re-fetch the evidence and
                reach consensus on whether the proposal complied with the constitution.
              </p>
            </div>
          </div>

          <ol className="rows" style={{ marginTop: 'var(--s5)' }}>
            {PRODUCT_ROWS.map((r, i) => (
              <Reveal as="li" className="row" delay={i * 80} key={r.n}>
                <span className="row-n" aria-hidden="true">{r.n}</span>
                <h3 className="row-title">{r.title}</h3>
                <p className="row-body">{r.body}</p>
              </Reveal>
            ))}
          </ol>
        </Reveal>

        {/* The single deliberate typographic stunt. Real spaces in the DOM. */}
        <Reveal as="section" className="section">
          <div className="grid12">
            <div className="col-1-7">
              <p className="collapsed">
                Constitutional review without a private moderator, mutable evidence, or
                unverifiable AI judgement.
              </p>
            </div>
          </div>
        </Reveal>

        <Panel title="A governance dispute has no neutral reader">
          <div className="grid grid-2">
            <div>
              <p>
                A DAO&rsquo;s constitution is natural language: &ldquo;two-thirds of votes
                cast&rdquo;, &ldquo;publicly announced, in full&rdquo;, &ldquo;moves assets out of
                the treasury&rdquo;. Deciding whether a given proposal met those words is a reading
                question, and every party to the dispute has an interest in the answer.
              </p>
              <p>
                The organisation being challenged usually publishes the vote record itself, including
                its own declaration that the proposal <em>passed</em>. That declaration is the thing
                in dispute, not evidence for it.
              </p>
            </div>
            <div>
              <h3>Why the obvious fixes do not work</h3>
              <p>
                A threshold function cannot decide whether abstentions belong in the denominator when
                the rule says &ldquo;votes cast&rdquo; — two defensible readings give different
                answers. It cannot decide whether a chat reminder counts as a public announcement.
                And it cannot decide that a missing tally is neither compliance nor violation.
              </p>
              <p>
                A single human arbiter can decide all of those, and is one party&rsquo;s choice of
                reader.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="What ConstitutionCourt does">
          <p>
            One contract instance per case. It stores the two parties, four immutable evidence URLs,
            and — after adjudication — the ruling. Validators each fetch the same pinned documents,
            each derive a complete ruling independently, and consensus is reached on the decision
            fields: the outcome and the set of violated rule ids.
          </p>
          <Lifecycle status="OPEN" hasResponse={false} />
          <Notice>
            <p className="small" style={{ marginBottom: 0 }}>
              <strong>Filing is an allegation, not a finding.</strong> An OPEN case means someone paid
              gas to make a claim and nothing more. It carries no weight until validators have ruled.
            </p>
          </Notice>
        </Panel>

        <Panel title="What a ruling means — and what it does not">
          <TableWrap label="Outcomes and their limits">
            <table>
              <caption className="visually-hidden">
                The three outcomes, the final status each maps to, and the limits of each
              </caption>
              <thead>
                <tr>
                  <th scope="col">Outcome</th>
                  <th scope="col">Final status</th>
                  <th scope="col">What it means</th>
                  <th scope="col">What it does not mean</th>
                </tr>
              </thead>
              <tbody>
                {OUTCOME_MEANINGS.map((m) => (
                  <tr key={m.outcome}>
                    <th scope="row" className="mono">{m.outcome}</th>
                    <td><Badge kind={m.final}>{m.final}</Badge></td>
                    <td>{m.headline}</td>
                    <td className="muted">{m.notWhat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>

        <Panel title="Why this needs GenLayer">
          <div className="grid grid-3">
            <div>
              <h4>The judgment is irreducible</h4>
              <p className="small">
                Scope, tier, basis, sufficiency and silence each require reading a rule and deciding
                what it covers. The evidence schema deliberately forbids machine-readable threshold
                fields, so there is no number to compare.
              </p>
            </div>
            <div>
              <h4>No single reader is trusted</h4>
              <p className="small">
                Every validator fetches the evidence itself and derives its own complete ruling. A
                validator that merely checked the leader&rsquo;s answer had the right shape would be
                verifying formatting, not reasoning.
              </p>
            </div>
            <div>
              <h4>The frontend never decides</h4>
              <p className="small">
                This interface computes no outcome the contract adopts. If it could, the contract
                would merely be recording an answer produced off-chain, and the application would not
                need GenLayer at all.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="What this is not">
          <ul>
            <li><strong>Not a legal court.</strong> A ruling binds no one and has no legal force.</li>
            <li><strong>Not a treasury executor.</strong> The contract holds no balance, has no
              payable method, and cannot move an asset.</li>
            <li><strong>Not a voting platform.</strong> It reads a vote that already happened.</li>
            <li><strong>Not escrow.</strong> There is nothing at stake to win or lose.</li>
            <li><strong>Not a chatbot.</strong> It answers exactly one question about one pinned
              record.</li>
            <li><strong>Not a replacement for GenLayer native appeals.</strong> Contesting a ruling
              means appealing the ruling transaction itself.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
