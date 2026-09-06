import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileActivity } from './ProfileActivity';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const ALL = { stories: true, poems: true, images: true, games: true, likes: true, bookmarks: true };

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
    const { fetch } = activityFetch({ stories: [entry('s1', 'stories', 'Çîroka min')] });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={{ ...ALL, poems: false, images: false }} />);

    expect(await screen.findByRole('tab', { name: /Stories/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Games/ })).toBeInTheDocument();
    // hidden ones are not offered at all, not even as empty tabs
    expect(screen.queryByRole('tab', { name: /Poems/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Dîmen/ })).not.toBeInTheDocument();
  });

  it('renders nothing at all when the profile is private', () => {
    vi.stubGlobal('fetch', vi.fn());
    const { container } = renderApp(<ProfileActivity userId="u1" sections={null} />);
    expect(container.querySelector('.mkp-activity')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads only the open tab, and the next one only when it is opened', async () => {
    const { fetch, asked } = activityFetch({
      stories: [entry('s1', 'stories', 'Çîroka min')],
      games: [entry('g1', 'games', 'Wordle', { detail: 'Won · easy' })],
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={ALL} />);

    expect(await screen.findByText('Çîroka min')).toBeInTheDocument();
    // four tabs are shown but only the first was fetched
    expect(asked).toEqual(['stories']);

    await userEvent.click(screen.getByRole('tab', { name: /Games/ }));
    expect(await screen.findByText('Wordle')).toBeInTheDocument();
    expect(screen.getByText('Won · easy')).toBeInTheDocument();
    // and the story is gone rather than left under the games tab
    expect(screen.queryByText('Çîroka min')).not.toBeInTheDocument();
    expect(asked).toEqual(['stories', 'games']);
  });

  it('links a post to its page, and leaves a game result unlinked', async () => {
    const { fetch } = activityFetch({
      stories: [entry('s1', 'stories', 'Çîroka min', { href: '/app/library/s1' })],
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
      Array.from({ length: n }, (_, i) => entry(`s${from + i}`, 'stories', `Story ${from + i}`));
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
    const { fetch } = activityFetch({ poems: [entry('p1', 'poems', 'Helbesta min')] });
    vi.stubGlobal('fetch', fetch);
    renderApp(<ProfileActivity userId="u1" sections={{ ...ALL, poems: false }} own />);

    // on your own profile the tab stays — your work should not vanish on you
    const poems = await screen.findByRole('tab', { name: /Poems/ });
    expect(poems).toBeInTheDocument();
    expect(poems.textContent).toContain('Hidden');
    expect(screen.getByRole('tab', { name: /Stories/ }).textContent).not.toContain('Hidden');
  });
});
