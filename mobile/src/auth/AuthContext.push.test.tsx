// @vitest-environment jsdom
/**
 * Signing out and deleting the account take this phone off the account's
 * notifications first, while the session can still say whose phone it is:
 * once the session is cleared, the removal would go without one and be
 * refused without a word, and the phone would go on being told what the
 * account receives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('./deviceName', () => ({ deviceName: () => 'iPhone' }));
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryTokenStorage, type TokenStorage } from '../api/types';
import { I18nProvider } from '../i18n/I18nContext';
import { AuthProvider, useAuth } from './AuthContext';
import { forgetDeviceId } from './deviceId';
import { registeredPushToken, rememberPushToken, takePushToken } from '../push/thisDevice';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const USER = { id: 'u1', email: 'r@example.com', username: 'rojda', displayName: null, profilePhotoUrl: null, emailVerified: true };
const PHONE = 'ExponentPushToken[phone-of-rojda]';

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

type Call = { method: string; path: string; authorization: string | undefined; body: Record<string, unknown> | null };
function stubFetch(answer: (method: string, path: string) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = url.replace('https://api.test', '');
      const method = init.method ?? 'GET';
      const headers = init.headers as Record<string, string>;
      calls.push({ method, path, authorization: headers.authorization, body: init.body ? JSON.parse(String(init.body)) : null });
      return answer(method, path);
    }),
  );
  return calls;
}

async function signedIn(storage: MemoryTokenStorage) {
  await storage.set({ accessToken: 'acc', refreshToken: 'ref' });
  const hook = renderHook(() => useAuth(), { wrapper: wrapperWith(storage) });
  await waitFor(() => expect(hook.result.current.status).toBe('signedIn'));
  // registered for the account, as PushRegistration does once the app is signed in
  rememberPushToken(PHONE);
  return hook;
}

beforeEach(() => {
  localStorage.clear();
  forgetDeviceId();
  takePushToken();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('this phone’s notifications as the session ends', () => {
  it('signing out takes the phone off with the session, before the session is cleared', async () => {
    const calls = stubFetch((_method, path) => (path === '/me' ? json(200, { user: USER }) : json(200, {})));
    const storage = new MemoryTokenStorage();
    const { result } = await signedIn(storage);
    await act(async () => {
      await result.current.logout();
    });
    const removal = calls.findIndex((c) => c.path === '/me/devices/remove');
    expect(removal).toBeGreaterThan(-1);
    expect(calls[removal]).toMatchObject({ method: 'POST', authorization: 'Bearer acc', body: { token: PHONE } });
    // and only then is the session ended, on the server and on the phone
    expect(calls.findIndex((c) => c.path === '/auth/logout')).toBeGreaterThan(removal);
    expect(await storage.get()).toBeNull();
    expect(result.current.status).toBe('signedOut');
    expect(registeredPushToken()).toBeNull();
  });

  it('deleting the account takes the phone off before the deletion, and ends the session as signing out does', async () => {
    const calls = stubFetch((method, path) =>
      path === '/me' && method === 'GET' ? json(200, { user: USER }) : path === '/me' ? json(200, { deletionScheduled: true, graceDays: 14 }) : json(200, {}),
    );
    const storage = new MemoryTokenStorage();
    const { result } = await signedIn(storage);
    let outcome: Awaited<ReturnType<typeof result.current.deleteAccount>> | null = null;
    await act(async () => {
      outcome = await result.current.deleteAccount();
    });
    expect(outcome).toEqual({ ok: true, graceDays: 14 });
    const removal = calls.findIndex((c) => c.path === '/me/devices/remove');
    const deletion = calls.findIndex((c) => c.path === '/me' && c.method === 'DELETE');
    expect(calls[removal]).toMatchObject({ authorization: 'Bearer acc', body: { token: PHONE } });
    expect(deletion).toBeGreaterThan(removal);
    expect(calls.findIndex((c) => c.path === '/auth/logout')).toBeGreaterThan(deletion);
    expect(calls.find((c) => c.path === '/auth/logout')!.body).toEqual({ refreshToken: 'ref' });
    expect(await storage.get()).toBeNull();
    expect(result.current.status).toBe('signedOut');
  });

  it('a removal the server refuses does not renew the session it was the last request of', async () => {
    const calls = stubFetch((_method, path) => (path === '/me' ? json(200, { user: USER }) : path === '/me/devices/remove' ? json(401, { code: 'UNAUTHORIZED' }) : json(200, {})));
    const storage = new MemoryTokenStorage();
    const { result } = await signedIn(storage);
    await act(async () => {
      await result.current.logout();
    });
    expect(calls.some((c) => c.path === '/auth/refresh')).toBe(false);
    expect(calls.some((c) => c.path === '/auth/logout')).toBe(true);
    expect(await storage.get()).toBeNull();
  });
});
