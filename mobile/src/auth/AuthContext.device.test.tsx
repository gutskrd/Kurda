// @vitest-environment jsdom
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

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const SIGNED_IN = { user: { id: 'u1', email: 'r@example.com', username: 'rojda', displayName: null, profilePhotoUrl: null, emailVerified: true }, tokens: { accessToken: 'acc', refreshToken: 'ref' } };

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

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> | null };
function stubFetch(answer: (url: string) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null });
      return answer(url);
    }),
  );
  return calls;
}

beforeEach(() => {
  localStorage.clear();
  forgetDeviceId();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('signing in from this device', () => {
  it('says which device it is on every request, the same id each time, and names the phone', async () => {
    const calls = stubFetch((url) => (url.endsWith('/auth/login') ? json(200, SIGNED_IN) : json(200, { user: SIGNED_IN.user })));
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(new MemoryTokenStorage()) });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(async () => {
      expect(await result.current.login('r@example.com', 'berbang2026')).toBeNull();
    });
    await act(async () => {
      await result.current.refreshUser();
    });
    const id = localStorage.getItem('kurda_device_id_v1');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    // the sign-in, the account read after it, and whatever else the signed-in app sent
    expect(calls.map((c) => c.url)).toEqual(expect.arrayContaining(['https://api.test/auth/login', 'https://api.test/me']));
    for (const call of calls) expect(call.headers['x-device-id'], call.url).toBe(id);
    expect(calls.find((c) => c.url.endsWith('/auth/login'))!.body).toEqual({ email: 'r@example.com', password: 'berbang2026', deviceName: 'iPhone' });
  });

  it('keeps the id it stored on an earlier launch', async () => {
    localStorage.setItem('kurda_device_id_v1', 'kept-from-last-time');
    const calls = stubFetch(() => json(200, SIGNED_IN));
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(new MemoryTokenStorage()) });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(async () => {
      await result.current.login('r@example.com', 'berbang2026');
    });
    expect(calls.find((c) => c.url.endsWith('/auth/login'))!.headers['x-device-id']).toBe('kept-from-last-time');
  });

  it('names the phone when signing up and when signing in with Google or Apple', async () => {
    const calls = stubFetch(() => json(201, SIGNED_IN));
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(new MemoryTokenStorage()) });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(async () => {
      await result.current.register({ email: 'r@example.com', username: 'rojda', password: 'berbang2026', birthYear: 1998, birthMonth: 3 });
    });
    await act(async () => {
      await result.current.oauthSignIn('apple', 'id-token-from-apple-0123456789');
    });
    const sent = (path: string) => calls.find((c) => c.url.endsWith(path))!.body;
    expect(sent('/auth/register')).toMatchObject({ email: 'r@example.com', deviceName: 'iPhone', acceptTerms: true });
    expect(sent('/auth/oauth')).toEqual({ provider: 'apple', idToken: 'id-token-from-apple-0123456789', deviceName: 'iPhone' });
  });

  it('passes on Apple’s authorization code and the shared name with an Apple sign-in, and neither with Google', async () => {
    const calls = stubFetch(() => json(201, SIGNED_IN));
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(new MemoryTokenStorage()) });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(async () => {
      await result.current.oauthSignIn('apple', 'id-token-from-apple-0123456789', { authorizationCode: 'c1.0.first', fullName: 'Rojda Amed' });
    });
    await act(async () => {
      // Apple shares the name on the first sign-in only
      await result.current.oauthSignIn('apple', 'id-token-from-apple-0123456789', { authorizationCode: 'c2.0.later', fullName: null });
    });
    await act(async () => {
      await result.current.oauthSignIn('google', 'id-token-from-google-0123456789', { authorizationCode: 'c3', fullName: 'Rojda Amed' });
    });
    const sent = calls.filter((c) => c.url.endsWith('/auth/oauth')).map((c) => c.body);
    expect(sent).toEqual([
      { provider: 'apple', idToken: 'id-token-from-apple-0123456789', authorizationCode: 'c1.0.first', fullName: 'Rojda Amed', deviceName: 'iPhone' },
      { provider: 'apple', idToken: 'id-token-from-apple-0123456789', authorizationCode: 'c2.0.later', deviceName: 'iPhone' },
      { provider: 'google', idToken: 'id-token-from-google-0123456789', deviceName: 'iPhone' },
    ]);
    expect(Object.keys(sent[1]!)).not.toContain('fullName');
  });

  it('hands the form the refusal’s code with its sentence', async () => {
    stubFetch(() => json(403, { code: 'CAPTCHA_REQUIRED', message: 'complete the challenge to sign in', details: { captchaRequired: true, reason: 'attempts' } }));
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(new MemoryTokenStorage()) });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    let failure: Awaited<ReturnType<typeof result.current.login>> = null;
    await act(async () => {
      failure = await result.current.login('r@example.com', 'wrong-one-1');
    });
    expect(failure).toEqual({
      code: 'CAPTCHA_REQUIRED',
      message: 'There have been several failed sign-in attempts. For your safety, wait a few minutes and try again, or reset your password.',
    });
  });
});
