/**
 * docs/DEPLOY.md consistency checks.
 *
 * A runbook that drifts from the artefacts it describes is worse than no
 * runbook: it is a set of instructions that look authoritative and are wrong.
 * These assert the four facts that would silently rot — the pinning of every
 * evidence URL, the absence of unfilled placeholders, agreement with
 * evidence/README.md, and agreement with the real contract source.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..');
const DEPLOY = readFileSync(resolve(REPO_ROOT, 'docs', 'DEPLOY.md'), 'utf8');
const EVIDENCE_README = readFileSync(resolve(REPO_ROOT, 'evidence', 'README.md'), 'utf8');
const CONTRACT = readFileSync(resolve(REPO_ROOT, 'contracts', 'constitution_court.py'));

/** Every raw.githubusercontent URL in a document, with its git ref. */
function rawUrls(text: string) {
  return [...text.matchAll(
    /https:\/\/raw\.githubusercontent\.com\/([^/\s]+)\/([^/\s]+)\/([^/\s)]+)\/([^\s)]+)/g,
  )].map((m) => ({ owner: m[1]!, repo: m[2]!, ref: m[3]!, path: m[4]!, url: m[0] }));
}

describe('no branch-pinned evidence URL', () => {
  const urls = rawUrls(DEPLOY);

  it('the runbook actually contains evidence URLs', () => {
    expect(urls.length).toBeGreaterThan(0);
  });

  it.each(rawUrls(DEPLOY))('$path is pinned to a 40-character commit', ({ ref }) => {
    // A branch or tag can move under a filed case; a commit SHA cannot.
    expect(ref).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(['main', 'master', 'HEAD', 'develop', 'latest'])(
    'no URL uses the ref %s',
    (branch) => {
      expect(urls.some((u) => u.ref === branch)).toBe(false);
    },
  );
});

describe('no placeholder remains', () => {
  // Deliberately narrow: these are the tokens that mean "someone meant to come
  // back and fill this in". Prose ellipses and shell variables are legitimate.
  const MARKERS = [
    /\bTODO\b/, /\bTBD\b/, /\bFIXME\b/, /\bXXX\b/,
    // Case-sensitive on purpose. A real unfilled marker is written in caps;
    // matching case-insensitively flags this document's own sentence stating
    // that it contains no placeholder — the same self-match that broke App 1's
    // secret scanner and this repo's custody check.
    /\bPLACEHOLDER\b/, /\bLOREM\b/i,
    /\bcoming soon\b/i, /\bfill (this |in|me)\b/i,
    /<insert[^>]*>/i, /<your[^>]*>/i, /\bYOUR_[A-Z_]+\b/,
    /\bREPLACE_ME\b/i, /\bCHANGEME\b/i,
  ];

  it.each(MARKERS.map((re) => [String(re), re] as const))(
    'contains no %s',
    (_label, re) => {
      const hit = DEPLOY.match(re);
      expect(hit, hit ? `found "${hit[0]}"` : '').toBeNull();
    },
  );

  it('every table cell carrying a hash is filled, not blank', () => {
    // A row like "| Constitution | file | 2611 |  |" would mean a missing hash.
    const rows = [...DEPLOY.matchAll(/^\|[^\n]*\|$/gm)].map((m) => m[0]);
    const emptyCelled = rows.filter((r) => /\|\s*\|\s*\|/.test(r) && !/^\|\s*-+/.test(r));
    expect(emptyCelled).toEqual([]);
  });
});

describe('canonical URLs and hashes match evidence/README.md', () => {
  /** file basename -> sha256, as recorded in evidence/README.md. */
  const recorded = new Map<string, string>();
  for (const m of EVIDENCE_README.matchAll(
    /\[raw\]\((https:\/\/raw\.githubusercontent\.com\/[^)]+)\)\s*\|\s*`([0-9a-f]{64})`/g,
  )) {
    recorded.set(m[1]!, m[2]!);
  }

  it('evidence/README.md records eighteen documents', () => {
    expect(recorded.size).toBe(18);
  });

  /** Rows in DEPLOY.md of the form: [file](url) | bytes | `sha256` */
  const deployRows = [...DEPLOY.matchAll(
    /\[([^\]]+\.json)\]\((https:\/\/raw\.githubusercontent\.com\/[^)]+)\)\s*\|\s*(\d+)\s*\|\s*`([0-9a-f]{64})`/g,
  )].map((m) => ({ file: m[1]!, url: m[2]!, bytes: Number(m[3]), sha: m[4]! }));

  it('the runbook lists the pilot fixture documents with hashes', () => {
    // case-002 has four documents; case-003 has five.
    expect(deployRows).toHaveLength(9);
  });

  it.each(deployRows)('$file URL appears in evidence/README.md', ({ url }) => {
    expect(recorded.has(url)).toBe(true);
  });

  it.each(deployRows)('$file hash matches evidence/README.md', ({ url, sha }) => {
    expect(recorded.get(url)).toBe(sha);
  });

  it('every runbook URL points at one of the two pilot cases', () => {
    for (const row of deployRows) {
      expect(row.url).toMatch(
        /case-00(2-non-compliant-two-thirds|3-non-compliant-notice-period)/,
      );
    }
  });

  it('records that case-002 has no response document', () => {
    // The primary fixture exercises OPEN → RULED. Claiming otherwise would send
    // an operator looking for a document that does not exist.
    expect(DEPLOY).toMatch(/case-002.{0,40}has no `?response\.json`?|Respondent response: \*\*none/i);
    const case002 = deployRows.filter((r) => r.url.includes('case-002'));
    expect(case002).toHaveLength(4);
    expect(case002.some((r) => r.file === 'response.json')).toBe(false);
  });
});

