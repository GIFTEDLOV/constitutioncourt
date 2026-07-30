/**
 * Create-wizard interaction.
 *
 * The wizard gates progress on validation because the four evidence URLs are
 * immutable once the case exists. Everything asserted here is a mistake that
 * would otherwise be unfixable after deployment.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Create } from './Create';
import { WalletProvider } from '../state/wallet';
import { clearAll } from '../lib/registry';
import { SCHEMA_LITERALS } from '../lib/evidence';

function renderWizard() {
  return render(
    <MemoryRouter>
      <WalletProvider>
        <Create />
      </WalletProvider>
    </MemoryRouter>,
  );
}

const cont = () => screen.getByRole('button', { name: /continue/i });
const back = () => screen.getByRole('button', { name: /back/i });
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

beforeEach(() => {
  localStorage.clear();
  clearAll();
  vi.restoreAllMocks();
});

describe('step 1 — case', () => {
  it('blocks Continue until a title and respondent are valid', () => {
    renderWizard();
    expect(isDisabled(cont())).toBe(true);

    fireEvent.change(screen.getByLabelText(/case title/i), { target: { value: 'MC-2026-021' } });
    expect(isDisabled(cont())).toBe(true);

    fireEvent.change(screen.getByLabelText(/respondent address/i), {
      target: { value: '0x2222222222222222222222222222222222222222' },
    });
    expect(isDisabled(cont())).toBe(false);
  });

  it('rejects a malformed respondent address with a reason', () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/respondent address/i), { target: { value: '0x123' } });
    expect(screen.getByText(/valid 0x address/i)).toBeTruthy();
  });

  it('rejects the zero address', () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/respondent address/i), {
      target: { value: '0x0000000000000000000000000000000000000000' },
    });
    expect(screen.getByText(/zero address/i)).toBeTruthy();
  });

  it('rejects an over-long title', () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/case title/i), { target: { value: 'x'.repeat(201) } });
    expect(screen.getByText(/longer than 200/i)).toBeTruthy();
  });

  it('marks invalid fields with aria-invalid', () => {
    renderWizard();
    const input = screen.getByLabelText(/respondent address/i);
    fireEvent.change(input, { target: { value: 'nope' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('explains that the signer becomes the challenger', () => {
    renderWizard();
    expect(screen.getByText(/recorded as the/i)).toBeTruthy();
    expect(screen.getByText(/carries no weight until validators rule/i)).toBeTruthy();
  });
});

describe('URL steps gate on the contract’s own rules', () => {
  function toStep2() {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/case title/i), { target: { value: 'MC-1' } });
    fireEvent.change(screen.getByLabelText(/respondent address/i), {
      target: { value: '0x2222222222222222222222222222222222222222' },
    });
    fireEvent.click(cont());
  }

  it('blocks Continue on a plain HTTP URL', () => {
    toStep2();
    fireEvent.change(screen.getByLabelText(/constitution url/i), {
      target: { value: 'http://evidence.example/c.json' },
    });
    expect(screen.getByText(/must be an https/i)).toBeTruthy();
    expect(isDisabled(cont())).toBe(true);
  });

  it('blocks a URL carrying credentials', () => {
    toStep2();
    fireEvent.change(screen.getByLabelText(/constitution url/i), {
      target: { value: 'https://u:p@evidence.example/c.json' },
    });
    expect(screen.getByText(/embeds credentials/i)).toBeTruthy();
  });

  it('warns about a mutable branch URL but still allows Continue', () => {
    toStep2();
    fireEvent.change(screen.getByLabelText(/constitution url/i), {
      target: { value: 'https://raw.githubusercontent.com/o/r/main/c.json' },
    });
    expect(screen.getByText(/branch or tag/i)).toBeTruthy();
    expect(isDisabled(cont())).toBe(false);
  });

  it('disables Test URL until the URL is syntactically valid', () => {
    toStep2();
    expect(isDisabled(screen.getByRole('button', { name: /test url/i }))).toBe(true);
    fireEvent.change(screen.getByLabelText(/constitution url/i), {
      target: { value: 'https://evidence.example/c.json' },
    });
    expect(isDisabled(screen.getByRole('button', { name: /test url/i }))).toBe(false);
  });

  it('reports a schema mismatch when the wrong document is served', async () => {
    toStep2();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200,
      text: async () => JSON.stringify({ schema: SCHEMA_LITERALS.proposal }),
    })));
    fireEvent.change(screen.getByLabelText(/constitution url/i), {
      target: { value: 'https://evidence.example/c.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: /test url/i }));
    await waitFor(() => expect(screen.getByText(/expected/i)).toBeTruthy());
  });

  it('previews a document that passes', async () => {
    toStep2();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200,
      text: async () => JSON.stringify({
        schema: SCHEMA_LITERALS.constitution,
        organization: 'Meridian Collective',
        rules: [{ id: 'ART-4.3' }],
      }),
    })));
    fireEvent.change(screen.getByLabelText(/constitution url/i), {
      target: { value: 'https://evidence.example/c.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: /test url/i }));
    await waitFor(() => expect(screen.getByText(/schema literal matches/i)).toBeTruthy());
    expect(screen.getByText(/document preview/i)).toBeTruthy();
  });

  it('invalidates a previous pass when the URL is edited', async () => {
    toStep2();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 200,
      text: async () => JSON.stringify({
        schema: SCHEMA_LITERALS.constitution, rules: [{ id: 'ART-1' }],
      }),
    })));
    const input = screen.getByLabelText(/constitution url/i);
    fireEvent.change(input, { target: { value: 'https://evidence.example/c.json' } });
    fireEvent.click(screen.getByRole('button', { name: /test url/i }));
    await waitFor(() => expect(screen.getByText(/schema literal matches/i)).toBeTruthy());

    // Editing must drop the stale pass; otherwise an untested URL rides in on
    // an earlier URL's verification.
    fireEvent.change(input, { target: { value: 'https://evidence.example/other.json' } });
    expect(screen.queryByText(/schema literal matches/i)).toBeNull();
  });
});

describe('step 4 tests the two governance records independently', () => {
  function toStep4() {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/case title/i), { target: { value: 'MC-1' } });
    fireEvent.change(screen.getByLabelText(/respondent address/i), {
      target: { value: '0x2222222222222222222222222222222222222222' },
    });
    fireEvent.click(cont());
    fireEvent.change(screen.getByLabelText(/constitution url/i), {
      target: { value: 'https://evidence.example/c.json' },
    });
    fireEvent.click(cont());
    fireEvent.change(screen.getByLabelText(/proposal url/i), {
      target: { value: 'https://evidence.example/p.json' },
    });
    fireEvent.click(cont());
  }

  it('offers a separate Test button for each record', () => {
    toStep4();
    expect(screen.getAllByRole('button', { name: /test url/i })).toHaveLength(2);
  });

  it('blocks Continue until both are valid', () => {
    toStep4();
    expect(isDisabled(cont())).toBe(true);
    fireEvent.change(screen.getByLabelText(/vote record url/i), {
      target: { value: 'https://evidence.example/v.json' },
    });
    expect(isDisabled(cont())).toBe(true);
    fireEvent.change(screen.getByLabelText(/notice record url/i), {
      target: { value: 'https://evidence.example/n.json' },
    });
    expect(isDisabled(cont())).toBe(false);
  });

  it('rejects the same URL pinned in two roles', () => {
    toStep4();
    fireEvent.change(screen.getByLabelText(/vote record url/i), {
      target: { value: 'https://evidence.example/c.json' }, // already the constitution
    });
    fireEvent.change(screen.getByLabelText(/notice record url/i), {
      target: { value: 'https://evidence.example/n.json' },
    });
    expect(screen.getByText(/more than one role/i)).toBeTruthy();
    expect(isDisabled(cont())).toBe(true);
  });
});

describe('step 5 — review states immutability plainly', () => {
  function toReview() {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/case title/i), { target: { value: 'MC-1' } });
    fireEvent.change(screen.getByLabelText(/respondent address/i), {
      target: { value: '0x2222222222222222222222222222222222222222' },
    });
    fireEvent.click(cont());
    fireEvent.change(screen.getByLabelText(/constitution url/i), {
      target: { value: 'https://raw.githubusercontent.com/o/r/main/c.json' },
    });
    fireEvent.click(cont());
    fireEvent.change(screen.getByLabelText(/proposal url/i), { target: { value: 'https://evidence.example/p.json' } });
    fireEvent.click(cont());
    fireEvent.change(screen.getByLabelText(/vote record url/i), { target: { value: 'https://evidence.example/v.json' } });
    fireEvent.change(screen.getByLabelText(/notice record url/i), { target: { value: 'https://evidence.example/n.json' } });
    fireEvent.click(cont());
  }

  it('warns that everything is permanent', () => {
    toReview();
    expect(screen.getByText(/everything below is permanent/i)).toBeTruthy();
    expect(screen.getByText(/no method to change them/i)).toBeTruthy();
  });

  it('collects mutable-URL warnings into one block', () => {
    toReview();
    expect(screen.getByText(/mutable evidence sources/i)).toBeTruthy();
    expect(screen.getByText(/the URL is pinned on-chain; its content is not/i)).toBeTruthy();
  });

  it('flags URLs that were never verified from the browser', () => {
    toReview();
    expect(screen.getByText(/have not been verified from this browser/i)).toBeTruthy();
  });

  it('shows the respondent and all four URLs for review', () => {
    toReview();
    expect(screen.getByText('0x2222222222222222222222222222222222222222')).toBeTruthy();
    expect(screen.getByText(/evidence\.example\/p\.json/)).toBeTruthy();
    expect(screen.getByText(/evidence\.example\/v\.json/)).toBeTruthy();
    expect(screen.getByText(/evidence\.example\/n\.json/)).toBeTruthy();
  });

  it('allows going back to correct a mistake', () => {
    toReview();
    fireEvent.click(back());
    expect(screen.getByLabelText(/vote record url/i)).toBeTruthy();
  });
});

describe('step 6 — deploy', () => {
  function toDeploy() {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/case title/i), { target: { value: 'MC-1' } });
    fireEvent.change(screen.getByLabelText(/respondent address/i), {
      target: { value: '0x2222222222222222222222222222222222222222' },
    });
    fireEvent.click(cont());
    fireEvent.change(screen.getByLabelText(/constitution url/i), { target: { value: 'https://evidence.example/c.json' } });
    fireEvent.click(cont());
    fireEvent.change(screen.getByLabelText(/proposal url/i), { target: { value: 'https://evidence.example/p.json' } });
    fireEvent.click(cont());
    fireEvent.change(screen.getByLabelText(/vote record url/i), { target: { value: 'https://evidence.example/v.json' } });
    fireEvent.change(screen.getByLabelText(/notice record url/i), { target: { value: 'https://evidence.example/n.json' } });
    fireEvent.click(cont());
    fireEvent.click(cont());
  }

  it('disables deploy with no wallet connected', () => {
    toDeploy();
    expect(isDisabled(screen.getByRole('button', { name: /deploy case/i }))).toBe(true);
    expect(screen.getByText(/connect a wallet to deploy/i)).toBeTruthy();
  });

  it('states that a hash is not a deployment', () => {
    toDeploy();
    expect(screen.getByText(/a returned transaction hash is not a deployment/i)).toBeTruthy();
    expect(screen.getByText(/fourteen checks/i)).toBeTruthy();
  });

  it('shows the exact source hash it will submit', () => {
    toDeploy();
    expect(screen.getByText(/bf845bc4/)).toBeTruthy();
  });
});
