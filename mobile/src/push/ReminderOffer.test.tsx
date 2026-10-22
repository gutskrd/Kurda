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
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { notificationsStub } from '../reports/testing/stubs';
import { memoryStore } from '../keyboard/deviceStore';
import { OFFER_KEY, REOFFER_AFTER_MS } from './permission';
import { ReminderOffer } from './ReminderOffer';

patchReactNativeWeb();

const TITLE = 'Want a gentle reminder to keep learning?';

/** What `/me` says of the account: the session from a fresh sign-in does not carry `minor`. */
function serveMe(user: { minor?: boolean }) {
  testAuth.client = fakeClient({ 'GET /me': ok({ user }) });
}

beforeEach(() => {
  notificationsStub.permission = { status: 'undetermined', granted: false, canAskAgain: true };
  notificationsStub.afterRequest = { status: 'granted', granted: true, canAskAgain: true };
  notificationsStub.requests = 0;
  serveMe({ minor: false });
});
afterEach(() => cleanup());

/** Let the checks (permission, the record, the account's age) come back. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe('the offer at the end of a lesson', () => {
  it('offers an adult who has never been asked, with Allow and Not now, and asks nothing by itself', async () => {
    const store = memoryStore();
    renderWithProviders(<ReminderOffer ready store={store} />);
    expect(await screen.findByText(TITLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(notificationsStub.requests).toBe(0);
    await settle();
    expect(JSON.parse(store.data.get(OFFER_KEY)!).shown).toBe(1);
  });

  it('shows the system prompt only on Allow, and says when notifications are on', async () => {
    renderWithProviders(<ReminderOffer ready store={memoryStore()} />);
    await settle();
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }));
    expect(await screen.findByText('Notifications are on')).toBeTruthy();
    expect(notificationsStub.requests).toBe(1);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('goes quietly when the system prompt is answered no', async () => {
    notificationsStub.afterRequest = { status: 'denied', granted: false, canAskAgain: false };
    const { container } = renderWithProviders(<ReminderOffer ready store={memoryStore()} />);
    await settle();
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }));
    await settle();
    expect(container.textContent).toBe('');
  });

  it('goes on Not now without showing any prompt, and is remembered', async () => {
    const store = memoryStore();
    const { container } = renderWithProviders(<ReminderOffer ready store={store} />);
    await settle();
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(container.textContent).toBe('');
    expect(notificationsStub.requests).toBe(0);
    cleanup();
    // the next lesson the same week: nothing
    renderWithProviders(<ReminderOffer ready store={store} />);
    await settle();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('comes back once a week later, and not a third time', async () => {
    const weekAgo = new Date(Date.now() - REOFFER_AFTER_MS).toISOString();
    renderWithProviders(<ReminderOffer ready store={memoryStore({ [OFFER_KEY]: JSON.stringify({ shown: 1, lastShownAt: weekAgo }) })} />);
    expect(await screen.findByText(TITLE)).toBeTruthy();
    cleanup();
    renderWithProviders(<ReminderOffer ready store={memoryStore({ [OFFER_KEY]: JSON.stringify({ shown: 2, lastShownAt: weekAgo }) })} />);
    await settle();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('waits for the celebration to finish before it appears, and is not counted until it does', async () => {
    const store = memoryStore();
    const { rerender } = renderWithProviders(<ReminderOffer ready={false} store={store} />);
    await settle();
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(store.data.has(OFFER_KEY)).toBe(false);
    rerender(<ReminderOffer ready store={store} />);
    expect(await screen.findByText(TITLE)).toBeTruthy();
  });

  it('is never offered to a minor, nor to an account whose age is not known', async () => {
    serveMe({ minor: true });
    renderWithProviders(<ReminderOffer ready store={memoryStore()} />);
    await settle();
    expect(screen.queryByText(TITLE)).toBeNull();
    cleanup();
    serveMe({});
    renderWithProviders(<ReminderOffer ready store={memoryStore()} />);
    await settle();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('is not offered once the phone has answered, either way', async () => {
    notificationsStub.permission = { status: 'granted', granted: true, canAskAgain: true };
    renderWithProviders(<ReminderOffer ready store={memoryStore()} />);
    await settle();
    expect(screen.queryByText(TITLE)).toBeNull();
    cleanup();
    notificationsStub.permission = { status: 'denied', granted: false, canAskAgain: false };
    renderWithProviders(<ReminderOffer ready store={memoryStore()} />);
    await settle();
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
