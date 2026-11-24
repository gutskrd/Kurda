// @vitest-environment jsdom
/** Settings → Storage and data → On this device: the cache's size, and clearing it behind a confirming sheet. */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { TRANSLATIONS } from '../i18n/translations';
import { interpolate } from '../i18n/format';
import { ART_OVERRIDES_KEY } from '../art/overrides';
import { formatBytes } from './deviceCache';
import { SettingsPageScreen } from './SettingsPageScreen';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

patchReactNativeWeb({ reduceMotion: true });

const t = (key: keyof typeof TRANSLATIONS.en, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.en[key], vars);

/** The browser's storage for the page: its size, and the caches a clear empties. */
function browser(usage: () => number): { deleted: string[] } {
  const deleted: string[] = [];
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: async () => ({ usage: usage() }) } });
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      keys: async () => ['pictures', 'sounds'],
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    },
  });
  return { deleted };
}

beforeEach(() => {
  testAuth.user = { ...testAuth.user, guest: true };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  testAuth.user = { ...testAuth.user, guest: false };
  Reflect.deleteProperty(navigator, 'storage');
  Reflect.deleteProperty(globalThis, 'caches');
});

describe('the cache', () => {
  it('says a size as phones do, in powers of a thousand', () => {
    expect(formatBytes(840_000, t, 'en')).toBe('840 KB');
    expect(formatBytes(23_400_000, t, 'en')).toBe('23.4 MB');
    expect(formatBytes(1_250_000_000, t, 'en')).toBe('1.3 GB');
    expect(formatBytes(23_400_000, t, 'de')).toBe('23,4 MB');
  });

  it('shows its size, asks before clearing, and clears only what is kept to be quick', async () => {
    let usage = 23_400_000;
    const { deleted } = browser(() => usage);
    const client = fakeClient({ 'GET /art/overrides': ok({ version: 'v1', overrides: {} }) });
    testAuth.client = client;
    localStorage.setItem(ART_OVERRIDES_KEY, '{"version":"v0","overrides":{}}');
    localStorage.setItem('kurda_tokens_v1', '{"accessToken":"a","refreshToken":"r"}');
    renderWithProviders(<SettingsPageScreen page="storage" onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Clear cache' })).toBeTruthy();
    expect((await screen.findByText('23.4 MB')).textContent).toBe('23.4 MB');

    fireEvent.click(screen.getByRole('button', { name: 'Clear cache' }));
    const sheet = await screen.findByTestId('storage-clear-ask');
    expect(within(sheet).getByText('Clears pictures and sounds saved on this phone. Your progress, drafts and settings stay.')).toBeTruthy();
    expect(deleted).toEqual([]);

    usage = 1_200_000;
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId('storage-clear-confirm'));
    });
    expect(deleted.sort()).toEqual(['pictures', 'sounds']);
    // The copy of the server's art list is read again; the session stays.
    expect(client.calls.some((c) => c.path === '/art/overrides')).toBe(true);
    expect(localStorage.getItem('kurda_tokens_v1')).not.toBeNull();
    expect(await screen.findByTestId('storage-cleared')).toBeTruthy();
    expect(await screen.findByText('1.2 MB')).toBeTruthy();
  });
});
