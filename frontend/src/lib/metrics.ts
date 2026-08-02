/**
 * Headline metrics for the editorial pages.
 *
 * Every figure here is *derived* from the same constants the application uses
 * to do its work, never typed in as a display string. A statistic set in 96px
 * type is a claim about the product, and a claim that drifts from the code is
 * worse than no claim at all — so `4` is `EVIDENCE_ROLES.filter(required)`, not
 * the character "4".
 *
 * `format` is separate from `value` on purpose: the count-up animation needs a
 * number to interpolate, while the rendered label may carry a suffix.
 */

import { EVIDENCE_ROLES, OUTCOMES, FINAL_STATUSES, STATUSES } from '../config';

export interface Metric {
  /** The numeric target, used by the count-up animation. */
  value: number;
  /** Rendered after the number, if any. Never part of the interpolation. */
  suffix?: string;
  /** The line beneath the figure. Sentence case, no terminal period. */
  label: string;
  /**
   * Why this number is what it is. Not decorative — it is what stops an
   * oversized figure from being a marketing assertion.
   */
  basis: string;
}

/** Evidence documents a case must pin before it can be filed. */
export const REQUIRED_EVIDENCE_COUNT = EVIDENCE_ROLES.filter((r) => r.required).length;

/** Evidence documents a case may carry in total, including the optional response. */
export const TOTAL_EVIDENCE_COUNT = EVIDENCE_ROLES.length;

/**
 * Validators drawn for a single GenLayer consensus round.
 *
 * This is network policy, not an application setting — ConstitutionCourt cannot
 * choose it, and it is stated here only so the figure on the page has one
 * source. Bradbury draws five for a first round and expands the set on
 * rotation, which is why the consensus page describes it as the opening size
 * rather than a fixed guarantee.
 */
export const FIRST_ROUND_VALIDATORS = 5;

export const HOME_METRICS: Metric[] = [
  {
    value: REQUIRED_EVIDENCE_COUNT,
    label: 'Immutable evidence sources',
    basis:
      'A filing pins a constitution, a proposal, a vote record and a notice record. '
      + 'All four are required before the wizard will let a case be signed.',
  },
  {
    value: OUTCOMES.length,
    label: 'Constitutional outcomes',
    basis:
      'COMPLIANT, NON_COMPLIANT and INSUFFICIENT_EVIDENCE. The vocabulary is closed — '
      + 'validators cannot invent a fourth verdict.',
  },
  {
    value: FIRST_ROUND_VALIDATORS,
    label: 'Independent validators',
    basis:
      'Each ruling is executed by an independently drawn validator set that fetches the '
      + 'evidence separately and must agree before the result is recorded.',
  },
  {
    value: 100,
    suffix: '%',
    label: 'Commit-pinned evidence',
    basis:
      'Every evidence URL is pinned to a 40-character commit, never a branch, so the bytes '
      + 'validators read at ruling time are the bytes cited at filing time.',
  },
];

/** The lifecycle and verdict vocabularies, for the pages that enumerate them. */
export const VOCABULARY = {
  statuses: STATUSES,
  outcomes: OUTCOMES,
  finalStatuses: FINAL_STATUSES,
} as const;
