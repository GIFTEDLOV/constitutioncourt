/**
 * Four worked examples.
 *
 * Each fixture exists to turn on a specific judgment a threshold function
 * cannot make. The page states what each one turns on, because the point is not
 * "look, four verdicts" — it is "look, four readings that a number could not
 * have produced".
 *
 * Expected outcomes shown here are what the fixtures were *built* to produce and
 * what the direct-mode suite asserts. Where no contract is deployed, the page
 * says so rather than implying a live ruling exists.
 */

import { Link } from 'react-router-dom';
import { DEMO_CASES, REPO, EVIDENCE_COMMIT, fixtureUrl } from '../config';
import { Badge, Ext, Notice, Panel } from '../components/Primitives';

/** The documents a case pins, in order. The response exists only for some. */
function documentsFor(dir: string, hasResponse: boolean) {
  const files = ['constitution.json', 'proposal.json', 'vote-record.json', 'notice-record.json'];
  if (hasResponse) files.push('response.json');
  return files.map((file) => ({ file, url: fixtureUrl(dir, file) }));
}

export function Demo() {
  return (
    <div className="page">
      <h1>Worked examples</h1>
      <p className="lede">
        Four complete evidence sets, each built around a different kind of reading. Every document
        is public; you can fetch exactly what a validator would.
      </p>

      <Notice>
        <p className="small">
          These are <strong>fixtures</strong>, not live disputes. The expected outcome for each is
          what the evidence was constructed to produce and what the contract&rsquo;s offline test
          suite asserts.
        </p>
        <p className="small" style={{ marginBottom: 0 }}>
          Nothing is deployed at this stage, so no case below has a contract address. An expected
          outcome is not a ruling — a ruling only exists once validators have reached consensus on
          a real contract.
        </p>
      </Notice>

      <div className="grid grid-2">
        {DEMO_CASES.map((c) => (
          <Panel key={c.id} title={c.label}>
            <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
              <Badge kind={c.expected.final}>{c.expected.final}</Badge>
              <span className="mono small">{c.expected.outcome}</span>
              {c.hasResponse ? (
                <span className="small muted">respondent answered</span>
              ) : (
                <span className="small muted">no response — ruled from OPEN</span>
              )}
            </div>

            <p>{c.blurb}</p>

            <h4>What it turns on</h4>
            <p className="small">{c.turnsOn}</p>

            {c.expected.ruleIds.length > 0 ? (
              <p className="small">
                <strong>Cited:</strong>{' '}
                <span className="mono">{c.expected.ruleIds.join(', ')}</span>
              </p>
            ) : (
              <p className="small muted">No rules cited as violated.</p>
            )}

            <details>
              <summary>The exact documents validators fetch</summary>
              <ul className="small">
                {documentsFor(c.dir, c.hasResponse).map((d) => (
                  <li key={d.file}>
                    <Ext href={d.url}>{d.file}</Ext>
                  </li>
                ))}
              </ul>
              <p className="small muted">
                Every URL is pinned to commit{' '}
                <span className="mono">{EVIDENCE_COMMIT.slice(0, 7)}</span>, never to a branch, so
                what it serves cannot change. Hashes are recorded in{' '}
                <Ext href={`${REPO}/blob/${EVIDENCE_COMMIT}/evidence/README.md`}>
                  evidence/README.md
                </Ext>.
              </p>
            </details>

            {c.address ? (
              <Link className="btn" to={`/case/${c.address}`}>Open the live case</Link>
            ) : (
              <p className="small muted">
                Not deployed. When a contract exists for this fixture, its address appears here and
                the ruling shown is read from the chain rather than from this page.
              </p>
            )}
          </Panel>
        ))}
      </div>

      <Panel title="Why these four">
        <p>
          A compliant case is easy to produce and proves little on its own. The set is chosen so
          that each case fails a <em>different</em> way of being decided mechanically:
        </p>
        <ul>
          <li>
            <strong>Tier selection.</strong> 250,000 USDC passes the simple-majority bar and fails
            the two-thirds bar. A reader anchored on the smaller per-grant amounts in the body text
            reaches the wrong article entirely.
          </li>
          <li>
            <strong>Denominator choice.</strong> &ldquo;Votes cast&rdquo; either includes
            abstentions or does not; the two readings give 60.0% and 62.4%, and only the rule&rsquo;s
            own words settle which applies.
          </li>
          <li>
            <strong>Sufficiency of notice.</strong> Whether a chat reminder is a public
            announcement &ldquo;in full&rdquo;, and whether it counts when it landed after voting
            opened. Here the respondent&rsquo;s argument is well-reasoned, sympathetic, and must
            still lose.
          </li>
          <li>
            <strong>Silence.</strong> A missing tally is neither compliance nor violation. Deciding
            that absence settles nothing — rather than inferring a figure or treating the gap as
            suspicious — is a judgment no threshold expresses.
          </li>
        </ul>
        <p className="small muted">
          A fetch failure is never one of these outcomes. A 503 is a retryable network condition,
          not an evidentiary finding — mapping it to UNRESOLVED would turn a blip into a permanent
          verdict on a case that has a real answer.
        </p>
      </Panel>
    </div>
  );
}
