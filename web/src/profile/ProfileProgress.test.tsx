import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { ProfileRank } from '@kurda/shared';
import { renderApp } from '../test/utils';
import { en } from '../i18n/en';
import { ProfileProgress } from './ProfileProgress';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const rank = (over: Partial<ProfileRank>): ProfileRank => ({
  game: 'wordle-battle',
  tier: 'ciya',
  division: 1,
  points: 1160,
  resting: false,
  placing: false,
  seasonPeakTier: 'ciya',
  bestTier: 'lutke',
  ...over,
});

describe('ProfileProgress', () => {
  it('shows the three badges, each game’s rank with the season’s best and the best ever, and the league, all named', () => {
    renderApp(
      <ProfileProgress
        badges={[
          { key: 'peyvzan', family: 'games', tier: 3, tierKey: 'zer' },
          { key: 'agir', family: 'habit', tier: 2, tierKey: 'ziv' },
          { key: 'rank-ciya', family: 'ranked', tier: 1, tierKey: 'sifir' },
        ]}
        ranks={[rank({}), rank({ game: 'stories', tier: 'gir', division: 2, seasonPeakTier: 'gir', bestTier: 'gir' })]}
        league={{ tier: 'cem' }}
      />,
    );
    expect(screen.getByText('Peyvzan')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Agir (Fire), Zîv' })).toBeInTheDocument();
    expect(screen.getByText('Çiya I')).toBeInTheDocument();
    expect(screen.getByText('Best ever: Lûtke')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Best this season: Çiya (Mountain)' })).toBeInTheDocument();
    expect(screen.getByText('Çem League')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Çem (River)' })).toBeInTheDocument();
  });

  it('handles a rank with no tier: placing, and resting', () => {
    renderApp(
      <ProfileProgress
        ranks={[
          rank({ game: 'rhyme-match', tier: null, division: null, points: null, placing: true, seasonPeakTier: null, bestTier: null }),
          rank({ game: 'stories', tier: null, division: null, points: null, resting: true, seasonPeakTier: null, bestTier: 'gir' }),
        ]}
      />,
    );
    expect(screen.getByText(en['ranks.placingShort'], { selector: '.profile-rank-tier' })).toBeInTheDocument();
    expect(screen.getByText(en['ranks.resting'])).toBeInTheDocument();
    expect(screen.getByText('Best ever: Gir')).toBeInTheDocument();
  });

  it('reads an old ten-tier league name as its water tier, and shows nothing for someone not in a league', () => {
    const { unmount } = renderApp(<ProfileProgress league={{ tier: 'gold' as never }} />);
    expect(screen.getByText('Kanî League')).toBeInTheDocument();
    unmount();
    const { container } = renderApp(<ProfileProgress league={null} ranks={[]} badges={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('invites the owner to choose badges when none are on show', () => {
    renderApp(<ProfileProgress own badges={[]} />);
    expect(screen.getByText(en['profile.noBadges'])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en['profile.allBadges'] })).toHaveAttribute('href', '/app/badges');
  });
});
