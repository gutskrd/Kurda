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

/**
 * A post, as the wall draws it.
 *
 * Posts, likes and saved come back as whole posts now — they used to be a line
 * of text with a 40px thumbnail, which turned a picture into a stamp and a poem
 * into an icon.
 */
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
 * Answer /users/:id/activity per `kind`, and record which kinds were asked for.
 *
 * The route returns both keys and leaves the unused one empty — games are rows
 * under `entries`, everything else is whole posts under `items` — so the stub
 * answers the same way.
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
    expect(container.querySelector('.mkp-activity')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads only the open tab, and the next one only when it is opened', async () => {
    const { fetch, asked } = activityFetch({
      posts: [post('s1', 'Çîroka min')],
      games: [entry('g1', 'games', 'Wordle', { detail: 'Won · easy' })],
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    expect(await screen.findByText('Çîroka min')).toBeInTheDocument();
    // four tabs are shown but only the first was fetched
    expect(asked).toEqual(['posts']);

    await userEvent.click(screen.getByRole('tab', { name: /Games/ }));
    expect(await screen.findByText('Wordle')).toBeInTheDocument();
    expect(screen.getByText('Won · easy')).toBeInTheDocument();
    // and the story is gone rather than left under the games tab
    expect(screen.queryByText('Çîroka min')).not.toBeInTheDocument();
    expect(asked).toEqual(['posts', 'games']);
  });

  it('links a post to its page, and leaves a game result unlinked', async () => {
    const { fetch } = activityFetch({
      posts: [post('s1', 'Çîroka min')],
      games: [entry('g1', 'games', 'Wordle')],
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    expect(await screen.findByRole('link', { name: /Çîroka min/ })).toHaveAttribute('href', '/app/library/s1');

    await userEvent.click(screen.getByRole('tab', { name: /Games/ }));
    expect(await screen.findByText('Wordle')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Wordle/ })).not.toBeInTheDocument();
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

    // on your own profile the tab stays — your work should not vanish on you
    const likes = await screen.findByRole('tab', { name: /Likes/ });
    expect(likes).toBeInTheDocument();
    expect(likes.textContent).toContain('Hidden');
    expect(screen.getByRole('tab', { name: /Posts/ }).textContent).not.toContain('Hidden');
  });

  it('offers exactly five sections: posts, games, likes, reposts, saved', async () => {
    const { fetch } = activityFetch({ posts: [] });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    // stories, poems and Dîmen were three tabs for one thing, the same split
    // the community wall stopped making
    const tabs = (await screen.findAllByRole('tab')).map((t) => t.textContent?.replace('Hidden', '').trim());
    expect(tabs).toEqual(['Posts', 'Games', 'Likes', 'Reposts', 'Saved']);
  });

  it('shows a picture at the size the card shows it, not as a thumbnail', async () => {
    const { fetch } = activityFetch({
      posts: [post('i1', 'Çiya', { imageUrl: 'https://cdn.test/a.webp' })],
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    // the picture belongs to the card now — the 40px .mkp-activity-shot square
    // is what this replaced
    await screen.findByText('Çiya');
    expect(document.querySelector('.fcard-shot img')).toHaveAttribute('src', 'https://cdn.test/a.webp');
    expect(document.querySelector('.mkp-activity-shot')).toBeNull();
  });

  it('draws a post as the whole card, byline and actions and all', async () => {
    const { fetch } = activityFetch({ posts: [post('s1', 'Çîroka min')] });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    await screen.findByText('Çîroka min');
    const card = document.querySelector('.mkp-activity-feed .fcard');
    expect(card, 'a post should be a card').not.toBeNull();
    // who wrote it, what it says, and the things you can do with it
    expect(card!.querySelector('.fcard-name')?.textContent).toBe('nivîskar');
    expect(card!.querySelector('.fcard-text')?.textContent).toContain('fill a card');
    expect(card!.querySelectorAll('.fcard-act').length).toBeGreaterThan(1);
  });
});
