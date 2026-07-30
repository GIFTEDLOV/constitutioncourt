/**
 * Network constants and the locked vocabulary the contract enforces.
 *
 * Everything here that mirrors the contract is a copy of a value the contract
 * owns, kept so the UI can validate before a signature rather than after a
 * revert. Where the two could drift, the contract wins — the frontend never
 * decides anything the contract adopts.
 */

export const CHAIN_ID = 4221;
export const CHAIN_ID_HEX = '0x107d';
export const CHAIN_NAME = 'GenLayer Bradbury Testnet';
export const RPC_URL = 'https://rpc-bradbury.genlayer.com';
export const EXPLORER = 'https://explorer-bradbury.genlayer.com';

export const REPO = 'https://github.com/GIFTEDLOV/constitutioncourt';

/** The exact genlayer-js this bundle was built against; asserted by e2e/reproducibility.mjs. */
export const SDK_VERSION = '1.1.8';

/**
 * SHA-256 of the contract source embedded in this bundle, over its canonical LF
 * bytes.
 *
 * The deploy payload is this file byte-for-byte — there is no compilation step
 * to normalise it — so its hash decides the deployed contract's identity. App 1
 * deployed *different contracts from the same commit* because a Windows
 * checkout materialised CRLF; `.gitattributes` pins `frontend/src/contract/*.py`
 * to LF and `e2e/reproducibility.mjs` asserts this constant against the file on
 * both Windows and Linux CI.
 */
export const CONTRACT_SOURCE_SHA256 =
  'bf845bc43768cb0829157ae9e7dad01a4d15b333c4139255d5018ac6ecf99341';

/** Runner version hash pinned in the contract header. Never an alias. */
export const RUNNER_HASH = 'py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6';

// --------------------------------------------------------------- vocabulary --

export const STATUSES = ['OPEN', 'RESPONDED', 'RULED'] as const;
export type CaseStatus = (typeof STATUSES)[number];

