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
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { UnreadProvider } from '../messages/unread';
import { onPostDeleted, postDeleted, type DeletedPost } from '../composer/postDeleted';
import { FeedCard } from './FeedCard';
import { CivakScreen } from './CivakScreen';
import type { FeedItem } from './types';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => {
  navigation.navigate.mockReset();
  testAuth.user = { ...testAuth.user, id: 'me' };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  key: 'library:p1',
  id: 'p1',
  targetType: 'library',
  kind: 'poem',
  title: 'Şev',
  excerpt: 'Şev e…',
  imageUrl: null,
  href: '/library/p1',
  viewCount: 0,
  at: '2026-10-19T10:00:00Z',
  author: { id: 'me', username: 'rojda', displayName: null, avatarUrl: null },
  commentCount: 0,
  engagement: { liked: false, likes: 0, reposted: false, reposts: 0, bookmarked: false, bookmarks: 0 },
  ...over,
});

/** Hold the card down for longer than a tap, as a finger would. */
async function longPress(card: HTMLElement) {
  fireEvent.mouseDown(card, { button: 0, buttons: 1 });
  await act(() => new Promise((r) => setTimeout(r, 600)));
  fireEvent.mouseUp(card, { button: 0 });
}

describe('your own post on the wall', () => {
  it('opens Edit and Delete on a long press, without opening the post', async () => {
    renderWithProviders(<FeedCard item={item()} />);
    await longPress(screen.getByRole('button', { name: 'Poem: Şev' }));
    expect(screen.getByRole('button', { name: 'Edit post' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete post' })).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalledWith('LibraryPost', { postId: 'p1' });
  });

  it('deletes a picture with the website’s call, once confirmed, and tells the lists', async () => {
    const heard: DeletedPost[] = [];
    const stop = onPostDeleted((p) => heard.push(p));
    const client = fakeClient({ 'DELETE /images/i1': ok({ ok: true }) });
    testAuth.client = client;
    renderWithProviders(<FeedCard item={item({ key: 'image:i1', id: 'i1', targetType: 'image', kind: 'meme', title: null })} />);
    await longPress(screen.getByRole('button', { name: /^Meme/ }));
    // a picture's caption is not edited on the phone
    expect(screen.queryByRole('button', { name: 'Edit post' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    expect(screen.getByText('This can’t be undone.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(heard).toEqual([{ targetType: 'image', id: 'i1' }]));
    expect(client.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /images/i1']);
    stop();
  });

  it('offers nothing on somebody else’s', async () => {
    renderWithProviders(<FeedCard item={item({ author: { id: 'u-azad', username: 'azad', displayName: null, avatarUrl: null } })} />);
    await longPress(screen.getByRole('button', { name: 'Poem: Şev' }));
    expect(screen.queryByRole('button', { name: 'Delete post' })).toBeNull();
  });
});

describe('the wall', () => {
  it('drops a deleted post at once, and every repost of it', async () => {
    testAuth.client = fakeClient({
      'GET /feed?section=all&limit=20&offset=0': ok({
        items: [item(), item({ key: 'repost:u2:library:p1' }), item({ key: 'library:p2', id: 'p2', title: 'Roj' })],
      }),
      'GET /chat/conversations': ok({ conversations: [] }),
      'GET /me/groups/unread': ok({ unread: [] }),
      'GET /friends/requests': ok({ requests: [] }),
      'GET /me/notifications/unread-count': ok({ count: 0 }),
      'GET /me/social': ok({ unread: { gifts: 0 } }),
    });
    renderWithProviders(
      <UnreadProvider>
        <CivakScreen />
      </UnreadProvider>,
    );
    expect(await screen.findAllByRole('button', { name: 'Poem: Şev' })).toHaveLength(2);
    act(() => postDeleted({ targetType: 'library', id: 'p1' }));
    expect(screen.queryByRole('button', { name: 'Poem: Şev' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Poem: Roj' })).toBeTruthy();
  });
});
