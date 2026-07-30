/**
 * Reproducible-build and pin check. No browser, no network.
 *
 * Asserts the three things that decide whether this bundle deploys the contract
 * everyone thinks it deploys:
 *
 *   1. the embedded contract is byte-identical to contracts/constitution_court.py;
 *   2. it contains no CRLF, so its bytes do not depend on the checkout platform;
 *   3. CONTRACT_SOURCE_SHA256 in config.ts is its real hash.
 *
 * Plus: every dependency is an exact pin, and the SDK version recorded in
 * config.ts matches what package.json actually installs.
 *
 * App 1 deployed different contracts from the same commit because a Windows
 * checkout materialised CRLF. This script is what makes that impossible to
 * repeat unnoticed — it runs on both Windows and Linux CI and must agree.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, '..');
const repo = resolve(frontend, '..');

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { failures += 1; console.error(`  FAIL  ${m}`); };

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

console.log('Reproducibility and pin check');
console.log(`  platform: ${process.platform}, node ${process.version}`);

// --- 1. embedded contract parity ------------------------------------------
const canonicalPath = resolve(repo, 'contracts', 'constitution_court.py');
const embeddedPath = resolve(frontend, 'src', 'contract', 'constitution_court.py');
const canonical = readFileSync(canonicalPath);
const embedded = readFileSync(embeddedPath);

if (embedded.equals(canonical)) ok('embedded contract is byte-identical to the canonical contract');
else fail(`embedded contract differs from ${canonicalPath}`);

if (!embedded.includes(Buffer.from('\r\n'))) ok('embedded contract contains no CRLF');
else fail('embedded contract contains CRLF — its bytes depend on the checkout platform');

if (!canonical.includes(Buffer.from('\r\n'))) ok('canonical contract contains no CRLF');
else fail('canonical contract contains CRLF');

// --- 2. recorded hash ------------------------------------------------------
const configSrc = readFileSync(resolve(frontend, 'src', 'config.ts'), 'utf8');
const recorded = /CONTRACT_SOURCE_SHA256\s*=\s*\n?\s*'([0-9a-f]{64})'/.exec(configSrc)?.[1];
const actual = sha256(embedded);

if (!recorded) fail('CONTRACT_SOURCE_SHA256 not found in config.ts');
else if (recorded === actual) ok(`CONTRACT_SOURCE_SHA256 matches (${actual.slice(0, 16)}…)`);
else fail(`CONTRACT_SOURCE_SHA256 is ${recorded.slice(0, 16)}… but the file hashes to ${actual.slice(0, 16)}…`);

console.log(`  contract sha256: ${actual}`);
console.log(`  contract bytes:  ${embedded.length}`);

// --- 3. runner pin ---------------------------------------------------------
const firstLine = embedded.toString('utf8').split('\n')[0];
if (/"Depends":\s*"py-genlayer(-multi)?:[0-9a-z]{40,}"/.test(firstLine)) {
  ok('contract pins a runner version hash');
} else {
  fail('contract does not pin a runner version hash on its first line');
}
if (/py-genlayer(-multi)?:(test|latest)\b/.test(embedded.toString('utf8'))) {
  fail('contract uses a local-Studio runner alias, which every network rejects');
} else {
  ok('contract uses no runner alias');
}

// --- 4. exact dependency pins ---------------------------------------------
const pkg = JSON.parse(readFileSync(resolve(frontend, 'package.json'), 'utf8'));
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const ranged = Object.entries(allDeps).filter(([, v]) => /[\^~><*]|\|\|/.test(v));
if (ranged.length === 0) {
  ok(`all ${Object.keys(allDeps).length} dependencies are exact pins`);
} else {
  fail(`non-exact pins: ${ranged.map(([k, v]) => `${k}@${v}`).join(', ')}`);
}

// --- 5. lockfile agreement -------------------------------------------------
let lock;
try {
  lock = JSON.parse(readFileSync(resolve(frontend, 'package-lock.json'), 'utf8'));
} catch {
  lock = null;
}
if (!lock) {
  fail('package-lock.json is missing — the pin set is not reproducible without it');
} else {
  const mismatched = [];
  for (const [name, want] of Object.entries(allDeps)) {
    const got = lock.packages?.[`node_modules/${name}`]?.version;
    if (got && got !== want) mismatched.push(`${name}: package.json ${want}, lock ${got}`);
  }
  if (mismatched.length === 0) ok('package-lock.json agrees with every pin');
  else fail(`lockfile disagreement — ${mismatched.join('; ')}`);
}

// --- 6. SDK version recorded in config ------------------------------------
const sdkRecorded = /SDK_VERSION\s*=\s*'([^']+)'/.exec(configSrc)?.[1];
const sdkPinned = allDeps['genlayer-js'];
if (sdkRecorded === sdkPinned) ok(`SDK_VERSION matches genlayer-js pin (${sdkPinned})`);
else fail(`SDK_VERSION is ${sdkRecorded} but genlayer-js is pinned at ${sdkPinned}`);

// --- 7. no contract deployment config leaked into the bundle ---------------
if (/DEMO_CASES[\s\S]*?address:\s*'0x/.test(configSrc)) {
  fail('a demo case names a deployed address, but nothing is deployed at this stage');
} else {
  ok('no demo case claims a deployed address');
}

console.log(failures === 0 ? '\nReproducibility check passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
