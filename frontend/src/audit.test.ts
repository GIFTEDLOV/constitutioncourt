/**
 * Stage 5 pre-deployment audit assertions.
 *
 * These pin the parts of the flow whose inputs come from a *live* contract
 * rather than from a fixture the tests themselves wrote. Every value used here
 * was dumped from the real contract through the direct-mode harness, so the
 * shapes and formats are the ones a Bradbury deployment will actually produce —
 * not the ones the frontend's own interfaces assume.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { normalizeCaseState } from './chain';
import { roleFor, availableActions } from './lib/actions';
import { checkPostcondition } from './lib/postconditions';
import { sameAddress } from './lib/validation';
import { clearAll, getCase, listCases, upsertCase } from './lib/registry';

/**
 * A real `get_state()` payload, dumped from contracts/constitution_court.py via
 * the direct-mode harness. Note the addresses: `Address.as_hex` returns the
 * EIP-55 **checksummed** mixed-case form, not lowercase.
 */
const LIVE_OPEN = {
  case_title: 'Challenge to case-001-compliant-simple-majority',
  challenger: '0x2bd806c97F0e00aF1a1fC3328fA763a9269723C8',
  respondent: '0x81b637d8fCD2C6da6359E6963113a1170de795e4',
  status: 'OPEN',
  final_status: '',
  outcome: '',
  violated_rule_ids: [],
  evidence_citations: [],
  reasoning: '',
  created_at: '2026-07-30T19:27:00Z',
  responded_at: '',
  ruled_at: '',
  has_response: false,
};

const LIVE_RULED = {
  ...LIVE_OPEN,
  status: 'RULED',
  final_status: 'CERTIFIED',
  outcome: 'COMPLIANT',
  responded_at: '2026-07-30T19:27:00Z',
  ruled_at: '2026-07-30T19:27:00Z',
  has_response: true,
  evidence_citations: [{
    locator: '$.tally',
    quote: 'for: 340000, against: 180000',
    source: 'vote-record',
    // The contract emits an empty string, not an absent key, when the model
    // supplied no `supports`.
    supports: '',
    url: 'https://evidence.constitutioncourt.test/case-001-compliant-simple-majority/vote-record.json',
  }],
  reasoning: 'Derived from the pinned record.',
};

describe('state reading — the live payload matches the frontend interface', () => {
  it('carries every field CaseState declares, with no extras lost', () => {
    const st = normalizeCaseState(LIVE_OPEN);
    expect(Object.keys(st).sort()).toEqual(Object.keys(LIVE_OPEN).sort());
  });

  it('preserves values rather than blanking them', () => {
    const st = normalizeCaseState(LIVE_OPEN);
    expect(st.status).toBe('OPEN');
    expect(st.case_title).toBe(LIVE_OPEN.case_title);
    expect(st.challenger).toBe(LIVE_OPEN.challenger);
    expect(st.has_response).toBe(false);
  });

  it('decodes a live ruling’s citation object', () => {
    const st = normalizeCaseState(LIVE_RULED);
    expect(st.evidence_citations).toHaveLength(1);
    expect(st.evidence_citations[0]!.source).toBe('vote-record');
    expect(st.evidence_citations[0]!.locator).toBe('$.tally');
    // An empty `supports` must stay falsy so the UI does not render an empty
    // "bears on" label.
    expect(st.evidence_citations[0]!.supports).toBe('');
  });

  it('survives a Map, which is what calldata decodes a dict to before jsonSafe', () => {
    // If this ever regressed, every field would read undefined and a case would
    // render blank rather than erroring — a silent, total failure.
    const st = normalizeCaseState(new Map(Object.entries(LIVE_OPEN)));
    expect(st.status).toBe('OPEN');
    expect(st.challenger).toBe(LIVE_OPEN.challenger);
  });
});

