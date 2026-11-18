// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// A phone, so there is push to offer (the web build has none).
vi.mock('react-native', async () => {
  // react-native-web ships no types.
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
const NEVER_ASKED = { status: 'undetermined', granted: false, canAskAgain: true } as const;
const REFUSED_FOR_GOOD = { status: 'denied', granted: false, canAskAgain: false } as const;

beforeEach(() => {
  // Turned down, on a phone that will not ask again: the one case the banner is for.
  notificationsStub.permission = { ...REFUSED_FOR_GOOD };
  notificationsStub.afterRequest = { status: 'granted', granted: true, canAskAgain: true };
  notificationsStub.requests = 0;
  notificationsStub.failRequest = false;
  notificationsStub.prompt = null;
  openSettings.mockClear();
  testAuth.client = fakeClient({ 'GET /me': ok({ user: { minor: false } }) });
});
afterEach(() => cleanup());

/** Let the checks (permission, the record, the account's age) come back. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe('the reminder banner on Learn', () => {
  it('says what reminders are for once the phone will not ask again, and opens the phone’s settings, then goes', async () => {
    const store = memoryStore();
    const { container } = renderWithProviders(<ReminderNudge hold={false} store={store} />);
    expect(await screen.findByText(LINE)).toBeTruthy();
    await settle();
    // Seen once, out of the same budget as the screen after a lesson.
    expect(JSON.parse(store.data.get(OFFER_KEY)!).shown).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open phone settings' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(notificationsStub.requests).toBe(0);
    expect(container.textContent).toBe('');
  });

  it('never stands in front of the phone’s own question: nothing while the phone could still ask', async () => {
    // Never asked, and Android after one refusal, which would show its prompt again.
    for (const permission of [NEVER_ASKED, { status: 'denied', granted: false, canAskAgain: true } as const]) {
      notificationsStub.permission = { ...permission };
      const store = memoryStore();
      const { container } = renderWithProviders(<ReminderNudge hold={false} store={store} />);
      await settle();
      expect(container.textContent, permission.status).toBe('');
      // Not shown, so not counted, and nothing asked of the phone.
      expect(store.data.has(OFFER_KEY)).toBe(false);
      expect(notificationsStub.requests).toBe(0);
      cleanup();
    }
  });

  it('has two things to press, the phone’s settings and its cross, and neither of them asks the phone anything', async () => {
    renderWithProviders(<ReminderNudge hold={false} store={memoryStore()} />);
    await screen.findByText(LINE);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Open phone settings', 'Close']);
    // "Allow" and "Turn on" belonged to a banner that led to the phone's question.
    expect(screen.queryByRole('button', { name: /allow|turn on/i })).toBeNull();
    expect(notificationsStub.requests).toBe(0);
  });

  it('closes on its cross without asking anything', async () => {
    const { container } = renderWithProviders(<ReminderNudge hold={false} store={memoryStore()} />);
    await screen.findByText(LINE);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(container.textContent).toBe('');
    expect(notificationsStub.requests).toBe(0);
    expect(openSettings).not.toHaveBeenCalled();
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

  it('is never shown to a minor, to a guest, once reminders are on, or past its budget', async () => {
    testAuth.client = fakeClient({ 'GET /me': ok({ user: { minor: true } }) });
    renderWithProviders(<ReminderNudge hold={false} store={memoryStore()} />);
    await settle();
    expect(screen.queryByText(LINE)).toBeNull();
    cleanup();

    // A guest has no birth month, so the server does not call one a minor; nothing is sent to guests either.
    testAuth.client = fakeClient({ 'GET /me': ok({ user: { minor: false, guest: true } }) });
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

    notificationsStub.permission = { ...REFUSED_FOR_GOOD };
    const spent = memoryStore({ [OFFER_KEY]: JSON.stringify({ shown: 1, lastShownAt: new Date().toISOString() }) });
    renderWithProviders(<ReminderNudge hold={false} store={spent} />);
    await settle();
    expect(screen.queryByText(LINE)).toBeNull();
  });
});
