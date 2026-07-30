/** Live case reading and transaction tracking. */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pollTx, readCase, readEvidenceSources, sendTx,
  type CaseState, type EvidenceSources, type TxTracker,
} from '../chain';
import {
  clearPendingTx, getCase, REGISTRY_EVENT, setPendingTx, upsertCase,
} from '../lib/registry';

/**
 * Reduce an RPC error to the one line a person needs.
 *
 * viem and genlayer-js raise multi-line diagnostics ending in a version footer.
 * Surfacing that verbatim buries the only part that matters — "contract not
 * found at address 0x…" — under boilerplate.
 */
export function readableError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const informative = lines.find((l) => /^Details:/i.test(l))
    ?? lines.find((l) => /not found|revert|timeout|denied|invalid/i.test(l))
    ?? lines[0] ?? raw;
  return informative
    .replace(/^Details:\s*/i, '')
    .replace(/\s*Version:\s*\S+\s*$/i, '')
    .trim();
}

/**
 * The outcome of one read, carrying the state it read.
 *
 * The snapshot is returned rather than only committed to React state because a
 * caller that must decide something *now* — may this write still be submitted? —
 * cannot wait for a render. Reading `st` from the hook right after awaiting
 * `refresh()` yields the pre-refresh value, which is exactly the stale state
 * the preflight check exists to reject.
 */
export interface LiveRead {
  ok: boolean;
  error?: string;
  st?: CaseState | null;
  sources?: EvidenceSources | null;
}

export interface LiveCase {
  st: CaseState | null;
  sources: EvidenceSources | null;
  loading: boolean;
  error: string | null;
  degraded: boolean;
  refreshedAt: number | null;
  /**
   * A status another tab read from this contract more recently than we did,
   * which disagrees with the state in hand. Non-null means what is on screen is
   * known-stale and nothing may be offered or submitted from it.
   */
  supersededBy: string | null;
  refresh: () => Promise<LiveRead>;
}

/**
 * A status for this address observed in shared browser storage, when it
 * disagrees with the state this tab is holding.
 *
 * Two tabs on one case share no React state. A respondent tab left open on OPEN
 * keeps offering "Submit response" for a full poll interval after the response
 * has landed from another tab — and a tab on OPEN keeps offering "Run ruling"
 * after someone else has already ruled. Every tab writes the status and read
 * time it observed into the local registry, and that write raises `storage` in
 * every *other* tab (plus a same-tab event), so another tab's read becomes an
 * immediate signal instead of a 20-second window.
 *
 * Guarded on read time: a registry entry left from an earlier session is
 * *older* than the state in hand, not newer, and must never suppress actions.
 */
export function useSupersededStatus(
  address: string | null, current: string | null, readAt: number | null,
): string | null {
  const [observed, setObserved] = useState<{ status: string; at: number } | null>(null);

  useEffect(() => {
    setObserved(null);
    if (!address) return;
    const check = () => {
      const e = getCase(address);
      setObserved((prev) => {
        if (!e?.lastStatus || typeof e.refreshedAt !== 'number') return null;
        if (prev && prev.status === e.lastStatus && prev.at === e.refreshedAt) return prev;
        return { status: e.lastStatus, at: e.refreshedAt };
      });
    };
    check();
    window.addEventListener('storage', check);
    window.addEventListener(REGISTRY_EVENT, check);
    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener(REGISTRY_EVENT, check);
    };
  }, [address]);

  if (!observed || !current) return null;
  if (observed.status === current) return null;
  return observed.at > (readAt ?? 0) ? observed.status : null;
}

/**
 * Live case reader with backoff on transient RPC failure and a periodic refresh.
 */
