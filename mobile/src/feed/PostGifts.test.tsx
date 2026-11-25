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
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { PostGifts } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { FeedCard } from './FeedCard';
import { PostGiftsRow } from './PostGifts';
import type { FeedItem } from './types';

/* A post's gifts: the small row with who gave them, the list behind it, and the gift button beside like and share. */

patchReactNativeWeb({ reduceMotion: true });
const me = testAuth.user;
beforeEach(() => {
  testAuth.user = { ...me, id: 'me', guest: false };
});
afterEach(() => {
  cleanup();
  testAuth.user = me;
});

const HAMO = { userId: 'u-hamo', username: 'hamo', displayName: 'Hamo', avatarUrl: null };

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
  author: { id: 'u-rojda', username: 'rojda', displayName: 'Rojda', avatarUrl: null },
  commentCount: 0,
  engagement: { liked: false, likes: 0, reposted: false, reposts: 0, bookmarked: false, bookmarks: 0 },
  ...over,
});

const gifts = (over: Partial<PostGifts> = {}): PostGifts => ({
  count: 5,
  items: [
    { sku: 'sticker-lale', name: 'Lale', assetUrl: '/cosmetics/icons/made-05-lale.png', count: 3 },
    { sku: 'sticker-roj', name: 'Roj', assetUrl: '/cosmetics/icons/made-02-roj.png', count: 2 },
  ],
  senders: 4,
  from: HAMO,
  ...over,
});

describe('the gifts on a post', () => {
  it('shows nothing until a post has a gift', () => {
    renderWithProviders(<PostGiftsRow item={item()} gifts={gifts({ count: 0, items: [], senders: 0, from: null })} />);
    expect(screen.queryByTestId('post-gifts')).toBeNull();
  });

  it('says how many and who gave them, and lists every giver on a tap', async () => {
    testAuth.client = fakeClient({
      'GET /gifts/posts/library/p1': ok({
        gifts: gifts(),
        senders: [
          { from: HAMO, sku: 'sticker-lale', itemName: 'Lale', assetUrl: null, at: '2026-11-20T10:00:00Z' },
          { from: null, sku: 'sticker-roj', itemName: 'Roj', assetUrl: null, at: '2026-11-19T10:00:00Z' },
        ],
      }),
    });
    renderWithProviders(<PostGiftsRow item={item()} gifts={gifts()} />);
    expect(screen.getByText('Gifts from Hamo and 3 others')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gifts from Hamo and 3 others, Gifts: 5' }));
    expect(await screen.findByText('Gifts on this post')).toBeTruthy();
    expect(await screen.findByText('Gift from Hamo')).toBeTruthy();
    // A giver this reader may not see is never named.
    expect(screen.getByText('Gift from a Hevalo member')).toBeTruthy();
  });

  it('names one giver of several gifts, and one other', () => {
    const { rerender } = renderWithProviders(<PostGiftsRow item={item()} gifts={gifts({ count: 2, senders: 1 })} />);
    expect(screen.getByText('Gifts from Hamo')).toBeTruthy();
    rerender(<PostGiftsRow item={item()} gifts={gifts({ count: 1, senders: 1, items: gifts().items.slice(0, 1) })} />);
    expect(screen.getByText('Gift from Hamo')).toBeTruthy();
    rerender(<PostGiftsRow item={item()} gifts={gifts({ count: 2, senders: 2 })} />);
    expect(screen.getByText('Gifts from Hamo and one other')).toBeTruthy();
  });

  it('says a Hevalo member when the latest giver may not be named here', () => {
    renderWithProviders(<PostGiftsRow item={item()} gifts={gifts({ count: 1, senders: 1, from: null })} />);
    expect(screen.getByText('Gift from a Hevalo member')).toBeTruthy();
  });
});

describe('the gift button on a post', () => {
  it('sits beside like, comments and share on someone else’s post, and opens the gift sheet for it', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?post=library%3Ap1': ok({ items: [], balance: { zer: 0 }, freeGifts: 0, hold: null }) });
    renderWithProviders(<FeedCard item={item({ gifts: gifts() })} />);
    expect(screen.getByRole('button', { name: 'Share this post' })).toBeTruthy();
    expect(screen.getByTestId('post-gifts')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Give a gift' }));
    expect(await screen.findByText('A gift on Rojda’s post')).toBeTruthy();
  });

  it('is not there on your own post, for a guest, or on a post still being checked', () => {
    const { rerender } = renderWithProviders(<FeedCard item={item({ author: { id: 'me', username: 'rojda', displayName: null, avatarUrl: null } })} />);
    expect(screen.queryByRole('button', { name: 'Give a gift' })).toBeNull();
    rerender(<FeedCard item={item({ review: 'held' })} />);
    expect(screen.queryByRole('button', { name: 'Give a gift' })).toBeNull();
    testAuth.user = { ...me, id: 'guest-1', guest: true };
    rerender(<FeedCard item={item({ id: 'p2', key: 'library:p2' })} />);
    expect(screen.queryByRole('button', { name: 'Give a gift' })).toBeNull();
  });
});
