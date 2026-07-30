/**
 * Case-view behaviour, with the chain layer mocked.
 *
 * These cover the parts that carry incident lessons: role gating from live
 * state, the stale-state preflight, postcondition clearing and binding, and
 * contract-address switching.
 */

import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseState, EvidenceSources } from '../chain';

const ADDRESS = '0xAAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA';
const OTHER = '0xBBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB';
const CHALLENGER = '0x1111111111111111111111111111111111111111';
const RESPONDENT = '0x2222222222222222222222222222222222222222';

const state = (over: Partial<CaseState> = {}): CaseState => ({
  case_title: 'MC-2026-021 treasury disbursement',
  challenger: CHALLENGER,
  respondent: RESPONDENT,
  status: 'OPEN',
  final_status: '',
  outcome: '',
  violated_rule_ids: [],
  evidence_citations: [],
  reasoning: '',
  created_at: '2026-07-30T00:00:00Z',
  responded_at: '',
  ruled_at: '',
  has_response: false,
  ...over,
});

const sources = (over: Partial<EvidenceSources> = {}): EvidenceSources => ({
  constitution_url: 'https://evidence.example/c.json',
  proposal_url: 'https://evidence.example/p.json',
  vote_record_url: 'https://evidence.example/v.json',
  notice_record_url: 'https://evidence.example/n.json',
  response_url: '',
  schema_version: 'constitutioncourt/evidence@1',
  ...over,
});

const readCase = vi.fn(async (_a: string) => state());
const readEvidenceSources = vi.fn(async (_a: string) => sources());
const sendTx = vi.fn(async (_o: unknown) => `0x${'a'.repeat(64)}`);
const pollTx = vi.fn(async (hash: string) => ({ phase: 'submitted' as const, hash }));

vi.mock('../chain', async (orig) => {
  const actual = await orig<typeof import('../chain')>();
  return {
    ...actual,
    readCase: (a: string) => readCase(a),
    readEvidenceSources: (a: string) => readEvidenceSources(a),
    sendTx: (o: unknown) => sendTx(o as never),
    pollTx: (h: string) => pollTx(h),
  };
});

let connected: string | null = null;
vi.mock('../state/wallet', async (orig) => {
  const actual = await orig<typeof import('../state/wallet')>();
  return {
    ...actual,
    useWallet: () => ({
      account: connected,
      chainId: '0x107d',
      provider: connected ? {} : null,
      available: true,
      connecting: false,
      error: null,
      wrongNetwork: false,
      connect: async () => {},
      disconnect: () => {},
      switchNetwork: async () => {},
    }),
  };
});

// Imported after the mocks so the page picks them up.
const { CasePage } = await import('./CasePage');

function at(address = ADDRESS) {
  return render(
    <MemoryRouter initialEntries={[`/case/${address}`]}>
      <Routes>
        <Route path="/case/:contractAddress" element={<CasePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  connected = null;
  readCase.mockReset().mockImplementation(async () => state());
  readEvidenceSources.mockReset().mockImplementation(async () => sources());
  sendTx.mockReset().mockImplementation(async (_o: unknown) => `0x${'a'.repeat(64)}`);
  pollTx.mockReset().mockImplementation(async (hash: string) => ({ phase: 'submitted', hash }));
});

afterEach(() => { vi.clearAllTimers(); });

describe('reading a case needs no wallet', () => {
  it('renders the case for a disconnected reader', async () => {
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());
    expect(screen.getAllByText('OPEN').length).toBeGreaterThan(0);
  });

  it('offers no actions with no wallet', async () => {
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /submit response/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /run validator ruling/i })).toBeNull();
  });

  it('shows the pinned evidence URLs', async () => {
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());
    expect(screen.getByText('https://evidence.example/v.json')).toBeTruthy();
  });

  it('says a case that cannot be read might not exist', async () => {
    readCase.mockRejectedValue(new Error('contract not found'));
    at();
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
    expect(screen.getByText(/is not proof a contract exists/i)).toBeTruthy();
  });
});

describe('role gating comes from live state', () => {
  it('offers submit_response to the respondent only', async () => {
    connected = RESPONDENT;
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /submit response/i })).toBeTruthy();
  });

  it('hides submit_response from the challenger and explains why', async () => {
    connected = CHALLENGER;
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /submit response/i })).toBeNull();
    expect(screen.getByText(/only the respondent named at filing/i)).toBeTruthy();
  });

  it('offers the ruling to an unrelated observer — it is permissionless', async () => {
    connected = '0x9999999999999999999999999999999999999999';
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /run validator ruling/i })).toBeTruthy();
    expect(screen.getByText(/anyone may run the ruling/i)).toBeTruthy();
  });

  it('offers the ruling from RESPONDED too', async () => {
    readCase.mockImplementation(async () => state({ status: 'RESPONDED', has_response: true }));
    connected = CHALLENGER;
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /run validator ruling/i })).toBeTruthy();
  });
});

describe('no state-changing action survives RULED', () => {
  it('offers nothing and points at the native appeal', async () => {
    readCase.mockImplementation(async () => state({
      status: 'RULED', outcome: 'COMPLIANT', final_status: 'CERTIFIED',
      ruled_at: '2026-07-30T02:00:00Z', reasoning: 'No violation found.',
    }));
    connected = CHALLENGER;
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /run validator ruling/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /submit response/i })).toBeNull();
    expect(screen.getByText(/no state-changing action exists for a RULED case/i)).toBeTruthy();
    expect(screen.getAllByText(/native transaction appeal/i).length).toBeGreaterThan(0);
  });
});

