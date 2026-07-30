import { describe, expect, it } from 'vitest';
import { elapsed, formatTimestamp, shortAddress, shortHash, truncate } from './format';
import { sha256Hex } from './hash';

describe('address and hash shortening', () => {
  it('shortens a full address', () => {
    expect(shortAddress('0x1111111111111111111111111111111111111111'))
      .toBe('0x1111…1111');
  });
  it('renders an em dash for nothing', () => {
    expect(shortAddress(null)).toBe('—');
    expect(shortHash(undefined)).toBe('—');
  });
  it('leaves a short value alone', () => {
    expect(shortAddress('0x1234')).toBe('0x1234');
  });
});

describe('timestamps stay UTC', () => {
  it('renders the contract format without converting to local time', () => {
    // Converting to a local zone would invite misreading a deadline that does
    // not exist — every timestamp the contract stores is UTC.
    expect(formatTimestamp('2026-07-30T12:34:56Z')).toBe('2026-07-30 12:34:56 UTC');
  });
  it('passes an unrecognised format through untouched', () => {
    expect(formatTimestamp('whenever')).toBe('whenever');
  });
  it('renders nothing as an em dash', () => {
    expect(formatTimestamp('')).toBe('—');
    expect(formatTimestamp(null)).toBe('—');
  });
});

describe('elapsed', () => {
  it('renders seconds', () => {
    expect(elapsed(0, 45_000)).toBe('45s');
  });
  it('renders minutes and seconds', () => {
    expect(elapsed(0, 125_000)).toBe('2m 5s');
  });
  it('renders hours and minutes', () => {
    expect(elapsed(0, 3_900_000)).toBe('1h 5m');
  });
  it('never renders a negative elapsed time', () => {
    expect(elapsed(1000, 0)).toBe('0s');
  });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('abc', 10)).toBe('abc');
  });
  it('adds an ellipsis when cutting', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });
});

describe('sha256Hex pins the exact bytes', () => {
  it('hashes the known empty-string digest', async () => {
    expect(await sha256Hex(''))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('produces a different hash for CRLF than for LF — the App 1 incident', async () => {
    // Same logical content, different bytes, different contract address.
    const lf = await sha256Hex('a\nb\n');
    const crlf = await sha256Hex('a\r\nb\r\n');
    expect(lf).not.toBe(crlf);
  });
});
