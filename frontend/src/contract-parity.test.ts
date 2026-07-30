/**
 * Canonical contract source parity.
 *
 * The frontend deploys `src/contract/constitution_court.py` byte for byte —
 * there is no compilation step to normalise it — so its bytes decide the
 * deployed contract's address and identity. Three things therefore have to
 * agree, and this file asserts all three:
 *
 *   1. the embedded copy is byte-identical to `contracts/constitution_court.py`;
 *   2. it contains no CRLF, whatever platform the checkout happened on;
 *   3. `CONTRACT_SOURCE_SHA256` in config.ts is its real hash.
 *
 * App 1 deployed *different contracts from the same commit* because a Windows
 * checkout materialised CRLF. `.gitattributes` pins both paths to LF; this test
 * is what proves the pin is actually in effect wherever the suite runs.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import embedded from './contract/constitution_court.py?raw';
import { CONTRACT_SOURCE_SHA256, RUNNER_HASH } from './config';
import { sha256Hex } from './lib/hash';

const REPO_ROOT = resolve(__dirname, '..', '..');
const CANONICAL = resolve(REPO_ROOT, 'contracts', 'constitution_court.py');
const EMBEDDED = resolve(__dirname, 'contract', 'constitution_court.py');

describe('the embedded contract is the canonical contract', () => {
  it('is byte-identical to contracts/constitution_court.py', () => {
    const canonical = readFileSync(CANONICAL);
    const copy = readFileSync(EMBEDDED);
    expect(copy.equals(canonical)).toBe(true);
  });

  it('contains no CRLF — the bytes must not depend on the checkout platform', () => {
    const copy = readFileSync(EMBEDDED);
    expect(copy.includes(Buffer.from('\r\n'))).toBe(false);
  });

  it('hashes to the constant recorded in config.ts', async () => {
    const onDisk = readFileSync(EMBEDDED, 'utf8');
    expect(await sha256Hex(onDisk)).toBe(CONTRACT_SOURCE_SHA256);
  });

  it('hashes identically whether read from disk or imported with ?raw', async () => {
    // If Vite's `?raw` ever normalised line endings, the bundle would deploy
    // different bytes than the file this test verified.
    const onDisk = readFileSync(EMBEDDED, 'utf8');
    expect(await sha256Hex(embedded)).toBe(await sha256Hex(onDisk));
  });
});

describe('the embedded contract carries the pinned runner', () => {
  it('declares the exact runner version hash on its first line', () => {
    const first = embedded.split('\n')[0]!;
    expect(first).toContain(RUNNER_HASH);
  });

  it('uses no local-Studio runner alias', () => {
    // `:test` and `:latest` are Studio-only aliases that every GenLayer network
    // rejects, so a bundle carrying one is undeployable.
    expect(embedded).not.toMatch(/py-genlayer(-multi)?:(test|latest)\b/);
  });

  it('declares the five locked methods and no others', () => {
    for (const m of ['submit_response', 'rule', 'get_state', 'get_evidence_sources']) {
      expect(embedded).toContain(`def ${m}(`);
    }
    const publicDecorators = embedded.match(/@gl\.public\.(write|view)/g) ?? [];
    expect(publicDecorators).toHaveLength(4); // plus __init__ = five methods
  });

  it('remains custody-free', () => {
    // No payable surface, no external message, no cross-contract call. Comment
    // lines are stripped first: the contract documents its own exclusions.
    const code = embedded
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/payable/);
    expect(code).not.toMatch(/gl\.message\.value/);
    expect(code).not.toMatch(/\.emit\(/);
  });
});
