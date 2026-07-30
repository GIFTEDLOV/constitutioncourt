import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TxPanel } from './TxPanel';
import type { PostconditionRecord } from '../lib/postconditions';

const ADDRESS = '0xAAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA';
const HASH_A = `0x${'a'.repeat(64)}`;
const HASH_B = `0x${'b'.repeat(64)}`;

const record = (over: Partial<PostconditionRecord> = {}): PostconditionRecord => ({
  hash: HASH_A,
  method: 'submit_response',
  address: ADDRESS,
  at: 1,
  result: { ok: true, detail: 'Response recorded at 2026-07-30T01:00:00Z.' },
  ...over,
});

describe('a hash is reported as submitted, never as success', () => {
  it('says explicitly that submission is not success', () => {
    render(
      <TxPanel
        tx={{ phase: 'submitted', hash: HASH_A, method: 'rule' }}
        address={ADDRESS}
        postcondition={null}
      />,
    );
    expect(screen.getByText(/this is not success/i)).toBeTruthy();
  });
});

describe('execution errors render as failure', () => {
  it('labels FINISHED_WITH_ERROR a failure, not an acceptance', () => {
    render(
      <TxPanel
        tx={{
          phase: 'execution-error', hash: HASH_A, method: 'rule',
          consensusStatus: 'ACCEPTED', executionResult: 'FINISHED_WITH_ERROR',
          error: 'Consensus accepted the transaction but contract execution failed.',
        }}
        address={ADDRESS}
        postcondition={null}
      />,
    );
    expect(screen.getByText(/failed — execution error/i)).toBeTruthy();
    expect(screen.getByText(/not a partial success/i)).toBeTruthy();
  });

  it('renders a rejection summary explaining nothing changed', () => {
    render(
      <TxPanel
        tx={{ phase: 'execution-error', hash: HASH_A, method: 'rule' }}
        address={ADDRESS}
        postcondition={null}
        rejection="This case was already ruled. The duplicate was safely rejected: no state changed."
      />,
    );
    expect(screen.getByText(/safely rejected/i)).toBeTruthy();
  });
});

describe('an unknown outcome tells the reader not to retry blindly', () => {
  it('surfaces the confirm-before-retry instruction', () => {
    render(
      <TxPanel
        tx={{ phase: 'unknown', hash: HASH_A, method: 'rule', error: 'no execution result' }}
        address={ADDRESS}
        postcondition={null}
      />,
    );
    expect(screen.getByText(/do not retry until you have confirmed/i)).toBeTruthy();
  });
});

describe('postconditions are bound to the transaction on screen', () => {
  it('shows a postcondition for its own hash and method', () => {
    render(
      <TxPanel
        tx={{ phase: 'finalized', hash: HASH_A, method: 'submit_response' }}
        address={ADDRESS}
        postcondition={record()}
      />,
    );
    expect(screen.getByText(/verified on-chain/i)).toBeTruthy();
  });

  it('does NOT show a postcondition from a different transaction', () => {
    render(
      <TxPanel
        tx={{ phase: 'finalized', hash: HASH_B, method: 'submit_response' }}
        address={ADDRESS}
        postcondition={record()}
      />,
    );
    expect(screen.queryByText(/verified on-chain/i)).toBeNull();
  });

  it('does NOT show a submit_response postcondition under a rule transaction', () => {
    // The historical-result bug: an earlier action's verdict appearing beneath
    // a later, unrelated transaction.
    render(
      <TxPanel
        tx={{ phase: 'finalized', hash: HASH_A, method: 'rule' }}
        address={ADDRESS}
        postcondition={record()}
      />,
    );
    expect(screen.queryByText(/verified on-chain/i)).toBeNull();
    expect(screen.queryByText(/Response recorded/i)).toBeNull();
  });

  it('does NOT show a postcondition belonging to another contract', () => {
    render(
      <TxPanel
        tx={{ phase: 'finalized', hash: HASH_A, method: 'submit_response' }}
        address="0xBBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB"
        postcondition={record()}
      />,
    );
    expect(screen.queryByText(/verified on-chain/i)).toBeNull();
  });

  it('renders a failed postcondition as not verified', () => {
    render(
      <TxPanel
        tx={{ phase: 'finalized', hash: HASH_A, method: 'submit_response' }}
        address={ADDRESS}
        postcondition={record({ result: { ok: false, detail: 'Expected RESPONDED, found OPEN.' } })}
      />,
    );
    expect(screen.getByText(/not verified/i)).toBeTruthy();
  });
});

describe('idle renders nothing', () => {
  it('returns null with no transaction', () => {
    const { container } = render(
      <TxPanel tx={{ phase: 'idle' }} address={ADDRESS} postcondition={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
