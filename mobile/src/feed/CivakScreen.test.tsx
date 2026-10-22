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
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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

/** One post on the wall, by the letter a test reads it as. */
const post = (id: string) => ({
  key: `library:${id}`,
  targetType: 'library',
  id,
  kind: 'poem',
  title: `Post ${id}`,
  excerpt: 'Şev e…',
  imageUrl: null,
  images: [],
  href: `/library/${id}`,
  viewCount: 0,
  at: '2026-10-19T10:00:00Z',
  author: { id: 'u1', username: 'rojda', displayName: null, avatarUrl: null },
  commentCount: 0,
  engagement: { liked: false, likes: 0, reposted: false, reposts: 0, bookmarked: false, bookmarks: 0 },
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

  it('narrows the wall from the sort and filter sheet, only on Show posts, and goes back to everything from the ✕', async () => {
    const client = open({ extra: { 'GET /feed?section=dimen&kind=mim&limit=20&offset=0': ok({ items: [post('m1')] }) } });
    // no row of choices on the wall itself
    expect(screen.queryByRole('button', { name: 'Writing' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Sort and filter' }));
    const show = screen.getByRole('radiogroup', { name: 'Show' });
    expect(show.querySelector('[aria-checked="true"]')?.textContent).toBe('Everything');
    fireEvent.click(screen.getByRole('radio', { name: 'Meme' }));
    // a choice is a draft until it is shown: nothing is asked for yet
    expect(client.calls.some((c) => c.path.includes('kind=mim'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Show posts' }));
    await waitFor(() => expect(client.calls.some((c) => c.path === '/feed?section=dimen&kind=mim&limit=20&offset=0')).toBe(true));
    // the button says what is on, and a chip under the faces says what is shown
    expect(screen.getByRole('button', { name: 'Sort and filter — Pictures · Meme' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pictures · Meme' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sort and filter' })).toBeTruthy());
    expect(screen.queryByText('Pictures · Meme')).toBeNull();
  });

  it('sorts by the most popular this week, says so in a chip, and goes back to the newest from its ✕', async () => {
    const client = open({ items: [post('a')], extra: { 'GET /feed?section=all&sort=popular&period=week&limit=20&offset=0': ok({ items: [post('b')] }) } });
    fireEvent.click(await screen.findByRole('button', { name: 'Sort and filter' }));
    // a range is only offered for an order that ranks
    expect(screen.queryByRole('radiogroup', { name: 'From' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Most popular, Hearts, reposts and comments' }));
    fireEvent.click(screen.getByRole('radio', { name: 'This week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show posts' }));
    expect(await screen.findByText('Post b')).toBeTruthy();
    expect(client.calls.some((c) => c.path === '/feed?section=all&sort=popular&period=week&limit=20&offset=0')).toBe(true);
    expect(screen.getByRole('button', { name: 'Sort and filter — Most popular, This week' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Most popular · This week' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to newest' }));
    expect(await screen.findByText('Post a')).toBeTruthy();
    expect(screen.queryByText('Most popular · This week')).toBeNull();
  });

  it('leaves the wall as it was when the sheet is closed another way, and Reset puts the choices back', async () => {
    const client = open({ items: [post('a')] });
    fireEvent.click(await screen.findByRole('button', { name: 'Sort and filter' }));
    const disabled = () => screen.getByRole('button', { name: 'Reset' }).getAttribute('aria-disabled') === 'true';
    expect(disabled()).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Oldest' }));
    expect(disabled()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('radiogroup', { name: 'Sort by' }).querySelector('[aria-checked="true"]')?.textContent).toContain('Newest');
    fireEvent.click(screen.getByRole('radio', { name: 'Oldest' }));
    fireEvent.click(within(screen.getByTestId('feed-filter-sheet')).getByRole('button', { name: 'Close' }));
    // closed without Show posts: the wall was not asked for again, and opening the sheet again starts from it
    expect(client.calls.some((c) => c.path.includes('sort='))).toBe(false);
    expect(screen.getByRole('button', { name: 'Sort and filter' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    await waitFor(() =>
      expect(screen.getByRole('radiogroup', { name: 'Sort by' }).querySelector('[aria-checked="true"]')?.textContent).toContain('Newest'),
    );
  });
});
