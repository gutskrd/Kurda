// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { SuspendedErrorDetails } from '@kurda/shared';
import type { TokenPair, TokenStorage } from '../api/types';
import { I18nProvider } from '../i18n/I18nContext';
import { AuthProvider, useAuth } from './AuthContext';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const details: SuspendedErrorDetails = {
  until: '2026-10-27T13:57:00.000Z',
  policy: 'harassment',
  statement: 'Threats against another learner.',
  appealable: true,
  appealToken: 'appeal-tok',
};

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

describe('AuthProvider and a suspended account', () => {
  it('keeps the reasons and the appeal token when sign-in is refused, for the suspension screen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(403, { code: 'ACCOUNT_SUSPENDED', message: 'this account is suspended', details })));
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(memoryStorage()) });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(async () => {
      await result.current.login('kawa@example.com', 'long-enough-password');
    });
    expect(result.current.suspension).toEqual(details);
    // back to the sign-in form, on purpose
    act(() => result.current.clearSuspension());
    expect(result.current.suspension).toBeNull();
  });

  it('hears of a ban at the next refresh, and signs out onto the reasons', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? json(403, { code: 'ACCOUNT_SUSPENDED', message: 'this account is suspended', details })
        : json(401, { code: 'UNAUTHORIZED', message: 'expired' }),
    );
    vi.stubGlobal('fetch', fetchFn);
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapperWith(memoryStorage({ accessToken: 'old', refreshToken: 'refresh' })),
    });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.suspension).toEqual(details);
  });

  it('has no suspension for an ordinary wrong password', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { code: 'INVALID_CREDENTIALS', message: 'wrong email or password' })));
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWith(memoryStorage()) });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(async () => {
      await result.current.login('kawa@example.com', 'wrong');
    });
    expect(result.current.suspension).toBeNull();
  });
});
