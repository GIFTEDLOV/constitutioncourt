/**
 * Chain access layer.
 *
 * Four rules, all carried forward from App 1's pilot incidents, drive
 * everything here:
 *
 *  1. A returned transaction hash is NOT success. It means the node accepted the
 *     transaction for processing. Consensus and execution are separate later
 *     outcomes, and either can still fail.
 *  2. Consensus ACCEPTED with execution FINISHED_WITH_ERROR is a failure and
 *     must render as one.
 *  3. FINALIZED with no execution result, or an unrecognised one, is not
 *     success either — it is unknown, and the caller must confirm on-chain state
 *     before retrying.
 *  4. An address argument must reach GenVM as a calldata Address, not a string.
 *     See `addressArg`.
 */

import { createClient, chains } from 'genlayer-js';
import { CalldataAddress } from 'genlayer-js/types';

export type TxPhase =
  | 'idle'
  | 'awaiting-signature'
  | 'submitted'
  | 'pending-consensus'
  | 'consensus-accepted'
  | 'execution-error'
  | 'finalized'
  | 'failed'
  | 'unknown';

export interface TxTracker {
  phase: TxPhase;
  hash?: string;
  method?: string;
  consensusStatus?: string;
  executionResult?: string;
  /** AGREE / DISAGREE — the settled consensus result, when the node reports one. */
  consensusResult?: string;
  error?: string;
  startedAt?: number;
  /**
   * True only when consensus agreed AND the execution result is explicitly one
   * of the successful ones. Never inferred from status.
   */
  succeeded?: boolean;
}

/** Mirrors `get_state()` in contracts/constitution_court.py. */
export interface CaseState {
  case_title: string;
  challenger: string;
  respondent: string;
  status: string;
  final_status: string;
  outcome: string;
  violated_rule_ids: string[];
  evidence_citations: EvidenceCitation[];
  reasoning: string;
  created_at: string;
  responded_at: string;
  ruled_at: string;
  has_response: boolean;
}

/**
 * One citation as stored.
 *
 * Citations are recorded from the LEADER's result. They are explanatory and are
 * NOT consensus-critical — only `outcome` and the set of `violated_rule_ids`
 * were agreed. Every surface that renders these must say so.
 */
export interface EvidenceCitation {
  source: string;
  url: string;
  locator: string;
  quote: string;
  supports?: string;
}

/** Mirrors `get_evidence_sources()`. */
export interface EvidenceSources {
  constitution_url: string;
  proposal_url: string;
  vote_record_url: string;
  notice_record_url: string;
  response_url: string;
  schema_version: string;
}

const chain = chains.testnetBradbury;

export function readClient() {
  return createClient({ chain });
}

export function walletClient(address: string, provider: unknown) {
  return createClient({
    chain,
    account: address as `0x${string}`,
    provider: provider as never,
  });
}

// --------------------------------------------------------------------- reads

/**
 * Calldata decodes a contract `dict` to a JS `Map`; `jsonSafeReturn: true`
 * converts it to a plain object, and every read here asks for that.
 *
 * This normalises a `Map` anyway, because the failure mode otherwise is silent
 * and total: property access on a Map yields `undefined` for every key, so a
 * case would render as blank strings and an empty status rather than as an
 * error. A blank case that looks merely unread is far worse than a loud failure.
 */
function asRecord(raw: unknown): Record<string, unknown> {
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  return (raw ?? {}) as Record<string, unknown>;
}

export async function readCase(address: string): Promise<CaseState> {
  const c = readClient();
  const raw = (await c.readContract({
    address: address as `0x${string}`,
    functionName: 'get_state',
    args: [],
    jsonSafeReturn: true,
  })) as unknown as CaseState;
  return normalizeCaseState(raw);
}

export async function readEvidenceSources(address: string): Promise<EvidenceSources> {
  const c = readClient();
  const raw = await c.readContract({
    address: address as `0x${string}`,
    functionName: 'get_evidence_sources',
    args: [],
    jsonSafeReturn: true,
  });
  // Same Map defence as `normalizeCaseState` — an evidence panel silently
  // showing five blank URLs would look like a case with no evidence.
  return asRecord(raw) as unknown as EvidenceSources;
}

/**
 * Read the deployed source at an address.
 *
 * `getContractCode` takes the address **positionally**; the SDK wraps it into
 * `[{ address }]` itself for non-Studio chains. Passing `{ address }` here
 * produces a doubly-nested parameter that the node rejects, and because
 * `verifyDeployment` treats a throw from this call as "no contract exists",
 * every genuine deployment would have been reported as a ghost deployment.
 *
 * The previous version cast the client to an invented object-argument
 * signature, so TypeScript could not catch it. It is called through the real
 * client type now: a future SDK signature change becomes a compile error rather
 * than a runtime surprise on a live deploy.
 */