describe('role derivation — against checksummed addresses from the contract', () => {
  it('identifies the challenger despite EIP-55 mixed case', () => {
    const st = normalizeCaseState(LIVE_OPEN);
    expect(roleFor(LIVE_OPEN.challenger, st)).toBe('challenger');
  });

  it('identifies the respondent when the wallet reports lowercase', () => {
    // Injected wallets commonly return lowercase; the contract returns
    // checksummed. A case-sensitive compare would make the respondent an
    // observer and hide their only action.
    const st = normalizeCaseState(LIVE_OPEN);
    expect(roleFor(LIVE_OPEN.respondent.toLowerCase(), st)).toBe('respondent');
  });

  it('identifies the challenger when the wallet reports uppercase hex', () => {
    const st = normalizeCaseState(LIVE_OPEN);
    const upper = `0x${LIVE_OPEN.challenger.slice(2).toUpperCase()}`;
    expect(roleFor(upper, st)).toBe('challenger');
  });

  it('offers the respondent their action on a live OPEN case', () => {
    const st = normalizeCaseState(LIVE_OPEN);
    const role = roleFor(LIVE_OPEN.respondent.toLowerCase(), st);
    expect(availableActions({ st, role }).map((a) => a.method))
      .toEqual(['submit_response', 'rule']);
  });

  it('sameAddress is the only comparison used, and it is case-insensitive', () => {
    expect(sameAddress(LIVE_OPEN.challenger, LIVE_OPEN.challenger.toLowerCase())).toBe(true);
    expect(sameAddress(LIVE_OPEN.challenger, LIVE_OPEN.respondent)).toBe(false);
  });
});

describe('ruling postconditions — against a live RULED payload', () => {
  it('passes on the real contract output', () => {
    const st = normalizeCaseState(LIVE_RULED);
    const r = checkPostcondition({ method: 'rule', st });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/COMPLIANT.*CERTIFIED/);
  });

  it('passes on a live NON_COMPLIANT payload citing a real rule', () => {
    const st = normalizeCaseState({
      ...LIVE_RULED,
      outcome: 'NON_COMPLIANT',
      final_status: 'REJECTED',
      violated_rule_ids: ['ART-4.3'],
    });
    expect(checkPostcondition({ method: 'rule', st }).ok).toBe(true);
  });

  it('passes on a live INSUFFICIENT_EVIDENCE payload', () => {
    const st = normalizeCaseState({
      ...LIVE_RULED,
      outcome: 'INSUFFICIENT_EVIDENCE',
      final_status: 'UNRESOLVED',
    });
    expect(checkPostcondition({ method: 'rule', st }).ok).toBe(true);
  });

  it('passes on a live RESPONDED payload for submit_response', () => {
    const st = normalizeCaseState({
      ...LIVE_OPEN,
      status: 'RESPONDED',
      responded_at: '2026-07-30T19:27:00Z',
      has_response: true,
    });
    expect(checkPostcondition({ method: 'submit_response', st }).ok).toBe(true);
  });
});

describe('local registry — behaviour that affects what a pilot user sees', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAll();
  });

  it('finds a case whether stored checksummed and looked up lowercase, or vice versa', () => {
    upsertCase({ address: LIVE_OPEN.challenger, title: 'MC-1' });
    expect(getCase(LIVE_OPEN.challenger.toLowerCase())?.title).toBe('MC-1');
    expect(getCase(LIVE_OPEN.challenger.toUpperCase().replace('0X', '0x'))?.title).toBe('MC-1');
  });

  it('does not create a duplicate entry when the same address arrives in a different case', () => {
    upsertCase({ address: LIVE_OPEN.challenger, title: 'MC-1' });
    upsertCase({ address: LIVE_OPEN.challenger.toLowerCase(), lastStatus: 'RULED' });
    const all = listCases();
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe('MC-1');
    expect(all[0]!.lastStatus).toBe('RULED');
  });

  it('keeps the address in the form it was first stored, for stable explorer links', () => {
    upsertCase({ address: LIVE_OPEN.challenger, title: 'MC-1' });
    upsertCase({ address: LIVE_OPEN.challenger.toLowerCase() });
    expect(listCases()[0]!.address).toBe(LIVE_OPEN.challenger);
  });
});
