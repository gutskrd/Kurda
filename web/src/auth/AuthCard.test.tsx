import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthCard } from './AuthCard';
import { arrivalHeld, holdArrival } from './arrival';

/** The y of where a hoof is drawn, from its group's transform. */
function hoofY(container: HTMLElement, side: 'left' | 'right'): number {
  const t = container.querySelector(`[data-cp="hoof-${side}"]`)?.getAttribute('transform') ?? '';
  return Number(/translate\(\S+ (\S+)\)/.exec(t)?.[1] ?? Number.NaN);
}

const lid = (container: HTMLElement, side: 'left' | 'right', state: string): string | null | undefined =>
  container.querySelector(`[data-eye="${side}"] [data-lid="${state}"]`)?.getAttribute('visibility');

function Form({ status, word }: { status?: 'idle' | 'busy' | 'error' | 'success'; word?: 'welcome' }): React.JSX.Element {
  return (
    <AuthCard status={status} word={word}>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="username" />
      <label htmlFor="password">Password</label>
      <span className="input-wrap">
        <input id="password" type="password" autoComplete="current-password" />
        <button type="button">Show</button>
      </span>
    </AuthCard>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthCard', () => {
  it('draws Hevalo behind the card, hidden from assistive technology', () => {
    const { container } = render(<Form />);
    const companion = container.querySelector('.auth-companion');
    expect(companion).toHaveAttribute('aria-hidden', 'true');
    expect(companion?.querySelector('svg [data-cp="head"]')).not.toBeNull();
    expect(container.querySelector('.auth-stage > .auth-card #email')).not.toBeNull();
  });

  it('covers his eyes with his hooves while a password is typed', async () => {
    const { container } = render(<Form />);
    await userEvent.click(container.querySelector('#password')!);
    await waitFor(() => expect(hoofY(container, 'left')).toBeLessThan(360));
    await waitFor(() => expect(lid(container, 'left', 'closed')).toBe('visible'));
    expect(lid(container, 'right', 'closed')).toBe('visible');

    // leaving it, the hooves go back down to the edge
    await userEvent.click(container.querySelector('#email')!);
    await waitFor(() => expect(hoofY(container, 'left')).toBeGreaterThan(440));
  });

  it('shows the form going wrong and going right with a sign over his head, and a word on getting in', async () => {
    const { container, rerender } = render(<Form status="busy" />);
    const companion = container.querySelector<HTMLElement>('.auth-companion')!;
    await waitFor(() => expect(companion.dataset.emote).toBe('think'));
    rerender(<Form status="error" />);
    await waitFor(() => expect(companion.dataset.emote).toBe('question'));
    rerender(<Form status="success" word="welcome" />);
    await waitFor(() => expect(companion.dataset.emote).toBe('spark'));
    await waitFor(() => expect(companion.querySelector('.cp-say')).toHaveTextContent('Bi xêr hatî!'));
    expect(companion.querySelector('.cp-say')).toBeVisible();
  });

  it('for whoever asks for less motion goes straight to each pose', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }));
    const { container } = render(<Form />);
    container.querySelector<HTMLInputElement>('#password')!.focus();
    await waitFor(() => expect(lid(container, 'left', 'closed')).toBe('visible'));
    expect(hoofY(container, 'left')).toBeCloseTo(344, 0);
  });
});

describe('holdArrival', () => {
  it('holds the signed-in redirect until released, once', () => {
    const release = holdArrival();
    expect(arrivalHeld()).toBe(true);
    release?.();
    release?.();
    expect(arrivalHeld()).toBe(false);
  });
});
