import { describe, expect, it } from 'vitest';
import {
  addressArg, classifyTx, decodeCitations, normalizeCaseState, UNREADABLE_CITATION,
} from './chain';

const HASH = `0x${'a'.repeat(64)}`;

describe('addressArg — the encoding that killed an App 1 deployment', () => {
  it('produces a calldata Address, not a string', () => {
    const encoded = addressArg('0x1111111111111111111111111111111111111111');
    // A plain "0x…" string would be encoded as a 42-character str and handed to
    // a constructor annotated `respondent: Address`, failing the contract's
    // isinstance check ~30 minutes and one signature later.
    expect(typeof encoded).not.toBe('string');
    expect(encoded).toHaveProperty('bytes');
  });

  it('encodes exactly 20 bytes', () => {
    const encoded = addressArg('0x0102030405060708090a0b0c0d0e0f1011121314') as unknown as
      { bytes: Uint8Array };
    expect(encoded.bytes).toHaveLength(20);
    expect(Array.from(encoded.bytes.slice(0, 4))).toEqual([1, 2, 3, 4]);
  });

  it('accepts an address without the 0x prefix', () => {
    expect(() => addressArg('1111111111111111111111111111111111111111')).not.toThrow();
  });

  it('is case-insensitive about hex digits', () => {
    const lower = addressArg('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd') as unknown as
      { bytes: Uint8Array };
    const upper = addressArg('0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD') as unknown as
      { bytes: Uint8Array };
    expect(Array.from(lower.bytes)).toEqual(Array.from(upper.bytes));
  });

  it.each(['0x1234', '', 'not-hex', `0x${'a'.repeat(41)}`])(
    'throws rather than sending a malformed address: %s',
    (bad) => {
      expect(() => addressArg(bad)).toThrow(/Not a 20-byte address/);
    },
  );
});

describe('classifyTx — a hash is not success', () => {
  it('treats a missing transaction as merely submitted', () => {
    expect(classifyTx(HASH, null).phase).toBe('submitted');
  });

  it('treats FINALIZED + FINISHED_WITH_RETURN as success', () => {
    const t = classifyTx(HASH, {
      statusName: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_RETURN',
    });
    expect(t.phase).toBe('finalized');
    expect(t.succeeded).toBe(true);
  });

  it('treats FINISHED_WITH_ERROR as a failure, not an acceptance', () => {
    const t = classifyTx(HASH, {
      statusName: 'ACCEPTED', txExecutionResultName: 'FINISHED_WITH_ERROR',
    });
    expect(t.phase).toBe('execution-error');
    expect(t.succeeded).toBeUndefined();
    expect(t.error).toMatch(/execution failed/i);
  });

  it('treats FINALIZED with NO execution result as unknown, never success', () => {
    const t = classifyTx(HASH, { statusName: 'FINALIZED' });
    expect(t.phase).toBe('unknown');
    expect(t.succeeded).toBeUndefined();
    expect(t.error).toMatch(/do not assume it succeeded/i);
  });

  it('treats an unrecognised execution result as unknown', () => {
    const t = classifyTx(HASH, {
      statusName: 'FINALIZED', txExecutionResultName: 'SOMETHING_NEW',
    });
    expect(t.phase).toBe('unknown');
  });

  it('treats a settled DISAGREE as a failure whatever the status says', () => {
    const t = classifyTx(HASH, {
      statusName: 'FINALIZED',
      txExecutionResultName: 'FINISHED_WITH_RETURN',
      resultName: 'DISAGREE',
    });
    expect(t.phase).toBe('failed');
    expect(t.error).toMatch(/did not agree/i);
  });

  it.each(['canceled', 'undetermined', 'validators_timeout', 'leader_timeout'])(
    'treats %s as a failure',
    (status) => {
      expect(classifyTx(HASH, { statusName: status }).phase).toBe('failed');
    },
  );

  it.each(['pending', 'proposing', 'committing', 'revealing'])(
    'treats %s as pending consensus',
    (status) => {
      expect(classifyTx(HASH, { statusName: status }).phase).toBe('pending-consensus');
    },
  );

  it('accepts FINISHED_WITH_NO_RETURN as success too', () => {
    const t = classifyTx(HASH, {
      statusName: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_NO_RETURN',
    });
    expect(t.succeeded).toBe(true);
  });
});

describe('citation decoding', () => {
  it('decodes JSON-string citations', () => {
    const out = decodeCitations([
      JSON.stringify({ source: 'vote-record', url: 'https://e/v.json', locator: '$.tally', quote: '340000' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe('vote-record');
    expect(out[0]!.locator).toBe('$.tally');
  });

  it('accepts already-decoded objects', () => {
    const out = decodeCitations([
      { source: 'proposal', url: 'https://e/p.json', locator: '$.amount', quote: '250000' },
    ]);
    expect(out[0]!.source).toBe('proposal');
  });

  it('marks a malformed citation unreadable rather than dropping it', () => {
    // Silently dropping would quietly shrink the ruling's stated basis.
    const out = decodeCitations(['{not json', JSON.stringify({ source: 'proposal' })]);
    expect(out).toHaveLength(2);
    expect(out[0]!.source).toBe(UNREADABLE_CITATION);
  });

  it('marks a non-object entry unreadable', () => {
    const out = decodeCitations([42]);
    expect(out[0]!.source).toBe(UNREADABLE_CITATION);
  });

  it('returns an empty list for a non-array', () => {
    expect(decodeCitations(null)).toEqual([]);
    expect(decodeCitations('nope')).toEqual([]);
  });

  it('coerces non-string fields rather than throwing', () => {
    const out = decodeCitations([{ source: 'proposal', locator: 5, quote: true }]);
    expect(out[0]!.locator).toBe('5');
    expect(out[0]!.quote).toBe('true');
  });
});

describe('normalizeCaseState', () => {
  it('fills missing fields with empty strings rather than undefined', () => {
    const st = normalizeCaseState({ status: 'OPEN' });
    expect(st.outcome).toBe('');
    expect(st.final_status).toBe('');
    expect(st.violated_rule_ids).toEqual([]);
    expect(st.has_response).toBe(false);
  });

  it('de-duplicates rule ids defensively', () => {
    const st = normalizeCaseState({ violated_rule_ids: ['ART-4.3', 'ART-4.3', 'ART-5.4'] });
    expect(st.violated_rule_ids).toEqual(['ART-4.3', 'ART-5.4']);
  });

  it('coerces has_response to a boolean', () => {
    expect(normalizeCaseState({ has_response: 1 }).has_response).toBe(true);
    expect(normalizeCaseState({}).has_response).toBe(false);
  });

  it('survives a null payload', () => {
    expect(normalizeCaseState(null).status).toBe('');
  });
});
