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
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { SearchScreen } from './SearchScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

describe('Search with nothing typed', () => {
  /*
   * People you may know take a moment to arrive. "Type to search"
   * used to show first and then be replaced by them — the screen changing
   * its mind under the reader. Their place is held in grey instead.
   */
  it('holds the place of people you may know while they load, rather than saying there is nothing', async () => {
    let answer: (v: unknown) => void = () => undefined;
    testAuth.client = fakeClient({ 'GET /friends/suggestions': () => new Promise((go) => (answer = go)) as never });
    renderWithProviders(<SearchScreen />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(10);
    expect(screen.queryByText('Type to search across the app.')).toBeNull();

    answer(ok({ suggestions: [{ userId: 'u7', username: 'jiyan', displayName: 'Jiyan', mutualCount: 3 }] }));
    expect(await screen.findByText('jiyan')).toBeTruthy();
    expect(screen.queryAllByTestId('skeleton')).toHaveLength(0);
  });

  it('says where to start once it knows there is nobody to suggest', async () => {
    testAuth.client = fakeClient({ 'GET /friends/suggestions': ok({ suggestions: [] }) });
    renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('Type to search across the app.')).toBeTruthy();
    expect(screen.queryAllByTestId('skeleton')).toHaveLength(0);
  });
});
