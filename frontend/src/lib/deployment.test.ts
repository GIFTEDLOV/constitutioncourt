import { describe, expect, it, vi } from 'vitest';
import { verifyDeployment } from './deployment';
import type { DeploymentDraft } from './registry';
import type { CaseState, EvidenceSources } from '../chain';

const HASH = `0x${'a'.repeat(64)}`;
const ADDRESS = '0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc';
const SENDER = '0x1111111111111111111111111111111111111111';
const RESPONDENT = '0x2222222222222222222222222222222222222222';
const SHA = 'f'.repeat(64);

const draft: DeploymentDraft = {
  hash: HASH,
  sender: SENDER,
  respondent: RESPONDENT,
  caseTitle: 'MC-2026-021',
  constitutionUrl: 'https://e/constitution.json',
  proposalUrl: 'https://e/proposal.json',
  voteRecordUrl: 'https://e/vote-record.json',
  noticeRecordUrl: 'https://e/notice-record.json',
  sourceSha256: SHA,
  startedAt: 1,
};

function goodState(over: Partial<CaseState> = {}): CaseState {
  return {
    case_title: draft.caseTitle,
    challenger: SENDER,
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

function goodSources(over: Partial<EvidenceSources> = {}): EvidenceSources {
  return {
    constitution_url: draft.constitutionUrl,
    proposal_url: draft.proposalUrl,
    vote_record_url: draft.voteRecordUrl,
    notice_record_url: draft.noticeRecordUrl,
    response_url: '',
    schema_version: 'constitutioncourt/evidence@1',
    ...over,
  };
}

function deps(over: Partial<Parameters<typeof verifyDeployment>[0]['deps']> = {}) {
  return {
    readDeployReceipt: vi.fn(async () => ({
      statusName: 'FINALIZED',
      executionResultName: 'FINISHED_WITH_RETURN',
      contractAddress: ADDRESS,
      recipient: null,
    })),
    getContractCode: vi.fn(async () => '# contract source'),
    readCase: vi.fn(async () => goodState()),
    readEvidenceSources: vi.fn(async () => goodSources()),
    sha256Hex: vi.fn(async () => SHA),
    ...over,
  } as NonNullable<Parameters<typeof verifyDeployment>[0]['deps']>;
}

const run = (d = deps()) => verifyDeployment({ hash: HASH, draft, deps: d });

describe('a fully correct deployment verifies', () => {
  it('passes all fourteen checks and exposes the address', async () => {
    const r = await run();
    expect(r.ok).toBe(true);
    expect(r.address).toBe(ADDRESS);
    expect(r.checks).toHaveLength(14);
    expect(r.checks.every((c) => c.ok === true)).toBe(true);
    expect(r.failed).toBeNull();
  });
});

describe('a ghost deployment is caught', () => {
  it('fails when the chain has no code at the named address', async () => {
    // App 1: a deploy finalized with FINISHED_WITH_RETURN, every validator
    // agreed, the receipt named an address — and no contract was ever there.
    const r = await run(deps({
      getContractCode: vi.fn(async () => { throw new Error('contract not found'); }),
    }));
    expect(r.ok).toBe(false);
    expect(r.failed?.id).toBe('code');
    expect(r.address).toBeNull();
    expect(r.claimedAddress).toBe(ADDRESS);
  });

  it('fails on empty contract code', async () => {
    const r = await run(deps({ getContractCode: vi.fn(async () => '') }));
    expect(r.failed?.id).toBe('code');
  });
});

describe('consensus alone is never enough', () => {
  it('fails when the transaction is not FINALIZED', async () => {
    const r = await run(deps({
      readDeployReceipt: vi.fn(async () => ({
        statusName: 'PENDING', executionResultName: '', contractAddress: null, recipient: null,
      })),
    }));
    expect(r.failed?.id).toBe('finalized');
  });

  it('fails on an execution error', async () => {
    const r = await run(deps({
      readDeployReceipt: vi.fn(async () => ({
        statusName: 'FINALIZED', executionResultName: 'FINISHED_WITH_ERROR',
        contractAddress: ADDRESS, recipient: null,
      })),
    }));
    expect(r.failed?.id).toBe('execution');
  });

  it('fails when the receipt names no address', async () => {
    const r = await run(deps({
      readDeployReceipt: vi.fn(async () => ({
        statusName: 'FINALIZED', executionResultName: 'FINISHED_WITH_RETURN',
        contractAddress: null, recipient: null,
      })),
    }));
    expect(r.failed?.id).toBe('address');
  });

  it('fails when the transaction cannot be read at all', async () => {
    const r = await run(deps({ readDeployReceipt: vi.fn(async () => null) }));
    expect(r.failed?.id).toBe('finalized');
  });
});

describe('the deployed contract must be the one we meant to deploy', () => {
  it('fails when the deployed source hashes differently', async () => {
    const r = await run(deps({ sha256Hex: vi.fn(async () => 'e'.repeat(64)) }));
    expect(r.failed?.id).toBe('source');
  });

  it('fails when the challenger is not the deploying wallet', async () => {
    const r = await run(deps({
      readCase: vi.fn(async () => goodState({ challenger: RESPONDENT })),
    }));
    expect(r.failed?.id).toBe('challenger');
    expect(r.failed?.detail).toMatch(/not your case/i);
  });

  it('fails when the respondent is not the submitted address', async () => {
    const r = await run(deps({
      readCase: vi.fn(async () => goodState({ respondent: SENDER })),
    }));
    expect(r.failed?.id).toBe('respondent');
  });

  it('fails when the case title does not match', async () => {
    const r = await run(deps({
      readCase: vi.fn(async () => goodState({ case_title: 'Something else' })),
    }));
    expect(r.failed?.id).toBe('title');
  });

  it.each([
    ['constitution_url', 'constitution'],
    ['proposal_url', 'proposal'],
    ['vote_record_url', 'vote record'],
    ['notice_record_url', 'notice record'],
  ])('fails when the on-chain %s differs', async (key) => {
    const r = await run(deps({
      readEvidenceSources: vi.fn(async () => goodSources({ [key]: 'https://attacker/x.json' })),
    }));
    expect(r.failed?.id).toBe('evidence');
  });

  it('fails when get_evidence_sources does not answer', async () => {
    const r = await run(deps({
      readEvidenceSources: vi.fn(async () => { throw new Error('no'); }),
    }));
    expect(r.failed?.id).toBe('evidence');
  });
});

describe('a fresh case must be genuinely fresh', () => {
  it('fails when the status is not OPEN', async () => {
    const r = await run(deps({ readCase: vi.fn(async () => goodState({ status: 'RULED' })) }));
    expect(r.failed?.id).toBe('status');
  });

  it('fails when a response is already recorded', async () => {
    const r = await run(deps({
      readEvidenceSources: vi.fn(async () => goodSources({ response_url: 'https://e/r.json' })),
    }));
    expect(r.failed?.id).toBe('response');
  });

  it('fails when a ruling is already recorded', async () => {
    const r = await run(deps({
      readCase: vi.fn(async () => goodState({ outcome: 'COMPLIANT', final_status: 'CERTIFIED' })),
    }));
    expect(r.failed?.id).toBe('ruling');
  });

  it('fails when created_at is missing', async () => {
    const r = await run(deps({ readCase: vi.fn(async () => goodState({ created_at: '' })) }));
    expect(r.failed?.id).toBe('created');
  });

  it('fails when get_state does not answer', async () => {
    const r = await run(deps({ readCase: vi.fn(async () => { throw new Error('no'); }) }));
    expect(r.failed?.id).toBe('state');
  });
});

describe('checks after a failure are reported as not reached, never as passing', () => {
  it('marks later checks null', async () => {
    const r = await run(deps({ getContractCode: vi.fn(async () => '') }));
    const later = r.checks.filter((c) => ['state', 'challenger', 'status'].includes(c.id));
    expect(later.every((c) => c.ok === null)).toBe(true);
    expect(later.every((c) => c.detail.includes('Not reached'))).toBe(true);
  });

  it('never exposes an address for an unverified deployment', async () => {
    const r = await run(deps({ readCase: vi.fn(async () => goodState({ status: 'RULED' })) }));
    expect(r.address).toBeNull();
    expect(r.state).toBeNull();
  });
});

describe('title comparison uses the trimmed intent, as the contract does', () => {
  it('passes when the draft had surrounding whitespace', async () => {
    const padded = { ...draft, caseTitle: '  MC-2026-021  ' };
    const r = await verifyDeployment({ hash: HASH, draft: padded, deps: deps() });
    expect(r.ok).toBe(true);
  });
});
