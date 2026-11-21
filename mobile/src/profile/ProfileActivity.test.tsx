// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { ActivityGrid, ActivityTabs, useProfileActivity } from './ProfileActivity';
import type { ProfileSections } from './sections';

/*
 * The five icon tabs over somebody's activity and the grid under them: the chosen tab marked as where you are, a
 * section hidden from others still there for its owner and said to be hidden, posts as tiles of their picture or
 * words, and games as their cover with the result.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  navigation.navigate.mockReset();
  localStorage.removeItem('kurda_locale_v1');
});

const empty = ok({ entries: [], items: [] });

const post = (id: string, extra: Record<string, unknown> = {}) => ({
  key: `library:${id}`,
  targetType: 'library',
  id,
  kind: 'story',
  author: { id: 'u1', username: 'rojda', displayName: null, avatarUrl: null },
  title: 'Çîroka min',
  excerpt: 'Rojekê Hevalo û Xezo ber bi gund ve çûn.',
  imageUrl: null,
  href: `/app/library/${id}`,
  viewCount: 0,
  commentCount: 0,
  engagement: { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false },
  at: '2026-09-01T10:00:00.000Z',
  ...extra,
});

function Activity({ sections, own }: { sections?: ProfileSections | null; own?: boolean }): React.JSX.Element {
  const activity = useProfileActivity({ userId: 'u1', sections, own });
  return (
    <>
      <ActivityTabs activity={activity} width={390} />
      <ActivityGrid activity={activity} width={390} />
    </>
  );
}

function open(props: { sections?: ProfileSections | null; own?: boolean } = {}, routes: Record<string, unknown> = {}) {
  testAuth.client = fakeClient({
    'GET /users/u1/activity?kind=posts&limit=12': empty,
    'GET /users/u1/activity?kind=likes&limit=12': empty,
    'GET /users/u1/activity?kind=saved&limit=12': empty,
    ...routes,
  });
  renderWithProviders(<Activity {...props} />);
}

describe('the activity tabs', () => {
  it('marks the chosen section as the one you are in, and loads another when it is tapped', async () => {
    open({ own: true });
    await act(async () => undefined);
    expect(screen.getByRole('tab', { name: 'Posts' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Likes' }));
    await act(async () => undefined);
    expect(screen.getByRole('tab', { name: 'Likes' }).getAttribute('aria-selected')).toBe('true');
    expect(testAuth.client.get).toHaveBeenCalledWith('/users/u1/activity?kind=likes&limit=12');
  });

  it('shows five icons, each named for a screen reader, with no words on screen', async () => {
    open({ own: true });
    await act(async () => undefined);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(['Posts', 'Games', 'Likes', 'Reposts', 'Saved']);
    expect(tabs.every((tab) => tab.textContent === '')).toBe(true);
  });

  it('keeps a section you hid from others on your own profile, and says it is hidden', async () => {
    open({ own: true, sections: { posts: true, games: true, likes: true, reposts: true, saved: false } });
    await act(async () => undefined);
    expect(screen.getByRole('tab', { name: 'Saved, Hidden' })).toBeTruthy();
  });

  it('does not offer a hidden section to anybody else', async () => {
    open({ sections: { posts: true, games: true, likes: true, reposts: true, saved: false } });
    await act(async () => undefined);
    expect(screen.queryByRole('tab', { name: /Saved/ })).toBeNull();
  });

  it('shows nothing at all for a profile that is private', async () => {
    open({ sections: null });
    await act(async () => undefined);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(testAuth.client.get).not.toHaveBeenCalled();
  });

  it('starts the row on the right in Soranî', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    open({ own: true });
    await act(async () => undefined);
    const row = screen.getAllByRole('tab')[0]!.parentElement!;
    expect(getComputedStyle(row).flexDirection).toBe('row-reverse');
  });
});

describe('the grid', () => {
  it('draws a post of words as its title and opening lines, and opens the post', async () => {
    open({ own: true }, { 'GET /users/u1/activity?kind=posts&limit=12': ok({ items: [post('s1', { viewCount: 1240 })] }) });
    const tile = await screen.findByRole('button', { name: 'Story: Çîroka min' });
    expect(tile.textContent).toContain('Rojekê Hevalo');
    expect(tile.textContent).toContain('1,240');
    fireEvent.click(tile);
    expect(navigation.navigate).toHaveBeenCalledWith('LibraryPost', { postId: 's1' });
  });

  it('draws a game as its cover with the result, unlinked', async () => {
    open(
      { own: true },
      { 'GET /users/u1/activity?kind=games&limit=12': ok({ entries: [{ id: 'g1', title: 'Peyvok', detail: 'Won · easy', at: '2026-09-01T10:00:00.000Z' }], items: [] }) },
    );
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('tab', { name: 'Games' }));
    const game = await screen.findByRole('img', { name: /^Peyvok, Won · easy, / });
    expect(game.textContent).toContain('Won · easy');
  });

  it('says so plainly when a section is empty', async () => {
    open({ own: true });
    expect(await screen.findByText('Nothing here yet.')).toBeTruthy();
  });
});
