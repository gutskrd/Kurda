import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileActivity } from './ProfileActivity';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const ALL = { posts: true, games: true, likes: true, saved: true };

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

/** Answer /users/:id/activity per `kind`, and record which kinds were asked for. */
function activityFetch(byKind: Record<string, unknown[]>): { fetch: ReturnType<typeof vi.fn>; asked: string[] } {
  const asked: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    const kind = /kind=(\w+)/.exec(url)?.[1] ?? '';
    asked.push(kind);
    return jsonResponse(200, { entries: byKind[kind] ?? [] });
  });
  return { fetch, asked };
}

describe('ProfileActivity', () => {
  it('shows only the sections the profile advertises', async () => {
    const { fetch } = activityFetch({ posts: [entry('s1', 'posts', 'Çîroka min')] });
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
      posts: [entry('s1', 'posts', 'Çîroka min')],
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
      posts: [entry('s1', 'posts', 'Çîroka min', { href: '/app/library/s1' })],
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
      Array.from({ length: n }, (_, i) => entry(`s${from + i}`, 'posts', `Story ${from + i}`));
    const fetch = vi.fn(async (url: string) => {
      const offset = Number(/offset=(\d+)/.exec(url)?.[1] ?? 0);
      return jsonResponse(200, { entries: offset === 0 ? page(0, 12) : page(12, 3) });
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
    const { fetch } = activityFetch({ likes: [entry('l1', 'posts', 'Helbesta min')] });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={{ ...ALL, likes: false }} own />);

    // on your own profile the tab stays — your work should not vanish on you
    const likes = await screen.findByRole('tab', { name: /Likes/ });
    expect(likes).toBeInTheDocument();
    expect(likes.textContent).toContain('Hidden');
    expect(screen.getByRole('tab', { name: /Posts/ }).textContent).not.toContain('Hidden');
  });

  it('offers exactly four sections: posts, games, likes, saved', async () => {
    const { fetch } = activityFetch({ posts: [] });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    // stories, poems and Dîmen were three tabs for one thing, the same split
    // the community wall stopped making
    const tabs = (await screen.findAllByRole('tab')).map((t) => t.textContent?.replace('Hidden', '').trim());
    expect(tabs).toEqual(['Posts', 'Games', 'Likes', 'Saved']);
  });

  it('shows a picture in the row that has one', async () => {
    const { fetch } = activityFetch({
      posts: [entry('i1', 'posts', 'Çiya', { imageUrl: 'https://cdn.test/a.webp' })],
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    // one list holds both words and pictures now, so a row carries its own
    // thumbnail rather than there being a gallery tab and a list tab
    await screen.findByText('Çiya');
    expect(document.querySelector('.mkp-activity-shot')).toHaveAttribute('src', 'https://cdn.test/a.webp');
  });
});
