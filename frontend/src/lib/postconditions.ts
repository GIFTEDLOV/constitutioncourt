/**
 * What each action must have actually done, checked against live state after it
 * finalizes.
 *
 * `FINISHED_WITH_RETURN` means the contract code ran to completion. It does not
 * mean the thing you asked for happened — App 1 saw a deploy finalize
 * successfully and leave no contract at all. Every action therefore states a
 * postcondition, and the UI reports success only once that postcondition is
 * observed on-chain.
 *
 * Postconditions are bound to an exact transaction hash **and** method by
 * `PostconditionRecord`. A postcondition held against a method name alone gets
 * re-evaluated — and re-displayed — under whatever transaction comes next,
 * which is how a historical result ends up shown beneath an unrelated later
 * action.
 */

import type { CaseState } from '../chain';
import { OUTCOME_TO_FINAL, OUTCOMES, type Outcome } from '../config';

export interface PostconditionInput {
  method: string;
  st: CaseState;
  expected?: {
    /** Response URL submitted with submit_response. */
    responseUrl?: string;
  };
}

export interface PostconditionResult {
  /** null when this method has no postcondition worth asserting. */
  ok: boolean | null;
  detail: string;
}

/**
 * A postcondition bound to the transaction that produced it.
 *
 * `hash` and `method` together are the identity. A record is only ever shown
 * next to the transaction whose hash it names.
 */
export interface PostconditionRecord {
  hash: string;
  method: string;
  result: PostconditionResult;
  /** Contract this was evaluated against — cleared when the address changes. */
  address: string;
  at: number;
}

const ok = (detail: string): PostconditionResult => ({ ok: true, detail });
const no = (detail: string): PostconditionResult => ({ ok: false, detail });

const VALID_OUTCOMES = new Set<string>(OUTCOMES);

export function checkPostcondition(input: PostconditionInput): PostconditionResult {
  const { method, st, expected } = input;

  switch (method) {
    case 'submit_response': {
      if (st.status !== 'RESPONDED') {
        return no(`Expected status RESPONDED after submitting a response, found ${st.status}.`);
      }
      if (!st.has_response) {
        return no('The case is RESPONDED but records no response document.');
      }
      if (!st.responded_at) {
        return no('The case is RESPONDED but carries no responded_at timestamp.');
      }
      // The URL itself lives in get_evidence_sources; the caller passes it in
      // so this stays a pure function over a snapshot.
      if (expected?.responseUrl !== undefined && expected.responseUrl !== '') {
        return ok(`Response pinned at ${expected.responseUrl}; recorded ${st.responded_at}.`);
      }
      return ok(`Response recorded at ${st.responded_at}.`);
    }

    case 'rule': {
      if (st.status !== 'RULED') {
        return no(`Expected status RULED after adjudication, found ${st.status}.`);
      }
      if (!VALID_OUTCOMES.has(st.outcome)) {
        return no(
          `The recorded outcome "${st.outcome || '(empty)'}" is not one of the three valid `
          + 'rulings. Do not treat this case as adjudicated.',
        );
      }
      const expectedFinal = OUTCOME_TO_FINAL[st.outcome as Outcome];
      if (st.final_status !== expectedFinal) {
        return no(
          `Outcome ${st.outcome} should map to ${expectedFinal}, but the contract recorded `
          + `${st.final_status || '(empty)'}.`,
        );
      }
      if (!st.ruled_at) {
        return no('The case is RULED but carries no ruled_at timestamp.');
      }
      // The contract stores a set; a duplicate reaching here means something
      // decoded wrong, and a ruling whose basis cannot be trusted is not a pass.
      const unique = new Set(st.violated_rule_ids);
      if (unique.size !== st.violated_rule_ids.length) {
        return no('The stored violated rule ids contain duplicates, which the contract should '
          + 'not permit. Treat the recorded basis as unreliable.');
      }
      if (st.outcome === 'NON_COMPLIANT' && st.violated_rule_ids.length === 0) {
        return no('NON_COMPLIANT was recorded without citing any violated rule.');
      }
      if (st.outcome !== 'NON_COMPLIANT' && st.violated_rule_ids.length > 0) {
        return no(`${st.outcome} was recorded while citing violated rules.`);
      }
      const cites = st.violated_rule_ids.length
        ? ` citing ${st.violated_rule_ids.join(', ')}`
        : '';
      return ok(`Ruled ${st.outcome} → ${st.final_status}${cites}.`);
    }

    default:
      return { ok: null, detail: 'No postcondition defined for this action.' };
  }
}

/**
 * What a rejected write means, in the terms a party cares about.
 *
 * A guard that reverts is the contract working. Reporting it as a bare
 * "execution failed" reads like something may be in an unknown state, which is
 * the opposite of what happened — nothing changed, and this contract never
 * held any value to move.
 */
export function rejectionSummary(method: string, st: CaseState | null): string {
  const nothingChanged = 'no state changed';

  if (method === 'submit_response' && st?.status === 'RESPONDED') {
    return 'A response was already submitted for this case — from another tab, or earlier. The '
      + `duplicate was safely rejected by the contract: ${nothingChanged}, and the response on `
      + 'record is the first one, unchanged. The contract permits exactly one response.';
  }
  if (method === 'submit_response' && st?.status === 'RULED') {
    return 'This case was ruled before the response landed. The contract freezes the record at '
      + `RULED, so the submission was safely rejected: ${nothingChanged}.`;
  }
  if (method === 'rule' && st?.status === 'RULED') {
    return 'This case was already ruled — from another tab, or by anyone else, since ruling is '
      + `permissionless. The duplicate ruling was safely rejected: ${nothingChanged}, and the `
      + 'ruling on record is the first one. Use GenLayer’s native transaction appeal to contest it.';
  }
  if (st) {
    return `${method}() was safely rejected — the contract does not permit it while the case is `
      + `${st.status}: ${nothingChanged}.`;
  }
  return `${method}() was safely rejected by the contract: ${nothingChanged}. Live state could `
    + 'not be read back, so confirm the case status before retrying.';
}

/**
 * Whether a postcondition record may be displayed for the transaction on screen.
 *
 * Both the hash and the method must match, and the record must belong to the
 * contract currently being viewed. Any mismatch means the record is historical
 * and showing it would attribute one action's result to another.
 */
export function postconditionApplies(
  record: PostconditionRecord | null,
  tx: { hash?: string; method?: string } | null,
  address: string | null,
): boolean {
  if (!record || !tx?.hash || !tx.method || !address) return false;
  return record.hash === tx.hash
    && record.method === tx.method
    && record.address.toLowerCase() === address.toLowerCase();
}
