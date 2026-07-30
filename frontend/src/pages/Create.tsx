/**
 * The six-step case creation wizard.
 *
 * The wizard exists because the four evidence URLs are **immutable**. The
 * contract has no method to change one, by design: a challenger who could swap
 * evidence after filing could wait to see how a ruling was trending. That makes
 * a typo at step 2 unfixable at step 7, so every URL is fetched, parsed and
 * schema-checked here, before a signature.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import contractSource from '../contract/constitution_court.py?raw';
import { CONTRACT_SOURCE_SHA256, EVIDENCE_ROLES, MAX_TITLE_LEN } from '../config';
import { deployCase } from '../chain';
import { probeEvidence, type EvidenceSourceName, type FetchProbe } from '../lib/evidence';
import { sha256Hex } from '../lib/hash';
import { verifyDeployment, type DeployVerification } from '../lib/deployment';
import { saveDraft, upsertCase, type DeploymentDraft } from '../lib/registry';
import {
  checkCaseTitle, checkDistinctUrls, checkEvidenceUrl, checkRespondent,
} from '../lib/validation';
import { useWallet } from '../state/wallet';
import { readableError } from '../state/hooks';
import { Notice, Panel } from '../components/Primitives';
import { shortHash } from '../lib/format';

const STEPS = [
  'Case', 'Constitution', 'Proposal', 'Governance records', 'Review', 'Deploy',
] as const;

type UrlField = 'constitutionUrl' | 'proposalUrl' | 'voteRecordUrl' | 'noticeRecordUrl';

interface Form {
  caseTitle: string;
  respondent: string;
  constitutionUrl: string;
  proposalUrl: string;
  voteRecordUrl: string;
  noticeRecordUrl: string;
}

const EMPTY: Form = {
  caseTitle: '', respondent: '',
  constitutionUrl: '', proposalUrl: '', voteRecordUrl: '', noticeRecordUrl: '',
};

const SOURCE_FOR: Record<UrlField, EvidenceSourceName> = {
  constitutionUrl: 'constitution',
  proposalUrl: 'proposal',
  voteRecordUrl: 'vote-record',
  noticeRecordUrl: 'notice-record',
};

const LABEL_FOR: Record<UrlField, string> = {
  constitutionUrl: 'Constitution URL',
  proposalUrl: 'Proposal URL',
  voteRecordUrl: 'Vote record URL',
  noticeRecordUrl: 'Notice record URL',
};

type DeployPhase = 'idle' | 'signing' | 'submitted' | 'verifying' | 'verified' | 'failed';

export function Create() {
  const { account, provider, wrongNetwork } = useWallet();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [probes, setProbes] = useState<Partial<Record<UrlField, FetchProbe>>>({});
  const [testing, setTesting] = useState<UrlField | null>(null);

  const [phase, setPhase] = useState<DeployPhase>('idle');
  const [hash, setHash] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [verification, setVerification] = useState<DeployVerification | null>(null);
  const draftRef = useRef<DeploymentDraft | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    // A changed URL invalidates its probe. Carrying an old pass forward would
    // let an edited-but-untested URL through the gate.
    if (k in SOURCE_FOR) setProbes((p) => ({ ...p, [k as UrlField]: undefined }));
  };

  const titleCheck = checkCaseTitle(form.caseTitle);
  const respondentCheck = checkRespondent(form.respondent, account);
  const urlChecks = useMemo(() => ({
    constitutionUrl: checkEvidenceUrl(form.constitutionUrl),
    proposalUrl: checkEvidenceUrl(form.proposalUrl),
    voteRecordUrl: checkEvidenceUrl(form.voteRecordUrl),
    noticeRecordUrl: checkEvidenceUrl(form.noticeRecordUrl),
  }), [form]);
  const distinct = checkDistinctUrls([
    form.constitutionUrl, form.proposalUrl, form.voteRecordUrl, form.noticeRecordUrl,
  ]);

  const test = useCallback(async (field: UrlField) => {
    const check = checkEvidenceUrl(form[field]);
    if (!check.ok) return;
    setTesting(field);
    try {
      const result = await probeEvidence(form[field].trim(), SOURCE_FOR[field]);
      setProbes((p) => ({ ...p, [field]: result }));
    } finally {
      setTesting(null);
    }
  }, [form]);

  const stepValid = (i: number): boolean => {
    if (i === 0) return titleCheck.ok && respondentCheck.ok;
    if (i === 1) return urlChecks.constitutionUrl.ok;
    if (i === 2) return urlChecks.proposalUrl.ok;
    if (i === 3) return urlChecks.voteRecordUrl.ok && urlChecks.noticeRecordUrl.ok && distinct.ok;
    if (i === 4) {
      return titleCheck.ok && respondentCheck.ok && distinct.ok
        && (Object.keys(urlChecks) as UrlField[]).every((k) => urlChecks[k].ok);
    }
    return true;
  };

  const warnings = (Object.keys(urlChecks) as UrlField[])
    .map((k) => ({ field: k, warn: urlChecks[k].warn }))
    .filter((w): w is { field: UrlField; warn: string } => !!w.warn);

  const untested = (Object.keys(SOURCE_FOR) as UrlField[]).filter((k) => !probes[k]?.ok);

  async function onDeploy() {
    if (!account || !provider) {
      setDeployError('Connect a wallet before deploying.');
      return;
    }
    setDeployError(null);
    setPhase('signing');

    // Persist the full intent BEFORE the signature. Verification compares the
    // contract against what we meant to deploy, and a tab closed between
    // signing and finalization must still be recoverable.
    const draft: DeploymentDraft = {
      sender: account,
      respondent: form.respondent.trim(),
      caseTitle: form.caseTitle.trim(),
      constitutionUrl: form.constitutionUrl.trim(),
      proposalUrl: form.proposalUrl.trim(),
      voteRecordUrl: form.voteRecordUrl.trim(),
      noticeRecordUrl: form.noticeRecordUrl.trim(),
      sourceSha256: await sha256Hex(contractSource),
      startedAt: Date.now(),
    };
    draftRef.current = draft;
    saveDraft(draft);

    let txHash: string;
    try {
      txHash = await deployCase(contractSource, {
        respondent: draft.respondent,
        caseTitle: draft.caseTitle,
        constitutionUrl: draft.constitutionUrl,
        proposalUrl: draft.proposalUrl,
        voteRecordUrl: draft.voteRecordUrl,
        noticeRecordUrl: draft.noticeRecordUrl,
      }, account, provider);
    } catch (e) {
      const err = e as { code?: number; message?: string };
      setDeployError(err.code === 4001
        ? 'Signature rejected in the wallet. Nothing was submitted.'
        : `Not submitted: ${readableError(e)}`);
      setPhase('failed');
      return;
    }

    setHash(txHash);
    draftRef.current = { ...draft, hash: txHash };
    saveDraft(draftRef.current);
    setPhase('submitted');
  }

  async function onVerify() {
    if (!hash || !draftRef.current) return;
    setPhase('verifying');
    setDeployError(null);
    try {
      const result = await verifyDeployment({ hash, draft: draftRef.current });
      setVerification(result);
      setPhase(result.ok ? 'verified' : 'failed');
      if (result.ok && result.address) {
        upsertCase({
          address: result.address,
          title: draftRef.current.caseTitle,
          via: 'created',
          addedAt: Date.now(),
        });
      }
    } catch (e) {
      setDeployError(readableError(e));
      setPhase('failed');
    }
  }

  return (
    <div className="page page-narrow">
      <h1>File a case</h1>
      <p className="lede">
        Six steps. Everything you pin here is immutable once the case exists — the contract has no
        method to change an evidence URL, so a challenger cannot swap documents after seeing how a
        ruling is trending.
      </p>

      <ol className="steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            data-done={i < step ? 'true' : 'false'}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <Panel title="1. Case">
          <div className="field">
            <label htmlFor="title">Case title</label>
            <p className="field-hint">
              What this dispute is about, in one line. Stored on-chain, up to {MAX_TITLE_LEN}
              {' '}characters.
            </p>
            <input
              id="title"
              type="text"
              value={form.caseTitle}
              onChange={(e) => set('caseTitle', e.target.value)}
              aria-invalid={form.caseTitle !== '' && !titleCheck.ok}
              aria-describedby={titleCheck.reason ? 'title-err' : undefined}
              placeholder="Meridian Collective — MC-2026-021 treasury disbursement"
            />
            {form.caseTitle !== '' && titleCheck.reason ? (
              <p className="msg msg-error" id="title-err">{titleCheck.reason}</p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="respondent">Respondent address</label>
            <p className="field-hint">
              The party answering this challenge — typically the organisation or proposer being
              challenged. They alone may publish a response. This cannot be changed later.
            </p>
            <input
              id="respondent"
              type="text"
              className="mono"
              value={form.respondent}
              onChange={(e) => set('respondent', e.target.value)}
              aria-invalid={form.respondent !== '' && !respondentCheck.ok}
              aria-describedby={respondentCheck.reason ? 'respondent-err' : undefined}
              placeholder="0x…"
            />
            {form.respondent !== '' && respondentCheck.reason ? (
              <p className="msg msg-error" id="respondent-err">{respondentCheck.reason}</p>
            ) : null}
          </div>

          <Notice>
            <p className="small" style={{ marginBottom: 0 }}>
              You will be recorded as the <strong>challenger</strong>: the wallet that signs the
              deployment. Filing costs only gas — it is an allegation, and it carries no weight
              until validators rule.
            </p>
          </Notice>
        </Panel>
      ) : null}

      {step === 1 ? (
        <UrlStep
          heading="2. Constitution"
          field="constitutionUrl"
          blurb="The rules being applied. Validators read this document to decide which rules are
            in scope and what they require. Its rule ids are the only ids a ruling may cite."
          form={form} set={set} check={urlChecks.constitutionUrl}
          probe={probes.constitutionUrl} testing={testing === 'constitutionUrl'}
          onTest={() => void test('constitutionUrl')}
        />
      ) : null}

      {step === 2 ? (
        <UrlStep
          heading="3. Proposal"
          field="proposalUrl"
          blurb="What was proposed. Its self-declared type and amount are claims by the party being
            challenged — validators weigh them, they do not adopt them."
          form={form} set={set} check={urlChecks.proposalUrl}
          probe={probes.proposalUrl} testing={testing === 'proposalUrl'}
          onTest={() => void test('proposalUrl')}
        />
      ) : null}

      {step === 3 ? (
        <>
          <UrlStep
            heading="4. Governance records — vote"
            field="voteRecordUrl"
            blurb="How the vote went. Its declared_result is the organisation's own claim about
              whether the proposal passed, and is frequently the thing in dispute."
            form={form} set={set} check={urlChecks.voteRecordUrl}
            probe={probes.voteRecordUrl} testing={testing === 'voteRecordUrl'}
            onTest={() => void test('voteRecordUrl')}
          />
          <UrlStep
            heading="Governance records — notice"
            field="noticeRecordUrl"
            blurb="How it was announced. Tested independently: a notice record that fetches is not
              evidence that the vote record does."
            form={form} set={set} check={urlChecks.noticeRecordUrl}
            probe={probes.noticeRecordUrl} testing={testing === 'noticeRecordUrl'}
            onTest={() => void test('noticeRecordUrl')}
          />
          {!distinct.ok ? (
            <p className="msg msg-error">{distinct.reason}</p>
          ) : null}
        </>
      ) : null}

      {step === 4 ? (
        <Panel title="5. Review">
          <Notice tone="warn">
            <p className="small">
              <strong>Everything below is permanent.</strong> Once this case exists, the respondent
              and all four evidence URLs are frozen. The contract has no method to change them —
              not a restricted one, none at all.
            </p>
            <p className="small" style={{ marginBottom: 0 }}>
              If any URL is wrong, the case will adjudicate the wrong document and your only
              remedy is to file a new case.
            </p>
          </Notice>

          <dl className="kv">
            <dt>Challenger</dt>
            <dd className="mono">{account ?? '(no wallet connected)'}</dd>
            <dt>Respondent</dt>
            <dd className="mono">{form.respondent || '—'}</dd>
            <dt>Case title</dt>
            <dd>{form.caseTitle || '—'}</dd>
            {(Object.keys(SOURCE_FOR) as UrlField[]).map((k) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{LABEL_FOR[k]}</dt>
                <dd className="mono">
                  {form[k] || '—'}
                  {probes[k]?.ok ? (
                    <span className="msg-ok"> ✓ schema verified</span>
                  ) : (
                    <span className="muted"> — not verified from this browser</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          {warnings.length > 0 ? (
            <div className="msg-warn" style={{ marginTop: '1rem' }}>
              <p className="small"><strong>Mutable evidence sources</strong></p>
              <ul className="small">
                {warnings.map((w) => (
                  <li key={w.field}><strong>{LABEL_FOR[w.field]}:</strong> {w.warn}</li>
                ))}
              </ul>
              <p className="small" style={{ marginBottom: 0 }}>
                The URL is pinned on-chain; its content is not. Validators fetch these URLs at
                ruling time, which may be much later than filing. If the content changes in
                between, they adjudicate something you never saw — and if it changes while they
                are fetching, they may disagree with each other.
              </p>
            </div>
          ) : null}

          {untested.length > 0 ? (
            <div className="msg-warn" style={{ marginTop: '1rem' }}>
              <p className="small" style={{ marginBottom: 0 }}>
                {untested.length} URL{untested.length === 1 ? '' : 's'} have not been verified from
                this browser. That may just be CORS — validators fetch server-side and are not
                subject to it — but an unverified URL is one you are pinning on trust.
              </p>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {step === 5 ? (
        <Panel title="6. Deploy">
          {wrongNetwork ? (
            <Notice tone="danger">
              <p className="small" style={{ marginBottom: 0 }}>
                Your wallet is on the wrong network. Switch before deploying.
              </p>
            </Notice>
          ) : null}

          {phase === 'idle' || phase === 'signing' ? (
            <>
              <p>
                Deploying submits the contract source embedded in this bundle, byte for byte, along
                with your six constructor arguments. The source hashes to{' '}
                <span className="mono">{shortHash(CONTRACT_SOURCE_SHA256)}</span>.
              </p>
              <p className="small muted">
                A returned transaction hash is not a deployment. After it finalizes, this page runs
                fourteen checks against the chain before treating the case as real.
              </p>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void onDeploy()}
                  disabled={!account || phase === 'signing' || wrongNetwork}
                >
                  {phase === 'signing' ? 'Awaiting signature…' : 'Deploy case'}
                </button>
                {!account ? <span className="small muted">Connect a wallet to deploy.</span> : null}
              </div>
            </>
          ) : null}

          {hash ? (
            <dl className="kv small" style={{ marginTop: '1rem' }}>
              <dt>Transaction</dt>
              <dd className="mono">{hash}</dd>
            </dl>
          ) : null}

          {phase === 'submitted' ? (
            <>
              <Notice tone="warn">
                <p className="small" style={{ marginBottom: 0 }}>
                  Submitted — <strong>not yet deployed</strong>. The node accepted the transaction.
                  Consensus and execution are separate later outcomes and either can still fail.
                  Bradbury commonly takes around 30 minutes.
                </p>
              </Notice>
              <button type="button" className="btn btn-primary" onClick={() => void onVerify()}>
                Verify deployment
              </button>
            </>
          ) : null}

          {phase === 'verifying' ? <p>Running verification checks…</p> : null}

          {verification ? (
            <VerificationPanel
              verification={verification}
              onOpen={() => {
                if (verification.address) navigate(`/case/${verification.address}`);
              }}
              onRetry={() => void onVerify()}
            />
          ) : null}

          {deployError ? <p className="msg msg-error">{deployError}</p> : null}
        </Panel>
      ) : null}

      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || phase === 'signing' || phase === 'verifying'}
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepValid(step)}
          >
            Continue
          </button>
        ) : null}
      </div>
    </div>
  );
}

interface UrlStepProps {
  heading: string;
  field: UrlField;
  blurb: string;
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  check: { ok: boolean; reason?: string; warn?: string };
  probe: FetchProbe | undefined;
  testing: boolean;
  onTest: () => void;
}

function UrlStep(
  { heading, field, blurb, form, set, check, probe, testing, onTest }: UrlStepProps,
) {
  const value = form[field];
  const role = EVIDENCE_ROLES.find((r) => r.key === `${field.replace('Url', '')}_url`
    || r.source === SOURCE_FOR[field]);

  return (
    <Panel title={heading}>
      <p>{blurb}</p>
      <div className="field">
        <label htmlFor={field}>{LABEL_FOR[field]}</label>
        <p className="field-hint">
          Must be HTTPS, publicly fetchable, and carry{' '}
          <code>&quot;schema&quot;: &quot;{role?.schema}&quot;</code>.
        </p>
        <input
          id={field}
          type="text"
          className="mono"
          value={value}
          onChange={(e) => set(field, e.target.value)}
          aria-invalid={value !== '' && !check.ok}
          aria-describedby={`${field}-msg`}
          placeholder="https://…"
        />
        <div id={`${field}-msg`}>
          {value !== '' && check.reason ? <p className="msg msg-error">{check.reason}</p> : null}
          {check.warn ? <p className="msg msg-warn">{check.warn}</p> : null}
        </div>
      </div>

      <div className="btn-row">
        <button type="button" className="btn" onClick={onTest} disabled={!check.ok || testing}>
          {testing ? 'Testing…' : 'Test URL'}
        </button>
      </div>

      {probe ? (
        <div style={{ marginTop: '1rem' }}>
          {probe.ok ? (
            <>
              <p className="msg msg-ok">
                Fetched, parsed, and the schema literal matches. {probe.summary}
              </p>
              <details>
                <summary>Document preview</summary>
                <pre className="pre">{JSON.stringify(probe.doc, null, 2)}</pre>
              </details>
            </>
          ) : (
            <p className={probe.kind === 'network' ? 'msg msg-warn' : 'msg msg-error'}>
              {probe.error}
            </p>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

function VerificationPanel(
  { verification, onOpen, onRetry }:
  { verification: DeployVerification; onOpen: () => void; onRetry: () => void },
) {
  return (
    <div style={{ marginTop: '1rem' }}>
      <h3>{verification.ok ? 'Deployment verified' : 'Deployment not verified'}</h3>
      {!verification.ok && verification.failed ? (
        <Notice tone="danger">
          <p className="small" style={{ marginBottom: 0 }}>
            <strong>{verification.failed.label}:</strong> {verification.failed.detail}
          </p>
        </Notice>
      ) : null}

      <ul className="checklist">
        {verification.checks.map((c) => (
          <li key={c.id}>
            <span
              className={`check-mark ${
                c.ok === true ? 'check-pass' : c.ok === false ? 'check-fail' : 'check-skip'
              }`}
              aria-hidden="true"
            >
              {c.ok === true ? '✓' : c.ok === false ? '✗' : '·'}
            </span>
            <span>
              <strong>{c.label}</strong>
              <span className="visually-hidden">
                {c.ok === true ? ' — passed' : c.ok === false ? ' — failed' : ' — not reached'}
              </span>
              <br />
              <span className="small muted">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="btn-row">
        {verification.ok ? (
          <button type="button" className="btn btn-primary" onClick={onOpen}>Open case</button>
        ) : (
          <button type="button" className="btn" onClick={onRetry}>Check again</button>
        )}
      </div>
      {!verification.ok && verification.claimedAddress ? (
        <p className="small muted">
          The receipt named <span className="mono">{verification.claimedAddress}</span>. That
          address is shown for diagnosis only and is not treated as a case.
        </p>
      ) : null}
    </div>
  );
}
