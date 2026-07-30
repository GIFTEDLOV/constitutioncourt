import { Link } from 'react-router-dom';
import { OUTCOME_MEANINGS } from '../config';
import { Lifecycle } from '../components/Lifecycle';
import { Badge, Notice, Panel, TableWrap } from '../components/Primitives';

export function Home() {
  return (
    <div className="page">
      <section style={{ marginBottom: '2.5rem' }}>
        <h1>Was that proposal carried according to your own constitution?</h1>
        <p className="lede">
          A challenger pins the constitution, the proposal, the vote record and the notice record.
          The respondent may publish one response. GenLayer validators then independently re-fetch
          every document and decide, on that record, whether the proposal complied.
        </p>
        <div className="btn-row" style={{ marginTop: '1.5rem' }}>
          <Link className="btn btn-primary" to="/create">File a case</Link>
          <Link className="btn" to="/demo">See four worked examples</Link>
        </div>
      </section>

      <Panel title="The problem">
        <div className="grid grid-2">
          <div>
            <h3>A governance dispute has no neutral reader</h3>
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
  );
}