export function useLiveCase(address: string | null, intervalMs = 20000): LiveCase {
  const [st, setSt] = useState<CaseState | null>(null);
  const [sources, setSources] = useState<EvidenceSources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const failures = useRef(0);

  /**
   * Monotonic read generation.
   *
   * Two reads can be in flight across an address change, and RPC latency is not
   * ordered: a slow read of case A can land after a fast read of B and paint
   * A's ruling under B's address. Every read captures the generation it started
   * in and discards its own result if the generation has moved on.
   */
  const generation = useRef(0);
  const inFlight = useRef(false);

  // Address changed: abandon everything from the previous contract immediately,
  // so nothing from A is ever visible while B is on screen.
  useEffect(() => {
    generation.current += 1;
    setSt(null);
    setSources(null);
    setError(null);
    setDegraded(false);
    setRefreshedAt(null);
    setLoading(Boolean(address));
    failures.current = 0;
    inFlight.current = false;
    return () => { generation.current += 1; };
  }, [address]);

  const refresh = useCallback(async (): Promise<LiveRead> => {
    if (!address) { setLoading(false); return { ok: false, error: 'No address.' }; }
    const mine = generation.current;
    const stale = () => mine !== generation.current;
    inFlight.current = true;
    try {
      const [s, ev] = await Promise.all([
        readCase(address),
        readEvidenceSources(address).catch(() => null),
      ]);
      if (stale()) return { ok: false, error: 'Superseded by a newer address.' };
      setSt(s);
      setSources(ev);
      setError(null);
      setDegraded(false);
      failures.current = 0;
      // One timestamp for both the hook state and the registry: the cross-tab
      // check compares them, so they must not drift by a millisecond.
      const at = Date.now();
      setRefreshedAt(at);
      upsertCase({
        address,
        title: s.case_title || undefined,
        lastStatus: s.status,
        lastOutcome: s.outcome || undefined,
        refreshedAt: at,
      });
      return { ok: true, st: s, sources: ev };
    } catch (e) {
      if (stale()) return { ok: false, error: 'Superseded by a newer address.' };
      failures.current += 1;
      setDegraded(failures.current >= 2);
      const message = readableError(e);
      setError(message);
      return { ok: false, error: message };
    } finally {
      inFlight.current = false;
      if (!stale()) setLoading(false);
    }
  }, [address]);

  useEffect(() => { void refresh(); }, [refresh]);

  /**
   * Single-flight recursive timeout, not setInterval.
   *
   * setInterval with an async callback fires on a fixed schedule regardless of
   * whether the previous read finished, so a slow network stacks overlapping
   * RPC calls whose responses can land out of order. The next read is scheduled
   * only after the previous one settles.
   */
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    let timer = 0;

    const tick = () => {
      const delay = Math.min(intervalMs * 2 ** Math.min(failures.current, 3), 120000);
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (!inFlight.current) await refresh();
        if (!cancelled) tick();
      }, delay);
    };
    tick();

    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [address, refresh, intervalMs]);

  const supersededBy = useSupersededStatus(address, st?.status ?? null, refreshedAt);

  // Another tab has seen a newer status: re-read now rather than waiting out the
  // poll interval, so the stale state is replaced instead of merely suppressed.
  useEffect(() => {
    if (supersededBy && !inFlight.current) void refresh();
  }, [supersededBy, refresh]);

  return { st, sources, loading, error, degraded, refreshedAt, supersededBy, refresh };
}

export interface WriteAction {
  tx: TxTracker;
  busy: boolean;
  /**
   * Resolves with the submitted transaction hash, or null when nothing was
   * submitted. Callers bind their postcondition to that hash: a postcondition
   * held against a method name alone gets re-evaluated — and re-displayed —
   * under whatever transaction comes next.
   */
  run: (opts: {
    method: string; args?: unknown[];
    account: string; provider: unknown; address: string;
  }) => Promise<string | null>;
  reset: () => void;
  /** Resume tracking a previously-submitted hash after a reload. */
  resume: (address: string, hash: string, method: string, startedAt: number) => void;
}

/**
 * Runs a contract write and tracks it to finality.
 *
 * Persists the hash *before* awaiting so an interruption is recoverable, and
 * never resubmits a write once a hash exists — a second submission on top of an
 * in-flight one is how a duplicate action gets signed.
 */
export function useWriteAction(onSettled?: () => void): WriteAction {
  const [tx, setTx] = useState<TxTracker>({ phase: 'idle' });
  const timerRef = useRef<number | null>(null);
  /**
   * Bumped whenever tracking is stopped or replaced, so a poll already in
   * flight cannot write its result over a newer transaction's state.
   */
  const trackGen = useRef(0);

  const stop = useCallback(() => {
    trackGen.current += 1;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => { stop(); }, [stop]);

  const track = useCallback((address: string, hash: string, method: string, startedAt: number) => {
    stop();
    const mine = trackGen.current;
    const schedule = () => {
      timerRef.current = window.setTimeout(async () => {
        if (mine !== trackGen.current) return;
        const t = await pollTx(hash);
        if (mine !== trackGen.current) return;
        setTx((prev) => ({ ...t, method, startedAt: prev.startedAt ?? startedAt }));
        if (t.phase === 'finalized' || t.phase === 'execution-error'
            || t.phase === 'failed' || t.phase === 'unknown') {
          stop();
          clearPendingTx(address);
          onSettled?.();
          return;
        }
        if (t.phase === 'consensus-accepted') onSettled?.();
        schedule();
      }, 15000);
    };
    schedule();
  }, [onSettled, stop]);

  const run: WriteAction['run'] = useCallback(
    async ({ method, args, account, provider, address }) => {
      stop();
      const startedAt = Date.now();
      setTx({ phase: 'awaiting-signature', method, startedAt });
      let hash: string;
      try {
        hash = await sendTx({ address, method, args, account, provider });
      } catch (e) {
        const err = e as { code?: number; message?: string };
        const msg = err.code === 4001
          ? 'Signature rejected in the wallet.'
          : (err.message ?? String(e));
        // No hash was issued, so nothing committed — safe to let the user retry.
        setTx({ phase: 'failed', method, error: `Not submitted: ${msg}`, startedAt });
        return null;
      }
      setPendingTx(address, { hash, method, startedAt });
      setTx({ phase: 'submitted', method, hash, startedAt });
      track(address, hash, method, startedAt);
      return hash;
    },
    [track, stop],
  );

  const resume: WriteAction['resume'] = useCallback((address, hash, method, startedAt) => {
    setTx({ phase: 'submitted', method, hash, startedAt });
    track(address, hash, method, startedAt);
  }, [track]);

  const busy = tx.phase !== 'idle' && tx.phase !== 'finalized'
    && tx.phase !== 'execution-error' && tx.phase !== 'failed' && tx.phase !== 'unknown';

  return { tx, busy, run, reset: () => { stop(); setTx({ phase: 'idle' }); }, resume };
}
