import { describe, expect, it } from 'vitest';
import { preflightAction } from './preflight';
import type { CaseState } from '../chain';

const RESPONDENT = '0x2222222222222222222222222222222222222222';

function state(over: Partial<CaseState> = {}): CaseState {
  return {
    case_title: 'MC-2026-021',
    challenger: '0x1111111111111111111111111111111111111111',
    respondent: RESPONDENT,
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

describe('preflight passes a still-valid action', () => {
  it('returns the freshly derived action', () => {
    const r = preflightAction({
      method: 'submit_response',
      live: { ok: true },
      ctx: { st: state(), role: 'respondent' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.method).toBe('submit_response');
  });
});

describe('preflight blocks a stale tab', () => {
  it('refuses submit_response when the case has already moved to RESPONDED', () => {
    // The exact stale-tab shape: this tab still shows OPEN, the contract does not.
    const r = preflightAction({
      method: 'submit_response',
      live: { ok: true },
      ctx: { st: state({ status: 'RESPONDED', has_response: true }), role: 'respondent' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/no longer available/i);
      expect(r.reason).toMatch(/RESPONDED/);
      expect(r.reason).toMatch(/nothing was signed/i);
    }
  });

  it('refuses rule() when the case is already RULED', () => {
    const r = preflightAction({
      method: 'rule',
      live: { ok: true },
      ctx: {
        st: state({ status: 'RULED', outcome: 'COMPLIANT', final_status: 'CERTIFIED' }),
        role: 'challenger',
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no longer available/i);
  });

  it('names the outcome when there is one, so the reason is checkable', () => {
    const r = preflightAction({
      method: 'rule',
      live: { ok: true },
      ctx: {
        st: state({ status: 'RULED', outcome: 'NON_COMPLIANT', final_status: 'REJECTED' }),
        role: 'observer',
      },
    });
    if (!r.ok) expect(r.reason).toMatch(/NON_COMPLIANT/);
  });
});

describe('preflight refuses to guess when state is unreadable', () => {
  it('blocks when the read failed', () => {
    const r = preflightAction({
      method: 'rule',
      live: { ok: false, error: 'RPC timeout' },
      ctx: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/could not be confirmed/i);
      expect(r.reason).toMatch(/RPC timeout/);
      expect(r.reason).toMatch(/nothing was signed and nothing was spent/i);
    }
  });

  it('blocks when there is no context even if the read claims success', () => {
    const r = preflightAction({ method: 'rule', live: { ok: true }, ctx: null });
    expect(r.ok).toBe(false);
  });
});

describe('preflight enforces the role gate at the last moment', () => {
  it('refuses submit_response for the challenger', () => {
    const r = preflightAction({
      method: 'submit_response',
      live: { ok: true },
      ctx: { st: state(), role: 'challenger' },
    });
    expect(r.ok).toBe(false);
  });

  it('refuses everything to a disconnected wallet', () => {
    const r = preflightAction({
      method: 'rule',
      live: { ok: true },
      ctx: { st: state(), role: 'disconnected' },
    });
    expect(r.ok).toBe(false);
  });
});