export async function getContractCode(address: string): Promise<string> {
  const c = readClient();
  const code = await c.getContractCode(address as `0x${string}`);
  return typeof code === 'string' ? code : String(code ?? '');
}

/**
 * Defensive normalisation of a `get_state` payload.
 *
 * `evidence_citations` is stored as a DynArray[str] of JSON objects and decoded
 * by the contract's view, but a node that returns them still-encoded, or a
 * malformed entry, must not crash the case page. A citation that cannot be
 * decoded is surfaced as unreadable rather than dropped silently — dropping it
 * would quietly shrink a ruling's stated basis.
 */
export function normalizeCaseState(raw: unknown): CaseState {
  const r = asRecord(raw);
  const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const ids = Array.isArray(r.violated_rule_ids) ? r.violated_rule_ids.map(str) : [];

  return {
    case_title: str(r.case_title),
    challenger: str(r.challenger),
    respondent: str(r.respondent),
    status: str(r.status),
    final_status: str(r.final_status),
    outcome: str(r.outcome),
    // De-duplicated on read as well as on write: the contract stores a set, and
    // a duplicate arriving here would be a node or decode fault, not a finding.
    violated_rule_ids: [...new Set(ids)],
    evidence_citations: decodeCitations(r.evidence_citations),
    reasoning: str(r.reasoning),
    created_at: str(r.created_at),
    responded_at: str(r.responded_at),
    ruled_at: str(r.ruled_at),
    has_response: Boolean(r.has_response),
  };
}

/** Marker used for a citation whose JSON could not be decoded. */
export const UNREADABLE_CITATION = '(unreadable)';

export function decodeCitations(raw: unknown): EvidenceCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: EvidenceCitation[] = [];
  for (const item of raw) {
    let obj: unknown = item;
    if (typeof item === 'string') {
      try {
        obj = JSON.parse(item);
      } catch {
        out.push({
          source: UNREADABLE_CITATION,
          url: '',
          locator: '',
          quote: '',
        });
        continue;
      }
    }
    if (!obj || typeof obj !== 'object') {
      out.push({ source: UNREADABLE_CITATION, url: '', locator: '', quote: '' });
      continue;
    }
    const c = obj as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
    out.push({
      source: s(c.source) || UNREADABLE_CITATION,
      url: s(c.url),
      locator: s(c.locator),
      quote: s(c.quote),
      supports: c.supports == null ? undefined : s(c.supports),
    });
  }
  return out;
}

// ------------------------------------------------------------ tx status

const PENDING = new Set([
  'pending', 'proposing', 'committing', 'revealing', 'activated', 'accepted_pending',
]);
const BAD = new Set(['canceled', 'cancelled', 'undetermined', 'validators_timeout', 'leader_timeout']);

/**
 * The only execution results that mean the contract ran to completion.
 * Anything else — including an absent result — is not success.
 */
const SUCCESSFUL_EXECUTION = new Set(['FINISHED_WITH_RETURN', 'FINISHED_WITH_NO_RETURN']);

interface RpcTx {
  statusName?: string;
  status?: string | number;
  txExecutionResultName?: string;
  resultName?: string;
  txDataDecoded?: { contractAddress?: string };
  contractAddress?: string;
  recipient?: string;
}

/**
 * Classify a raw RPC transaction payload.
 *
 * Split out from `pollTx` so the classification — the part that carries the
 * incident lessons — is testable without a network.
 */
export function classifyTx(hash: string, tx: RpcTx | null): TxTracker {
  if (!tx) return { phase: 'submitted', hash };

  const status = String(tx.statusName ?? tx.status ?? '').toUpperCase();
  const exec = tx.txExecutionResultName ?? undefined;
  const consensusResult = tx.resultName ? String(tx.resultName).toUpperCase() : undefined;
  const base = { hash, consensusStatus: status, executionResult: exec, consensusResult };

  if (BAD.has(status.toLowerCase())) {
    return {
      ...base,
      phase: 'failed',
      error: `Consensus did not accept this transaction (${status.toLowerCase()}).`,
    };
  }

  // Rule 2. A contract guard that reverts lands here, and it must read as a
  // failure of the attempt — never as "accepted, therefore done".
  if (exec && exec.toUpperCase().includes('ERROR')) {
    return {
      ...base,
      phase: 'execution-error',
      error: 'Consensus accepted the transaction but contract execution failed.',
    };
  }

  if (consensusResult && consensusResult !== 'AGREE'
      && (status === 'FINALIZED' || status === 'ACCEPTED')) {
    return {
      ...base,
      phase: 'failed',
      error: `Validators did not agree on this transaction (${consensusResult}).`,
    };
  }

  if (status === 'FINALIZED' || status === 'ACCEPTED') {
    const finalized = status === 'FINALIZED';
    if (!exec) {
      // Rule 3.
      return {
        ...base,
        phase: 'unknown',
        error: `The transaction is ${status.toLowerCase()} but the node reported no execution `
          + 'result. Do not assume it succeeded — confirm the on-chain state before retrying.',
      };
    }
    if (!SUCCESSFUL_EXECUTION.has(exec.toUpperCase())) {
      return {
        ...base,
        phase: 'unknown',
        error: `Unrecognised execution result "${exec}". Confirm the on-chain state before retrying.`,
      };
    }
    return { ...base, phase: finalized ? 'finalized' : 'consensus-accepted', succeeded: true };
  }

  if (PENDING.has(status.toLowerCase())) return { ...base, phase: 'pending-consensus' };
  return { ...base, phase: 'submitted' };
}