describe('outcome to final status rendering', () => {
  it.each([
    ['COMPLIANT', 'CERTIFIED'],
    ['NON_COMPLIANT', 'REJECTED'],
    ['INSUFFICIENT_EVIDENCE', 'UNRESOLVED'],
  ])('renders %s as %s with its limits stated', async (outcome, final) => {
    readCase.mockImplementation(async () => state({
      status: 'RULED', outcome, final_status: final,
      ruled_at: '2026-07-30T02:00:00Z', reasoning: 'Reasoning text.',
      violated_rule_ids: outcome === 'NON_COMPLIANT' ? ['ART-4.3'] : [],
    }));
    at();
    await waitFor(() => expect(screen.getAllByText(final).length).toBeGreaterThan(0));
    expect(screen.getAllByText(outcome).length).toBeGreaterThan(0);
  });

  it('labels reasoning as the leader’s explanation, not agreed text', async () => {
    readCase.mockImplementation(async () => state({
      status: 'RULED', outcome: 'COMPLIANT', final_status: 'CERTIFIED',
      ruled_at: '2026-07-30T02:00:00Z', reasoning: 'No violation found.',
    }));
    at();
    await waitFor(() => expect(screen.getByText('No violation found.')).toBeTruthy());
    expect(screen.getByText(/not consensus-verified text/i)).toBeTruthy();
  });

  it('renders decoded citations as structured cards', async () => {
    readCase.mockImplementation(async () => state({
      status: 'RULED', outcome: 'NON_COMPLIANT', final_status: 'REJECTED',
      ruled_at: '2026-07-30T02:00:00Z', reasoning: 'Short of two-thirds.',
      violated_rule_ids: ['ART-4.3'],
      evidence_citations: [{
        source: 'vote-record',
        url: 'https://evidence.example/v.json',
        locator: '$.tally',
        quote: 'for: 340000',
        supports: 'ART-4.3',
      }],
    }));
    at();
    await waitFor(() => expect(screen.getByText('$.tally')).toBeTruthy());
    expect(screen.getByText(/for: 340000/)).toBeTruthy();
  });
});

describe('the stale-state preflight blocks a write the contract would reject', () => {
  it('abandons submit_response when the case moved to RESPONDED between render and click', async () => {
    connected = RESPONDENT;
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/response url/i), {
      target: { value: 'https://evidence.example/r.json' },
    });

    // Another tab submits first: the next read returns RESPONDED.
    readCase.mockImplementation(async () => state({ status: 'RESPONDED', has_response: true }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit response/i }));
    });

    await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeTruthy());
    expect(screen.getByText(/nothing was signed/i)).toBeTruthy();
    // Crucially, the dialog never opened and nothing was sent.
    expect(sendTx).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('abandons the ruling when the case was already ruled elsewhere', async () => {
    connected = CHALLENGER;
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());

    readCase.mockImplementation(async () => state({
      status: 'RULED', outcome: 'COMPLIANT', final_status: 'CERTIFIED',
      ruled_at: '2026-07-30T02:00:00Z',
    }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /run validator ruling/i }));
    });

    await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeTruthy());
    expect(sendTx).not.toHaveBeenCalled();
  });

  it('opens the dialog when the action is genuinely still available', async () => {
    connected = CHALLENGER;
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /run validator ruling/i }));
    });

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    // Scoped to the dialog: the same explanation also appears in the action
    // description behind it, deliberately.
    expect(within(screen.getByRole('dialog')).getAllByText(/independently re-fetches/i).length)
      .toBeGreaterThan(0);
  });
});

describe('the confirmation dialog is keyboard navigable', () => {
  async function openDialog() {
    connected = CHALLENGER;
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /run validator ruling/i }));
    });
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  }

  it('is a labelled modal dialog', async () => {
    await openDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('moves focus to the confirm button on open', async () => {
    await openDialog();
    expect(document.activeElement?.textContent).toMatch(/run validator ruling/i);
  });

  it('closes on Escape without submitting', async () => {
    await openDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sendTx).not.toHaveBeenCalled();
  });

  it('closes on Cancel without submitting', async () => {
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sendTx).not.toHaveBeenCalled();
  });
});

describe('contract address switching clears local state', () => {
  it('reads the new address and drops the previous case entirely', async () => {
    const { unmount } = at(ADDRESS);
    await waitFor(() => expect(readCase).toHaveBeenCalledWith(ADDRESS));
    unmount();

    readCase.mockImplementation(async () => state({ case_title: 'A different case' }));
    at(OTHER);
    await waitFor(() => expect(readCase).toHaveBeenCalledWith(OTHER));
    await waitFor(() => expect(screen.getByText(/A different case/)).toBeTruthy());
    expect(screen.queryByText(/MC-2026-021/)).toBeNull();
  });
});

describe('a persisted transaction resumes after reload', () => {
  it('picks up a pending hash from the registry and tracks it', async () => {
    const hash = `0x${'c'.repeat(64)}`;
    localStorage.setItem('constitutioncourt:v1', JSON.stringify({
      cases: [{
        address: ADDRESS, chainId: 4221, addedAt: 1, via: 'created',
        pendingTx: { hash, method: 'rule', startedAt: 1 },
      }],
      drafts: [],
    }));
    at();
    await waitFor(() => expect(screen.getByText(/MC-2026-021/)).toBeTruthy());
    // The tracker shows the resumed transaction rather than starting from idle.
    await waitFor(() => expect(screen.getByText(/rule\(\) — Submitted/i)).toBeTruthy());
  });
});
