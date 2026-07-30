/**
 * SDK call-shape tests — what this app hands to genlayer-js.
 *
 * These exist because of a bug the Stage 4 suite did not catch and the Stage 5
 * audit did: `getContractCode` takes the address **positionally**, but the code
 * called it with `{ address }` behind a hand-written cast, so TypeScript could
 * not see the mismatch. `verifyDeployment` treats a throw from that call as
 * "no contract exists", so every genuine deployment would have been reported as
 * a ghost deployment — a failure only a live deploy would have surfaced.
 *
 * The generalisable lesson: wherever the app casts past the SDK's own types,
 * something must assert the real shape. genlayer-js is mocked here, so these
 * assert the arguments *we* pass and never touch a network.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Typed with their real parameters so `mock.calls[0][0]` is inspectable and so
// a wrong argument shape is visible to TypeScript, not just at runtime.
const getContractCode = vi.fn(async (_a: unknown): Promise<unknown> => '# deployed source');
const readContract = vi.fn(async (_a: unknown): Promise<unknown> => ({}));
const writeContract = vi.fn(async (_a: unknown): Promise<unknown> => `0x${'a'.repeat(64)}`);
const deployContract = vi.fn(async (_a: unknown): Promise<unknown> => `0x${'b'.repeat(64)}`);
const getTransaction = vi.fn(async (_a: unknown): Promise<unknown> => ({}));

vi.mock('genlayer-js', async (orig) => {
  const actual = await orig<typeof import('genlayer-js')>();
  return {
    ...actual,
    createClient: () => ({
      getContractCode, readContract, writeContract, deployContract, getTransaction,
    }),
  };
});

const chain = await import('./chain');

const ADDRESS = '0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc';
const RESPONDENT = '0x2222222222222222222222222222222222222222';

beforeEach(() => {
  getContractCode.mockClear();
  readContract.mockClear();
  writeContract.mockClear();
  deployContract.mockClear();
  getTransaction.mockClear();
});

describe('getContractCode is called positionally', () => {
  it('passes a bare address string, not an object', async () => {
    await chain.getContractCode(ADDRESS);

    expect(getContractCode).toHaveBeenCalledTimes(1);
    const arg = getContractCode.mock.calls[0]?.[0];
    // The SDK wraps this into [{ address }] itself. Passing { address } here
    // produced params[0].address === { address: '0x…' }, which the node rejects.
    expect(typeof arg).toBe('string');
    expect(arg).toBe(ADDRESS);
    expect(arg).not.toEqual({ address: ADDRESS });
  });

  it('coerces a non-string result rather than returning it raw', async () => {
    getContractCode.mockResolvedValueOnce(undefined as never);
    expect(await chain.getContractCode(ADDRESS)).toBe('');
  });
});

describe('view reads pass the locked method names and an empty arg list', () => {
  it('get_state', async () => {
    readContract.mockResolvedValueOnce({ status: 'OPEN' } as never);
    await chain.readCase(ADDRESS);
    const arg = readContract.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.functionName).toBe('get_state');
    expect(arg.address).toBe(ADDRESS);
    expect(arg.args).toEqual([]);
    expect(arg.jsonSafeReturn).toBe(true);
  });

  it('get_evidence_sources', async () => {
    readContract.mockResolvedValueOnce({ constitution_url: 'x' } as never);
    await chain.readEvidenceSources(ADDRESS);
    const arg = readContract.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.functionName).toBe('get_evidence_sources');
    expect(arg.jsonSafeReturn).toBe(true);
  });
});

describe('writes always carry an explicit zero value', () => {
  it('sendTx passes value: 0n — the SDK requires it and this contract is never payable', async () => {
    await chain.sendTx({
      address: ADDRESS, method: 'rule', args: [], account: RESPONDENT, provider: {},
    });
    const arg = writeContract.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.value).toBe(0n);
    expect(arg.functionName).toBe('rule');
    expect(arg.args).toEqual([]);
  });

  it('submit_response carries its single URL argument', async () => {
    await chain.sendTx({
      address: ADDRESS,
      method: 'submit_response',
      args: ['https://evidence.example/r.json'],
      account: RESPONDENT,
      provider: {},
    });
    const arg = writeContract.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.args).toEqual(['https://evidence.example/r.json']);
  });
});

describe('deploy passes the source and six positional constructor arguments', () => {
  it('in the contract’s locked order, with the respondent as a calldata Address', async () => {
    await chain.deployCase('# source bytes', {
      respondent: RESPONDENT,
      caseTitle: 'MC-2026-021',
      constitutionUrl: 'https://evidence.example/c.json',
      proposalUrl: 'https://evidence.example/p.json',
      voteRecordUrl: 'https://evidence.example/v.json',
      noticeRecordUrl: 'https://evidence.example/n.json',
    }, RESPONDENT, {});

    const arg = deployContract.mock.calls[0]?.[0] as { code: string; args: unknown[] };
    expect(arg.code).toBe('# source bytes');
    expect(arg.args).toHaveLength(6);

    // Argument 0 must be an Address object, never the hex string.
    expect(typeof arg.args[0]).not.toBe('string');
    expect(arg.args[0]).toHaveProperty('bytes');

    // Order matches __init__(respondent, case_title, constitution, proposal,
    // vote_record, notice_record).
    expect(arg.args[1]).toBe('MC-2026-021');
    expect(arg.args[2]).toBe('https://evidence.example/c.json');
    expect(arg.args[3]).toBe('https://evidence.example/p.json');
    expect(arg.args[4]).toBe('https://evidence.example/v.json');
    expect(arg.args[5]).toBe('https://evidence.example/n.json');
  });

  it('refuses to deploy with a malformed respondent, before any signature', async () => {
    await expect(chain.deployCase('# source', {
      respondent: '0x123',
      caseTitle: 't',
      constitutionUrl: 'c', proposalUrl: 'p', voteRecordUrl: 'v', noticeRecordUrl: 'n',
    }, RESPONDENT, {})).rejects.toThrow(/Not a 20-byte address/);
    expect(deployContract).not.toHaveBeenCalled();
  });
});

describe('deploy receipt parsing', () => {
  it('takes the address from txDataDecoded and never from recipient', async () => {
    getTransaction.mockResolvedValueOnce({
      statusName: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_RETURN',
      txDataDecoded: { contractAddress: ADDRESS },
      // A deploy is submitted with recipient: zeroAddress, so this is never the
      // contract. It is carried for diagnostics only.
      recipient: '0x0000000000000000000000000000000000000000',
    } as never);

    const receipt = await chain.readDeployReceipt(`0x${'a'.repeat(64)}`);
    expect(receipt?.contractAddress).toBe(ADDRESS);
    expect(receipt?.recipient).toMatch(/^0x0{40}$/);
  });

  it('reports no contract address when txDataDecoded carries none', async () => {
    getTransaction.mockResolvedValueOnce({
      statusName: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_RETURN',
      recipient: '0x0000000000000000000000000000000000000000',
    } as never);

    const receipt = await chain.readDeployReceipt(`0x${'a'.repeat(64)}`);
    // Crucially null, not the zero address.
    expect(receipt?.contractAddress).toBeNull();
  });

  it('returns null when the transaction cannot be read', async () => {
    getTransaction.mockRejectedValueOnce(new Error('not indexed'));
    expect(await chain.readDeployReceipt(`0x${'a'.repeat(64)}`)).toBeNull();
  });
});
