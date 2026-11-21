import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileActivity } from './ProfileActivity';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const ALL = { posts: true, games: true, likes: true, reposts: true, saved: true };

/** A game result: still a row, because there is no card for one. */
const entry = (id: string, kind: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind,
  title,
  detail: null,
  href: null,
  imageUrl: null,
  at: '2026-09-01T10:00:00.000Z',
  ...extra,
});

/** A whole post, as posts, likes and saved return them. */
const post = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  key: `library:${id}`,
  targetType: 'library',
  id,
  kind: 'story',
  author: { id: 'u1', username: 'nivîskar', avatarUrl: null },
  title,
  excerpt: 'A body long enough to fill a card.',
  imageUrl: null,
  href: `/app/library/${id}`,
  viewCount: 0,
  commentCount: 0,
  engagement: { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false },
  at: '2026-09-01T10:00:00.000Z',
  ...extra,
});

/**
 * Answers /users/:id/activity per `kind` and records the kinds asked for. Like the route, it returns both `entries`
 * (game rows) and `items` (posts), leaving the unused one empty.
 */
function activityFetch(byKind: Record<string, unknown[]>): { fetch: ReturnType<typeof vi.fn>; asked: string[] } {
  const asked: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    const kind = /kind=(\w+)/.exec(url)?.[1] ?? '';
    asked.push(kind);
    const rows = byKind[kind] ?? [];
    return jsonResponse(200, kind === 'games' ? { entries: rows, items: [] } : { entries: [], items: rows });
  });
  return { fetch, asked };
}

describe('ProfileActivity', () => {
  it('shows only the sections the profile advertises', async () => {
    const { fetch } = activityFetch({ posts: [post('s1', 'Çîroka min')] });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={{ ...ALL, likes: false, saved: false }} />);

    expect(await screen.findByRole('tab', { name: /Posts/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Games/ })).toBeInTheDocument();
    // hidden ones are not offered at all, not even as empty tabs
    expect(screen.queryByRole('tab', { name: /Likes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Saved/ })).not.toBeInTheDocument();
  });

  it('renders nothing at all when the profile is private', () => {
    vi.stubGlobal('fetch', vi.fn());
    const { container } = renderApp(<ProfileActivity userId="u1" sections={null} />);
    expect(container.querySelector('.pg')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads only the open tab, and the next one only when it is opened', async () => {
    const { fetch, asked } = activityFetch({
      posts: [post('s1', 'Çîroka min')],
      games: [entry('g1', 'games', 'Peyvok', { detail: 'Won · easy' })],
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    expect(await screen.findByText('Çîroka min')).toBeInTheDocument();
    // four tabs are shown but only the first was fetched
    expect(asked).toEqual(['posts']);

    await userEvent.click(screen.getByRole('tab', { name: /Games/ }));
    expect(await screen.findByText('Peyvok')).toBeInTheDocument();
    expect(screen.getByText('Won · easy')).toBeInTheDocument();
    // and the story is gone rather than left under the games tab
    expect(screen.queryByText('Çîroka min')).not.toBeInTheDocument();
    expect(asked).toEqual(['posts', 'games']);
  });

  it('links a post’s tile to its page, and shows a game as its cover with the result, unlinked', async () => {
    const { fetch } = activityFetch({
      posts: [post('s1', 'Çîroka min')],
      games: [entry('g1', 'games', 'Peyvok', { detail: 'Won · easy' })],
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    expect(await screen.findByRole('link', { name: /Çîroka min/ })).toHaveAttribute('href', '/app/library/s1');

    await userEvent.click(screen.getByRole('tab', { name: 'Games' }));
    const game = await screen.findByRole('img', { name: /^Peyvok, Won · easy, / });
    expect(game.querySelector('.gp-art')).not.toBeNull();
    expect(screen.queryByRole('link', { name: /Peyvok/ })).not.toBeInTheDocument();
  });

  it('says so plainly when a section is empty', async () => {
    const { fetch } = activityFetch({});
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);
    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('offers Show more only on a full page, and appends the next one', async () => {
    const page = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => post(`s${from + i}`, `Story ${from + i}`));
    const fetch = vi.fn(async (url: string) => {
      const offset = Number(/offset=(\d+)/.exec(url)?.[1] ?? 0);
      return jsonResponse(200, { entries: [], items: offset === 0 ? page(0, 12) : page(12, 3) });
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    const more = await screen.findByRole('button', { name: 'Show more' });
    await userEvent.click(more);

    expect(await screen.findByText('Story 14')).toBeInTheDocument();
    expect(screen.getByText('Story 0')).toBeInTheDocument(); // the first page is kept
    // a short page means the end
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument());
  });

  it('marks your own hidden sections instead of dropping them', async () => {
    const { fetch } = activityFetch({ likes: [post('l1', 'Helbesta min')] });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={{ ...ALL, likes: false }} own />);

    // on your own profile the tab stays, said to be hidden and marked with a lock
    const likes = await screen.findByRole('tab', { name: 'Likes, Hidden' });
    expect(likes.querySelector('.pg-tab-lock')).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Posts' }).querySelector('.pg-tab-lock')).toBeNull();
  });

  it('offers exactly five sections as icons named for a screen reader: posts, games, likes, reposts, saved', async () => {
    const { fetch } = activityFetch({ posts: [] });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    // Stories, poems and Dîmen share the Posts tab, as on the community wall.
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(['Posts', 'Games', 'Likes', 'Reposts', 'Saved']);
    expect(tabs.every((t) => t.textContent === '')).toBe(true);
  });

  it('draws a post with a picture as the picture, filling its tile, with how often it was seen, shortened', async () => {
    const { fetch } = activityFetch({
      posts: [post('i1', 'Çiya', { imageUrl: 'https://cdn.test/a.webp', viewCount: 1240 })],
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    const tile = await screen.findByRole('link', { name: /Çiya/ });
    expect(tile.querySelector('img.pg-tile-img')).toHaveAttribute('src', 'https://cdn.test/a.webp');
    expect(tile.querySelector('.pg-tile-foot')?.textContent).toBe('1.2K');
  });

  it('draws a post of words as its title and opening lines, marked with its kind', async () => {
    const { fetch } = activityFetch({ posts: [post('s1', 'Çîroka min')] });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    const tile = await screen.findByRole('link', { name: 'Story: Çîroka min' });
    expect(tile).toHaveClass('is-words');
    expect(tile.querySelector('.pg-tile-title')?.textContent).toBe('Çîroka min');
    expect(tile.querySelector('.pg-tile-excerpt')?.textContent).toContain('fill a card');
    expect(tile.querySelector('.pg-tile-mark svg')).not.toBeNull();
  });
});
