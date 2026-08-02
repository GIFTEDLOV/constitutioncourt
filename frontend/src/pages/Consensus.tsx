/**
 * How consensus works — the five stages between a filing and a ruling.
 *
 * Deliberately typographic. The brief asks for enormous numerals instead of
 * diagrams, and that suits the subject: the sequence is linear and the only
 * thing a diagram would add is decoration. Each stage states what happens, and
 * then what the stage does *not* guarantee — the second half is the part that
 * keeps this page honest rather than promotional.
 */

import { Link } from 'react-router-dom';
import { Ext } from '../components/Primitives';
import { CHAIN_NAME, EVIDENCE_ROLES, REPO, TYPICAL_SETTLE_SECONDS } from '../config';
import { FIRST_ROUND_VALIDATORS, REQUIRED_EVIDENCE_COUNT } from '../lib/metrics';

interface Stage {
  n: number;
  title: string;
  body: string;
  /** The honest limit of this stage. Rendered as a distinct, quieter line. */
  limit: string;
}

const SETTLE_MINUTES = Math.round(TYPICAL_SETTLE_SECONDS / 60);

const STAGES: Stage[] = [
  {
    n: 1,
    title: 'Submission',
    body:
      'A challenger deploys one contract per dispute. The filing names a respondent and pins '
      + `${REQUIRED_EVIDENCE_COUNT} evidence URLs. Nothing is adjudicated at this point: the case opens as `
      + 'an allegation on the record, and the contract stores it exactly as submitted.',
    limit:
      'Filing proves a claim was made. It proves nothing about whether the claim is correct.',
  },
  {
    n: 2,
    title: 'Pinned evidence',
    body:
      'Each URL is pinned to a 40-character commit rather than a branch. The contract stores the '
      + 'URL; it cannot store what that URL serves. Pinning is what makes the two the same thing '
      + 'at ruling time as at filing time.',
    limit:
      'A pinned URL cannot be edited underneath the case, but it can still be taken offline. '
      + 'The protocol pins references, not bytes.',
  },
  {
    n: 3,
    title: 'Independent validator fetch',
    body:
      `Each of the ${FIRST_ROUND_VALIDATORS} validators fetches the evidence itself. No validator trusts another's copy, `
      + 'and none trusts this interface. They read the same commit and apply the constitution to '
      + 'the proposal, the vote record and the notice record.',
    limit:
      'Validators read what is pinned. Evidence that was never filed cannot influence a ruling, '
      + 'however relevant it may be.',
  },
  {
    n: 4,
    title: 'Consensus',
    body:
      'The validators must agree. Disagreement rotates the set and re-runs the question rather '
      + 'than averaging opinions, because a governance verdict has no meaningful midpoint. '
      + `Settlement on ${CHAIN_NAME} commonly takes around ${SETTLE_MINUTES} minutes.`,
    limit:
      'Consensus establishes that independent readers agreed. It does not make the reading '
      + 'correct, and it is not a legal determination.',
  },
  {
    n: 5,
    title: 'Immutable ruling',
    body:
      'The outcome, its final status, the violated rule ids and the reasoning are written to the '
      + 'contract with citations. RULED is terminal — there is no reopening and no second ruling.',
    limit:
      'A ruling is an opinion with citations. Correcting one is a matter for GenLayer’s native '
      + 'transaction appeal, not for this application.',
  },
];

export function Consensus() {
  return (
    <div className="page ed-page">
      <header className="ed-head">
        <h1>How consensus works</h1>
        <p className="ed-lead">
          Five stages sit between a filing and a ruling. Every one of them is observable, and none
          of them requires trusting this interface.
        </p>
      </header>

      <ol className="ed-stages">
        {STAGES.map((s) => (
          <li className="ed-stage" key={s.n}>
            <span className="ed-stage-n" aria-hidden="true">{s.n}</span>
            <div className="ed-stage-body">
              <h2 className="ed-stage-title">
                <span className="visually-hidden">{`Stage ${s.n}: `}</span>
                {s.title}
              </h2>
              <p>{s.body}</p>
              <p className="ed-limit">{s.limit}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="ed-section" aria-labelledby="what-is-pinned">
        <h2 id="what-is-pinned">What a case pins</h2>
        <dl className="ed-defs">
          {EVIDENCE_ROLES.map((r) => (
            <div className="ed-def" key={r.key}>
              <dt>{r.label}</dt>
              <dd>
                {r.role}
                <span className="ed-def-schema mono">{r.schema}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="ed-note">
          Four are required. The respondent’s response is optional by design — a respondent who
          stays silent cannot deadlock adjudication.
        </p>
      </section>

      <section className="ed-section" aria-labelledby="verify-yourself">
        <h2 id="verify-yourself">You do not have to take our word for it</h2>
        <p>
          Every ruling can be re-derived from public data. Read the contract state directly, fetch
          the pinned evidence at its commit, and check the reasoning against the rules it cites.
        </p>
        <p>
          <Ext href={REPO}>Source and evidence fixtures</Ext> — or start from{' '}
          <Link to="/demo">four worked examples</Link> with their expected outcomes stated in
          advance.
        </p>
      </section>
    </div>
  );
}
