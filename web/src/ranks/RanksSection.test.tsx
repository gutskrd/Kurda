import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { progressToNext, seasonById, type MyRanks, type RankCard as RankCardData } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { RanksSection } from './RanksSection';
import { RankCard } from './RankCard';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function card(over: Partial<RankCardData> = {}): RankCardData {
  const points = over.points ?? 1160;
  return {
    game: 'wordle-battle',
    points,
    tier: 'ciya',
    division: 1,
    placement: null,
    provisional: false,
    shieldGames: 0,
    progress: progressToNext(points),
    ratedGames: 34,
    wins: 21,
    season: { id: '2026-Q4', ratedGames: 34, wins: 21, peakPoints: 1190, peakTier: 'ciya' },
    bestPoints: 1240,
    resting: false,
    lastRatedAt: '2026-10-13T00:00:00.000Z',
    ...over,
  };
}

describe('RankCard', () => {
  it('shows the tier and division with its meaning, the points and the way to the next division', () => {
    renderApp(<RankCard rank={card()} />);
    const article = screen.getByRole('article', { name: 'Peyvok Battle' });
    expect(within(article).getByRole('heading', { name: /Çiya I/ })).toBeInTheDocument();
    expect(within(article).getByText('Mountain')).toBeInTheDocument();
    expect(within(article).getByText('1,160')).toBeInTheDocument();
    expect(within(article).getByText('40 points to Lûtke III')).toBeInTheDocument();
    expect(within(article).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    expect(within(article).getByRole('img', { name: 'Çiya I (Mountain)' })).toBeInTheDocument();
  });

  it('shows “Placing 2/5” and no tier while placing', () => {
    renderApp(<RankCard rank={card({ game: 'rhyme-match', tier: null, division: null, placement: { played: 2, of: 5 }, progress: null, points: 112 })} />);
    expect(screen.getByRole('heading', { name: 'Placing 2/5' })).toBeInTheDocument();
    expect(screen.getByText('Your first 5 rated games find your starting rank.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('says “Not placed yet” before the first rated game', () => {
    renderApp(<RankCard rank={card({ tier: null, division: null, placement: { played: 0, of: 5 }, progress: null, points: 0 })} />);
    expect(screen.getByRole('heading', { name: en['ranks.unplaced'] })).toBeInTheDocument();
  });

  it('marks a settling rank with a “?” that explains itself, and a shield in words', () => {
    renderApp(<RankCard rank={card({ provisional: true, shieldGames: 2, tier: 'gir', division: 2, points: 450, progress: progressToNext(450) })} />);
    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByText(en['ranks.provisionalHint'])).toBeInTheDocument();
    expect(screen.getByText('Shield: 2 games')).toBeInTheDocument();
    expect(screen.getByText('Your next 2 rated games can’t take you below Gir.')).toBeInTheDocument();
  });

  it('says “Resting” after four weeks, and that the rank is kept', () => {
    renderApp(<RankCard rank={card({ resting: true })} />);
    expect(screen.getByText(en['ranks.resting'])).toBeInTheDocument();
    expect(screen.getByText(en['ranks.restingHint'])).toBeInTheDocument();
  });

  it('has no next division at the top of the climb, and Stêrk has none at all', () => {
    renderApp(<RankCard rank={card({ tier: 'sterk', division: null, points: 1500, progress: progressToNext(1500) })} />);
    expect(screen.getByRole('heading', { name: /Stêrk/ })).toBeInTheDocument();
    expect(screen.getByText(en['ranks.sterkHint'])).toBeInTheDocument();
  });
});

describe('RanksSection', () => {
  const mine = (over: Partial<MyRanks> = {}): MyRanks => ({
    ranks: [card(), card({ game: 'rhyme-match', tier: null, division: null, placement: { played: 2, of: 5 }, progress: null }), card({ game: 'stories', tier: 'gir', division: 2, points: 450, progress: progressToNext(450) })],
    cooldownUntil: null,
    season: { ...seasonById('2026-Q4'), daysLeft: 78 },
    ...over,
  });

  function signIn(body: unknown): void {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.includes('/ranks/me') ? jsonResponse(200, body) : jsonResponse(200, { user: { id: 'me', username: 'rojda', emailVerified: true } }))),
    );
  }

  it('shows a card per game and the season, calmly, with the way to its page and the badges', async () => {
    signIn(mine());
    renderApp(<RanksSection />);
    expect(await screen.findByRole('heading', { name: en['ranks.title'] })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByRole('link', { name: /Payîz 2026.*78 days left/ })).toHaveAttribute('href', '/app/season');
    expect(screen.getByRole('link', { name: en['badges.title'] })).toHaveAttribute('href', '/app/badges');
  });

  it('explains a rated-game cooldown, and that friendly games are open', async () => {
    signIn(mine({ cooldownUntil: new Date(Date.now() + 600_000).toISOString() }));
    renderApp(<RanksSection />);
    expect(await screen.findByText(/Rated games are paused for you until/)).toBeInTheDocument();
  });

  it('is not there for a visitor without an account', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    const { container } = renderApp(<RanksSection />);
    expect(container).toBeEmptyDOMElement();
  });
});
