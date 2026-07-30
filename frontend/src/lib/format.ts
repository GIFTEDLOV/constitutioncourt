/** Small display helpers. Pure and synchronous. */

export function shortAddress(a?: string | null): string {
  if (!a) return '—';
  const v = a.trim();
  if (v.length <= 12) return v;
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export function shortHash(h?: string | null): string {
  if (!h) return '—';
  const v = h.trim();
  if (v.length <= 18) return v;
  return `${v.slice(0, 10)}…${v.slice(-6)}`;
}

/**
 * Render an ISO-8601 UTC timestamp for display without pretending to more
 * precision than the contract stores, and without converting to a local zone —
 * the record is UTC and showing it as anything else invites misreading a
 * deadline that does not exist.
 */
export function formatTimestamp(iso?: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]} UTC`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** Approximate elapsed time, for a transaction that is still settling. */
export function elapsed(sinceMs: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - sinceMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
