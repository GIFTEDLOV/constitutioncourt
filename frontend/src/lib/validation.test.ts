import { describe, expect, it } from 'vitest';
import {
  checkCaseTitle, checkDistinctUrls, checkEvidenceUrl, checkRespondent,
  isAddress, isTxHash, sameAddress, ZERO_ADDRESS,
} from './validation';

const OK_URL = 'https://evidence.example/case/constitution.json';
const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

describe('addresses', () => {
  it('accepts a 20-byte hex address', () => {
    expect(isAddress(WALLET)).toBe(true);
  });
  it('rejects a short address', () => {
    expect(isAddress('0x1234')).toBe(false);
  });
  it('rejects an address with no 0x prefix', () => {
    expect(isAddress('1111111111111111111111111111111111111111')).toBe(false);
  });
  it('compares case-insensitively', () => {
    expect(sameAddress(WALLET.toUpperCase().replace('0X', '0x'), WALLET)).toBe(true);
  });
  it('never treats a missing address as equal', () => {
    expect(sameAddress(null, null)).toBe(false);
    expect(sameAddress(WALLET, undefined)).toBe(false);
  });
  it('recognises a transaction hash', () => {
    expect(isTxHash(`0x${'a'.repeat(64)}`)).toBe(true);
    expect(isTxHash(`0x${'a'.repeat(63)}`)).toBe(false);
  });
});

describe('evidence URL validation mirrors the contract guards', () => {
  it('accepts a plain HTTPS URL', () => {
    expect(checkEvidenceUrl(OK_URL).ok).toBe(true);
  });

  it('rejects plain HTTP — a per-validator MITM could split consensus', () => {
    const r = checkEvidenceUrl('http://evidence.example/c.json');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/https/i);
  });

  it('rejects an empty URL', () => {
    expect(checkEvidenceUrl('').ok).toBe(false);
    expect(checkEvidenceUrl('   ').ok).toBe(false);
  });

  it('rejects embedded credentials in the authority', () => {
    const r = checkEvidenceUrl('https://user:pass@evidence.example/c.json');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/credential/i);
  });

  it('allows an @ in the path — only the authority may not contain one', () => {
    expect(checkEvidenceUrl('https://evidence.example/users/@meridian/c.json').ok).toBe(true);
  });

  it.each([
    'https://evidence.example/c.json?access_token=abc',
    'https://evidence.example/c.json?api_key=abc',
    'https://evidence.example/c.json?token=abc',
    'https://evidence.example/c.json?signature=deadbeef',
  ])('rejects credential-shaped query parameter: %s', (url) => {
    const r = checkEvidenceUrl(url);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/credential/i);
  });

  it('rejects a URL longer than the contract limit', () => {
    const long = `https://evidence.example/${'a'.repeat(2100)}.json`;
    expect(checkEvidenceUrl(long).ok).toBe(false);
  });

  it('rejects whitespace and control characters', () => {
    expect(checkEvidenceUrl('https://evidence.example/a b.json').ok).toBe(false);
    expect(checkEvidenceUrl('https://evidence.example/a\nb.json').ok).toBe(false);
  });

  it('rejects a scheme-relative URL', () => {
    expect(checkEvidenceUrl('//evidence.example/c.json').ok).toBe(false);
  });
});

describe('mutable-source warnings', () => {
  it('warns about a GitHub branch ref', () => {
    const r = checkEvidenceUrl('https://raw.githubusercontent.com/o/r/main/evidence/c.json');
    expect(r.ok).toBe(true);
    expect(r.warn).toMatch(/branch or tag/i);
  });

  it('does not warn about a commit-pinned raw URL', () => {
    const sha = 'a'.repeat(40);
    const r = checkEvidenceUrl(`https://raw.githubusercontent.com/o/r/${sha}/evidence/c.json`);
    expect(r.ok).toBe(true);
    expect(r.warn).toBeUndefined();
  });

  it('warns that a GitHub blob page is not raw JSON', () => {
    const r = checkEvidenceUrl('https://github.com/o/r/blob/main/evidence/c.json');
    expect(r.ok).toBe(true);
    expect(r.warn).toMatch(/raw/i);
  });

  it('warns about an unpinned gist', () => {
    const r = checkEvidenceUrl('https://gist.githubusercontent.com/u/id/raw/c.json');
    expect(r.warn).toMatch(/revision/i);
  });

  it('warns generically that any URL pins location, not content', () => {
    expect(checkEvidenceUrl(OK_URL).warn).toMatch(/immutable|whatever this URL serves/i);
  });
});

describe('respondent', () => {
  it('accepts a distinct valid address', () => {
    expect(checkRespondent(OTHER, WALLET).ok).toBe(true);
  });
  it('rejects the zero address', () => {
    expect(checkRespondent(ZERO_ADDRESS, WALLET).ok).toBe(false);
  });
  it('rejects filing against yourself', () => {
    const r = checkRespondent(WALLET, WALLET);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/differ/i);
  });
  it('rejects a malformed address', () => {
    expect(checkRespondent('not-an-address', WALLET).ok).toBe(false);
  });
  it('accepts when no wallet is connected to compare against', () => {
    expect(checkRespondent(OTHER, null).ok).toBe(true);
  });
});

describe('case title', () => {
  it('requires a non-empty title', () => {
    expect(checkCaseTitle('').ok).toBe(false);
    expect(checkCaseTitle('   ').ok).toBe(false);
  });
  it('accepts a title at the 200-character limit', () => {
    expect(checkCaseTitle('x'.repeat(200)).ok).toBe(true);
  });
  it('rejects a title over the limit', () => {
    expect(checkCaseTitle('x'.repeat(201)).ok).toBe(false);
  });
});

describe('distinct URLs', () => {
  it('accepts four different URLs', () => {
    expect(checkDistinctUrls(['a', 'b', 'c', 'd']).ok).toBe(true);
  });
  it('rejects the same URL pinned in two roles', () => {
    const r = checkDistinctUrls(['a', 'b', 'a', 'd']);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/more than one role/i);
  });
  it('ignores blanks while the form is still being filled in', () => {
    expect(checkDistinctUrls(['a', '', '', '']).ok).toBe(true);
  });
});