/** Poll transaction status through the JSON-RPC via genlayer-js. */
export async function pollTx(hash: string): Promise<TxTracker> {
  let tx: RpcTx | null = null;
  try {
    tx = (await readClient().getTransaction({ hash: hash as never })) as unknown as RpcTx;
  } catch {
    // Not indexed yet, or a transient RPC hiccup — keep waiting, don't error.
    return { phase: 'submitted', hash };
  }
  return classifyTx(hash, tx);
}

export interface DeployReceipt {
  statusName: string;
  executionResultName: string;
  contractAddress: string | null;
  recipient: string | null;
}

/**
 * Read a deploy receipt.
 *
 * The deployed address comes from `txDataDecoded.contractAddress` and nowhere
 * else. `recipient` is **not** a fallback: `deployContract` submits the
 * transaction with `recipient: zeroAddress`, so a deploy receipt's recipient is
 * always `0x000…0`. Falling back to it would hand verification a syntactically
 * valid address that belongs to no contract, turning "the receipt named no
 * address" into a confusing "no contract exists at 0x000…0".
 *
 * It is still returned, for diagnostics only.
 */
export async function readDeployReceipt(hash: string): Promise<DeployReceipt | null> {
  let tx: RpcTx | null;
  try {
    tx = (await readClient().getTransaction({ hash: hash as never })) as unknown as RpcTx;
  } catch {
    return null;
  }
  if (!tx) return null;
  return {
    statusName: String(tx.statusName ?? tx.status ?? ''),
    executionResultName: String(tx.txExecutionResultName ?? ''),
    contractAddress: tx.txDataDecoded?.contractAddress ?? null,
    recipient: tx.recipient ?? null,
  };
}

// -------------------------------------------------------------------- writes

export interface SendOpts {
  address: string;
  method: string;
  args?: unknown[];
  account: string;
  provider: unknown;
}

/** Submits and returns the hash. Callers must then poll — a hash is not success. */
export async function sendTx(o: SendOpts): Promise<string> {
  const c = walletClient(o.account, o.provider);
  return (await c.writeContract({
    address: o.address as `0x${string}`,
    functionName: o.method,
    args: (o.args ?? []) as never[],
    value: 0n,
  })) as unknown as string;
}

// -------------------------------------------------------------------- deploy

/**
 * Encode a hex address as GenVM calldata's Address type.
 *
 * `calldata.encode()` dispatches on `instanceof CalldataAddress`. A plain
 * `"0x…"` string is therefore encoded as a 42-character `str`, and GenVM hands
 * that str to a constructor annotated `respondent: Address`. The contract's
 * `isinstance(respondent, Address)` check then fails and raises
 * `[INPUT] respondent must be an Address` — but only after the transaction has
 * reached consensus, ~30 minutes and one signature later.
 *
 * App 1 lost a deployment to exactly this: every argument present and correct,
 * but the address on the wire as `str(42)` instead of `Address(20 bytes)`.
 */
export function addressArg(hex: string): CalldataAddress {
  const clean = hex.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) {
    throw new Error(`Not a 20-byte address: ${JSON.stringify(hex)}`);
  }
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new CalldataAddress(bytes);
}

export interface DeployArgs {
  respondent: string;
  caseTitle: string;
  constitutionUrl: string;
  proposalUrl: string;
  voteRecordUrl: string;
  noticeRecordUrl: string;
}

/**
 * Deploy one case instance.
 *
 * Arguments are positional and in the constructor's locked order:
 * `(respondent, case_title, constitution_url, proposal_url, vote_record_url,
 * notice_record_url)`. `respondent` goes through `addressArg`.
 *
 * Returns the transaction hash only. A hash is not a deployment — the caller
 * must run `verifyDeployment` before treating a contract as real.
 */
export async function deployCase(
  source: string,
  args: DeployArgs,
  account: string,
  provider: unknown,
): Promise<string> {
  const c = walletClient(account, provider);
  return (await c.deployContract({
    code: source as never,
    args: [
      addressArg(args.respondent),
      args.caseTitle,
      args.constitutionUrl,
      args.proposalUrl,
      args.voteRecordUrl,
      args.noticeRecordUrl,
    ] as never[],
  })) as unknown as string;
}
