// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProfileRank } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { ProgressShowcase } from './ProgressShowcase';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));

const rank = (over: Partial<ProfileRank>): ProfileRank => ({
  game: 'wordle-battle',
  tier: 'gir',
  division: 2,
  points: 450,
  resting: false,
  placing: false,
  placement: null,
  seasonPeakTier: 'gir',
  bestTier: 'gir',
  ...over,
});

describe('ProgressShowcase', () => {
  afterEach(cleanup);

  it('says how far through placement someone is, rather than 0 of 5', () => {
    renderWithProviders(
      <ProgressShowcase
        own={false}
        badges={[]}
        league={null}
        ranks={[
          rank({ game: 'rhyme-match', tier: null, division: null, points: null, placing: true, placement: { played: 3, of: 5 }, seasonPeakTier: null, bestTier: null }),
          rank({}),
        ]}
      />,
    );
    expect(screen.getAllByText('Placing 3/5').length).toBeGreaterThan(0);
    expect(screen.queryByText('Placing 0/5')).toBeNull();
    expect(screen.getAllByText('Gir II').length).toBeGreaterThan(0);
  });

  it('falls back to a bare "Placing" when the count is not sent', () => {
    renderWithProviders(
      <ProgressShowcase
        own={false}
        badges={[]}
        league={null}
        ranks={[rank({ tier: null, division: null, points: null, placing: true, placement: undefined as never, seasonPeakTier: null, bestTier: null })]}
      />,
    );
    expect(screen.getAllByText('Placing').length).toBeGreaterThan(0);
  });
});
