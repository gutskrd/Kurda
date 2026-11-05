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
