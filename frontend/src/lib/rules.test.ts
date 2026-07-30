import { describe, expect, it } from 'vitest';
import { citationIsPinned, resolveRuleIds } from './rules';
import type { ConstitutionRule } from './evidence';

const RULES: ConstitutionRule[] = [
  { id: 'ART-4.3', title: 'Elevated tier', text: 'Two-thirds of votes cast.' },
  { id: 'ART-5.4', title: 'Notice', text: 'Publicly announced, in full.' },
];

describe('resolving cited rule ids', () => {
  it('resolves an id present in the constitution', () => {
    const [r] = resolveRuleIds(['ART-4.3'], RULES);
    expect(r!.state).toBe('resolved');
    if (r!.state === 'resolved') expect(r!.rule.title).toBe('Elevated tier');
  });

  it('reports an id the constitution does not contain — never invents text', () => {
    const [r] = resolveRuleIds(['ART-9.9'], RULES);
    expect(r!.state).toBe('not-in-constitution');
    expect(JSON.stringify(r)).not.toMatch(/text/);
  });

  it('reports unavailable when the constitution could not be fetched', () => {
    const [r] = resolveRuleIds(['ART-4.3'], null);
    expect(r!.state).toBe('unavailable');
    if (r!.state === 'unavailable') expect(r!.reason).toMatch(/could not be fetched/i);
  });

  it('carries a specific reason when one is known', () => {
    const [r] = resolveRuleIds(['ART-4.3'], null, 'The host returned 404.');
    if (r!.state === 'unavailable') expect(r!.reason).toBe('The host returned 404.');
  });

  it('resolves a mixed list independently', () => {
    const out = resolveRuleIds(['ART-4.3', 'ART-9.9'], RULES);
    expect(out[0]!.state).toBe('resolved');
    expect(out[1]!.state).toBe('not-in-constitution');
  });

  it('returns nothing for an empty citation list', () => {
    expect(resolveRuleIds([], RULES)).toEqual([]);
  });
});

describe('citation URL pinning', () => {
  const pinned = ['https://e/c.json', 'https://e/v.json'];

  it('accepts a pinned URL', () => {
    expect(citationIsPinned('https://e/v.json', pinned)).toBe(true);
  });

  it('rejects a URL that was never pinned', () => {
    expect(citationIsPinned('https://attacker/x.json', pinned)).toBe(false);
  });

  it('rejects an empty URL', () => {
    expect(citationIsPinned('', pinned)).toBe(false);
  });

  it('requires an exact match, not a prefix', () => {
    expect(citationIsPinned('https://e/v.json?x=1', pinned)).toBe(false);
  });
});
