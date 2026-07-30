/**
 * Last-moment re-derivation of action availability.
 *
 * `availableActions` is computed from whatever state the tab last read. That
 * state has a lifetime: another tab, the counterparty, or a finalizing
 * transaction can move the case between the read and the click.
 *
 * In App 1's pilot a provider tab still holding a stale status offered an action
 * the contract had already made impossible; the duplicate write reverted with
 * FINISHED_WITH_ERROR and changed nothing, but it cost a signature, gas, and
 * half an hour of waiting to discover. The same shape exists here: two tabs on
 * one case, respondent submits from tab A, tab B still shows OPEN and still
 * offers "Submit response".
 *
 * So availability is re-established from a freshly read snapshot **twice** —
 * before the confirmation dialog opens, and again immediately before the write
 * is submitted — and the write is abandoned unless the method is still on the
 * list. This is a pure function over a snapshot so it can be exercised without
 * a network or a wallet.
 */

import { availableActions, type ActionContext, type ActionDef } from './actions';

export type PreflightResult =
  /** The action, re-derived from live state. Use this one, not the stale copy
   *  captured when the button was rendered. */
  | { ok: true; action: ActionDef }
  | { ok: false; reason: string };

export interface PreflightInput {
  method: ActionDef['method'];
  /** Outcome of the read taken for this check. */
  live: { ok: boolean; error?: string };
  /** Context built from the freshly read state, or null when there is none. */
  ctx: ActionContext | null;
}

export function preflightAction({ method, live, ctx }: PreflightInput): PreflightResult {
  if (!live.ok || !ctx) {
    // Availability that cannot be confirmed is not availability. Submitting on
    // an unread state is precisely the gamble this check removes.
    return {
      ok: false,
      reason: `Live state could not be confirmed${live.error ? ` (${live.error})` : ''}, so `
        + `${method}() was not submitted. Nothing was signed and nothing was spent. Retry once `
        + 'the contract reads again.',
    };
  }

  const action = availableActions(ctx).find((a) => a.method === method);
  if (!action) {
    return {
      ok: false,
      reason: `${method}() is no longer available: this case is now ${ctx.st.status}`
        + `${ctx.st.outcome ? ` (${ctx.st.outcome})` : ''} and your role is ${ctx.role}. `
        + 'Nothing was signed and nothing was spent.',
    };
  }

  // The role gate is enforced by availableActions, but assert it again: this is
  // the last check before a signature, and it must not depend on the caller
  // having passed the right role into the context.
  if (!action.roles.includes(ctx.role)) {
    return {
      ok: false,
      reason: `${method}() cannot be called by your role (${ctx.role}). Nothing was signed and `
        + 'nothing was spent.',
    };
  }

  return { ok: true, action };
}
