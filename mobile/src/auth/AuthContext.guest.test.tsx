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
import { onGuestRefused } from './guestRefused';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** What POST /auth/guest answers: an account with a given name, no email, verified and nothing more to ask. */
const GUEST = {
  user: { id: 'g1', email: '', username: 'mevan_4821', displayName: null, profilePhotoUrl: null, emailVerified: true, birthDateRequired: false, guest: true },
  tokens: { accessToken: 'guest-acc', refreshToken: 'guest-ref' },
};
/** What POST /auth/claim answers: the same account, now somebody's, with a code on its way. */
const CLAIMED = {
  user: { ...GUEST.user, email: 'r@example.com', username: 'rojda', emailVerified: false, guest: false },
};

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

type Call = { url: string; body: Record<string, unknown> | null };
function stubFetch(answer: (url: string) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
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

async function startAsGuest(calls: Call[]) {
  const storage = new MemoryTokenStorage();
  const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(storage) });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  await act(async () => {
    expect(await result.current.continueAsGuest()).toBeNull();
  });
  return { result, storage, calls };
}

describe('trying Hevalo as a guest', () => {
  it('asks for a guest session with the phone’s name and language, and is signed in as a guest on its tokens', async () => {
    const calls = stubFetch((url) => (url.endsWith('/auth/guest') ? json(201, GUEST) : json(200, { user: GUEST.user })));
    const { result, storage } = await startAsGuest(calls);
    expect(calls.find((c) => c.url.endsWith('/auth/guest'))!.body).toEqual({ deviceName: 'iPhone', locale: 'en' });
    expect(await storage.get()).toEqual({ accessToken: 'guest-acc', refreshToken: 'guest-ref' });
    expect(result.current.status).toBe('signedIn');
    expect(result.current.isGuest).toBe(true);
    expect(result.current.user?.username).toBe('mevan_4821');
  });

  it('hands the sign-in screen the refusal, with its code, and stays signed out', async () => {
    stubFetch(() => json(503, { code: 'SERVICE_UNAVAILABLE', message: 'try later' }));
    const storage = new MemoryTokenStorage();
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(storage) });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    let failure: Awaited<ReturnType<typeof result.current.continueAsGuest>> = null;
    await act(async () => {
      failure = await result.current.continueAsGuest();
    });
    expect(failure).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(result.current.status).toBe('signedOut');
    expect(await storage.get()).toBeNull();
  });

  it('claims the account with the form’s answers and consent, and becomes that account on the same tokens', async () => {
    const calls = stubFetch((url) => {
      if (url.endsWith('/auth/guest')) return json(201, GUEST);
      if (url.endsWith('/auth/claim')) return json(200, CLAIMED);
      return json(200, { user: GUEST.user });
    });
    const { result, storage } = await startAsGuest(calls);
    await act(async () => {
      expect(
        await result.current.claimAccount({ email: 'r@example.com', username: 'rojda', password: 'berbang2026', locale: 'en', birthYear: 1998, birthMonth: 3 }),
      ).toBeNull();
    });
    expect(calls.find((c) => c.url.endsWith('/auth/claim'))!.body).toEqual({
      email: 'r@example.com',
      username: 'rojda',
      password: 'berbang2026',
      locale: 'en',
      birthYear: 1998,
      birthMonth: 3,
      acceptTerms: true,
    });
    // the session is the same one; only who it belongs to changed, and the email is still to be proven
    expect(await storage.get()).toEqual({ accessToken: 'guest-acc', refreshToken: 'guest-ref' });
    expect(result.current.isGuest).toBe(false);
    expect(result.current.user).toMatchObject({ username: 'rojda', email: 'r@example.com', emailVerified: false, guest: false });
    expect(result.current.status).toBe('signedIn');
  });

  it('keeps the guest when the claim is refused, and says why with the code', async () => {
    const calls = stubFetch((url) => {
      if (url.endsWith('/auth/guest')) return json(201, GUEST);
      if (url.endsWith('/auth/claim')) return json(409, { code: 'REGISTRATION_FAILED', message: 'could not register' });
      return json(200, { user: GUEST.user });
    });
    const { result } = await startAsGuest(calls);
    let failure: Awaited<ReturnType<typeof result.current.claimAccount>> = null;
    await act(async () => {
      failure = await result.current.claimAccount({ email: 'r@example.com', password: 'berbang2026', birthYear: 1998, birthMonth: 3 });
    });
    expect(failure).toMatchObject({ code: 'REGISTRATION_FAILED' });
    expect(result.current.isGuest).toBe(true);
  });

  it('tells the account gate when the server refuses the guest something only an account may do', async () => {
    const calls = stubFetch((url) => {
      if (url.endsWith('/auth/guest')) return json(201, GUEST);
      if (url.endsWith('/friends/requests')) return json(403, { code: 'GUEST_ACCOUNT', message: 'guest accounts cannot do this' });
      return json(200, { user: GUEST.user });
    });
    const { result } = await startAsGuest(calls);
    const refusals: number[] = [];
    const stop = onGuestRefused(() => refusals.push(1));
    await act(async () => {
      const res = await result.current.client.post('/friends/requests', { userId: 'u2' });
      expect(res.ok).toBe(false);
    });
    stop();
    expect(refusals).toHaveLength(1);
  });
});