export const OUTCOMES = ['COMPLIANT', 'NON_COMPLIANT', 'INSUFFICIENT_EVIDENCE'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const FINAL_STATUSES = ['CERTIFIED', 'REJECTED', 'UNRESOLVED'] as const;
export type FinalStatus = (typeof FINAL_STATUSES)[number];

/**
 * The locked mapping, mirrored for display only.
 *
 * The contract applies this after consensus. The frontend never computes a
 * final status a contract adopts — it uses this to check what was recorded and
 * to explain the vocabulary, and it renders whatever the contract actually
 * stored even if the two ever disagreed.
 */
export const OUTCOME_TO_FINAL: Record<Outcome, FinalStatus> = {
  COMPLIANT: 'CERTIFIED',
  NON_COMPLIANT: 'REJECTED',
  INSUFFICIENT_EVIDENCE: 'UNRESOLVED',
};

export interface OutcomeMeaning {
  outcome: Outcome;
  final: FinalStatus;
  headline: string;
  /** What it does NOT mean. The most important column on the page. */
  notWhat: string;
}

/**
 * Plain-language meanings. The `notWhat` column exists because the single
 * biggest misreading risk in this product is treating CERTIFIED as a warrant.
 */
export const OUTCOME_MEANINGS: OutcomeMeaning[] = [
  {
    outcome: 'COMPLIANT',
    final: 'CERTIFIED',
    headline:
      'Validators read the pinned evidence and found no violation of the pinned constitution.',
    notWhat:
      'It does not mean the proposal is legal, safe, wise, or automatically authorised for '
      + 'execution. It is a finding on a record, not a warrant.',
  },
  {
    outcome: 'NON_COMPLIANT',
    final: 'REJECTED',
    headline:
      'Validators found at least one applicable rule was violated, and cited it by id.',
    notWhat:
      'It does not void the vote, reverse a transfer, or bind anyone. Nothing is executed or '
      + 'undone; the finding is an opinion with citations.',
  },
  {
    outcome: 'INSUFFICIENT_EVIDENCE',
    final: 'UNRESOLVED',
    headline:
      'The documents were read successfully but do not settle the question.',
    notWhat:
      'It is neither exoneration nor condemnation, and it is not an error. A fetch failure is '
      + 'never recorded as this outcome.',
  },
];

/** The five evidence roles, in the order the case presents them. */
export const EVIDENCE_ROLES = [
  {
    key: 'constitution_url',
    source: 'constitution',
    label: 'Constitution',
    role: 'The rules being applied',
    schema: 'constitutioncourt/constitution@1',
    required: true,
  },
  {
    key: 'proposal_url',
    source: 'proposal',
    label: 'Proposal',
    role: 'What was proposed',
    schema: 'constitutioncourt/proposal@1',
    required: true,
  },
  {
    key: 'vote_record_url',
    source: 'vote-record',
    label: 'Vote record',
    role: 'How the vote went',
    schema: 'constitutioncourt/vote-record@1',
    required: true,
  },
  {
    key: 'notice_record_url',
    source: 'notice-record',
    label: 'Notice record',
    role: 'How it was announced',
    schema: 'constitutioncourt/notice-record@1',
    required: true,
  },
  {
    key: 'response_url',
    source: 'response',
    label: 'Respondent response',
    role: 'The respondent’s argument — optional',
    schema: 'constitutioncourt/response@1',
    required: false,
  },
] as const;

export type EvidenceKey = (typeof EVIDENCE_ROLES)[number]['key'];

/** Contract bounds, mirrored so the wizard can reject before a signature. */
export const MAX_URL_LEN = 2048;
export const MAX_TITLE_LEN = 200;

/**
 * Bradbury serialises transactions per contract and each step waits on the
 * previous one's finality, so a single write can take ~30 minutes to settle.
 * The UI must never imply completion before the receipt says so.
 */
export const TYPICAL_SETTLE_SECONDS = 1900;

/** Commit pinning the evidence fixtures used by /demo. */
export const EVIDENCE_COMMIT = 'main';

export interface DemoCase {
  id: string;
  label: string;
  blurb: string;
  /** What this fixture is built to demonstrate. */
  turnsOn: string;
  dir: string;
  expected: { outcome: Outcome; final: FinalStatus; ruleIds: string[] };
  hasResponse: boolean;
  /** Deployed instance, when one exists. Null renders as "not deployed". */
  address: string | null;
}

/**
 * The four fixture cases. Addresses are null at Stage 4 — nothing is deployed
 * yet, and a fabricated address would be worse than an honest absence.
 */
export const DEMO_CASES: DemoCase[] = [
  {
    id: 'case-001-compliant-simple-majority',
    label: 'Compliant — simple majority',
    blurb:
      'A 40,000 USDC grant carried on a simple majority, with 14 days of notice. Every '
      + 'applicable rule is satisfied on the record.',
    turnsOn:
      'Scope and tier: the amount falls under the 100,000 USDC bar, so the two-thirds rule '
      + 'never applies.',
    dir: 'evidence/case-001-compliant-simple-majority',
    expected: { outcome: 'COMPLIANT', final: 'CERTIFIED', ruleIds: [] },
    hasResponse: true,
    address: null,
  },
  {
    id: 'case-002-non-compliant-two-thirds',
    label: 'Rejected — two-thirds threshold',
    blurb:
      '250,000 USDC passes the simple-majority bar and fails the two-thirds bar that its tier '
      + 'requires. The vote record declares PASSED.',
    turnsOn:
      'Tier and basis: 250,000 crosses into ART-4.3, and excluding abstentions the 65.38% for '
      + 'falls short of 66.67%. The declared result is the thing in dispute.',
    dir: 'evidence/case-002-non-compliant-two-thirds',
    expected: { outcome: 'NON_COMPLIANT', final: 'REJECTED', ruleIds: ['ART-4.3'] },
    hasResponse: false,
    address: null,
  },
  {
    id: 'case-003-non-compliant-notice-period',
    label: 'Rejected — notice period',
    blurb:
      'The vote itself is impeccable. The announcement did not meet the notice rule, and the '
      + 'respondent argues — persuasively — that it should not matter.',
    turnsOn:
      'Sufficiency: whether a chat reminder counts as "publicly announced, in full", and '
      + 'whether it counts when it landed after voting opened.',
    dir: 'evidence/case-003-non-compliant-notice-period',
    expected: { outcome: 'NON_COMPLIANT', final: 'REJECTED', ruleIds: ['ART-5.4'] },
    hasResponse: true,
    address: null,
  },
  {
    id: 'case-004-insufficient-evidence',
    label: 'Unresolved — insufficient evidence',
    blurb:
      'The vote record has no tally. Every document fetches and parses cleanly; the one fact '
      + 'needed to decide the allegation is simply absent.',
    turnsOn:
      'Silence: deciding that an absence is neither compliance nor violation is a judgment a '
      + 'threshold function cannot express.',
    dir: 'evidence/case-004-insufficient-evidence',
    expected: { outcome: 'INSUFFICIENT_EVIDENCE', final: 'UNRESOLVED', ruleIds: [] },
    hasResponse: false,
    address: null,
  },
];

export function explorerTx(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${EXPLORER}/address/${address}`;
}
