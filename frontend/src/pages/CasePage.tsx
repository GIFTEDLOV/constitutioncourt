/**
 * The live case view.
 *
 * Every write on this page passes the same discipline:
 *   1. refresh live state and re-derive availability BEFORE opening the dialog;
 *   2. refresh and re-derive AGAIN immediately before submitting;
 *   3. clear any previous postcondition when a new action begins;
 *   4. bind the resulting postcondition to the exact transaction hash + method;
 *   5. report success only once the postcondition is observed on-chain.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EVIDENCE_ROLES, OUTCOME_MEANINGS, explorerAddress } from '../config';
import { availableActions, roleFor, unavailableReason, type ActionDef } from '../lib/actions';
import { preflightAction } from '../lib/preflight';
import {
  checkPostcondition, rejectionSummary,
  type PostconditionRecord,
} from '../lib/postconditions';
import { extractRules, probeEvidence, type ConstitutionRule } from '../lib/evidence';
import { resolveRuleIds } from '../lib/rules';
import { checkEvidenceUrl } from '../lib/validation';
import { getPendingTx } from '../lib/registry';
import { useLiveCase, useWriteAction } from '../state/hooks';
import { useWallet } from '../state/wallet';
import { Address, Badge, Ext, Notice, Panel, Timestamp } from '../components/Primitives';
import { Lifecycle } from '../components/Lifecycle';
import { CitationCard, ConsensusScopeNote, ViolatedRules } from '../components/Citations';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TxPanel } from '../components/TxPanel';
import { isAddress } from '../lib/validation';

export function CasePage() {
  const { contractAddress } = useParams();
  const address = contractAddress ?? null;
  const { account, provider, wrongNetwork } = useWallet();
  const live = useLiveCase(address);
  const { st, sources, loading, error, supersededBy, refresh } = live;

  const write = useWriteAction(() => { void refresh(); });
  const [postcondition, setPostcondition] = useState<PostconditionRecord | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [pending, setPending] = useState<ActionDef | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [responseUrl, setResponseUrl] = useState('');
  const [rules, setRules] = useState<ConstitutionRule[] | null>(null);
  const [rulesError, setRulesError] = useState<string | undefined>();
  const resumedFor = useRef<string | null>(null);

  const role = roleFor(account, st);
  const actions = useMemo(() => (st ? availableActions({ st, role }) : []), [st, role]);

  /**
   * Switching contract clears every piece of local action and transaction
   * state. Carrying a postcondition, a rejection notice, or a half-open dialog
   * across an address change would attribute one case's result to another.
   */
  useEffect(() => {
    setPostcondition(null);
    setRejection(null);
    setPending(null);
    setBlocked(null);
    setResponseUrl('');
    setRules(null);
    setRulesError(undefined);
    write.reset();
    resumedFor.current = null;
    // `write` is a stable-enough object; including it would reset on every
    // tracker tick and cancel the transaction being tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  /** Resume tracking a write that was submitted before a reload. */
  useEffect(() => {
    if (!address || resumedFor.current === address) return;
    const p = getPendingTx(address);
    if (p) {
      resumedFor.current = address;
      write.resume(address, p.hash, p.method, p.startedAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  /** Fetch the constitution so cited rule ids can be resolved to their text. */
  useEffect(() => {
    let alive = true;
    setRules(null);
    setRulesError(undefined);
    const url = sources?.constitution_url;
    if (!url || !st || st.violated_rule_ids.length === 0) return;
    void (async () => {
      const probe = await probeEvidence(url, 'constitution');
      if (!alive) return;
      if (probe.ok && probe.doc) setRules(extractRules(probe.doc));
      else setRulesError(probe.error);
    })();
    return () => { alive = false; };
  }, [sources?.constitution_url, st]);

  /**
   * Step 1 of the write discipline: re-read live state and re-derive
   * availability before the confirmation dialog opens.
   */
  const openDialog = useCallback(async (action: ActionDef) => {
    if (!address) return;
    setBlocked(null);
    // Step 3: a new action begins, so any previous postcondition is history and
    // must not linger beside it.
    setPostcondition(null);
    setRejection(null);

    const read = await refresh();
    const fresh = read.st ?? null;
    const check = preflightAction({
      method: action.method,
      live: { ok: read.ok, ...(read.error !== undefined ? { error: read.error } : {}) },
      ctx: fresh ? { st: fresh, role: roleFor(account, fresh) } : null,
    });
    if (!check.ok) {
      setBlocked(check.reason);
      return;
    }
    setPending(check.action);
  }, [address, refresh, account]);

  /**
   * Step 2: re-derive availability again immediately before submitting, then
   * bind the postcondition to the hash that comes back.
   */
  const confirm = useCallback(async () => {
    if (!pending || !address || !account || !provider) return;
    const method = pending.method;

    const read = await refresh();
    const fresh = read.st ?? null;
    const check = preflightAction({
      method,
      live: { ok: read.ok, ...(read.error !== undefined ? { error: read.error } : {}) },
      ctx: fresh ? { st: fresh, role: roleFor(account, fresh) } : null,
    });
    if (!check.ok) {
      setPending(null);
      setBlocked(check.reason);
      return;
    }

    const args = method === 'submit_response' ? [responseUrl.trim()] : [];
    setPending(null);
    const hash = await write.run({ method, args, account, provider, address });
    if (!hash) return;

    // The postcondition is evaluated when the transaction settles, and is bound
    // to this hash and method so it can never be shown under a later one.
    const settledAt = Date.now();
    const evaluate = async () => {
      const after = await refresh();
      if (!after.st) return;
      setPostcondition({
        hash,
        method,
        address,
        at: settledAt,
        result: checkPostcondition({
          method,
          st: after.st,
          expected: method === 'submit_response'
            ? { responseUrl: after.sources?.response_url ?? '' }
            : undefined,
        }),
      });
    };
    void evaluate();
  }, [pending, address, account, provider, responseUrl, refresh, write]);

  // When a write ends in an execution error, explain what the contract refused
  // and that nothing changed — rather than leaving a bare failure on screen.
  useEffect(() => {
    if (write.tx.phase === 'execution-error' && write.tx.method) {
      setRejection(rejectionSummary(write.tx.method, st));
    }
  }, [write.tx.phase, write.tx.method, st]);

  // Re-evaluate the postcondition once the transaction actually settles.
  useEffect(() => {
    const { phase, hash, method } = write.tx;
    if (phase !== 'finalized' || !hash || !method || !address) return;
    void (async () => {
      const after = await refresh();
      if (!after.st) return;
      setPostcondition({
        hash,
        method,
        address,
        at: Date.now(),
        result: checkPostcondition({
          method,
          st: after.st,
          expected: method === 'submit_response'
            ? { responseUrl: after.sources?.response_url ?? '' }
            : undefined,
        }),
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [write.tx.phase, write.tx.hash, write.tx.method, address]);

  if (!address || !isAddress(address)) {
    return (
      <div className="page page-narrow">
        <h1>Not a contract address</h1>
        <p>
          A case is addressed by its contract, e.g.{' '}
          <span className="mono">/case/0x…</span>. The value in the URL is not a valid address.
        </p>
      </div>
    );
  }

  if (loading && !st) {
    return <div className="page"><p>Reading the case from the contract…</p></div>;
  }

  if (!st) {
    return (
      <div className="page page-narrow">
        <h1>This case could not be read</h1>
        <p className="msg msg-error">{error ?? 'The contract did not answer.'}</p>
        <p>
          Either no contract exists at <span className="mono">{address}</span>, or it is not a
          ConstitutionCourt case. A deploy transaction that finalized is not proof a contract
          exists — that exact failure is why the create wizard verifies before recording a case.
        </p>
        <p><Ext href={explorerAddress(address)}>Inspect the address in the explorer</Ext></p>
      </div>
    );
  }

  const responseCheck = checkEvidenceUrl(responseUrl);
  const meaning = OUTCOME_MEANINGS.find((m) => m.outcome === st.outcome);
  const pinnedUrls = sources
    ? [
      sources.constitution_url, sources.proposal_url,
      sources.vote_record_url, sources.notice_record_url, sources.response_url,
    ].filter(Boolean)
    : [];

  return (
    <div className="page">
      <h1>{st.case_title || 'Untitled case'}</h1>
      <p className="btn-row" style={{ marginBottom: '1.5rem' }}>
        <Badge kind={st.status}>{st.status}</Badge>
        {st.final_status ? <Badge kind={st.final_status}>{st.final_status}</Badge> : null}
        <span className="mono small">
          <Ext href={explorerAddress(address)}>{address}</Ext>
        </span>
      </p>

      {supersededBy ? (
        <Notice tone="warn">
          <p className="small" style={{ marginBottom: 0 }}>
            Another tab has read this case as <strong>{supersededBy}</strong>, which disagrees with
            what is shown here. The view is refreshing; no action is offered from state known to be
            stale.
          </p>
        </Notice>
      ) : null}

      <Panel title="Lifecycle">
        <Lifecycle status={st.status} hasResponse={st.has_response} />
      </Panel>

      <div className="grid grid-2">
        <Panel title="Parties and timestamps">
          <dl className="kv">
            <dt>Challenger</dt>
            <dd><Address value={st.challenger} /></dd>
            <dt>Respondent</dt>
            <dd><Address value={st.respondent} /></dd>
            <dt>Filed</dt>
            <dd><Timestamp value={st.created_at} label="filed" /></dd>
            <dt>Responded</dt>
            <dd>
              {st.responded_at
                ? <Timestamp value={st.responded_at} />
                : <span className="muted">No response submitted</span>}
            </dd>
            <dt>Ruled</dt>
            <dd>
              {st.ruled_at
                ? <Timestamp value={st.ruled_at} />
                : <span className="muted">Not yet ruled</span>}
            </dd>
            <dt>Your role</dt>
            <dd>
              {role === 'disconnected'
                ? <span className="muted">Reading without a wallet</span>
                : <span>{role}</span>}
            </dd>
          </dl>
        </Panel>

        <Panel title="Evidence sources">
          <p className="small muted">
            Pinned at filing and immutable. Validators fetch exactly these URLs and never follow
            links found inside the documents.
          </p>
          <dl className="kv">
            {EVIDENCE_ROLES.map((r) => {
              const url = sources?.[r.key] ?? '';
              return (
                <div key={r.key} style={{ display: 'contents' }}>
                  <dt>{r.label}</dt>
                  <dd>
                    {url ? (
                      <Ext href={url}><span className="mono">{url}</span></Ext>
                    ) : (
                      <span className="muted">
                        {r.required ? '—' : 'None — the respondent submitted no response'}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Panel>
      </div>

      {st.status === 'RULED' ? (
        <Panel title="Ruling">
          <div className="btn-row" style={{ marginBottom: '1rem' }}>
            <Badge kind={st.final_status}>{st.final_status}</Badge>
            <span className="mono">{st.outcome}</span>
          </div>
          {meaning ? (
            <>
              <p>{meaning.headline}</p>
              <Notice tone="warn">
                <p className="small" style={{ marginBottom: 0 }}>{meaning.notWhat}</p>
              </Notice>
            </>
          ) : null}

          <h3>Violated rules</h3>
          <ViolatedRules
            resolutions={resolveRuleIds(st.violated_rule_ids, rules, rulesError)}
          />

          <ConsensusScopeNote />

          <h3>Citations</h3>
          {st.evidence_citations.length === 0 ? (
            <p className="small muted">No citations were recorded.</p>
          ) : (
            st.evidence_citations.map((c, i) => (
              <CitationCard key={`${c.source}-${c.locator}-${i}`} citation={c} pinned={pinnedUrls} />
            ))
          )}

          <h3>Validator reasoning</h3>
          <p className="small muted">
            The leader validator&rsquo;s explanation, recorded for audit. Not consensus-verified text.
          </p>
          <p>{st.reasoning || <span className="muted">No reasoning recorded.</span>}</p>

          <Notice>
            <p className="small" style={{ marginBottom: 0 }}>
              <strong>RULED is terminal.</strong> There is no reopening, no second ruling and no
              appeal method in this contract. A party who disputes this ruling uses
              GenLayer&rsquo;s <strong>native transaction appeal</strong> on the ruling transaction
              itself.
            </p>
          </Notice>
        </Panel>
      ) : (
        <Panel title="Not yet ruled">
          <p>
            This case is <strong>{st.status}</strong>. No ruling has been recorded, and no finding
            of any kind has been made.
          </p>
          <p className="small muted">
            An OPEN case is an unadjudicated claim: someone paid gas to allege a violation. It is
            not an accusation with weight, and nothing here should be read as one.
          </p>
        </Panel>
      )}

      <TxPanel
        tx={write.tx}
        address={address}
        postcondition={postcondition}
        rejection={rejection}
        onDismiss={() => { write.reset(); setRejection(null); }}
      />

      <Panel title="Actions">
        {blocked ? (
          <Notice tone="warn">
            <p className="small" style={{ marginBottom: 0 }}>{blocked}</p>
          </Notice>
        ) : null}

        {wrongNetwork ? (
          <Notice tone="danger">
            <p className="small" style={{ marginBottom: 0 }}>
              Switch to the correct network before signing.
            </p>
          </Notice>
        ) : null}

        {st.status === 'RULED' ? (
          <p>
            No state-changing action exists for a RULED case, for anyone. The record is frozen.
          </p>
        ) : null}

        {/*
          Rendered whenever an action is absent, not only when *every* action is.
          A challenger looking at an OPEN case sees the ruling button and would
          otherwise get no explanation of why "Submit response" is missing —
          leaving them to guess whether it is a permission rule or a bug.
        */}
        {st.status !== 'RULED' ? (
          <div className="stack">
            {(['submit_response', 'rule'] as const).map((m) => {
              const reason = unavailableReason({ st, role }, m);
              return reason ? <p className="small muted" key={m}>{reason}</p> : null;
            })}
          </div>
        ) : null}

        {actions.map((a) => (
          <div key={a.method} style={{ marginBottom: '1.25rem' }}>
            <h3>{a.label}</h3>
            <p className="small">{a.consequence}</p>
            {a.permissionless ? (
              <p className="small muted">
                Anyone may run the ruling — the challenger, the respondent, or an unrelated third
                party. The respondent cannot prevent adjudication by declining to respond.
              </p>
            ) : null}

            {a.method === 'submit_response' ? (
              <div className="field">
                <label htmlFor="response-url">Response URL</label>
                <p className="field-hint">
                  One public HTTPS URL carrying{' '}
                  <code>&quot;schema&quot;: &quot;constitutioncourt/response@1&quot;</code>.
                </p>
                <input
                  id="response-url"
                  type="text"
                  className="mono"
                  value={responseUrl}
                  onChange={(e) => setResponseUrl(e.target.value)}
                  aria-invalid={responseUrl !== '' && !responseCheck.ok}
                  placeholder="https://…"
                />
                {responseUrl !== '' && responseCheck.reason ? (
                  <p className="msg msg-error">{responseCheck.reason}</p>
                ) : null}
                {responseCheck.warn ? <p className="msg msg-warn">{responseCheck.warn}</p> : null}
              </div>
            ) : null}

            <button
              type="button"
              className={a.tone === 'primary' ? 'btn btn-primary' : 'btn'}
              onClick={() => void openDialog(a)}
              disabled={
                write.busy
                || !account
                || wrongNetwork
                || !!supersededBy
                || (a.method === 'submit_response' && !responseCheck.ok)
              }
            >
              {a.label}
            </button>
            {!account ? (
              <p className="small muted">Connect a wallet to act. Reading needs none.</p>
            ) : null}
          </div>
        ))}
      </Panel>

      <ConfirmDialog
        open={!!pending}
        title={pending?.label ?? ''}
        consequence={pending?.consequence ?? ''}
        confirmLabel={pending?.label ?? 'Confirm'}
        busy={write.busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      >
        {pending?.method === 'submit_response' ? (
          <Notice tone="warn">
            <p className="small" style={{ marginBottom: 0 }}>
              This is permanent. The contract accepts exactly one response and provides no way to
              replace, edit or withdraw it — so the document cannot be swapped after you see how it
              lands. Submitting: <span className="mono">{responseUrl.trim()}</span>
            </p>
          </Notice>
        ) : null}
        {pending?.method === 'rule' ? (
          <Notice tone="warn">
            <p className="small">
              Every validator independently re-fetches all pinned evidence and derives its own
              complete ruling. Consensus is on the <strong>outcome</strong> and the{' '}
              <strong>set of violated rule ids</strong>; citations and reasoning are explanatory
              and are recorded from the leader.
            </p>
            <p className="small" style={{ marginBottom: 0 }}>
              RULED is terminal. Once this settles the record is frozen and the only recourse is
              GenLayer&rsquo;s native transaction appeal.
            </p>
          </Notice>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
