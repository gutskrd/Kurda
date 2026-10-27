// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { TokenPair, TokenStorage } from '../api/types';
import { I18nProvider } from '../i18n/I18nContext';
import { currentMaintenance, endMaintenance } from '../maintenance/maintenance';
import { AuthProvider, useAuth } from './AuthContext';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  endMaintenance();
});

const notice = { title: null, message: null, pictureUrl: null, since: '2026-10-27T09:00:00.000Z', backBy: null };
const user = { id: 'u1', email: 'kawa-test-address', username: 'kawa', displayName: null, profilePhotoUrl: null, emailVerified: true };

function memoryStorage(initial: TokenPair | null = null): TokenStorage {
  let tokens = initial;
  return {
    get: async () => tokens,
    set: async (next) => {
      tokens = next;
    },
    clear: async () => {
      tokens = null;
    },
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function wrapperWith(storage: TokenStorage) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider>
        <AuthProvider storage={storage} baseUrl="https://api.test">
          {children}
        </AuthProvider>
      </I18nProvider>
    );
  };
}

describe('AuthProvider while Hevalo is offline', () => {
  /*
   * Opening the app while Hevalo is offline: the session is restored with
   * `GET /me`, which is answered 503 MAINTENANCE. That is not a failed session,
   * and it used to land on the sign-in screen as though it were.
   */
  it('keeps a session it could not restore, and restores it once Hevalo is back', async () => {
    let open = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => (open ? json(200, { user }) : json(503, { code: 'MAINTENANCE', message: 'offline', maintenance: notice }))),
    );
    const storage = memoryStorage({ accessToken: 'acc', refreshToken: 'ref' });
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(storage) });

    await waitFor(() => expect(currentMaintenance()).toEqual(notice));
    expect(result.current.status).toBe('restoring');
    expect(await storage.get()).toEqual({ accessToken: 'acc', refreshToken: 'ref' });

    open = true;
    act(() => endMaintenance());
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user?.username).toBe('kawa');
  });

  it('stays signed in when a call meets it, and reads the account again when Hevalo is back', async () => {
    let offline = false;
    let renamed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        offline
          ? json(503, { code: 'MAINTENANCE', message: 'offline', maintenance: notice })
          : json(200, { user: renamed ? { ...user, displayName: 'Kawa' } : user }),
      ),
    );
    const storage = memoryStorage({ accessToken: 'acc', refreshToken: 'ref' });
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(storage) });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    offline = true;
    await act(async () => {
      await result.current.refreshUser();
    });
    expect(currentMaintenance()).toEqual(notice);
    expect(result.current.status).toBe('signedIn');
    expect(await storage.get()).not.toBeNull();

    offline = false;
    renamed = true;
    act(() => endMaintenance());
    await waitFor(() => expect(result.current.user?.displayName).toBe('Kawa'));
  });
});
