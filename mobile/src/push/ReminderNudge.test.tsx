// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// a phone, so there is push to offer (the web build has none)
vi.mock('react-native', async () => {
  // react-native-web ships no types
  const rn = (await import('../play/testing/native')) as unknown as Record<string, object> & { Platform: object };
  return { ...rn, Platform: { ...rn.Platform, OS: 'ios' } };
});
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { notificationsStub } from '../reports/testing/stubs';
import { memoryStore } from '../keyboard/deviceStore';
import { OFFER_KEY } from './permission';
import { ReminderNudge } from './ReminderNudge';

patchReactNativeWeb();

const LINE = 'Turn on reminders to keep your streak safe';
const openSettings = vi.fn(async () => undefined);
(Linking as unknown as { openSettings: typeof openSettings }).openSettings = openSettings;

beforeEach(() => {
  notificationsStub.permission = { status: 'undetermined', granted: false, canAskAgain: true };
  notificationsStub.afterRequest = { status: 'granted', granted: true, canAskAgain: true };
  notificationsStub.requests = 0;
  openSettings.mockClear();
  testAuth.client = fakeClient({ 'GET /me': ok({ user: { minor: false } }) });
});
afterEach(() => cleanup());

/** Let the checks (permission, the record, the account's age) come back. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe('the reminder banner on Learn', () => {
  it('says what reminders are for and asks the phone only when Turn on is tapped', async () => {
    const store = memoryStore();
    renderWithProviders(<ReminderNudge hold={false} store={store} />);
    expect(await screen.findByText(LINE)).toBeTruthy();
    expect(notificationsStub.requests).toBe(0);
    await settle();
    // seen once, out of the same budget as the card after a lesson
    expect(JSON.parse(store.data.get(OFFER_KEY)!).shown).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText('Notifications are on')).toBeTruthy();
    expect(notificationsStub.requests).toBe(1);
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it('opens the phone settings when reminders were turned down, and goes', async () => {
    notificationsStub.permission = { status: 'denied', granted: false, canAskAgain: false };
    const { container } = renderWithProviders(<ReminderNudge hold={false} store={memoryStore()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open phone settings' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(notificationsStub.requests).toBe(0);
    expect(container.textContent).toBe('');
  });

  it('closes on its cross without asking anything', async () => {
    const { container } = renderWithProviders(<ReminderNudge hold={false} store={memoryStore()} />);
    await screen.findByText(LINE);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(container.textContent).toBe('');
    expect(notificationsStub.requests).toBe(0);
  });

  it('waits while another moment has the visit, and is not counted until it shows', async () => {
    const store = memoryStore();
    const { rerender } = renderWithProviders(<ReminderNudge hold store={store} />);
    await settle();
    expect(screen.queryByText(LINE)).toBeNull();
    expect(store.data.has(OFFER_KEY)).toBe(false);
    rerender(<ReminderNudge hold={false} store={store} />);
    expect(await screen.findByText(LINE)).toBeTruthy();
  });

  it('is never shown to a minor, once reminders are on, or past its budget', async () => {
    testAuth.client = fakeClient({ 'GET /me': ok({ user: { minor: true } }) });
    renderWithProviders(<ReminderNudge hold={false} store={memoryStore()} />);
    await settle();
    expect(screen.queryByText(LINE)).toBeNull();
    cleanup();

    testAuth.client = fakeClient({ 'GET /me': ok({ user: { minor: false } }) });
    notificationsStub.permission = { status: 'granted', granted: true, canAskAgain: true };
    renderWithProviders(<ReminderNudge hold={false} store={memoryStore()} />);
    await settle();
    expect(screen.queryByText(LINE)).toBeNull();
    cleanup();

    notificationsStub.permission = { status: 'undetermined', granted: false, canAskAgain: true };
    const spent = memoryStore({ [OFFER_KEY]: JSON.stringify({ shown: 1, lastShownAt: new Date().toISOString() }) });
    renderWithProviders(<ReminderNudge hold={false} store={spent} />);
    await settle();
    expect(screen.queryByText(LINE)).toBeNull();
  });
});
