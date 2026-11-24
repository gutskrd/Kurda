// @vitest-environment jsdom
/** Settings → Storage and data: a copy of your data asked for, prepared while the page watches, then saved from a fresh link. */
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Linking } from 'react-native';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { SettingsPageScreen } from '../settings/SettingsPageScreen';
import { POLL_FAST_MS, exportFileName } from '../settings/dataExport';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const READY = {
  status: 'ready',
  downloadUrl: 'https://files.test/export.json?sig=fresh',
  requestedAt: '2026-11-16T23:58:00.000Z',
  completedAt: '2026-11-17T10:00:00.000Z',
};
const storage = () => renderWithProviders(<SettingsPageScreen page="storage" onExit={() => undefined} />);

describe('a copy of your data', () => {
  it('asks for one when none was asked for, and says it is being prepared, on the page rather than in an alert', async () => {
    let asked = false;
    testAuth.client = fakeClient({
      'GET /me/export': () => ok(asked ? { status: 'pending', requestedAt: READY.requestedAt } : { status: 'none' }),
      'POST /me/export': () => {
        asked = true;
        return ok({ requested: true });
      },
    });
    storage();
    const row = await screen.findByRole('button', { name: 'Download your data' });
    await act(async () => {
      fireEvent.click(row);
    });
    expect(asked).toBe(true);
    expect(await screen.findByTestId('export-pending')).toBeTruthy();
    expect(screen.getAllByText('Preparing your copy…').length).toBeGreaterThan(0);
  });

  it('keeps asking while it is prepared, and offers the download the moment it is ready', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    let reads = 0;
    testAuth.client = fakeClient({
      'GET /me/export': () => {
        reads += 1;
        return ok(reads < 2 ? { status: 'pending', requestedAt: READY.requestedAt } : READY);
      },
    });
    storage();
    await screen.findByTestId('export-pending');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_FAST_MS + 10);
    });
    expect(await screen.findByTestId('export-download')).toBeTruthy();
    expect(screen.getByText(/^Made on Tuesday/)).toBeTruthy();
  });

  it('once it is ready, downloads it with a fresh link', async () => {
    testAuth.client = fakeClient({ 'GET /me/export': ok(READY) });
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    storage();
    const download = await screen.findByTestId('export-download');
    await act(async () => {
      fireEvent.click(download);
    });
    expect(open).toHaveBeenCalledWith(READY.downloadUrl);
  });

  it('says so in the page’s own error line when the download does not open', async () => {
    testAuth.client = fakeClient({ 'GET /me/export': ok(READY) });
    vi.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));
    storage();
    const download = await screen.findByTestId('export-download');
    await act(async () => {
      fireEvent.click(download);
    });
    expect((await screen.findByTestId('export-failed')).textContent).toBe('Couldn’t download your copy. Check your connection and try again.');
  });

  it('can make a newer copy, and says when today’s is the one there is', async () => {
    const client = fakeClient({ 'GET /me/export': ok(READY), 'POST /me/export': ok({ requested: true, reused: true }) });
    testAuth.client = client;
    storage();
    const again = await screen.findByTestId('export-again');
    await act(async () => {
      fireEvent.click(again);
    });
    expect(client.calls.some((c) => c.method === 'POST' && c.path === '/me/export')).toBe(true);
    expect(await screen.findByText('You already made a copy today, so that one is kept. You can make a new one tomorrow.')).toBeTruthy();
  });

  it('names the file by the day the copy was asked for, as the server does', () => {
    expect(exportFileName('2026-11-17T10:00:00.000Z')).toBe('hevalo-data-2026-11-17.json');
    expect(exportFileName(undefined, new Date('2026-11-24T08:00:00Z'))).toBe('hevalo-data-2026-11-24.json');
  });
});
