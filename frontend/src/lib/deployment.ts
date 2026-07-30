/**
 * Deployment verification.
 *
 * A finalized deploy transaction is NOT proof that a case exists. In App 1 a
 * deploy finalized with `FINISHED_WITH_RETURN`, every validator agreed, and the
 * receipt named a contract address — yet the chain had no contract there, hours
 * later. The receipt was right about what it claimed; there was simply nothing
 * at the address.
 *
 * So a deployment is never inferred from consensus alone. Every check below
 * must hold before a case is treated as real:
 *
 *   1.  consensus status is FINALIZED
 *   2.  execution result is FINISHED_WITH_RETURN
 *   3.  an address is named by the finalized receipt
 *   4.  contract code exists at that address
 *   5.  the deployed source hashes to the source we submitted
 *   6.  get_state answers
 *   7.  challenger is the deploying wallet
 *   8.  respondent is the address we submitted
 *   9.  case title matches
 *   10. all four evidence URLs match exactly
 *   11. status is OPEN
 *   12. response URL is empty
 *   13. outcome and final status are empty
 *   14. created_at is populated
 *
 * Anything less is reported as unverified, with the failing check named.
 * Checks after a failure are reported as "not reached", never as passing, so
 * the panel can never imply more was proven than actually was.
 */

import {
  getContractCode, readCase, readDeployReceipt, readEvidenceSources, type CaseState,
} from '../chain';
import { sha256Hex } from './hash';
import type { DeploymentDraft } from './registry';
import { sameAddress } from './validation';

export type DeployCheckId =
  | 'finalized' | 'execution' | 'address' | 'code' | 'source' | 'state'
  | 'challenger' | 'respondent' | 'title' | 'evidence'
  | 'status' | 'response' | 'ruling' | 'created';

export interface DeployCheck {
  id: DeployCheckId;
  label: string;
  /** null = not reached, because an earlier check already failed. */
  ok: boolean | null;
  detail: string;
}

export interface DeployVerification {
  ok: boolean;
  /** Set only when every check passed. Never expose an unverified address as a case. */
  address: string | null;
  /** The address the receipt named, verified or not — for diagnostics and explorer links. */
  claimedAddress: string | null;
  state: CaseState | null;
  consensusStatus: string;
  executionResult: string;
  checks: DeployCheck[];
  failed: DeployCheck | null;
}

const LABELS: Record<DeployCheckId, string> = {
  finalized: 'Consensus finalized',
  execution: 'Execution finished with return',
  address: 'Contract address recovered from the receipt',
  code: 'Contract code present on-chain',
  source: 'Deployed source matches the source we submitted',
  state: 'Case state readable',
  challenger: 'Challenger matches the connected wallet',
  respondent: 'Respondent matches the submitted address',
  title: 'Case title matches',
  evidence: 'All four evidence URLs match exactly',
  status: 'Status is OPEN',
  response: 'Response URL is empty',
  ruling: 'Outcome and final status are empty',
  created: 'created_at is populated',
};

const ORDER: DeployCheckId[] = [
  'finalized', 'execution', 'address', 'code', 'source', 'state',
  'challenger', 'respondent', 'title', 'evidence',
  'status', 'response', 'ruling', 'created',
];

export interface VerifyInput {
  hash: string;
  draft: DeploymentDraft;
  /** Injected for tests; defaults to the real chain readers. */
  deps?: {
    readDeployReceipt: typeof readDeployReceipt;
    getContractCode: typeof getContractCode;
    readCase: typeof readCase;
    readEvidenceSources: typeof readEvidenceSources;
    sha256Hex: typeof sha256Hex;
  };
}

