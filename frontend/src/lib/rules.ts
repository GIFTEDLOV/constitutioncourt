/**
 * Resolving a cited rule id to the rule it names.
 *
 * A ruling that says only "ART-4.3 was violated" is a bare verdict badge: the
 * reader cannot check the finding against its basis without going and fetching
 * the constitution themselves. So the case view resolves each cited id against
 * the constitution document and shows its title and text.
 *
 * The hard rule here: **never invent missing rule text.** If the constitution
 * cannot be fetched, or the id is not in it, the UI says so explicitly. A
 * plausible-looking paraphrase next to a consensus-backed finding would be the
 * worst possible failure — it would put words the validators never read inside
 * something that looks authoritative.
 */

import type { ConstitutionRule } from './evidence';

export type RuleResolution =
  | { id: string; state: 'resolved'; rule: ConstitutionRule }
  /** The constitution was read, and this id is genuinely not in it. */
  | { id: string; state: 'not-in-constitution' }
  /** The constitution could not be read, so resolution was not attempted. */
  | { id: string; state: 'unavailable'; reason: string };

export function resolveRuleIds(
  ids: readonly string[],
  rules: readonly ConstitutionRule[] | null,
  unavailableReason?: string,
): RuleResolution[] {
  return ids.map((id) => {
    if (!rules) {
      return {
        id,
        state: 'unavailable' as const,
        reason: unavailableReason
          ?? 'The constitution document could not be fetched from this browser, so the rule '
            + 'text cannot be shown. Validators fetched it server-side when they ruled.',
      };
    }
    const rule = rules.find((r) => r.id === id);
    if (!rule) return { id, state: 'not-in-constitution' as const };
    return { id, state: 'resolved' as const, rule };
  });
}

/**
 * Whether a citation points at one of the URLs actually pinned on this case.
 *
 * The contract already rewrites citation URLs to pinned ones and drops the
 * rest, so a mismatch here would mean something decoded wrong. Surfacing it is
 * cheap and the alternative — rendering an unpinned URL as evidence — is
 * exactly what the citation rules exist to prevent.
 */
export function citationIsPinned(url: string, pinned: readonly string[]): boolean {
  if (!url) return false;
  return pinned.some((p) => p && p === url);
}
