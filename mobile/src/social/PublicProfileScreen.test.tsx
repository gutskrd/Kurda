// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// the fire as its props: how big it burns, whoever draws it
vi.mock('../theme/Fire', () => import('../theme/testing/fireProbe'));
import { cleanup, screen } from '@testing-library/react';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { PublicProfileScreen } from './PublicProfileScreen';

/*
 * Another learner's profile: their streak's fire as big as their streak has
 * grown it, so a friend a year in shows the Newroz fire.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

function visit(streak: number): void {
  testAuth.client = fakeClient({
    'GET /users/u2': ok({ userId: 'u2', username: 'baran', displayName: 'Baran', friendStatus: 'friends', private: false, xp: 9000, streak, achievements: 4 }),
    'GET /users/u2/activity?kind=posts&limit=12': ok({ items: [] }),
  });
  renderWithProviders(<PublicProfileScreen userId="u2" onExit={() => undefined} />);
}

describe('the streak of another learner', () => {
  it('burns as big as their streak: the Newroz fire after a year', async () => {
    visit(400);
    expect(await screen.findByText('400')).toBeTruthy();
    expect(screen.getByTestId('fire').dataset.stage).toBe('newroz');
  });

  it('is a campfire after nine days, and cold logs with none', async () => {
    visit(9);
    expect(await screen.findByText('9')).toBeTruthy();
    expect(screen.getByTestId('fire').dataset.stage).toBe('campfire');
    cleanup();
    visit(0);
    expect(await screen.findByText('baran')).toBeTruthy();
    expect(screen.getByTestId('fire').dataset.stage).toBe('cold');
  });
});
