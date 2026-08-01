/**
 * Published-fixture verification.
 *
 * Re-fetches every pinned evidence document and re-checks it against the
 * SHA-256 recorded in `evidence/README.md`. This is the check that keeps the
 * published-URL claim honest: a table of hashes nobody re-verifies is a table
 * of hashes that quietly goes stale.
 *
 * It asserts four things:
 *   1. every URL returns HTTP 200;
 *   2. the served bytes hash to the value recorded in evidence/README.md;
 *   3. the served bytes match the committed blob;
 *   4. no URL anywhere in the repo pins evidence to a branch instead of a commit.
 *
 * Network-dependent by nature — it is the one suite that must reach the
 * internet, because "is this URL actually fetchable" cannot be answered
 * offline. It touches raw.githubusercontent.com only: no GenLayer network, no
 * wallet, no GEN.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { failures += 1; console.error(`  FAIL  ${m}`); };

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

console.log('Published evidence fixtures — HTTP 200 and hash parity');

// --- the pinned commit, read from the app config ---------------------------
const configSrc = readFileSync(resolve(repoRoot, 'frontend/src/config.ts'), 'utf8');
const pin = /EVIDENCE_COMMIT\s*=\s*'([0-9a-f]{40})'/.exec(configSrc)?.[1];

if (!pin) {
  fail('EVIDENCE_COMMIT in config.ts is not a full 40-character commit SHA');
  console.log('\n1 check failed.');
  process.exit(1);
}
ok(`EVIDENCE_COMMIT is a 40-character commit SHA (${pin.slice(0, 7)})`);

// --- no branch refs anywhere -----------------------------------------------
// A raw URL whose ref is not 40 hex characters can move under the case.
//
// Two kinds of match are NOT violations and must be excluded, or this check
// fails on the very text that documents the rule it enforces — the same
// self-match that broke App 1's secret scanner and this repo's custody check:
//
//   * a template expression, e.g. `${EVIDENCE_COMMIT}` — the ref is resolved at
//     runtime from EVIDENCE_COMMIT, which is separately asserted to be 40 hex
//     characters above;
//   * a documentation placeholder, e.g. `<40-hex commit>` in a comment
//     explaining the required shape.
//
// Both are recognised by the ref containing a character no real git ref can:
// `$`, `{`, `<` or `>`.
const BRANCHY = /raw\.githubusercontent\.com\/[^/\s]+\/[^/\s]+\/([^/\s)"'`]+)/g;
const isPlaceholder = (ref) => /[${}<>]/.test(ref);

const scanned = [
  'frontend/src/config.ts',
  'frontend/src/pages/Demo.tsx',
  'frontend/src/pages/Help.tsx',
  'evidence/README.md',
  'docs/BUILD-PLAN.md',
];
let branchRefs = 0;
let literalUrls = 0;
for (const rel of scanned) {
  const text = readFileSync(resolve(repoRoot, rel), 'utf8');
  for (const m of text.matchAll(BRANCHY)) {
    const ref = m[1];
    if (isPlaceholder(ref)) continue;
    literalUrls += 1;
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      fail(`${rel} pins evidence to a non-commit ref: "${ref}"`);
      branchRefs += 1;
    }
  }
}
if (branchRefs === 0) {
  ok(`no evidence URL pins to a branch or tag (${literalUrls} literal URLs checked)`);
}

// --- the recorded table ----------------------------------------------------
const readme = readFileSync(resolve(repoRoot, 'evidence/README.md'), 'utf8');
const rowRe = /\|\s*`([^`]+\.json)`\s*\|\s*`[0-9a-f]{7}`\s*\|\s*\[raw\]\((https:\/\/raw\.githubusercontent\.com\/[^)]+)\)\s*\|\s*`([0-9a-f]{64})`\s*\|/g;
const recorded = [...readme.matchAll(rowRe)].map((m) => ({ file: m[1], url: m[2], sha: m[3] }));

if (recorded.length === 0) {
  fail('evidence/README.md records no fixture URLs');
} else {
  ok(`evidence/README.md records ${recorded.length} fixture URLs`);
}

// --- committed blobs, for the third comparison -----------------------------
function blobOf(path) {
  try {
    return execFileSync('git', ['cat-file', 'blob', `${pin}:${path}`], {
      cwd: repoRoot, maxBuffer: 1 << 24,
    });
  } catch {
    return null;
  }
}

// --- fetch and compare ------------------------------------------------------
for (const row of recorded) {
  const path = row.url.split(`/${pin}/`)[1];
  let res;
  try {
    res = await fetch(row.url);
  } catch (e) {
    fail(`${path} — fetch failed: ${e.message}`);
    continue;
  }
  if (res.status !== 200) {
    fail(`${path} — HTTP ${res.status}`);
    continue;
  }
  const served = Buffer.from(await res.arrayBuffer());
  const servedSha = sha256(served);

  if (servedSha !== row.sha) {
    fail(`${path} — served bytes hash to ${servedSha.slice(0, 16)}…, README records ${row.sha.slice(0, 16)}…`);
    continue;
  }
  if (served.includes(Buffer.from('\r\n'))) {
    fail(`${path} — served bytes contain CRLF`);
    continue;
  }
  const blob = blobOf(path);
  if (blob && sha256(blob) !== servedSha) {
    fail(`${path} — the committed blob and the served bytes differ`);
    continue;
  }
  ok(`${path} — 200, ${served.length}B, sha256 ${servedSha.slice(0, 12)}…`);
}

console.log(
  failures === 0
    ? `\nAll ${recorded.length} published fixtures verified.`
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
