/**
 * Input validation, shared by the create wizard, response submission and import.
 *
 * Every rule here mirrors a deterministic `[INPUT]` guard in
 * `contracts/constitution_court.py`. The point is to reject before a signature
 * rather than after a ~30-minute revert — the contract remains the authority,
 * and anything this file lets through the contract will still check.
 */

import { MAX_TITLE_LEN, MAX_URL_LEN } from '../config';

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function isAddress(v: string): boolean {
  return ADDRESS_RE.test(v.trim());
}

export function isTxHash(v: string): boolean {
  return TX_HASH_RE.test(v.trim());
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export interface Check {
  ok: boolean;
  reason?: string;
  /** Non-blocking: the value is accepted but carries a risk worth stating. */
  warn?: string;
}

/**
 * Credential-shaped query parameters the contract rejects outright.
 * Kept in sync with `_validate_url` in the contract.
 */
const CREDENTIAL_MARKERS = [
  'access_token=', 'api_key=', 'apikey=', 'auth=', 'token=', 'signature=',
];

/**
 * Validate an evidence URL against the contract's own rules, then warn about
 * mutability.
 *
 * HTTPS is mandatory because over plain HTTP an on-path attacker can serve
 * different bytes to different validators and split consensus without even
 * controlling the host. Embedded credentials are rejected because evidence
 * requiring a secret is not something every validator can independently fetch —
 * and the secret would be published on-chain forever.
 */
export function checkEvidenceUrl(raw: string): Check {
  const v = raw.trim();
  if (!v) return { ok: false, reason: 'Required.' };
  if (v.length > MAX_URL_LEN) {
    return { ok: false, reason: `Longer than ${MAX_URL_LEN} characters.` };
  }

  // Whitespace or control characters: either a paste error, or an attempt to
  // make two URLs render alike while resolving differently.
  for (const ch of v) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x21 || code === 0x7f) {
      return { ok: false, reason: 'Contains whitespace or control characters.' };
    }
  }

  if (!v.startsWith('https://')) {
    return {
      ok: false,
      reason: 'Must be an https:// URL — every validator has to fetch it publicly and identically.',
    };
  }

  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { ok: false, reason: 'Not a valid URL.' };
  }
  if (!u.hostname || !u.hostname.includes('.')) {
    return { ok: false, reason: 'Host looks invalid.' };
  }

  // The authority component is everything before the first '/', '?' or '#'.
  const rest = v.slice('https://'.length);
  const authority = rest.split(/[/?#]/)[0] ?? '';
  if (authority.includes('@')) {
    return { ok: false, reason: 'Embeds credentials in the URL. Evidence must be public.' };
  }

  const lowered = v.toLowerCase();
  const marker = CREDENTIAL_MARKERS.find((m) => lowered.includes(m));
  if (marker) {
    return {
      ok: false,
      reason: `Carries a credential-shaped parameter (${marker.replace('=', '')}). Evidence must be public.`,
    };
  }

  return mutabilityWarning(v, u);
}

/**
 * Mutable-source detection.
 *
 * The URL is pinned on-chain but its *content* is not: validators re-fetch at
 * ruling time, which may be long after filing. A branch URL that moves between
 * those two moments changes what is adjudicated, and different validators
 * fetching mid-push can see different bytes and split consensus.
 */
function mutabilityWarning(v: string, u: URL): Check {
  if (u.hostname === 'raw.githubusercontent.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const ref = parts[2];
    if (ref && !/^[0-9a-f]{40}$/i.test(ref)) {
      return {
        ok: true,
        warn: `"${ref}" looks like a branch or tag, not a commit. Its content can change after `
          + 'you file — pin to a 40-character commit hash so validators fetch the same bytes '
          + 'you did.',
      };
    }
    return { ok: true };
  }
  if (/^https:\/\/github\.com\/.+\/blob\//.test(v)) {
    return {
      ok: true,
      warn: 'This is a GitHub HTML page, not raw JSON. Validators fetch this URL literally and '
        + 'will not find a document here. Use the raw, commit-pinned URL.',
    };
  }
  if (u.hostname === 'gist.github.com' || u.hostname === 'gist.githubusercontent.com') {
    if (!/\/raw\/[0-9a-f]{40}\//i.test(u.pathname)) {
      return {
        ok: true,
        warn: 'A gist URL without a revision hash serves the latest revision, which can change '
          + 'after you file. Use the permalink to a specific revision.',
      };
    }
    return { ok: true };
  }
  return {
    ok: true,
    warn: 'Pinned by URL, not by content. Whatever this URL serves when validators fetch it is '
      + 'what gets adjudicated — host it somewhere immutable.',
  };
}

/** The respondent must be a valid, non-zero address that is not the challenger. */
export function checkRespondent(respondent: string, challenger?: string | null): Check {
  const v = respondent.trim();
  if (!v) return { ok: false, reason: 'Required.' };
  if (!isAddress(v)) return { ok: false, reason: 'Enter a valid 0x address (40 hex characters).' };
  if (sameAddress(v, ZERO_ADDRESS)) return { ok: false, reason: 'Cannot be the zero address.' };
  if (challenger && sameAddress(v, challenger)) {
    return {
      ok: false,
      reason: 'The respondent must differ from your wallet. A case against yourself is either a '
        + 'mistake or an attempt to manufacture a favourable ruling.',
    };
  }
  return { ok: true };
}

export function checkCaseTitle(raw: string): Check {
  const v = raw.trim();
  if (!v) return { ok: false, reason: 'Required.' };
  if (v.length > MAX_TITLE_LEN) {
    return { ok: false, reason: `Longer than ${MAX_TITLE_LEN} characters (currently ${v.length}).` };
  }
  return { ok: true };
}

/** All four URLs must be distinct — the same document in two roles is a filing error. */
export function checkDistinctUrls(urls: string[]): Check {
  const cleaned = urls.map((u) => u.trim()).filter(Boolean);
  const seen = new Set(cleaned);
  if (seen.size !== cleaned.length) {
    return {
      ok: false,
      reason: 'The same URL is pinned in more than one role. Each document plays a different '
        + 'part in the ruling.',
    };
  }
  return { ok: true };
}
