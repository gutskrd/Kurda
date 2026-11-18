// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
// A connection the test turns off and on, as a phone on a train has it.
const net = vi.hoisted(() => {
  const listeners = new Set<(state: { isConnected: boolean | null }) => void>();
  let connected = false;
  return {
    set(next: boolean) {
      connected = next;
      listeners.forEach((l) => l({ isConnected: next }));
    },
    reset() {
      connected = false;
      listeners.clear();
    },
    module: {
      default: {
        addEventListener(listener: (state: { isConnected: boolean | null }) => void) {
          listeners.add(listener);
          listener({ isConnected: connected });
          return () => listeners.delete(listener);
        },
        async fetch() {
          return { isConnected: connected };
        },
      },
    },
  };
});
vi.mock('@react-native-community/netinfo', () => net.module);
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { TokenPair, TokenStorage } from '../api/types';
import { I18nProvider } from '../i18n/I18nContext';
import { AuthProvider, useAuth } from './AuthContext';

/*
 * Opening the app from a notification with no network, or while the server wakes: the stored session is kept, asked
 * again once it can be answered, and the letter the notification was about is then reachable.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  net.reset();
});

const user = { id: 'u1', email: 'kawa-test-address', username: 'kawa', displayName: null, profilePhotoUrl: null, emailVerified: true };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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

describe('restoring a session with no network', () => {
  it('keeps the session and signs in once the phone is back online, instead of landing on sign-in', async () => {
    let online = false;
    const fetchFn = vi.fn(async () => {
      if (!online) throw new TypeError('Network request failed');
      return json(200, { user });
    });
    vi.stubGlobal('fetch', fetchFn);
    const storage = memoryStorage({ accessToken: 'acc', refreshToken: 'ref' });
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(storage) });

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.status).toBe('restoring');
    expect(await storage.get()).toEqual({ accessToken: 'acc', refreshToken: 'ref' });

    online = true;
    act(() => net.set(true));
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user?.username).toBe('kawa');
  });

  it('keeps the session when an expired access token’s refresh cannot reach Hevalo', async () => {
    let online = false;
    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) {
        if (!online) throw new TypeError('Network request failed');
        return json(200, { accessToken: 'acc2', refreshToken: 'ref2' });
      }
      return json(401, { code: 'UNAUTHORIZED', message: 'expired' });
    });
    vi.stubGlobal('fetch', fetchFn);
    const storage = memoryStorage({ accessToken: 'acc', refreshToken: 'ref' });
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(storage) });

    await waitFor(() => expect(fetchFn.mock.calls.some(([url]) => String(url).endsWith('/auth/refresh'))).toBe(true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.status).toBe('restoring');
    expect(await storage.get()).toEqual({ accessToken: 'acc', refreshToken: 'ref' });

    // Back online: the refresh goes through, and the account is read with the new token.
    online = true;
    fetchFn.mockImplementation(async (url: string) =>
      String(url).endsWith('/auth/refresh') ? json(200, { accessToken: 'acc2', refreshToken: 'ref2' }) : json(200, { user }),
    );
    act(() => net.set(true));
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
  });

  it('keeps the session while the server is down, and asks again a little later by itself', async () => {
    let up = false;
    const fetchFn = vi.fn(async () => (up ? json(200, { user }) : json(502, { code: 'BAD_GATEWAY', message: 'waking' })));
    vi.stubGlobal('fetch', fetchFn);
    net.set(true);
    const storage = memoryStorage({ accessToken: 'acc', refreshToken: 'ref' });
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(storage) });
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('restoring');
    up = true;
    await waitFor(() => expect(result.current.status).toBe('signedIn'), { timeout: 4000 });
  });

  it('still signs out when the session itself is refused', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      String(url).endsWith('/auth/refresh') ? json(401, { code: 'INVALID_REFRESH_TOKEN', message: 'no' }) : json(401, { code: 'UNAUTHORIZED', message: 'expired' }),
    );
    vi.stubGlobal('fetch', fetchFn);
    net.set(true);
    const storage = memoryStorage({ accessToken: 'acc', refreshToken: 'ref' });
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(storage) });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(await storage.get()).toBeNull();
  });
});
