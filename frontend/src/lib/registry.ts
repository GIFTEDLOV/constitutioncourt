/**
 * Browser-local case registry.
 *
 * There is no backend and no database, by architectural decision: the contract
 * is the only authoritative store, and an index would immediately become a
 * second source of truth that can disagree with the chain. This registry holds
 * only what the chain cannot: which cases *this browser* has seen, and which
 * transactions it has in flight.
 *
 * Nothing here is trusted for a decision. Roles are always re-derived from live
 * contract state; a registry entry is a bookmark, not a claim.
 */

import { CHAIN_ID } from '../config';

const KEY = 'constitutioncourt:v1';
export const REGISTRY_EVENT = 'constitutioncourt:registry';

export interface PendingTx {
  hash: string;
  method: string;
  startedAt: number;
}

export interface CaseEntry {
  address: string;
  chainId: number;
  /** Title as read from the contract, for listing without a network round trip. */
  title?: string;
  addedAt: number;
  /** How this browser came to know about the case. */
  via: 'created' | 'imported';
  /** Last status this browser observed, and when. Used for the cross-tab check. */
  lastStatus?: string;
  lastOutcome?: string;
  refreshedAt?: number;
  /** A write submitted from this browser that has not settled yet. */
  pendingTx?: PendingTx;
}

/**
 * A deployment intent, persisted at signing time.
 *
 * Verification compares the deployed contract against what we *meant* to
 * deploy, not against whatever the form says afterwards. Persisting it before
 * the signature is what makes a deployment recoverable when the tab closes
 * between signing and finalization.
 */
export interface DeploymentDraft {
  hash?: string;
  sender: string;
  respondent: string;
  caseTitle: string;
  constitutionUrl: string;
  proposalUrl: string;
  voteRecordUrl: string;
  noticeRecordUrl: string;
  sourceSha256: string;
  startedAt: number;
}

interface Store {
  cases: CaseEntry[];
  drafts: DeploymentDraft[];
}

const EMPTY: Store = { cases: [], drafts: [] };

function read(): Store {
  if (typeof localStorage === 'undefined') return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      cases: Array.isArray(parsed.cases) ? parsed.cases : [],
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
    };
  } catch {
    // Corrupt storage must not brick the app. An unreadable registry is an
    // empty one — the chain still has everything that matters.
    return { ...EMPTY };
  }
}

function write(store: Store): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota or private-mode failure. Losing a bookmark is acceptable; throwing
    // in the middle of a deployment is not.
    return;
  }
  // Same-tab listeners: `storage` only fires in *other* tabs.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(REGISTRY_EVENT));
  }
}

export function listCases(): CaseEntry[] {
  return read().cases
    .filter((c) => c.chainId === CHAIN_ID)
    .sort((a, b) => b.addedAt - a.addedAt);
}

export function getCase(address: string): CaseEntry | undefined {
  const want = address.toLowerCase();
  return read().cases.find((c) => c.address.toLowerCase() === want);
}

export function upsertCase(entry: Partial<CaseEntry> & { address: string }): CaseEntry {
  const store = read();
  const want = entry.address.toLowerCase();
  const idx = store.cases.findIndex((c) => c.address.toLowerCase() === want);
  const base: CaseEntry = idx >= 0
    ? store.cases[idx]!
    : { address: entry.address, chainId: CHAIN_ID, addedAt: Date.now(), via: 'imported' };
  const merged: CaseEntry = { ...base, ...entry, address: base.address };
  if (idx >= 0) store.cases[idx] = merged;
  else store.cases.push(merged);
  write(store);
  return merged;
}

export function removeCase(address: string): void {
  const store = read();
  const want = address.toLowerCase();
  store.cases = store.cases.filter((c) => c.address.toLowerCase() !== want);
  write(store);
}

export function setPendingTx(address: string, tx: PendingTx): void {
  upsertCase({ address, pendingTx: tx });
}

export function clearPendingTx(address: string): void {
  const store = read();
  const want = address.toLowerCase();
  const idx = store.cases.findIndex((c) => c.address.toLowerCase() === want);
  if (idx < 0) return;
  const entry = { ...store.cases[idx]! };
  delete entry.pendingTx;
  store.cases[idx] = entry;
  write(store);
}

export function getPendingTx(address: string): PendingTx | undefined {
  return getCase(address)?.pendingTx;
}

// ------------------------------------------------------------------ drafts

export function saveDraft(draft: DeploymentDraft): void {
  const store = read();
  const idx = draft.hash
    ? store.drafts.findIndex((d) => d.hash === draft.hash)
    : store.drafts.findIndex((d) => !d.hash && d.startedAt === draft.startedAt);
  if (idx >= 0) store.drafts[idx] = draft;
  else store.drafts.push(draft);
  // Bounded: a browser that files many cases should not grow this forever.
  if (store.drafts.length > 25) store.drafts = store.drafts.slice(-25);
  write(store);
}

export function getDraft(hash: string): DeploymentDraft | undefined {
  return read().drafts.find((d) => d.hash === hash);
}

/** Deployments that were signed but never confirmed as verified. */
export function pendingDrafts(): DeploymentDraft[] {
  return read().drafts.filter((d) => !!d.hash).sort((a, b) => b.startedAt - a.startedAt);
}

export function clearAll(): void {
  write({ ...EMPTY, cases: [], drafts: [] });
}
