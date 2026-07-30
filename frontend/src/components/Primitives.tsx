/** Small presentational pieces shared across routes. */

import type { ReactNode } from 'react';
import { EXPLORER } from '../config';
import { formatTimestamp, shortAddress } from '../lib/format';

/**
 * A status or verdict badge.
 *
 * The label is always rendered as text. Colour never carries the meaning on its
 * own — partly for accessibility, and partly because CERTIFIED and REJECTED
 * differing only by hue is exactly the misreading this product cannot afford.
 */
export function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  const cls = {
    CERTIFIED: 'badge-certified',
    REJECTED: 'badge-rejected',
    UNRESOLVED: 'badge-unresolved',
    OPEN: 'badge-open',
    RESPONDED: 'badge-open',
    RULED: 'badge-neutral',
  }[kind] ?? 'badge-neutral';
  return <span className={`badge ${cls}`}>{children}</span>;
}

export function Panel(
  { title, children, id }: { title?: string; children: ReactNode; id?: string },
) {
  return (
    <section className="panel" id={id}>
      {title ? <h2 className="panel-title">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Notice(
  { tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode },
) {
  const cls = tone === 'warn' ? 'notice notice-warn'
    : tone === 'danger' ? 'notice notice-danger' : 'notice';
  return <div className={cls}>{children}</div>;
}

export function Address({ value }: { value?: string | null }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <a
      className="mono"
      href={`${EXPLORER}/address/${value}`}
      target="_blank"
      rel="noreferrer noopener"
      title={value}
    >
      {shortAddress(value)}
      <span className="visually-hidden"> (opens the block explorer in a new tab)</span>
    </a>
  );
}

export function Timestamp({ value, label }: { value?: string | null; label?: string }) {
  if (!value) {
    return (
      <span className="muted">
        —<span className="visually-hidden">{label ? ` ${label} not recorded` : ' not recorded'}</span>
      </span>
    );
  }
  return <time dateTime={value}>{formatTimestamp(value)}</time>;
}

/**
 * A horizontally scrollable container for a wide table.
 *
 * `tabindex={0}` is required, not decorative: a region that scrolls with the
 * mouse but cannot be focused is unreachable for anyone navigating by keyboard,
 * and on a narrow screen that hides real content. The accessible name says
 * which table is being scrolled, since a bare focusable div announces nothing.
 */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}

/** An external link, always marked as leaving the app. */
export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
