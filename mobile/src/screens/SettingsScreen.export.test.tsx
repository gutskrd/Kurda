// @vitest-environment jsdom
/** The data export row: requested, shown as preparing, then downloadable with a fresh link or prepared again. */
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Alert, Linking } from 'react-native';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { SettingsScreen } from './SettingsScreen';

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
});

const READY = { status: 'ready', downloadUrl: 'https://files.test/export.json?sig=fresh', requestedAt: '2026-11-17T10:00:00.000Z' };

describe('a copy of your data', () => {
  it('asks for one when none was asked for, and says it is being prepared', async () => {
    let asked = false;
    testAuth.client = fakeClient({
      'GET /me/export': () => ok(asked ? { status: 'pending' } : { status: 'none' }),
      'POST /me/export': () => {
        asked = true;
        return ok({ requested: true });
      },
    });
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    const row = await screen.findByRole('button', { name: /Request data export/ });
    await act(async () => {
      fireEvent.click(row);
    });
    expect(asked).toBe(true);
    expect(alert).toHaveBeenLastCalledWith('Your data', 'Export requested. Your copy is being prepared.');
    expect(await screen.findByText('Being prepared…')).toBeTruthy();
  });

  it('once it is ready, downloads it with a fresh link', async () => {
    testAuth.client = fakeClient({ 'GET /me/export': ok(READY) });
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.text === 'Download your data')?.onPress?.();
    });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    const row = await screen.findByRole('button', { name: /Download your data/ });
    await act(async () => {
      fireEvent.click(row);
    });
    expect(open).toHaveBeenCalledWith(READY.downloadUrl);
  });

  it('once it is ready, can prepare a newer one instead', async () => {
    const client = fakeClient({ 'GET /me/export': ok(READY), 'POST /me/export': ok({ requested: true }) });
    testAuth.client = client;
    vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.text === 'Prepare a new copy')?.onPress?.();
    });
    renderWithProviders(<SettingsScreen onExit={() => undefined} />);
    const row = await screen.findByRole('button', { name: /Download your data/ });
    await act(async () => {
      fireEvent.click(row);
    });
    expect(client.calls.some((c) => c.method === 'POST' && c.path === '/me/export')).toBe(true);
  });
});
