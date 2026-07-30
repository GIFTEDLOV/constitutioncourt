/**
 * Action availability model.
 *
 * Given live contract state and the connected wallet's role, this derives
 * exactly which write actions the contract will accept. The UI must never
 * surface an enabled action the contract would deterministically revert — every
 * gate here mirrors a guard in `contracts/constitution_court.py`.
 *
 * Two properties of this contract shape the whole model:
 *
 *  - `rule()` is **permissionless**. Anyone may call it, from OPEN or from
 *    RESPONDED. Restricting it in the UI would misrepresent the design and
 *    imply the respondent can stall adjudication, which is exactly what the
 *    lifecycle refuses to allow.
 *  - `submit_response` is respondent-only and OPEN-only. One response, ever.
 */

import type { CaseState } from '../chain';
import { sameAddress } from './validation';

export type Role = 'challenger' | 'respondent' | 'observer' | 'disconnected';

export interface ActionDef {
  method: 'submit_response' | 'rule';
  label: string;
  /** One-line consequence shown in the confirmation dialog. */
  consequence: string;
  /** Roles allowed to call it. The contract enforces this too. */
  roles: Role[];
  tone: 'primary' | 'default';
  /** True when any connected wallet may call it, whatever its role. */
  permissionless?: boolean;
}

export interface ActionContext {
  st: CaseState;
  role: Role;
}

/**
 * Determine the connected wallet's role from live contract state — never from
 * local metadata. A wallet is a party only when the contract says so.
 */
export function roleFor(account: string | null | undefined, st: CaseState | null): Role {
  if (!account) return 'disconnected';
  if (!st) return 'observer';
  if (sameAddress(account, st.challenger)) return 'challenger';
  if (sameAddress(account, st.respondent)) return 'respondent';
  return 'observer';
}

/** All actions the current state and role permit, in the order they would occur. */
export function availableActions(ctx: ActionContext): ActionDef[] {
  const { st, role } = ctx;
  const out: ActionDef[] = [];

  // A disconnected reader sees the case but is offered nothing. Reading is
  // deliberately possible without a wallet.
  if (role === 'disconnected') return out;

  if (st.status === 'OPEN' && role === 'respondent') {
    out.push({
      method: 'submit_response',
      label: 'Submit response',
      consequence:
        'Pins one public HTTPS response URL to this case, permanently. You may submit a '
        + 'response only once and it cannot be replaced, edited or withdrawn.',
      roles: ['respondent'],
      tone: 'primary',
    });
  }

  if (st.status === 'OPEN' || st.status === 'RESPONDED') {
    out.push({
      method: 'rule',
      label: 'Run validator ruling',
      consequence:
        'Every validator independently re-fetches all pinned evidence and derives its own '
        + 'ruling. Consensus is on the outcome and the set of violated rule ids. This is '
        + 'final — RULED cannot be reopened.',
      roles: ['challenger', 'respondent', 'observer'],
      tone: 'primary',
      permissionless: true,
    });
  }

  // RULED is terminal. No state-changing action exists, for anyone, ever. The
  // only recourse is GenLayer's native transaction appeal on the rule tx.
  return out;
}

/**
 * Why an action a user might expect is absent.
 *
 * Returning a reason rather than nothing keeps the UI from looking broken when
 * the correct behaviour is to offer nothing at all.
 */
export function unavailableReason(ctx: ActionContext, method: ActionDef['method']): string | null {
  const { st, role } = ctx;
  if (availableActions(ctx).some((a) => a.method === method)) return null;

  if (method === 'submit_response') {
    if (st.status === 'RULED') {
      return 'This case is RULED. The record is frozen — no evidence or response can be added.';
    }
    if (st.status === 'RESPONDED') {
      return 'A response has already been submitted. The contract permits exactly one, so it '
        + 'cannot be swapped after seeing how it lands.';
    }
    if (role === 'disconnected') return 'Connect the respondent wallet to submit a response.';
    return 'Only the respondent named at filing may submit the response.';
  }

  if (method === 'rule') {
    if (st.status === 'RULED') {
      return 'This case is already RULED. Rulings are final; use GenLayer’s native transaction '
        + 'appeal on the ruling transaction to contest it.';
    }
    if (role === 'disconnected') return 'Connect any wallet to run the ruling — it is permissionless.';
  }
  return null;
}
