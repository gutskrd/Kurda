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
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation, refocus } from '../play/testing/navigation';
import { UnreadProvider } from '../messages/unread';
import { CivakScreen, mergeFresh } from './CivakScreen';
import type { FeedItem } from './types';

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

  /*
   * Coming back to Home — from a post, a profile, another tab — used to empty
   * the wall and ask for it again, so the reader was back at the top of a grey
   * page every time. The posts stay; the read is quiet.
   */
  it('keeps the posts on the screen when it is come back to, and brings them up to date quietly', async () => {
    const liked = { ...post('a'), engagement: { ...post('a').engagement, liked: true, likes: 3 } };
    let reads = 0;
    const client = open({
      extra: {
        // the first read, then what a later one finds: a like on the post shown, and a post that is new
        'GET /feed?section=all&limit=20&offset=0': (() => ok({ items: reads++ === 0 ? [post('a')] : [post('n'), liked] })) as never,
      },
    });
    expect(await screen.findByText('Post a')).toBeTruthy();
    act(() => refocus());
    // no skeleton, and the post never leaves the screen while the wall is asked for again
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(screen.getByText('Post a')).toBeTruthy();
    await waitFor(() => expect(client.calls.filter((c) => c.path === '/feed?section=all&limit=20&offset=0')).toHaveLength(2));
    // the wall was at its top, so the new post is on it, and the one shown has its new count
    expect(await screen.findByText('Post n')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unlike (3)' })).toBeTruthy();
  });

  it('says nothing when a quiet read fails: what was shown stays', async () => {
    let reads = 0;
    open({
      extra: {
        'GET /feed?section=all&limit=20&offset=0': (() => (reads++ === 0 ? ok({ items: [post('a')] }) : fail({ kind: 'network', message: 'offline' }))) as never,
      },
    });
    expect(await screen.findByText('Post a')).toBeTruthy();
    act(() => refocus());
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByText('Post a')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('goes back to its skeleton only for another way of reading the wall', async () => {
    let answer: (() => void) | null = null;
    open({
      items: [post('a')],
      extra: {
        'GET /feed?section=dimen&kind=mim&limit=20&offset=0': (() => new Promise((resolve) => (answer = () => resolve(ok({ items: [post('m1')] }))))) as never,
      },
    });
    expect(await screen.findByText('Post a')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Meme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show posts' }));
    // the posts of the wall before say nothing about this one: grey until it answers
    await waitFor(() => expect(screen.queryByText('Post a')).toBeNull());
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    await act(async () => answer?.());
    expect(await screen.findByText('Post m1')).toBeTruthy();
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

describe('mergeFresh', () => {
  const item = (id: string, likes = 0) => ({ ...post(id), engagement: { ...post(id).engagement, likes } }) as unknown as FeedItem;

  it('gives each post shown what the read says of it, in its place, and drops none', () => {
    const merged = mergeFresh([item('a'), item('b'), item('c')], [item('b', 4)], true);
    expect(merged.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(merged.items[1]!.engagement.likes).toBe(4);
  });

  it('puts new posts on top while the wall is at its top, and holds them back while it is not', () => {
    const top = mergeFresh([item('a')], [item('n1'), item('n2'), item('a')], true);
    expect(top.items.map((i) => i.id)).toEqual(['n1', 'n2', 'a']);
    expect(top.waiting).toEqual([]);
    const down = mergeFresh([item('a')], [item('n1'), item('n2'), item('a')], false);
    expect(down.items.map((i) => i.id)).toEqual(['a']);
    expect(down.waiting.map((i) => i.id)).toEqual(['n1', 'n2']);
  });
});
