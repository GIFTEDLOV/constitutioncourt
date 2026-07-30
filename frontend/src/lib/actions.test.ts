import { describe, expect, it } from 'vitest';
import { availableActions, roleFor, unavailableReason } from './actions';
import type { CaseState } from '../chain';

const CHALLENGER = '0x1111111111111111111111111111111111111111';
const RESPONDENT = '0x2222222222222222222222222222222222222222';
const STRANGER = '0x3333333333333333333333333333333333333333';

function state(over: Partial<CaseState> = {}): CaseState {
  return {
    case_title: 'MC-2026-021',
    challenger: CHALLENGER,
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

const methods = (st: CaseState, role: ReturnType<typeof roleFor>) =>
  availableActions({ st, role }).map((a) => a.method);

describe('role detection comes from live contract state', () => {
  it('identifies the challenger', () => {
    expect(roleFor(CHALLENGER, state())).toBe('challenger');
  });
  it('identifies the respondent', () => {
    expect(roleFor(RESPONDENT, state())).toBe('respondent');
  });
  it('identifies an unrelated wallet as an observer', () => {
    expect(roleFor(STRANGER, state())).toBe('observer');
  });
  it('is case-insensitive about address casing', () => {
    expect(roleFor(RESPONDENT.toUpperCase().replace('0X', '0x'), state())).toBe('respondent');
  });
  it('reports no wallet as disconnected', () => {
    expect(roleFor(null, state())).toBe('disconnected');
  });
});

describe('submit_response is respondent-only and OPEN-only', () => {
  it('is offered to the respondent while OPEN', () => {
    expect(methods(state(), 'respondent')).toContain('submit_response');
  });

  it('is NOT offered to the challenger', () => {
    expect(methods(state(), 'challenger')).not.toContain('submit_response');
  });

  it('is NOT offered to a stranger', () => {
    expect(methods(state(), 'observer')).not.toContain('submit_response');
  });

  it('is NOT offered once a response exists', () => {
    const st = state({ status: 'RESPONDED', has_response: true });
    expect(methods(st, 'respondent')).not.toContain('submit_response');
  });

  it('is NOT offered after RULED', () => {
    const st = state({ status: 'RULED', outcome: 'COMPLIANT', final_status: 'CERTIFIED' });
    expect(methods(st, 'respondent')).not.toContain('submit_response');
  });

  it('explains why it is hidden after a response exists', () => {
    const st = state({ status: 'RESPONDED', has_response: true });
    expect(unavailableReason({ st, role: 'respondent' }, 'submit_response'))
      .toMatch(/exactly one/i);
  });

  it('explains why it is hidden for a non-respondent', () => {
    expect(unavailableReason({ st: state(), role: 'challenger' }, 'submit_response'))
      .toMatch(/only the respondent/i);
  });
});

describe('rule is permissionless from OPEN and from RESPONDED', () => {
  it.each(['challenger', 'respondent', 'observer'] as const)(
    'is offered to %s while OPEN',
    (role) => {
      expect(methods(state(), role)).toContain('rule');
    },
  );

  it.each(['challenger', 'respondent', 'observer'] as const)(
    'is offered to %s while RESPONDED',
    (role) => {
      const st = state({ status: 'RESPONDED', has_response: true });
      expect(methods(st, role)).toContain('rule');
    },
  );

  it('is flagged permissionless so the UI can say so', () => {
    const action = availableActions({ st: state(), role: 'observer' })
      .find((a) => a.method === 'rule');
    expect(action?.permissionless).toBe(true);
  });

  it('is NOT offered after RULED — rulings are final', () => {
    const st = state({ status: 'RULED', outcome: 'COMPLIANT', final_status: 'CERTIFIED' });
    expect(methods(st, 'challenger')).not.toContain('rule');
  });

  it('points at the native appeal once ruled', () => {
    const st = state({ status: 'RULED', outcome: 'COMPLIANT', final_status: 'CERTIFIED' });
    expect(unavailableReason({ st, role: 'challenger' }, 'rule')).toMatch(/native transaction appeal/i);
  });
});

describe('no state-changing action survives RULED, for anyone', () => {
  it.each(['challenger', 'respondent', 'observer'] as const)(
    'offers nothing to %s',
    (role) => {
      const st = state({ status: 'RULED', outcome: 'NON_COMPLIANT', final_status: 'REJECTED' });
      expect(availableActions({ st, role })).toHaveLength(0);
    },
  );
});

describe('read-only observer mode', () => {
  it('offers nothing at all without a wallet, in any state', () => {
    for (const status of ['OPEN', 'RESPONDED', 'RULED']) {
      expect(availableActions({ st: state({ status }), role: 'disconnected' })).toHaveLength(0);
    }
  });

  it('still explains what a wallet would enable', () => {
    expect(unavailableReason({ st: state(), role: 'disconnected' }, 'rule'))
      .toMatch(/permissionless/i);
  });
});
