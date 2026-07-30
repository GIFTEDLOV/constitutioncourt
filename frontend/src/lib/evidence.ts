/**
 * Evidence document fetching, schema validation and preview.
 *
 * The wizard tests every URL before deployment because the four evidence URLs
 * are immutable once the case exists. A typo caught here costs a keystroke; the
 * same typo caught after deployment costs the whole case — the contract has no
 * method to change an evidence URL, by design.
 *
 * The `schema` literal check is the one that catches the subtle failure. A
 * proposal served where a vote record was expected fetches fine and parses
 * fine; only the literal reveals that the case would adjudicate a different
 * question than the filer intended. The contract raises `[INVALID_EVIDENCE]` on
 * exactly this, so catching it here turns a failed ruling into a form error.
 */

import { EVIDENCE_ROLES, type EvidenceKey } from '../config';

export type EvidenceSourceName =
  | 'constitution' | 'proposal' | 'vote-record' | 'notice-record' | 'response';

export const SCHEMA_LITERALS: Record<EvidenceSourceName, string> = {
  constitution: 'constitutioncourt/constitution@1',
  proposal: 'constitutioncourt/proposal@1',
  'vote-record': 'constitutioncourt/vote-record@1',
  'notice-record': 'constitutioncourt/notice-record@1',
  response: 'constitutioncourt/response@1',
};

export interface FetchProbe {
  ok: boolean;
  /** Present when the document fetched, parsed and carried the right schema. */
  doc?: Record<string, unknown>;
  /** Short, human-readable failure. */
  error?: string;
  /** Classification mirroring the contract's error taxonomy. */
  kind?: 'transient' | 'invalid' | 'network';
  /** Compact one-line summary for the preview panel. */
  summary?: string;
  status?: number;
}

const TRANSIENT_STATUS = new Set([408, 425, 429]);

export function sourceForKey(key: EvidenceKey): EvidenceSourceName {
  const role = EVIDENCE_ROLES.find((r) => r.key === key);
  return (role?.source ?? 'constitution') as EvidenceSourceName;
}

/**
 * Validate an already-parsed document against its expected schema literal, and
 * summarise it for preview.
 *
 * Split from the fetch so it can be exercised without a network — every schema
 * rule is checked here.
 */
export function validateDocument(
  source: EvidenceSourceName,
  parsed: unknown,
): FetchProbe {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, kind: 'invalid', error: 'The document is not a JSON object.' };
  }
  const doc = parsed as Record<string, unknown>;
  const expected = SCHEMA_LITERALS[source];
  const actual = typeof doc.schema === 'string' ? doc.schema : undefined;

  if (!actual) {
    return {
      ok: false,
      kind: 'invalid',
      error: `No "schema" field. Expected "${expected}". Validators reject a document that does `
        + 'not identify itself.',
    };
  }
  if (actual !== expected) {
    const knownAs = (Object.entries(SCHEMA_LITERALS) as [EvidenceSourceName, string][])
      .find(([, lit]) => lit === actual);
    const hint = knownAs
      ? ` That is the ${knownAs[0]} schema — this URL looks like the wrong document for this slot.`
      : '';
    return {
      ok: false,
      kind: 'invalid',
      error: `Schema is "${actual}", expected "${expected}".${hint}`,
    };
  }

  return { ok: true, doc, summary: summarize(source, doc) };
}

/** A one-line description of what the document actually contains. */
export function summarize(source: EvidenceSourceName, doc: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  switch (source) {
    case 'constitution': {
      const rules = Array.isArray(doc.rules) ? doc.rules : [];
      const org = s(doc.organization) || 'unnamed organisation';
      const ids = rules
        .map((r) => (r && typeof r === 'object' ? s((r as Record<string, unknown>).id) : ''))
        .filter(Boolean);
      return `${org} — ${ids.length} rule${ids.length === 1 ? '' : 's'}`
        + (ids.length ? ` (${ids.slice(0, 6).join(', ')}${ids.length > 6 ? '…' : ''})` : '');
    }
    case 'proposal': {
      const amount = doc.requested_amount as Record<string, unknown> | undefined;
      const amt = amount ? `${s(amount.amount)} ${s(amount.currency)}`.trim() : '';
      return [s(doc.proposal_id), s(doc.title), amt].filter(Boolean).join(' · ') || 'proposal';
    }
    case 'vote-record': {
      const tally = doc.tally as Record<string, unknown> | undefined;
      const declared = s(doc.declared_result);
      if (!tally) {
        return `${s(doc.proposal_id)} · no tally present`
          + (declared ? ` · declares ${declared}` : '');
      }
      const parts = Object.entries(tally).map(([k, v]) => `${k} ${s(v)}`).join(', ');
      return `${parts}${declared ? ` · declares ${declared}` : ''}`;
    }
    case 'notice-record': {
      const notices = Array.isArray(doc.notices) ? doc.notices : [];
      return `${notices.length} notice${notices.length === 1 ? '' : 's'}`;
    }
    case 'response': {
      const points = Array.isArray(doc.supporting_points) ? doc.supporting_points.length : 0;
      return `response from ${s(doc.respondent) || 'respondent'}`
        + (points ? ` · ${points} supporting point${points === 1 ? '' : 's'}` : '');
    }
    default:
      return 'document';
  }
}

/**
 * Fetch and validate one evidence URL.
 *
 * Failure classification mirrors the contract's taxonomy so the wizard can say
 * "retry this" versus "this URL is wrong" rather than a generic error. A CORS
 * rejection is reported honestly as un-probeable rather than as a bad URL —
 * validators fetch server-side and are not subject to CORS, so a document the
 * browser cannot read may still be perfectly adjudicable.
 */
export async function probeEvidence(
  url: string,
  source: EvidenceSourceName,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchProbe> {
  let res: Response;
  try {
    res = await fetchImpl(url, { redirect: 'follow' });
  } catch {
    return {
      ok: false,
      kind: 'network',
      error: 'The browser could not fetch this URL. That may be CORS — validators fetch '
        + 'server-side and are not subject to it — or the host may be unreachable. Confirm the '
        + 'URL opens in a new tab before filing.',
    };
  }

  if (TRANSIENT_STATUS.has(res.status) || res.status >= 500) {
    return {
      ok: false,
      kind: 'transient',
      status: res.status,
      error: `The host returned ${res.status}. That is retryable — validators would disagree and `
        + 'consensus would retry rather than record a ruling.',
    };
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      kind: 'invalid',
      status: res.status,
      error: `The host returned ${res.status}. This URL does not serve the document.`,
    };
  }

  let text: string;
  try {
    text = await res.text();
  } catch {
    return { ok: false, kind: 'invalid', error: 'The response body could not be read.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      kind: 'invalid',
      status: res.status,
      error: 'The document is not valid JSON. If this is a GitHub page URL, use the raw one.',
    };
  }

  return { ...validateDocument(source, parsed), status: res.status };
}

export interface ConstitutionRule {
  id: string;
  title?: string;
  text?: string;
  scope?: string;
}

/** Extract the rule list from a constitution document, tolerating a bad shape. */
export function extractRules(doc: unknown): ConstitutionRule[] {
  if (!doc || typeof doc !== 'object') return [];
  const rules = (doc as Record<string, unknown>).rules;
  if (!Array.isArray(rules)) return [];
  const out: ConstitutionRule[] = [];
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    if (!id) continue;
    out.push({
      id,
      title: typeof rec.title === 'string' ? rec.title : undefined,
      text: typeof rec.text === 'string' ? rec.text : undefined,
      scope: typeof rec.scope === 'string' ? rec.scope : undefined,
    });
  }
  return out;
}
