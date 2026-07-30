import { describe, expect, it, vi } from 'vitest';
import {
  extractRules, probeEvidence, SCHEMA_LITERALS, summarize, validateDocument,
} from './evidence';

const constitution = {
  schema: SCHEMA_LITERALS.constitution,
  organization: 'Meridian Collective',
  rules: [
    { id: 'ART-4.2', title: 'Standard tier', text: 'Simple majority of votes cast.' },
    { id: 'ART-4.3', title: 'Elevated tier', text: 'Two-thirds of votes cast.' },
  ],
};

function res(body: unknown, status = 200): Response {
  return {
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe('schema literal validation', () => {
  it.each(Object.entries(SCHEMA_LITERALS))(
    'accepts a %s document carrying its own literal',
    (source, literal) => {
      const r = validateDocument(source as never, { schema: literal });
      expect(r.ok).toBe(true);
    },
  );

  it('rejects a document with no schema field', () => {
    const r = validateDocument('proposal', { title: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No "schema" field/);
  });

  it('rejects a document carrying the wrong literal', () => {
    const r = validateDocument('vote-record', { schema: SCHEMA_LITERALS.proposal });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/expected/i);
  });

  it('names the document it actually is — the swapped-document case', () => {
    // A proposal served where a vote record was expected fetches and parses
    // fine. Only the literal reveals the case would answer a different question.
    const r = validateDocument('vote-record', { schema: SCHEMA_LITERALS.proposal });
    expect(r.error).toMatch(/that is the proposal schema/i);
  });

  it('rejects a JSON array', () => {
    expect(validateDocument('proposal', [1, 2, 3]).ok).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(validateDocument('proposal', 'a string').ok).toBe(false);
    expect(validateDocument('proposal', null).ok).toBe(false);
  });
});

describe('probeEvidence classification', () => {
  it('accepts a well-formed document', async () => {
    const r = await probeEvidence('https://e/c.json', 'constitution',
      vi.fn(async () => res(constitution)) as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    expect(r.summary).toMatch(/Meridian Collective/);
  });

  it.each([408, 425, 429, 500, 503])('classifies %s as transient', async (status) => {
    const r = await probeEvidence('https://e/c.json', 'constitution',
      vi.fn(async () => res('{}', status)) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('transient');
  });

  it.each([400, 403, 404, 410])('classifies %s as invalid evidence', async (status) => {
    const r = await probeEvidence('https://e/c.json', 'constitution',
      vi.fn(async () => res('{}', status)) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('invalid');
  });

  it('classifies unparseable JSON as invalid', async () => {
    const r = await probeEvidence('https://e/c.json', 'constitution',
      vi.fn(async () => res('<html>not json</html>')) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('invalid');
    expect(r.error).toMatch(/not valid JSON/i);
  });

  it('reports a fetch rejection honestly as possibly-CORS, not as a bad URL', async () => {
    const r = await probeEvidence('https://e/c.json', 'constitution',
      vi.fn(async () => { throw new Error('CORS'); }) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('network');
    // Validators fetch server-side, so a browser failure is not proof the URL
    // is unusable — saying otherwise would reject a perfectly good filing.
    expect(r.error).toMatch(/CORS|server-side/i);
  });
});

describe('summaries', () => {
  it('summarises a constitution by rule ids', () => {
    expect(summarize('constitution', constitution)).toMatch(/ART-4.2, ART-4.3/);
  });

  it('says plainly when a vote record has no tally', () => {
    const s = summarize('vote-record', {
      schema: SCHEMA_LITERALS['vote-record'], proposal_id: 'MC-1', declared_result: 'PASSED',
    });
    expect(s).toMatch(/no tally present/i);
  });

  it('surfaces the declared result without adopting it', () => {
    const s = summarize('vote-record', {
      schema: SCHEMA_LITERALS['vote-record'],
      tally: { for: '340000', against: '180000' },
      declared_result: 'PASSED',
    });
    expect(s).toMatch(/declares PASSED/);
  });
});

describe('extractRules', () => {
  it('extracts ids, titles and text', () => {
    const rules = extractRules(constitution);
    expect(rules).toHaveLength(2);
    expect(rules[0]!.id).toBe('ART-4.2');
    expect(rules[1]!.title).toBe('Elevated tier');
  });

  it('tolerates a missing or malformed rules array', () => {
    expect(extractRules({})).toEqual([]);
    expect(extractRules({ rules: 'nope' })).toEqual([]);
    expect(extractRules(null)).toEqual([]);
  });

  it('skips entries with no id rather than inventing one', () => {
    expect(extractRules({ rules: [{ title: 'no id' }, { id: 'ART-1' }] })).toHaveLength(1);
  });
});
