// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('./deviceName', () => ({ deviceName: () => 'iPhone' }));
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryTokenStorage } from '../api/types';
import { I18nProvider } from '../i18n/I18nContext';
import { AuthProvider, useAuth } from './AuthContext';
import { forgetDeviceId } from './deviceId';

/*
 * What the account calls say when they fail: in the reader’s words, never a
 * claim that something happened when the server did not take it.
 */

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider storage={new MemoryTokenStorage()} baseUrl="https://api.test">
        {children}
      </AuthProvider>
    </I18nProvider>
  );
}

async function signedOut() {
  const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  return result;
}

beforeEach(() => {
  localStorage.clear();
  forgetDeviceId();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('signing in with Apple or Google', () => {
  async function refusedWith(status: number, body: unknown): Promise<string | null> {
    vi.stubGlobal('fetch', vi.fn(async () => json(status, body)));
    const auth = await signedOut();
    let said: string | null = null;
    await act(async () => {
      said = await auth.current.oauthSignIn('google', 'id-token-from-google-0123456789');
    });
    return said;
  }

  it('says a refused token in the reader’s words, without the code in brackets', async () => {
    const said = await refusedWith(401, { code: 'INVALID_OAUTH_TOKEN', message: 'invalid google token' });
    expect(said).toBe('We couldn’t confirm that sign-in. Please try again.');
  });

  it('says what to do when the address has an account that is not confirmed yet', async () => {
    const said = await refusedWith(409, { code: 'LINK_REQUIRES_VERIFIED_EMAIL', message: 'an account with this email exists but is not verified' });
    expect(said).toBe('This email already has an account that isn’t confirmed yet. Log in with your password and confirm the email first, then you can sign in this way too.');
  });

  it('never passes the server’s English through, whatever the refusal', async () => {
    const said = await refusedWith(400, { code: 'SOMETHING_NEW', message: 'provider sub mismatch' });
    expect(said).toBe('We couldn’t confirm that sign-in. Please try again.');
  });
});

describe('asking for a password reset', () => {
  it('resolves to nothing once the server has the request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { sent: true })));
    const auth = await signedOut();
    let said: string | null = 'unset';
    await act(async () => {
      said = await auth.current.requestPasswordReset('r@example.com');
    });
    expect(said).toBeNull();
  });

  it('says the phone could not reach Hevalo when it is offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Network request failed'))));
    const auth = await signedOut();
    let said: string | null = null;
    await act(async () => {
      said = await auth.current.requestPasswordReset('r@example.com');
    });
    expect(said).toBe('Can’t reach Hevalo right now. Check your connection and try again.');
  });
});
