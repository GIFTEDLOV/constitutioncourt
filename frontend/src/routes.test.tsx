/**
 * Route-level rendering.
 *
 * Every locked route must render without a wallet, because reading is
 * deliberately possible with none — a reviewer has to be able to audit a case
 * without installing anything.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { WalletProvider } from './state/wallet';
import { clearAll, upsertCase } from './lib/registry';

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WalletProvider>
        <App />
      </WalletProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  clearAll();
  vi.restoreAllMocks();
});

describe('every locked route renders without a wallet', () => {
  it('/ — the landing page', () => {
    at('/');
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByText(/governance-compliance adjudicator/i)).toBeTruthy();
  });

  it('/create — the wizard', () => {
    at('/create');
    expect(screen.getByRole('heading', { name: /file a case/i, level: 1 })).toBeTruthy();
  });

  it('/cases — the local registry', () => {
    at('/cases');
    expect(screen.getByRole('heading', { name: /my cases/i, level: 1 })).toBeTruthy();
  });

  it('/demo — four worked examples', () => {
    at('/demo');
    expect(screen.getByRole('heading', { name: /worked examples/i, level: 1 })).toBeTruthy();
  });

  it('/help — how it works', () => {
    at('/help');
    expect(screen.getByRole('heading', { name: /how it works/i, level: 1 })).toBeTruthy();
  });

  it('/case/:address — rejects a malformed address without crashing', () => {
    at('/case/not-an-address');
    expect(screen.getByText(/not a contract address/i)).toBeTruthy();
  });

  it('an unknown path renders an honest 404', () => {
    at('/nowhere');
    expect(screen.getByRole('heading', { name: /no such page/i })).toBeTruthy();
  });
});

describe('positioning is stated on every page', () => {
  it('the footer says what this is not', () => {
    at('/');
    // Stated both in the landing copy and in the footer, deliberately.
    expect(screen.getAllByText(/not a legal court/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/holds no funds/i)).toBeTruthy();
  });

  it('the CERTIFIED disclaimer appears verbatim in the footer', () => {
    at('/');
    expect(
      screen.getByText(/does not mean the proposal is legal, safe, wise or automatically authorised/i),
    ).toBeTruthy();
  });

  it('the landing page lists the excluded product categories', () => {
    at('/');
    expect(screen.getByText(/not a treasury executor/i)).toBeTruthy();
    expect(screen.getByText(/not a voting platform/i)).toBeTruthy();
    expect(screen.getByText(/not escrow/i)).toBeTruthy();
    expect(screen.getByText(/not a chatbot/i)).toBeTruthy();
    expect(screen.getByText(/not a replacement for genlayer native appeals/i)).toBeTruthy();
  });

  it('an OPEN case is framed as an unadjudicated claim, not an accusation', () => {
    at('/');
    expect(screen.getByText(/allegation, not a finding/i)).toBeTruthy();
  });
});

describe('/help documents the locked vocabulary', () => {
  it('lists all three outcomes and their final statuses', () => {
    at('/help');
    for (const t of ['COMPLIANT', 'NON_COMPLIANT', 'INSUFFICIENT_EVIDENCE']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
    for (const t of ['CERTIFIED', 'REJECTED', 'UNRESOLVED']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
  });

  it('explains that ruling is permissionless', () => {
    at('/help');
    expect(screen.getByText(/permissionless by design/i)).toBeTruthy();
  });

  it('explains that RULED is terminal and points at the native appeal', () => {
    at('/help');
    expect(screen.getByText(/RULED is terminal/i)).toBeTruthy();
    expect(screen.getAllByText(/native transaction appeal/i).length).toBeGreaterThan(0);
  });

  it('lists the limitations rather than hiding them', () => {
    at('/help');
    expect(screen.getByText(/no enforcement/i)).toBeTruthy();
    expect(screen.getByText(/evidence is only as good as its host/i)).toBeTruthy();
    expect(screen.getByText(/no content pinning/i)).toBeTruthy();
  });

  it('gives verification instructions', () => {
    at('/help');
    expect(screen.getByText(/verifying a ruling yourself/i)).toBeTruthy();
    expect(screen.getByText(/you do not have to trust this interface/i)).toBeTruthy();
  });
});

describe('/demo shows all four evidence examples', () => {
  it('renders one panel per fixture with its expected outcome', () => {
    at('/demo');
    expect(screen.getByText(/compliant — simple majority/i)).toBeTruthy();
    expect(screen.getByText(/rejected — two-thirds threshold/i)).toBeTruthy();
    expect(screen.getByText(/rejected — notice period/i)).toBeTruthy();
    expect(screen.getByText(/unresolved — insufficient evidence/i)).toBeTruthy();
  });

  it('does not present an expected outcome as a real ruling', () => {
    at('/demo');
    expect(screen.getByText(/an expected outcome is not a ruling/i)).toBeTruthy();
  });

  it('says honestly that nothing is deployed rather than inventing addresses', () => {
    at('/demo');
    expect(screen.getAllByText(/not deployed/i).length).toBeGreaterThan(0);
  });
});

describe('/cases is honest about being browser-local', () => {
  it('says the list lives in the browser, not a server', () => {
    at('/cases');
    expect(screen.getByText(/lives in your browser, not on a server/i)).toBeTruthy();
  });

  it('shows an empty state before anything is added', () => {
    at('/cases');
    expect(screen.getByRole('heading', { name: /no cases yet/i })).toBeTruthy();
  });

  it('lists a stored case', () => {
    upsertCase({ address: '0xAAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA', title: 'MC-2026-021' });
    at('/cases');
    expect(screen.getByRole('link', { name: /MC-2026-021/ })).toBeTruthy();
  });

  it('labels last-seen status as not live', () => {
    upsertCase({
      address: '0xAAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA',
      title: 'MC-1', lastStatus: 'OPEN',
    });
    at('/cases');
    expect(screen.getByText(/not a live value/i)).toBeTruthy();
  });
});

describe('accessibility affordances present on every page', () => {
  it('provides a skip link', () => {
    at('/');
    expect(screen.getByText(/skip to main content/i)).toBeTruthy();
  });

  it('marks the primary navigation', () => {
    at('/');
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeTruthy();
  });

  it('has exactly one h1 per page', () => {
    for (const path of ['/', '/create', '/cases', '/demo', '/help']) {
      const { unmount } = at(path);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      unmount();
    }
  });

  it('exposes a main landmark', () => {
    at('/');
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('gives every table a caption', () => {
    at('/help');
    const tables = screen.getAllByRole('table');
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) {
      const caption = t.querySelector('caption');
      expect(caption).not.toBeNull();
      expect(caption?.textContent?.trim()).toBeTruthy();
    }
  });
});

describe('read-only observer mode', () => {
  it('says a wallet is not needed to read', () => {
    at('/');
    expect(screen.getByText(/reading works without one/i)).toBeTruthy();
  });
});