export async function verifyDeployment(input: VerifyInput): Promise<DeployVerification> {
  const { draft } = input;
  const deps = input.deps ?? {
    readDeployReceipt, getContractCode, readCase, readEvidenceSources, sha256Hex,
  };
  const results = new Map<DeployCheckId, DeployCheck>();
  let consensusStatus = '';
  let executionResult = '';
  let claimedAddress: string | null = null;
  let state: CaseState | null = null;

  const pass = (id: DeployCheckId, detail: string) =>
    results.set(id, { id, label: LABELS[id], ok: true, detail });
  const fail = (id: DeployCheckId, detail: string) =>
    results.set(id, { id, label: LABELS[id], ok: false, detail });

  const finish = (): DeployVerification => {
    const checks = ORDER.map((id) => results.get(id)
      ?? { id, label: LABELS[id], ok: null, detail: 'Not reached — an earlier check failed.' });
    const failed = checks.find((c) => c.ok === false) ?? null;
    const allOk = checks.every((c) => c.ok === true);
    return {
      ok: allOk,
      address: allOk ? claimedAddress : null,
      claimedAddress,
      state: allOk ? state : null,
      consensusStatus,
      executionResult,
      checks,
      failed,
    };
  };

  const receipt = await deps.readDeployReceipt(input.hash);
  if (!receipt) {
    fail('finalized', 'The transaction could not be read from the network.');
    return finish();
  }
  consensusStatus = receipt.statusName;
  executionResult = receipt.executionResultName;

  if (receipt.statusName.toUpperCase() !== 'FINALIZED') {
    fail('finalized', `Consensus status is ${receipt.statusName || 'unknown'}, not FINALIZED.`);
    return finish();
  }
  pass('finalized', 'FINALIZED');

  if (receipt.executionResultName.toUpperCase() !== 'FINISHED_WITH_RETURN') {
    fail('execution', `Execution result is ${receipt.executionResultName || 'unknown'}. The `
      + 'transaction reached consensus but the contract did not run to completion.');
    return finish();
  }
  pass('execution', 'FINISHED_WITH_RETURN');

  claimedAddress = receipt.contractAddress ?? receipt.recipient ?? null;
  if (!claimedAddress) {
    fail('address', 'The finalized receipt names no contract address.');
    return finish();
  }
  pass('address', claimedAddress);

  let code: string;
  try {
    code = await deps.getContractCode(claimedAddress);
  } catch {
    fail('code', 'No contract exists at this address. The node reports no code there, so the '
      + 'transaction finalized without leaving a contract behind.');
    return finish();
  }
  if (!code || code.length === 0) {
    fail('code', 'The node returned empty contract code for this address.');
    return finish();
  }
  pass('code', `${code.length} characters of contract source present`);

  // The deployed bytes must be the bytes we sent. A mismatch means the address
  // holds somebody else's contract, or a different build of ours.
  const deployedSha = await deps.sha256Hex(code);
  if (draft.sourceSha256 && deployedSha !== draft.sourceSha256) {
    fail('source', `The deployed source hashes to ${deployedSha.slice(0, 16)}…, not the `
      + `${draft.sourceSha256.slice(0, 16)}… we submitted.`);
    return finish();
  }
  pass('source', `sha256 ${deployedSha.slice(0, 16)}…`);

  try {
    state = await deps.readCase(claimedAddress);
  } catch {
    fail('state', 'The contract did not answer get_state.');
    return finish();
  }
  if (!state || typeof state.status !== 'string' || state.status === '') {
    fail('state', 'get_state returned an unrecognised shape.');
    return finish();
  }
  pass('state', 'get_state answered');

  if (!sameAddress(state.challenger, draft.sender)) {
    fail('challenger', `The contract's challenger is ${state.challenger}, not the deploying `
      + `wallet ${draft.sender}. This is not your case.`);
    return finish();
  }
  pass('challenger', state.challenger);

  if (!sameAddress(state.respondent, draft.respondent)) {
    fail('respondent', `The contract's respondent is ${state.respondent}, not the address you `
      + `submitted (${draft.respondent}).`);
    return finish();
  }
  pass('respondent', state.respondent);

  // The contract trims the title, so compare against the trimmed intent.
  const wantTitle = draft.caseTitle.trim();
  if (state.case_title !== wantTitle) {
    fail('title', `The on-chain title is "${state.case_title}", not "${wantTitle}".`);
    return finish();
  }
  pass('title', state.case_title);

  // The four evidence URLs are immutable and decide every future ruling. If any
  // one is not what we submitted, the case is not ours in any meaningful sense —
  // and nothing can be done about it afterwards.
  let sources: Record<string, string>;
  try {
    sources = await deps.readEvidenceSources(claimedAddress) as unknown as Record<string, string>;
  } catch {
    fail('evidence', 'The contract did not answer get_evidence_sources.');
    return finish();
  }
  const expected: Array<[string, string, string]> = [
    ['constitution_url', 'constitution', draft.constitutionUrl],
    ['proposal_url', 'proposal', draft.proposalUrl],
    ['vote_record_url', 'vote record', draft.voteRecordUrl],
    ['notice_record_url', 'notice record', draft.noticeRecordUrl],
  ];
  const bad = expected.find(([key, , want]) => (sources[key] ?? '') !== want.trim());
  if (bad) {
    fail('evidence', `The on-chain ${bad[1]} URL is "${sources[bad[0]] ?? '(missing)'}", not the `
      + `"${bad[2]}" that was submitted.`);
    return finish();
  }
  pass('evidence', 'all four URLs match');

  if (state.status !== 'OPEN') {
    fail('status', `The case is ${state.status}, not OPEN.`);
    return finish();
  }
  pass('status', 'OPEN');

  if ((sources.response_url ?? '') !== '' || state.has_response) {
    fail('response', `A fresh case must carry no response, but the contract records `
      + `"${sources.response_url}".`);
    return finish();
  }
  pass('response', 'empty');

  if (state.outcome !== '' || state.final_status !== '') {
    fail('ruling', `A fresh case must carry no ruling, but the contract records outcome `
      + `"${state.outcome}" / final status "${state.final_status}".`);
    return finish();
  }
  pass('ruling', 'both empty');

  if (!state.created_at) {
    fail('created', 'The contract records no created_at timestamp.');
    return finish();
  }
  pass('created', state.created_at);

  return finish();
}
