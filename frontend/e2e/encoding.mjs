/**
 * Calldata encoding test. No wallet, no network, no signature.
 *
 * The constructor takes `respondent: Address`. `calldata.encode()` dispatches on
 * `instanceof CalldataAddress`, so a plain `"0x…"` string is encoded as a
 * 42-character `str` and GenVM hands that to an Address-annotated parameter.
 * The contract's `isinstance(respondent, Address)` check then fails — but only
 * after the transaction has reached consensus, roughly 30 minutes and one
 * signature later.
 *
 * App 1 lost a deployment to exactly this. This script encodes the real
 * constructor argument list through the real codec and asserts the wire bytes
 * carry an Address, not a string.
 */

import { abi } from 'genlayer-js';
import { CalldataAddress } from 'genlayer-js/types';

const { calldata } = abi;

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { failures += 1; console.error(`  FAIL  ${m}`); };

console.log('Calldata encoding test (offline — nothing is signed or sent)');

function addressArg(hex) {
  const clean = hex.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) {
    throw new Error(`Not a 20-byte address: ${JSON.stringify(hex)}`);
  }
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new CalldataAddress(bytes);
}

const RESPONDENT = '0x2222222222222222222222222222222222222222';

// --- 1. the helper produces a CalldataAddress ------------------------------
const encoded = addressArg(RESPONDENT);
if (encoded instanceof CalldataAddress) ok('addressArg returns a CalldataAddress');
else fail('addressArg did not return a CalldataAddress');

if (encoded.bytes?.length === 20) ok('encodes exactly 20 bytes');
else fail(`encoded ${encoded.bytes?.length} bytes, expected 20`);

// --- 2. the wire bytes differ from the string form -------------------------
const asAddress = calldata.encode([encoded]);
const asString = calldata.encode([RESPONDENT]);

if (asAddress.length !== asString.length) {
  ok(`Address encoding (${asAddress.length}B) differs from string encoding (${asString.length}B)`);
} else {
  fail('Address and string encode to the same length — the distinction is being lost');
}

if (asString.length > asAddress.length) {
  ok('the string form is longer, as a 42-character str would be');
} else {
  fail('unexpected: the string form is not longer than the address form');
}

// --- 3. the full constructor argument list round-trips ---------------------
const args = [
  addressArg(RESPONDENT),
  'MC-2026-021 treasury disbursement',
  'https://evidence.example/constitution.json',
  'https://evidence.example/proposal.json',
  'https://evidence.example/vote-record.json',
  'https://evidence.example/notice-record.json',
];

let wire;
try {
  wire = calldata.encode(args);
  ok(`the six constructor arguments encode (${wire.length} bytes)`);
} catch (e) {
  fail(`constructor arguments failed to encode: ${e.message}`);
}

if (wire) {
  const decoded = calldata.decode(wire);
  if (Array.isArray(decoded) && decoded.length === 6) ok('decodes back to six arguments');
  else fail(`decoded to ${Array.isArray(decoded) ? decoded.length : typeof decoded}, expected 6`);

  const first = decoded?.[0];
  if (first && typeof first !== 'string') {
    ok('argument 0 survives the round trip as an Address, not a string');
  } else {
    fail(`argument 0 round-tripped as ${typeof first} — this is the App 1 deployment failure`);
  }

  if (decoded?.[1] === args[1]) ok('the case title round-trips unchanged');
  else fail('the case title did not round-trip');

  for (let i = 2; i < 6; i += 1) {
    if (decoded?.[i] === args[i]) ok(`evidence URL ${i - 1} round-trips unchanged`);
    else fail(`evidence URL ${i - 1} did not round-trip`);
  }
}

// --- 4. malformed addresses are rejected before a signature ---------------
for (const bad of ['0x1234', '', 'not-hex', `0x${'a'.repeat(41)}`]) {
  try {
    addressArg(bad);
    fail(`accepted a malformed address: ${JSON.stringify(bad)}`);
  } catch {
    ok(`rejects malformed address ${JSON.stringify(bad)}`);
  }
}

console.log(failures === 0 ? '\nEncoding test passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
