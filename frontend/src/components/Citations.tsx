/**
 * Evidence citations and violated rules.
 *
 * Two labelling rules are load-bearing here, and both are about not overstating
 * what consensus established:
 *
 *  1. Citations and reasoning are the **leader validator's** audit record. Only
 *     `outcome` and the set of `violated_rule_ids` were agreed by consensus.
 *     Presenting the prose as agreed text overstates what was verified.
 *  2. Rule text is resolved from the constitution or is honestly absent. A
 *     paraphrase next to a consensus-backed finding would put words in the
 *     validators' mouths.
 */

import { UNREADABLE_CITATION, type EvidenceCitation } from '../chain';
import type { RuleResolution } from '../lib/rules';
import { Ext } from './Primitives';

export function ConsensusScopeNote() {
  return (
    <div className="notice">
      <p className="small">
        <strong>What consensus agreed:</strong> the outcome, and the set of violated rule ids.
        Validators compared those fields and nothing else.
      </p>
      <p className="small">
        <strong>What it did not:</strong> the citations and the written reasoning below are the
        <em> leader validator&rsquo;s</em> audit record, recorded so a reader can check the finding
        against its basis. They are explanatory. Two validators can reach the same verdict for the
        same reason and word it differently, so requiring agreement on prose would fail consensus
        for no gain in correctness.
      </p>
    </div>
  );
}

export function CitationCard(
  { citation, pinned }: { citation: EvidenceCitation; pinned: readonly string[] },
) {
  const unreadable = citation.source === UNREADABLE_CITATION;
  if (unreadable) {
    return (
      <div className="citation">
        <div className="citation-head">
          <span className="citation-source">Unreadable citation</span>
        </div>
        <p className="small">
          This citation is stored on-chain but could not be decoded as JSON. It is shown rather
          than hidden: silently dropping it would understate the ruling&rsquo;s stated basis.
        </p>
      </div>
    );
  }

  const isPinned = !!citation.url && pinned.includes(citation.url);
  return (
    <div className="citation">
      <div className="citation-head">
        <span className="citation-source">{citation.source}</span>
        {citation.supports ? (
          <span className="mono small">bears on {citation.supports}</span>
        ) : null}
      </div>
      {citation.locator ? (
        <div className="citation-locator">{citation.locator}</div>
      ) : null}
      {citation.quote ? (
        <pre className="citation-quote">{citation.quote}</pre>
      ) : (
        <p className="small muted">No quote recorded.</p>
      )}
      {citation.url ? (
        <p className="small" style={{ margin: 0 }}>
          <Ext href={citation.url}>{citation.url}</Ext>
          {!isPinned ? (
            <span className="msg-error">
              {' '}— this URL is not among the case&rsquo;s pinned evidence sources. Treat it with
              suspicion.
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

export function ViolatedRules({ resolutions }: { resolutions: RuleResolution[] }) {
  if (resolutions.length === 0) {
    return (
      <p className="small muted">
        No rules were cited as violated.
      </p>
    );
  }
  return (
    <div className="stack">
      {resolutions.map((r) => (
        <div className="citation" key={r.id}>
          <div className="citation-head">
            <span className="citation-source">{r.id}</span>
            {r.state === 'resolved' && r.rule.title ? <strong>{r.rule.title}</strong> : null}
          </div>
          {r.state === 'resolved' ? (
            <>
              {r.rule.scope ? <p className="small muted">Scope: {r.rule.scope}</p> : null}
              {r.rule.text ? <p className="small">{r.rule.text}</p> : (
                <p className="small muted">
                  This rule exists in the constitution but records no text.
                </p>
              )}
            </>
          ) : null}
          {r.state === 'not-in-constitution' ? (
            <p className="small msg-error">
              This rule id does not appear in the pinned constitution. The contract rejects
              rulings that cite unresolvable ids, so seeing this means the constitution served at
              its URL has changed since the ruling — the evidence moved, and the ruling now cites
              a rule the current document does not contain.
            </p>
          ) : null}
          {r.state === 'unavailable' ? (
            <p className="small muted">{r.reason}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
