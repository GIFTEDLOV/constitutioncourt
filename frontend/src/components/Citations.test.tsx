import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CitationCard, ConsensusScopeNote, ViolatedRules } from './Citations';
import { UNREADABLE_CITATION } from '../chain';
import { resolveRuleIds } from '../lib/rules';
import type { ConstitutionRule } from '../lib/evidence';

const RULES: ConstitutionRule[] = [
  { id: 'ART-4.3', title: 'Elevated tier', text: 'Two-thirds of votes cast.' },
];

const PINNED = ['https://e/v.json', 'https://e/c.json'];

describe('citations are labelled as the leader’s audit record', () => {
  it('says what consensus agreed and what it did not', () => {
    render(<ConsensusScopeNote />);
    expect(screen.getByText(/the outcome, and the set of violated rule ids/i)).toBeTruthy();
    expect(screen.getByText(/leader validator/i)).toBeTruthy();
    expect(screen.getByText(/explanatory/i)).toBeTruthy();
  });
});

describe('citation cards render the structured fields', () => {
  const citation = {
    source: 'vote-record',
    url: 'https://e/v.json',
    locator: '$.tally',
    quote: 'for: 340000, against: 180000',
    supports: 'ART-4.3',
  };

  it('shows source, locator, quote and the rule it bears on', () => {
    render(<CitationCard citation={citation} pinned={PINNED} />);
    expect(screen.getByText('vote-record')).toBeTruthy();
    expect(screen.getByText('$.tally')).toBeTruthy();
    expect(screen.getByText(/for: 340000/)).toBeTruthy();
    expect(screen.getByText(/bears on ART-4.3/)).toBeTruthy();
  });

  it('flags a citation pointing outside the pinned evidence', () => {
    render(
      <CitationCard citation={{ ...citation, url: 'https://attacker/x.json' }} pinned={PINNED} />,
    );
    expect(screen.getByText(/not among the case.s pinned evidence/i)).toBeTruthy();
  });

  it('does not flag a properly pinned citation', () => {
    render(<CitationCard citation={citation} pinned={PINNED} />);
    expect(screen.queryByText(/not among the case/i)).toBeNull();
  });

  it('renders an unreadable citation rather than hiding it', () => {
    render(
      <CitationCard
        citation={{ source: UNREADABLE_CITATION, url: '', locator: '', quote: '' }}
        pinned={PINNED}
      />,
    );
    expect(screen.getByText(/unreadable citation/i)).toBeTruthy();
    expect(screen.getByText(/silently dropping it would understate/i)).toBeTruthy();
  });

  it('handles a citation with no quote', () => {
    render(<CitationCard citation={{ ...citation, quote: '' }} pinned={PINNED} />);
    expect(screen.getByText(/no quote recorded/i)).toBeTruthy();
  });
});

describe('violated rules resolve against the constitution', () => {
  it('shows the resolved title and text', () => {
    render(<ViolatedRules resolutions={resolveRuleIds(['ART-4.3'], RULES)} />);
    expect(screen.getByText('ART-4.3')).toBeTruthy();
    expect(screen.getByText('Elevated tier')).toBeTruthy();
    expect(screen.getByText(/two-thirds of votes cast/i)).toBeTruthy();
  });

  it('says plainly when an id is not in the constitution and invents nothing', () => {
    render(<ViolatedRules resolutions={resolveRuleIds(['ART-9.9'], RULES)} />);
    expect(screen.getByText(/does not appear in the pinned constitution/i)).toBeTruthy();
    expect(screen.queryByText(/two-thirds/i)).toBeNull();
  });

  it('says the text is unavailable when the constitution could not be fetched', () => {
    render(<ViolatedRules resolutions={resolveRuleIds(['ART-4.3'], null)} />);
    expect(screen.getByText(/could not be fetched/i)).toBeTruthy();
    // Crucially, no invented rule text appears.
    expect(screen.queryByText(/two-thirds/i)).toBeNull();
  });

  it('states clearly when nothing was cited', () => {
    render(<ViolatedRules resolutions={[]} />);
    expect(screen.getByText(/no rules were cited/i)).toBeTruthy();
  });
});
