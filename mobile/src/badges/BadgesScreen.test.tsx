// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
// A phone's width: the test page has none, and the badge grid sizes its tiles from it.
vi.mock('react-native', async () => ({
  ...(await import('../play/testing/native')),
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
}));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import type { BadgeView, BadgesResponse } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { BadgesScreen } from './BadgesScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LESSONS: BadgeView = {
  key: 'ders',
  family: 'learning',
  tier: 1,
  tierCount: 4,
  tierKey: 'sifir',
  progress: 12,
  thresholds: [10, 75, 250, 750],
  next: 75,
  unit: 'lessons',
  earnedAt: '2026-10-01T10:00:00Z',
  tierEarnedAt: ['2026-10-01T10:00:00Z'],
  secret: false,
  hidden: false,
  hintKey: null,
  rarity: null,
};
const BADGES: BadgesResponse = {
  badges: [LESSONS],
  showcase: [],
  secretsFound: 0,
  secretsTotal: 0,
  legacy: [],
  monthlyChallenge: { month: '2026-11', days: 2, goal: 20 },
};

describe('the badges on show', () => {
  it('puts a badge on show before the server answers, and takes it off again with the reason when refused', async () => {
    const said = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let answer: (r: unknown) => void = () => undefined;
    const client = fakeClient({ 'GET /me/badges': ok(BADGES), 'PUT /me/badges/showcase': () => new Promise((resolve) => (answer = resolve)) } as never);
    testAuth.client = client;
    renderWithProviders(<BadgesScreen onExit={() => undefined} />);
    // Badges keep their Kurdish names in every language.
    const tiles = await screen.findAllByRole('button', { name: /^Wane/ });
    fireEvent.click(tiles.at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Show on my profile' }));
    expect(screen.getByRole('button', { name: 'On your profile — tap to take it off' })).toBeTruthy();
    expect(client.calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([{ keys: ['ders'] }]);
    await act(async () => answer({ ok: false, error: { kind: 'network', message: 'network request failed' } }));
    expect(screen.getByRole('button', { name: 'Show on my profile' })).toBeTruthy();
    expect(said).toHaveBeenCalledWith('Can’t reach Hevalo right now. Check your connection and try again.');
  });
});
