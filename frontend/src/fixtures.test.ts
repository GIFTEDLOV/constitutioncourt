/**
 * Published fixture pinning.
 *
 * Offline counterpart to `e2e/fixtures.mjs`: that one fetches the URLs, this
 * one asserts they are the right *shape* and that the app's own validator is
 * happy with them. The shape rule matters because a branch-pinned evidence URL
 * is the one mistake the contract cannot protect against — it stores the URL,
 * not what the URL serves.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_CASES, EVIDENCE_COMMIT, FIXTURE_FILES, fixtureUrl } from './config';
import { checkEvidenceUrl } from './lib/validation';

const REPO_ROOT = resolve(__dirname, '..', '..');

describe('EVIDENCE_COMMIT is a commit, never a branch', () => {
  it('is exactly 40 lowercase hex characters', () => {
    expect(EVIDENCE_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(['main', 'master', 'HEAD', 'latest', 'dev'])('is not the branch %s', (branch) => {
    expect(EVIDENCE_COMMIT).not.toBe(branch);
  });
});

describe('fixture URLs are immutable and pass the app’s own validator', () => {
  const urls = DEMO_CASES.flatMap((c) =>
    FIXTURE_FILES.filter((f) => f !== 'response.json' || c.hasResponse)
      .map((f) => ({ case: c.id, file: f, url: fixtureUrl(c.dir, f) })));

  it('covers all four cases', () => {
    expect(new Set(urls.map((u) => u.case)).size).toBe(4);
    // Four documents each, plus a response for the two cases that have one.
    expect(urls).toHaveLength(4 * 4 + 2);
  });

  it.each(urls)('$case/$file is HTTPS and commit-pinned', ({ url }) => {
    expect(url.startsWith('https://raw.githubusercontent.com/')).toBe(true);
    const ref = url.split('/')[5];
    expect(ref).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(urls)('$case/$file raises no mutability warning', ({ url }) => {
    // The single most important assertion here: the product warns users about
    // branch-pinned evidence, so its own published fixtures must not trip that
    // warning. A warning would mean shipping links we tell users not to use.
    const check = checkEvidenceUrl(url);
    expect(check.ok).toBe(true);
    expect(check.warn).toBeUndefined();
  });

  it('would warn if the same URLs were branch-pinned, proving the check bites', () => {
    const branchy = urls[0]!.url.replace(EVIDENCE_COMMIT, 'main');
    const check = checkEvidenceUrl(branchy);
    expect(check.ok).toBe(true);
    expect(check.warn).toMatch(/branch or tag/i);
  });
});

describe('evidence/README.md records the published manifest', () => {
  const readme = readFileSync(resolve(REPO_ROOT, 'evidence', 'README.md'), 'utf8');

  it('records a row per document with a raw URL and a SHA-256', () => {
    const rows = readme.match(
      /\|\s*`[^`]+\.json`\s*\|\s*`[0-9a-f]{7}`\s*\|\s*\[raw\]\(https:\/\/raw\.githubusercontent\.com\/[^)]+\)\s*\|\s*`[0-9a-f]{64}`\s*\|/g,
    ) ?? [];
    expect(rows).toHaveLength(18);
  });

  it('every recorded URL carries the pinned commit', () => {
    const refs = [...readme.matchAll(
      /raw\.githubusercontent\.com\/[^/\s]+\/[^/\s]+\/([0-9a-z]+)\/evidence\//g,
    )].map((m) => m[1]);
    expect(refs.length).toBe(18);
    for (const ref of refs) expect(ref).toBe(EVIDENCE_COMMIT);
  });

  it('states why a branch reference would be unsafe', () => {
    expect(readme).toMatch(/cannot store what the URL serves/i);
    expect(readme).toMatch(/consensus splits/i);
  });

  it('gives a re-verification command rather than asking for trust', () => {
    expect(readme).toMatch(/sha256sum/);
  });
});
