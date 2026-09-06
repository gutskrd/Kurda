import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Civak } from './Civak';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const engagement = (over = {}) => ({ likes: 0, bookmarks: 0, liked: false, bookmarked: false, ...over });

const item = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  targetType: 'library',
  id: key.split(':')[1] ?? key,
  kind: 'story',
  author: { id: 'a1', username: 'dilan', avatarUrl: null },
  title: 'Çîroka min',
  excerpt: 'Rojeke em derketin rê.',
  imageUrl: null,
  href: '/app/library/s1',
  viewCount: 3,
  commentCount: 2,
  engagement: engagement(),
  at: '2026-09-01T10:00:00.000Z',
  ...over,
});

/** Serve /feed, remember every query it was asked with, and log writes. */
function feedFetch(items: unknown[], onToggle?: () => unknown) {
  const queries: string[] = [];
  const posts: string[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/feed')) {
      queries.push(url.slice(url.indexOf('/feed')));
      return jsonResponse(200, { items });
    }
    if (url.includes('/posts/')) {
      posts.push(`${init?.method ?? 'GET'} ${url.slice(url.indexOf('/posts'))}`);
      return jsonResponse(200, onToggle ? onToggle() : { on: true, engagement: engagement({ likes: 1, liked: true }) });
    }
    if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetch);
  return { queries, posts };
}

describe('Civak', () => {
  it('shows one card per post, whatever kind it is', async () => {
    feedFetch([
      item('library:s1'),
      item('library:p1', { kind: 'poem', title: 'Dara Hinarê', href: '/app/library/p1' }),
      item('image:i1', {
        targetType: 'image',
        kind: 'image',
        title: null,
        imageUrl: 'https://cdn.test/a.webp',
        excerpt: 'Çiyayên welêt',
        href: '/app/dimen/i1',
      }),
    ]);
    renderApp(<Civak />, ['/app/civak']);

    expect(await screen.findByText('Çîroka min')).toBeInTheDocument();
    expect(screen.getByText('Dara Hinarê')).toBeInTheDocument();
    // the merge is the point: a picture sits between the words, not on its own page
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.test/a.webp');
    expect(screen.getAllByText('dilan')).toHaveLength(3);
  });

  it('asks the server for the filter rather than filtering what it already has', async () => {
    const { queries } = feedFetch([item('library:s1')]);
    renderApp(<Civak />, ['/app/civak']);
    await screen.findByText('Çîroka min');
    expect(queries[0]).toContain('kind=all');

    await userEvent.click(screen.getByRole('button', { name: 'Helbest' }));
    await waitFor(() => expect(queries.some((q) => q.includes('kind=poems'))).toBe(true));
  });

  it('starts on the filter the address asked for', async () => {
    const { queries } = feedFetch([item('library:i1')]);
    // so /app/stories can simply redirect here and land somewhere meaningful
    renderApp(<Civak />, ['/app/civak?kind=images']);
    await waitFor(() => expect(queries[0]).toContain('kind=images'));
    expect(screen.getByRole('button', { name: 'Dîmen' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('likes a post and keeps the new count, without reloading the wall', async () => {
    signIn();
    const { queries, posts } = feedFetch([item('library:s1')]);
    renderApp(<Civak />, ['/app/civak']);

    const card = (await screen.findByText('Çîroka min')).closest<HTMLElement>('.fcard')!;
    const like = within(card).getByRole('button', { name: /^Like/ });
    await waitFor(() => expect(like).toBeEnabled());
    await userEvent.click(like);

    await waitFor(() => expect(posts).toContain('POST /posts/library/s1/like'));
    // the server's answer replaces the card in place — a reload would lose your
    // scroll position for the sake of one number
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Unlike (1)' })).toBeInTheDocument());
    expect(card.textContent).toContain('1');
    expect(queries).toHaveLength(1);
  });

  it('saves a post separately from liking it', async () => {
    signIn();
    const { posts } = feedFetch([item('library:s1')], () => ({
      on: true,
      engagement: engagement({ bookmarks: 1, bookmarked: true }),
    }));
    renderApp(<Civak />, ['/app/civak']);

    const card = (await screen.findByText('Çîroka min')).closest<HTMLElement>('.fcard')!;
    const save = within(card).getByRole('button', { name: 'Save' });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() => expect(posts).toContain('POST /posts/library/s1/bookmark'));
    await waitFor(() =>
      expect(within(card).getByRole('button', { name: 'Remove from saved' })).toBeInTheDocument(),
    );
  });

  it('shows the counts to a guest but does not let them act', async () => {
    const { posts } = feedFetch([item('library:s1', { engagement: engagement({ likes: 4 }) })]);
    renderApp(<Civak />, ['/app/civak']);

    const like = await screen.findByRole('button', { name: 'Sign in to like' });
    // the count is still readable; it is the label that says what it is
    expect(like).toBeDisabled();
    expect(like.textContent).toContain('4');
    await userEvent.click(like);
    expect(posts).toHaveLength(0);
  });

  it('says so plainly when the wall is empty', async () => {
    feedFetch([]);
    renderApp(<Civak />, ['/app/civak']);
    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
  });
});
