import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAll, clearPendingTx, getCase, getDraft, getPendingTx, listCases,
  pendingDrafts, removeCase, saveDraft, setPendingTx, upsertCase,
  type DeploymentDraft,
} from './registry';

const A = '0xAAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA';
const B = '0xBBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB';

beforeEach(() => {
  localStorage.clear();
  clearAll();
});

describe('case bookmarks', () => {
  it('starts empty', () => {
    expect(listCases()).toEqual([]);
  });

  it('records a case and reads it back', () => {
    upsertCase({ address: A, title: 'MC-1', via: 'created' });
    expect(listCases()).toHaveLength(1);
    expect(getCase(A)?.title).toBe('MC-1');
  });

  it('finds a case regardless of address casing', () => {
    upsertCase({ address: A, title: 'MC-1' });
    expect(getCase(A.toLowerCase())?.title).toBe('MC-1');
  });

  it('merges an update rather than duplicating', () => {
    upsertCase({ address: A, title: 'MC-1', via: 'created' });
    upsertCase({ address: A, lastStatus: 'RULED' });
    const list = listCases();
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe('MC-1');
    expect(list[0]!.lastStatus).toBe('RULED');
  });

  it('lists newest first', () => {
    upsertCase({ address: A, addedAt: 1000 });
    upsertCase({ address: B, addedAt: 2000 });
    expect(listCases()[0]!.address).toBe(B);
  });

  it('forgets a case', () => {
    upsertCase({ address: A });
    removeCase(A);
    expect(listCases()).toEqual([]);
  });
});

describe('pending transactions are persisted before polling', () => {
  it('stores and reads a pending hash', () => {
    upsertCase({ address: A });
    setPendingTx(A, { hash: '0xabc', method: 'rule', startedAt: 5 });
    expect(getPendingTx(A)).toEqual({ hash: '0xabc', method: 'rule', startedAt: 5 });
  });

  it('survives a reload — the point of persisting it', () => {
    setPendingTx(A, { hash: '0xabc', method: 'submit_response', startedAt: 5 });
    // A fresh read of localStorage, as a reloaded tab would do.
    expect(getPendingTx(A)?.method).toBe('submit_response');
  });

  it('clears once the transaction settles', () => {
    setPendingTx(A, { hash: '0xabc', method: 'rule', startedAt: 5 });
    clearPendingTx(A);
    expect(getPendingTx(A)).toBeUndefined();
  });

  it('clearing an unknown address is a no-op, not a crash', () => {
    expect(() => clearPendingTx(B)).not.toThrow();
  });

  it('keeps pending transactions per contract', () => {
    setPendingTx(A, { hash: '0xaaa', method: 'rule', startedAt: 1 });
    setPendingTx(B, { hash: '0xbbb', method: 'rule', startedAt: 2 });
    expect(getPendingTx(A)?.hash).toBe('0xaaa');
    expect(getPendingTx(B)?.hash).toBe('0xbbb');
  });
});

describe('deployment drafts', () => {
  const draft: DeploymentDraft = {
    sender: A,
    respondent: B,
    caseTitle: 'MC-1',
    constitutionUrl: 'https://e/c.json',
    proposalUrl: 'https://e/p.json',
    voteRecordUrl: 'https://e/v.json',
    noticeRecordUrl: 'https://e/n.json',
    sourceSha256: 'f'.repeat(64),
    startedAt: 100,
  };

  it('saves an intent before a hash exists', () => {
    saveDraft(draft);
    expect(pendingDrafts()).toHaveLength(0); // no hash yet
  });

  it('updates the same draft once the hash arrives', () => {
    saveDraft(draft);
    saveDraft({ ...draft, hash: '0xdead' });
    expect(pendingDrafts()).toHaveLength(1);
    expect(getDraft('0xdead')?.caseTitle).toBe('MC-1');
  });

  it('keeps the full intent, so verification compares against what we meant', () => {
    saveDraft({ ...draft, hash: '0xdead' });
    const d = getDraft('0xdead');
    expect(d?.constitutionUrl).toBe('https://e/c.json');
    expect(d?.sourceSha256).toBe('f'.repeat(64));
  });

  it('bounds growth so a busy browser does not accumulate forever', () => {
    for (let i = 0; i < 40; i += 1) {
      saveDraft({ ...draft, hash: `0x${i}`, startedAt: i });
    }
    expect(pendingDrafts().length).toBeLessThanOrEqual(25);
  });
});

describe('corrupt storage never bricks the app', () => {
  it('treats unreadable JSON as an empty registry', () => {
    localStorage.setItem('constitutioncourt:v1', '{not json');
    expect(listCases()).toEqual([]);
  });

  it('treats a wrong-shaped payload as empty', () => {
    localStorage.setItem('constitutioncourt:v1', JSON.stringify({ cases: 'nope' }));
    expect(listCases()).toEqual([]);
  });
});
