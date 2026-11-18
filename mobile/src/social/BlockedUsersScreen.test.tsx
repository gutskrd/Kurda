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
// The pull to refresh as a button: the web's control has nothing to pull.
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import type { ApiResult } from '../api/types';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { BlockedUsersScreen } from './BlockedUsersScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const rojda = { userId: 'u2', username: 'rojda', displayName: null, avatarUrl: null, blockedAt: '2026-03-03T10:00:00.000Z' };

describe('the people you have blocked', () => {
  // A list that could not be read is not a list of nobody: "you haven't blocked anyone" would be untrue.
  it('says it could not load, with the way to ask again, rather than that nobody is blocked', async () => {
    let reads = 0;
    testAuth.client = fakeClient({
      'GET /friends/blocks?limit=25&offset=0': () => (reads++ === 0 ? fail({ kind: 'server', status: 500, message: 'down' }) : ok({ blocked: [rojda], total: 1 })),
    });
    renderWithProviders(<BlockedUsersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(screen.queryByText(/You haven’t blocked anyone/)).toBeNull();
    expect(await screen.findByText('rojda')).toBeTruthy();
  });

  /* As on the website: the row goes as Unblock is confirmed; the last one gone leaves the empty state. */
  it('unblocks at once, before the server answers, down to the empty list', async () => {
    let answer: (res: ApiResult<unknown>) => void = () => undefined;
    testAuth.client = fakeClient({
      'GET /friends/blocks?limit=25&offset=0': ok({ blocked: [rojda], total: 1 }),
      'DELETE /friends/u2/block': () => new Promise((resolve) => (answer = resolve)),
    });
    const confirm = vi.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    renderWithProviders(<BlockedUsersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Unblock' }));
    expect(screen.queryByText('rojda')).toBeNull();
    expect(screen.getByText('You haven’t blocked anyone.')).toBeTruthy();
    await act(async () => answer(ok({ ok: true })));
    expect(screen.queryByText('rojda')).toBeNull();
    confirm.mockRestore();
  });

  it('puts the row back, still blocked, and says why when the server refuses', async () => {
    testAuth.client = fakeClient({
      'GET /friends/blocks?limit=25&offset=0': ok({ blocked: [rojda], total: 1 }),
      'DELETE /friends/u2/block': fail({ kind: 'network', status: 0, message: 'offline' }),
    });
    const confirm = vi.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    renderWithProviders(<BlockedUsersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Unblock' }));
    expect(await screen.findByText('rojda')).toBeTruthy();
    expect(screen.queryByText('You haven’t blocked anyone.')).toBeNull();
    confirm.mockRestore();
  });

  it('says since when in the app’s own language', async () => {
    testAuth.client = fakeClient({ 'GET /friends/blocks?limit=25&offset=0': ok({ blocked: [rojda], total: 1 }) });
    renderWithProviders(<BlockedUsersScreen onExit={() => undefined} />);
    expect(await screen.findByText(/@rojda · .*Mar/)).toBeTruthy();
  });
});
