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
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { SeasonScreen } from './SeasonScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const SEASON = { id: '2026-Q4', name: 'payiz', year: 2026, startsAt: '2026-10-01T00:00:00Z', endsAt: '2027-01-01T00:00:00Z', daysLeft: 40 };

describe('wearing a season frame', () => {
  it('wears it before the server answers, ends quick taps on the last one, and puts a refused one back', async () => {
    const answers: ((r: unknown) => void)[] = [];
    const client = fakeClient({
      'GET /ranks/seasons/current': ok({ season: SEASON, rewards: [], minGames: 5, lastSeason: null }),
      'GET /ranks/me': ok({ ranks: [], cooldownUntil: null, season: SEASON }),
      'GET /ranks/seasons/me': ok({ emblems: [] }),
      'GET /me/inventory': ok({ items: [{ sku: 'frame_rank_gir', name: 'Gir frame', category: 'frame', quantity: 1, premiumOnly: false, assetUrl: null }] }),
      'GET /users/me': ok({ frameSku: null }),
      'PUT /me/cosmetics/frame': () => new Promise((resolve) => answers.push(resolve)),
    } as never);
    testAuth.client = client;
    renderWithProviders(<SeasonScreen onExit={() => undefined} />);
    const frame = await screen.findByRole('button', { name: /Wear$/ });
    fireEvent.click(frame);
    expect(screen.getByRole('button', { name: /Take off$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Take off$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Wear$/ }));
    const puts = () => client.calls.filter((c) => c.method === 'PUT').map((c) => c.body);
    expect(puts()).toEqual([{ sku: 'frame_rank_gir' }]);
    await act(async () => answers[0]!({ ok: false, error: { kind: 'network', message: 'network request failed' } }));
    expect(screen.getByRole('button', { name: /Wear$/ })).toBeTruthy();
    expect(screen.getByText('Can’t reach Hevalo right now. Check your connection and try again.')).toBeTruthy();
  });
});
