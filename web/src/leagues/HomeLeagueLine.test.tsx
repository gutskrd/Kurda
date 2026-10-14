import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { LeagueView } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { HomeLeagueLine } from './HomeLeagueLine';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const view = (over: Partial<LeagueView> = {}): LeagueView => ({
  mode: 'league',
  optedOut: false,
  joined: true,
  tier: 'cem',
  weekKey: '2026-10-12',
  endsAt: '2026-10-19T00:00:00.000Z',
  weeklyXp: 120,
  goalXp: 150,
  goalMet: false,
  safe: false,
  rank: 4,
  groupSize: 18,
  promoteCount: 4,
  demoteCount: 2,
  standings: [],
  lastWeek: null,
  recentWeeks: [],
  ...over,
});

function signIn(body: unknown): void {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url.includes('/me/league') ? jsonResponse(200, body) : jsonResponse(200, { user: { id: 'me', username: 'rojda', emailVerified: true } }))),
  );
}

describe('HomeLeagueLine', () => {
  it('says the league and the place in one line, with the goal ring, and goes to the league', async () => {
    signIn(view());
    renderApp(<HomeLeagueLine />);
    const link = await screen.findByRole('link', { name: /Çem League/ });
    expect(link).toHaveAttribute('href', '/app/rankings');
    expect(link).toHaveTextContent('Place 4 of 18 · 120/150 XP');
    expect(screen.getByRole('img', { name: 'Weekly goal: 120 of 150 XP' })).toBeInTheDocument();
  });

  it('says “Safe this week ✓” once the goal is met', async () => {
    signIn(view({ weeklyXp: 180, goalMet: true, safe: true }));
    renderApp(<HomeLeagueLine />);
    expect(await screen.findByText(en['leagues.safe'])).toBeInTheDocument();
  });

  it('asks someone not in a group yet to learn something', async () => {
    signIn(view({ joined: false, weeklyXp: 0 }));
    renderApp(<HomeLeagueLine />);
    expect(await screen.findByText(en['home.league.join'])).toBeInTheDocument();
  });

  it('is “Your week” in personal mode, with no league named', async () => {
    signIn(view({ mode: 'personal', optedOut: true, joined: false, tier: null, weeklyXp: 60 }));
    renderApp(<HomeLeagueLine />);
    expect(await screen.findByText(en['leagues.personal.title'])).toBeInTheDocument();
    expect(screen.getByText('60 of 150 XP this week')).toBeInTheDocument();
    expect(screen.queryByText(/League/)).not.toBeInTheDocument();
  });

  it('is not there for a visitor, or when the league cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    const { container } = renderApp(<HomeLeagueLine />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
