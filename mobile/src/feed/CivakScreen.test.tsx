// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { UnreadProvider } from '../messages/unread';
import { CivakScreen } from './CivakScreen';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function open({ unread = 0, items = [] as unknown[], extra = {} as Record<string, ReturnType<typeof ok>> } = {}) {
  const client = fakeClient({
    'GET /feed?section=all&limit=20&offset=0': ok({ items }),
    ...extra,
    'GET /chat/conversations': ok({ conversations: [] }),
    'GET /me/groups/unread': ok({ unread: [] }),
    'GET /friends/requests': ok({ requests: [] }),
    'GET /me/notifications/unread-count': ok({ count: unread }),
    'GET /me/social': ok({ unread: { gifts: 0 } }),
  });
  testAuth.client = client;
  renderWithProviders(
    <UnreadProvider>
      <CivakScreen />
    </UnreadProvider>,
  );
  return client;
}

describe('Home', () => {
  /*
   * Notifications moved out of the old Inbox to a bell on Home. A dot rather
   * than a number, and the number in words for a screen reader.
   */
  it('has a bell with a dot while notifications are unread, which opens them', async () => {
    open({ unread: 2 });
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    expect(screen.getByTestId('home-bell-dot')).toBeTruthy();
    fireEvent.click(bell);
    expect(navigation.navigate).toHaveBeenCalledWith('NotificationCenter');
  });

  it('has no dot on the bell when everything is read', async () => {
    open({ unread: 0 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy());
    expect(screen.queryByTestId('home-bell-dot')).toBeNull();
  });

  it('posts from the "+" at the start of its header', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Post something' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Compose');
  });

  /*
   * A new reader's wall is empty because they follow nobody and have written
   * nothing: it offers both, finding people first.
   */
  it('greets a new reader with two next steps: find people, or write something', async () => {
    open({ items: [] });
    expect(await screen.findByText('Welcome to Hevalo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Find people to follow' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Search');
    fireEvent.click(screen.getByRole('button', { name: 'Write your first post' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Compose');
  });

  it('narrows the wall from one filter button, says what it shows, and goes back to everything from the ✕', async () => {
    const client = open({ extra: { 'GET /feed?section=dimen&kind=mim&limit=20&offset=0': ok({ items: [] }) } });
    // no row of choices on the wall itself
    expect(screen.queryByRole('button', { name: 'Writing' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Filter posts' }));
    const options = screen.getByRole('radiogroup', { name: 'Show' });
    expect(options.querySelector('[aria-checked="true"]')?.textContent).toBe('Everything');
    fireEvent.click(screen.getByRole('radio', { name: 'Meme' }));
    await waitFor(() => expect(client.calls.some((c) => c.path === '/feed?section=dimen&kind=mim&limit=20&offset=0')).toBe(true));
    // the button says it is on, and a chip under the faces says what is shown
    expect(screen.getByRole('button', { name: 'Filter posts — showing Pictures · Meme' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pictures · Meme' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filter posts' })).toBeTruthy());
    expect(screen.queryByText('Pictures · Meme')).toBeNull();
  });
});
