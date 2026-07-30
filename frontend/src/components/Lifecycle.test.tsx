import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Lifecycle, lifecycleStates } from './Lifecycle';

describe('lifecycle states', () => {
  it('marks OPEN current on a fresh case', () => {
    const s = lifecycleStates('OPEN', false);
    expect(s.OPEN).toBe('current');
    expect(s.RESPONDED).toBe('future');
    expect(s.RULED).toBe('future');
  });

  it('marks RESPONDED current once a response exists', () => {
    const s = lifecycleStates('RESPONDED', true);
    expect(s.OPEN).toBe('done');
    expect(s.RESPONDED).toBe('current');
  });

  it('marks RESPONDED done when a ruled case went through it', () => {
    expect(lifecycleStates('RULED', true).RESPONDED).toBe('done');
  });

  it('marks RESPONDED SKIPPED when a case was ruled straight from OPEN', () => {
    // Showing it as "done" would invent a history the case never had.
    expect(lifecycleStates('RULED', false).RESPONDED).toBe('skipped');
  });
});

describe('the optional response path is visually obvious', () => {
  it('states that the response is optional', () => {
    render(<Lifecycle status="OPEN" hasResponse={false} />);
    expect(screen.getByText(/response is optional/i)).toBeTruthy();
  });

  it('states explicitly that the respondent cannot block adjudication', () => {
    render(<Lifecycle status="OPEN" hasResponse={false} />);
    expect(screen.getByText(/cannot prevent or delay adjudication/i)).toBeTruthy();
  });

  it('labels a skipped RESPONDED node as not used', () => {
    render(<Lifecycle status="RULED" hasResponse={false} />);
    expect(screen.getByText(/RESPONDED \(not used\)/)).toBeTruthy();
  });

  it('does not label RESPONDED as unused when it was used', () => {
    render(<Lifecycle status="RULED" hasResponse />);
    expect(screen.queryByText(/not used/)).toBeNull();
  });

  it('is exposed as a labelled group for assistive technology', () => {
    render(<Lifecycle status="OPEN" hasResponse={false} />);
    expect(screen.getByRole('group', { name: /case lifecycle/i })).toBeTruthy();
  });
});
