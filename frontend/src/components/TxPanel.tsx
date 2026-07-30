/**
 * Transaction progress, stated honestly at every phase.
 *
 * The rules this panel exists to enforce visually:
 *  - a hash means submitted, never successful;
 *  - `execution-error` renders as a failure, not as "accepted";
 *  - `unknown` says so and tells the reader to confirm on-chain state rather
 *    than retry;
 *  - a postcondition is shown only when it is bound to *this* transaction hash
 *    and method.
 */

import { TYPICAL_SETTLE_SECONDS, explorerTx } from '../config';
import { elapsed, shortHash } from '../lib/format';
import type { PostconditionRecord } from '../lib/postconditions';
import { postconditionApplies } from '../lib/postconditions';
import type { TxTracker } from '../chain';
import { Ext } from './Primitives';

const PHASE_TEXT: Record<string, { label: string; detail: string }> = {
  'awaiting-signature': {
    label: 'Awaiting signature',
    detail: 'Confirm in your wallet. Nothing has been submitted yet.',
  },
  submitted: {
    label: 'Submitted',
    detail: 'The node accepted the transaction for processing. This is not success — consensus '
      + 'and execution are separate later outcomes and either can still fail.',
  },
  'pending-consensus': {
    label: 'Awaiting consensus',
    detail: 'Validators are processing. Bradbury serialises transactions per contract, so this '
      + 'commonly takes around 30 minutes.',
  },
  'consensus-accepted': {
    label: 'Consensus accepted',
    detail: 'Validators agreed and execution completed. Waiting for finalization.',
  },
  finalized: {
    label: 'Finalized',
    detail: 'Consensus finalized and the contract ran to completion.',
  },
  'execution-error': {
    label: 'Failed — execution error',
    detail: 'Consensus accepted the transaction but the contract refused the call. This is a '
      + 'failure of the attempt, not a partial success.',
  },
  failed: { label: 'Failed', detail: 'The transaction did not succeed.' },
  unknown: {
    label: 'Unknown',
    detail: 'The outcome could not be established. Do not retry until you have confirmed the '
      + 'contract state below.',
  },
};

export interface TxPanelProps {
  tx: TxTracker;
  address: string | null;
  postcondition: PostconditionRecord | null;
  /** Rendered when the write was rejected by a contract guard. */
  rejection?: string | null;
  onDismiss?: () => void;
}

export function TxPanel({ tx, address, postcondition, rejection, onDismiss }: TxPanelProps) {
  if (tx.phase === 'idle') return null;
  const info = PHASE_TEXT[tx.phase] ?? { label: tx.phase, detail: '' };
  const settled = tx.phase === 'finalized' || tx.phase === 'execution-error'
    || tx.phase === 'failed' || tx.phase === 'unknown';

  // Bound to this exact hash and method. A historical postcondition must never
  // be recomputed after later state changes, nor displayed under a later
  // transaction.
  const showPostcondition = postconditionApplies(postcondition, tx, address);

  return (
    <section className="panel" aria-live="polite" aria-atomic="false">
      <h2 className="panel-title">
        {tx.method ? `${tx.method}() — ` : ''}{info.label}
      </h2>
      <p className="small">{info.detail}</p>

      {tx.error ? <p className="msg msg-error">{tx.error}</p> : null}

      <dl className="kv small">
        {tx.hash ? (
          <>
            <dt>Transaction</dt>
            <dd>
              <Ext href={explorerTx(tx.hash)}>{shortHash(tx.hash)}</Ext>
            </dd>
          </>
        ) : null}
        {tx.consensusStatus ? (
          <>
            <dt>Consensus status</dt>
            <dd className="mono">{tx.consensusStatus}</dd>
          </>
        ) : null}
        {tx.executionResult ? (
          <>
            <dt>Execution result</dt>
            <dd className="mono">{tx.executionResult}</dd>
          </>
        ) : null}
        {tx.startedAt && !settled ? (
          <>
            <dt>Elapsed</dt>
            <dd>
              {elapsed(tx.startedAt)}
              <span className="muted">
                {' '}(typically ~{Math.round(TYPICAL_SETTLE_SECONDS / 60)} minutes)
              </span>
            </dd>
          </>
        ) : null}
      </dl>

      {rejection ? (
        <div className="notice notice-warn">
          <p className="small" style={{ marginBottom: 0 }}>{rejection}</p>
        </div>
      ) : null}

      {showPostcondition && postcondition ? (
        <div
          className={postcondition.result.ok === false ? 'notice notice-danger' : 'notice'}
        >
          <p className="small" style={{ marginBottom: 0 }}>
            <strong>
              {postcondition.result.ok === true
                ? 'Verified on-chain: '
                : postcondition.result.ok === false
                  ? 'Not verified: '
                  : ''}
            </strong>
            {postcondition.result.detail}
          </p>
        </div>
      ) : null}

      {settled && onDismiss ? (
        <button type="button" className="btn" onClick={onDismiss}>Dismiss</button>
      ) : null}
    </section>
  );
}
