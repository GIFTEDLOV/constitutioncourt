import { describe, expect, it } from 'vitest';
import {
  checkPostcondition, postconditionApplies, rejectionSummary,
  type PostconditionRecord,
} from './postconditions';
import type { CaseState } from '../chain';

const ADDRESS = '0xAAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA';
const HASH_A = `0x${'a'.repeat(64)}`;
const HASH_B = `0x${'b'.repeat(64)}`;

function state(over: Partial<CaseState> = {}): CaseState {
  return {
    case_title: 'MC-2026-021',
    challenger: '0x1111111111111111111111111111111111111111',
    respondent: '0x2222222222222222222222222222222222222222',
    status: 'OPEN',
    final_status: '',
    outcome: '',
    violated_rule_ids: [],
    evidence_citations: [],
    reasoning: '',
    created_at: '2026-07-30T00:00:00Z',
    responded_at: '',
    ruled_at: '',
    has_response: false,
    ...over,
  };
}

describe('submit_response postcondition', () => {
  it('passes when the case actually reached RESPONDED', () => {
    const st = state({ status: 'RESPONDED', has_response: true, responded_at: '2026-07-30T01:00:00Z' });
    const r = checkPostcondition({ method: 'submit_response', st });
    expect(r.ok).toBe(true);
  });

  it('fails when the status did not move', () => {
    const r = checkPostcondition({ method: 'submit_response', st: state() });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/found OPEN/);
  });

  it('fails when RESPONDED but no response is recorded', () => {
    const st = state({ status: 'RESPONDED', has_response: false, responded_at: '2026-07-30T01:00:00Z' });
    expect(checkPostcondition({ method: 'submit_response', st }).ok).toBe(false);
  });

  it('fails when the timestamp is missing', () => {
    const st = state({ status: 'RESPONDED', has_response: true, responded_at: '' });
    expect(checkPostcondition({ method: 'submit_response', st }).ok).toBe(false);
  });
});

describe('rule postcondition', () => {
  const ruled = (over: Partial<CaseState> = {}) => state({
    status: 'RULED', outcome: 'COMPLIANT', final_status: 'CERTIFIED',
    ruled_at: '2026-07-30T02:00:00Z', ...over,
  });

  it('passes on a coherent COMPLIANT ruling', () => {
    expect(checkPostcondition({ method: 'rule', st: ruled() }).ok).toBe(true);
  });

  it('passes on a coherent NON_COMPLIANT ruling', () => {
    const st = ruled({
      outcome: 'NON_COMPLIANT', final_status: 'REJECTED', violated_rule_ids: ['ART-4.3'],
    });
    expect(checkPostcondition({ method: 'rule', st }).ok).toBe(true);
  });

  it('fails when the status is not RULED', () => {
    expect(checkPostcondition({ method: 'rule', st: state() }).ok).toBe(false);
  });

  it('rejects an outcome outside the three', () => {
    const r = checkPostcondition({ method: 'rule', st: ruled({ outcome: 'MAYBE' }) });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/not one of the three/i);
  });

  it.each([
    ['COMPLIANT', 'REJECTED'],
    ['NON_COMPLIANT', 'CERTIFIED'],
    ['INSUFFICIENT_EVIDENCE', 'CERTIFIED'],
  ])('rejects %s recorded against the wrong final status %s', (outcome, final) => {
    const st = ruled({
      outcome, final_status: final,
      violated_rule_ids: outcome === 'NON_COMPLIANT' ? ['ART-4.3'] : [],
    });
    const r = checkPostcondition({ method: 'rule', st });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/should map to/i);
  });

  it('rejects NON_COMPLIANT that cites nothing', () => {
    const st = ruled({ outcome: 'NON_COMPLIANT', final_status: 'REJECTED', violated_rule_ids: [] });
    expect(checkPostcondition({ method: 'rule', st }).ok).toBe(false);
  });

  it('rejects a COMPLIANT ruling that cites violations', () => {
    const st = ruled({ violated_rule_ids: ['ART-4.3'] });
    expect(checkPostcondition({ method: 'rule', st }).ok).toBe(false);
  });

  it('rejects duplicate rule ids — the contract stores a set', () => {
    const st = ruled({
      outcome: 'NON_COMPLIANT', final_status: 'REJECTED',
      violated_rule_ids: ['ART-4.3', 'ART-4.3'],
    });
    const r = checkPostcondition({ method: 'rule', st });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/duplicate/i);
  });

  it('fails when ruled_at is missing', () => {
    expect(checkPostcondition({ method: 'rule', st: ruled({ ruled_at: '' }) }).ok).toBe(false);
  });
});

describe('unknown methods assert nothing rather than passing', () => {
  it('returns null', () => {
    expect(checkPostcondition({ method: 'nonexistent', st: state() }).ok).toBeNull();
  });
});

describe('rejection summaries explain that nothing changed', () => {
  it('describes a duplicate response as safely rejected', () => {
    const s = rejectionSummary('submit_response', state({ status: 'RESPONDED', has_response: true }));
    expect(s).toMatch(/safely rejected/i);
    expect(s).toMatch(/no state changed/i);
    expect(s).toMatch(/exactly one response/i);
  });

  it('describes a duplicate ruling as safely rejected and points at the appeal', () => {
    const s = rejectionSummary('rule', state({ status: 'RULED', outcome: 'COMPLIANT' }));
    expect(s).toMatch(/already ruled/i);
    expect(s).toMatch(/safely rejected/i);
    expect(s).toMatch(/native transaction appeal/i);
  });

  it('explains a response arriving after a ruling', () => {
    expect(rejectionSummary('submit_response', state({ status: 'RULED' }))).toMatch(/freezes/i);
  });

  it('still says something useful with no state', () => {
    expect(rejectionSummary('rule', null)).toMatch(/confirm the case status/i);
  });
});

describe('postconditions are bound to an exact hash and method', () => {
  const record: PostconditionRecord = {
    hash: HASH_A,
    method: 'submit_response',
    address: ADDRESS,
    at: 1,
    result: { ok: true, detail: 'Response recorded.' },
  };

  it('applies to its own transaction', () => {
    expect(postconditionApplies(record, { hash: HASH_A, method: 'submit_response' }, ADDRESS))
      .toBe(true);
  });

  it('does NOT apply to a different transaction hash', () => {
    expect(postconditionApplies(record, { hash: HASH_B, method: 'submit_response' }, ADDRESS))
      .toBe(false);
  });

  it('does NOT apply under a different method — the historical-result bug', () => {
    // A submit_response postcondition must never be displayed beneath a later
    // rule() transaction.
    expect(postconditionApplies(record, { hash: HASH_A, method: 'rule' }, ADDRESS)).toBe(false);
  });

  it('does NOT apply after the contract address changes', () => {
    const other = '0xBBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB';
    expect(postconditionApplies(record, { hash: HASH_A, method: 'submit_response' }, other))
      .toBe(false);
  });

  it('does not apply when there is no transaction on screen', () => {
    expect(postconditionApplies(record, null, ADDRESS)).toBe(false);
    expect(postconditionApplies(record, { method: 'submit_response' }, ADDRESS)).toBe(false);
  });

  it('does not apply when there is no record', () => {
    expect(postconditionApplies(null, { hash: HASH_A, method: 'rule' }, ADDRESS)).toBe(false);
  });

  it('matches the address case-insensitively', () => {
    expect(postconditionApplies(
      record, { hash: HASH_A, method: 'submit_response' }, ADDRESS.toLowerCase(),
    )).toBe(true);
  });
});
