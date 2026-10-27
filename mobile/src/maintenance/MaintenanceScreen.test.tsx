// @vitest-environment jsdom
/**
 * The screen over the app while Hevalo is offline: the admin's words and
 * picture, or the app's own in the reader's language; when Hevalo is expected
 * back, only when that was said; and `GET /status` asked every half minute, at
 * once on "Try again" and on coming back to the front, until it says Hevalo
 * is open — when the screen goes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { AppState } from 'react-native';
import { MAINTENANCE_POLL_SECONDS, type MaintenanceNotice } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { TRANSLATIONS } from '../i18n/translations';
import { currentMaintenance, endMaintenance, onMaintenanceOver, showMaintenance } from './maintenance';
import { MaintenanceScreen } from './MaintenanceScreen';

patchReactNativeWeb();

const POLL_MS = MAINTENANCE_POLL_SECONDS * 1000;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  endMaintenance();
});

const notice = (over: Partial<MaintenanceNotice> = {}): MaintenanceNotice => ({
  title: null,
  message: null,
  pictureUrl: null,
  since: '2026-10-27T09:00:00.000Z',
  backBy: null,
  ...over,
});

/** The picture in the frame, once it has started loading. */
async function picture(container: HTMLElement): Promise<string | null | undefined> {
  await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
  return container.querySelector('img')?.getAttribute('src');
}

/** Hand over the app's state changes, so a test can send it to the back and bring it to the front. */
function appState(): (state: string) => void {
  const listeners: Array<(state: string) => void> = [];
  vi.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, cb: (state: string) => void) => {
    listeners.push(cb);
    return { remove: () => undefined };
  }) as unknown as typeof AppState.addEventListener);
  return (state) => act(() => listeners.forEach((cb) => cb(state)));
}

const statusCalls = (client: ReturnType<typeof fakeClient>): number => client.calls.filter((c) => c.path === '/status').length;

describe('MaintenanceScreen', () => {
  it('is not there while Hevalo is open', () => {
    renderWithProviders(<MaintenanceScreen />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows what the admin wrote, line breaks and all, with their picture', async () => {
    testAuth.client = fakeClient();
    showMaintenance(notice({ title: 'Back after lunch', message: 'New lessons are going in.\nSee you soon!', pictureUrl: 'https://media.hevalo.app/maintenance/fields.jpg' }));
    const { container } = renderWithProviders(<MaintenanceScreen />);
    expect(screen.getByRole('alert').textContent).toBe('Back after lunch');
    expect(screen.getByText(/New lessons are going in/).textContent).toBe('New lessons are going in.\nSee you soon!');
    expect(await picture(container)).toBe('https://media.hevalo.app/maintenance/fields.jpg');
    expect(screen.queryByText(TRANSLATIONS.en['maintenance.title'])).toBeNull();
  });

  it('says it in the app’s own words, with the deer, where the admin left the fields empty', async () => {
    testAuth.client = fakeClient();
    showMaintenance(notice());
    const { container } = renderWithProviders(<MaintenanceScreen />);
    expect(screen.getByRole('alert').textContent).toBe('Hevalo is taking a short break');
    expect(screen.getByText('We’re working on Hevalo and will be back soon. Your progress, streak and Zêr are safe.')).toBeTruthy();
    expect(await picture(container)).toMatch(/mascot-deer/);
    expect(screen.getByText(`We check again every ${MAINTENANCE_POLL_SECONDS} seconds.`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('says when Hevalo is expected back only when that was said', () => {
    testAuth.client = fakeClient();
    showMaintenance(notice({ backBy: new Date(Date.now() + 2 * 3_600_000).toISOString() }));
    const { unmount } = renderWithProviders(<MaintenanceScreen />);
    expect(screen.getByText(/^Back by /)).toBeTruthy();
    unmount();

    endMaintenance();
    showMaintenance(notice());
    renderWithProviders(<MaintenanceScreen />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/^Back by /)).toBeNull();
  });

  it('asks every half minute, and goes when Hevalo is open again', async () => {
    vi.useFakeTimers();
    const answers = [{ maintenance: notice({ title: 'Nearly there' }) }, { maintenance: null }];
    const client = fakeClient({ 'GET /status': () => ok(answers.shift()) });
    testAuth.client = client;
    const over = vi.fn();
    const stop = onMaintenanceOver(over);
    showMaintenance(notice());
    renderWithProviders(<MaintenanceScreen />);
    expect(statusCalls(client)).toBe(0);

    // still offline, with the admin's newer words
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(statusCalls(client)).toBe(1);
    expect(screen.getByRole('alert').textContent).toBe('Nearly there');

    // open: the screen goes, and what was waiting on it hears so
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(statusCalls(client)).toBe(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(currentMaintenance()).toBeNull();
    expect(over).toHaveBeenCalledTimes(1);

    // and nothing asks any more
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * POLL_MS);
    });
    expect(statusCalls(client)).toBe(2);
    stop();
  });

  it('asks at once on “Try again”, and keeps the screen while the answer is still no', async () => {
    const client = fakeClient({ 'GET /status': ok({ maintenance: notice() }) });
    testAuth.client = client;
    showMaintenance(notice());
    renderWithProviders(<MaintenanceScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(statusCalls(client)).toBe(1));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('keeps the screen when the question gets no answer', async () => {
    const client = fakeClient({ 'GET /status': { ok: false, error: { kind: 'network', message: 'network request failed' } } });
    testAuth.client = client;
    showMaintenance(notice());
    renderWithProviders(<MaintenanceScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(statusCalls(client)).toBe(1));
    expect(currentMaintenance()).not.toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('asks nothing while the app is in the background, and asks at once when it comes back', async () => {
    vi.useFakeTimers();
    const sendTo = appState();
    const client = fakeClient({ 'GET /status': ok({ maintenance: notice() }) });
    testAuth.client = client;
    showMaintenance(notice());
    renderWithProviders(<MaintenanceScreen />);

    sendTo('background');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * POLL_MS);
    });
    expect(statusCalls(client)).toBe(0);

    sendTo('active');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusCalls(client)).toBe(1);
    // and every half minute from then on
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(statusCalls(client)).toBe(2);
  });
});