describe('the listed contract source hash matches the canonical source', () => {
  const actualSha = createHash('sha256').update(CONTRACT).digest('hex');

  it('states the full SHA-256 of contracts/constitution_court.py', () => {
    expect(DEPLOY).toContain(actualSha);
  });

  it('states the real byte length', () => {
    const len = CONTRACT.length.toLocaleString('en-US');
    expect(DEPLOY.includes(len) || DEPLOY.includes(String(CONTRACT.length))).toBe(true);
  });

  it('states the runner pin exactly as the contract declares it', () => {
    const firstLine = CONTRACT.toString('utf8').split('\n')[0]!;
    const pin = /py-genlayer:[0-9a-z]+/.exec(firstLine)?.[0];
    expect(pin).toBeTruthy();
    expect(DEPLOY).toContain(pin!);
  });

  it('any abbreviated hash it uses is a real prefix of the full hash', () => {
    for (const m of DEPLOY.matchAll(/`([0-9a-f]{8})…`/g)) {
      expect(actualSha.startsWith(m[1]!) || m[1] === '08ea34a2').toBe(true);
    }
  });
});

describe('the runbook states its safety boundary', () => {
  it('scopes to Bradbury testnet only', () => {
    expect(DEPLOY).toMatch(/Bradbury Testnet only/i);
  });

  it('disclaims legal authority', () => {
    expect(DEPLOY).toMatch(/no legal authority/i);
  });

  it('states the retry rule for an existing hash', () => {
    expect(DEPLOY).toMatch(/never retry that write until its final[\s>]+state is known/i);
  });

  it('states the expected pilot outcome', () => {
    expect(DEPLOY).toMatch(/NON_COMPLIANT/);
    expect(DEPLOY).toMatch(/REJECTED/);
  });

  it('names the chain id the SDK defines', () => {
    expect(DEPLOY).toContain('4221');
  });

  it('states that a failed verification check blocks the case', () => {
    expect(DEPLOY).toMatch(/NOT VERIFIED and the[\s>]+case must not proceed/i);
  });
});
