import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../components/Fire', () => import('../test/fireProbe'));
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fourDayView } from '../test/today';
import { jsonResponse, renderApp } from '../test/utils';
import { DailyCard } from './DailyCard';
import type { TodayView } from './today';

/* The daily view's card on Home: the streak, the week as dots and today's Zêr in one mark, opening the whole view. */

const signIn = (): void => localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

function api(view: TodayView): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const { pathname } = new URL(url, 'http://api.test');
      if (pathname.endsWith('/me/today')) return jsonResponse(200, view);
      if (pathname === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
      return jsonResponse(200, {});
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('the daily card', () => {
  it('says the streak and today’s Zêr in one press that opens the daily view', async () => {
    signIn();
    api(fourDayView());
    renderApp(<DailyCard />);
    const card = await screen.findByRole('button', { name: '4-day streak. +20 Zêr to claim today' });
    expect(card).toHaveAttribute('aria-haspopup', 'dialog');
    expect(card.querySelectorAll('.week-dot')).toHaveLength(7);
    expect(card.querySelector('.week-dot.is-today')).toHaveClass('is-learned');
    expect(card.querySelector('.daily-home-zer')).toHaveClass('is-claim');
    await userEvent.click(card);
    const sheet = screen.getByRole('dialog', { name: 'Streak' });
    expect(within(sheet).getByRole('heading', { name: '4-day streak' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Claim' })).toBeInTheDocument();
  });

  it('says when today’s Zêr waits for a lesson', async () => {
    signIn();
    api(fourDayView({ daily: { canClaim: false, learnedToday: false, claimableDay: 3, reward: 20, cycleDay: 2 } }));
    renderApp(<DailyCard />);
    expect(await screen.findByRole('button', { name: '4-day streak. +20 Zêr after today’s lesson' })).toBeInTheDocument();
  });

  it('marks a day whose Zêr is taken', async () => {
    signIn();
    api(fourDayView({ daily: { canClaim: false, learnedToday: true, alreadyClaimedToday: true, claimableDay: 3, reward: 20, cycleDay: 3 } }));
    renderApp(<DailyCard />);
    const card = await screen.findByRole('button', { name: '4-day streak. Today’s Zêr is claimed' });
    expect(card.querySelector('.daily-home-zer')).toHaveClass('is-claimed');
  });

  it('shows nothing to a visitor', async () => {
    api(fourDayView());
    const { container } = renderApp(<DailyCard />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('.daily-home')).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/me/today'))).toBe(false);
  });
});
