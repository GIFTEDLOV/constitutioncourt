/**
 * Confirmation dialog for a state-changing write.
 *
 * The dialog is only ever opened *after* a fresh preflight has re-confirmed the
 * action is still available, and the write is preflighted again immediately
 * before submission. This component renders the consequence and takes the
 * decision; it does not decide availability itself.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  consequence: string;
  confirmLabel: string;
  busy?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, consequence, confirmLabel, busy, children, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the dialog on open, and Escape closes it. Both are
  // keyboard-navigation requirements, not niceties.
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
      if (e.key !== 'Tab') return;
      // Trap focus: a dialog the user can tab out of, while a signature is
      // pending behind it, is a way to click something they cannot see.
      const nodes = ref.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={() => { if (!busy) onCancel(); }}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-consequence"
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-consequence">{consequence}</p>
        {children}
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={busy}
            ref={confirmRef}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
