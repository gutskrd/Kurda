import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { en } from '../i18n/en';
import { ProfileProgress } from './ProfileProgress';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('ProfileProgress', () => {
  it('shows the three badges and the league, all named', () => {
    renderApp(
      <ProfileProgress
        badges={[
          { key: 'peyvzan', family: 'games', tier: 3, tierKey: 'zer' },
          { key: 'agir', family: 'habit', tier: 2, tierKey: 'ziv' },
          { key: 'rank-ciya', family: 'ranked', tier: 1, tierKey: 'sifir' },
        ]}
        league={{ tier: 'cem' }}
      />,
    );
    expect(screen.getByText('Peyvzan')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Agir (Fire), Zîv' })).toBeInTheDocument();
    // a badge earned before game ranks ended still shows
    expect(screen.getByRole('img', { name: 'Çiya (Mountain), Sifir' })).toBeInTheDocument();
    expect(screen.getByText(en['profile.stat.league'])).toBeInTheDocument();
    expect(screen.getByText('Çem League')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Çem (River)' })).toBeInTheDocument();
  });

  it('reads an old ten-tier league name as its water tier, and shows nothing for someone not in a league', () => {
    const { unmount } = renderApp(<ProfileProgress league={{ tier: 'gold' as never }} />);
    expect(screen.getByText('Kanî League')).toBeInTheDocument();
    unmount();
    const { container } = renderApp(<ProfileProgress league={null} badges={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('invites the owner to choose badges when none are on show', () => {
    renderApp(<ProfileProgress own badges={[]} />);
    expect(screen.getByText(en['profile.noBadges'])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en['profile.allBadges'] })).toHaveAttribute('href', '/app/badges');
  });
});
