import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { jsonResponse, renderApp } from '../test/utils';
import { DimenPost } from './DimenPost';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const AUTHOR = { id: 'a1', username: 'dilan', avatarUrl: null };

const post = {
  id: 'i1',
  authorId: AUTHOR.id,
  author: AUTHOR,
  imageMediaId: 'm1',
  imageUrl: 'https://cdn.test/a.webp',
  caption: 'Çiyayên welêt',
  category: 'image',
  language: 'ku',
  viewCount: 40,
  commentCount: 2,
  createdAt: '2026-10-01T10:00:00Z',
};

const engagement = (over: Record<string, unknown> = {}) => ({
  likes: 3,
  bookmarks: 0,
  reposts: 1,
  liked: false,
  bookmarked: false,
  reposted: false,
  ...over,
});

/** The picture, its counts and its comments; every request is logged. */
function serve(signedIn: boolean): { calls: string[] } {
  if (signedIn) localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.slice(url.indexOf('/', 8));
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/me') return signedIn ? jsonResponse(200, { user: { id: 'me', username: 'baran' } }) : jsonResponse(401, {});
      if (path.startsWith('/images/i1/comments')) return jsonResponse(200, { comments: [] });
      if (path === '/images/i1') return jsonResponse(200, post);
      if (path === '/posts/image/i1/engagement') return jsonResponse(200, { engagement: engagement() });
      if (path === '/posts/image/i1/like') return jsonResponse(200, { on: true, engagement: engagement({ likes: 4, liked: true }) });
      return jsonResponse(200, {});
    }),
  );
  return { calls };
}

const show = () =>
  renderApp(
    <Routes>
      <Route path="/app/dimen/:id" element={<DimenPost />} />
    </Routes>,
    ['/app/dimen/i1'],
  );

describe('DimenPost', () => {
  it('is the wall’s own post, with its counts fetched for whoever is reading', async () => {
    const { calls } = serve(false);
    show();

    const like = await screen.findByRole('button', { name: 'Sign in to like' });
    await waitFor(() => expect(like.textContent).toContain('3'));
    expect(calls).toContain('GET /posts/image/i1/engagement');
    expect(screen.getByRole('button', { name: 'Sign in to repost' }).textContent).toContain('1');
    // the words above the picture, read whole, and the comments under the post
    expect(screen.getByText('Çiyayên welêt').closest('.fcard-body')?.nextElementSibling).toHaveClass('fcard-media');
    expect(screen.getByRole('article')).toHaveClass('is-page');
    expect(await screen.findByRole('region', { name: 'Comments' })).toBeInTheDocument();
  });

  it('does not link the post to itself', async () => {
    serve(false);
    show();
    await screen.findByText('Çiyayên welêt');
    expect(screen.getByText('Çiyayên welêt').closest('a')).toBeNull();
    expect(screen.queryByRole('link', { name: /View all/ })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/app/dimen/i1"]')).toBeNull();
  });

  it('likes the picture and keeps the count the server answers with', async () => {
    const { calls } = serve(true);
    show();

    const like = await screen.findByRole('button', { name: 'Like (3)' });
    await waitFor(() => expect(like).toBeEnabled());
    await userEvent.click(like);
    expect(await screen.findByRole('button', { name: 'Unlike (4)' })).toHaveAttribute('aria-pressed', 'true');
    expect(calls).toContain('POST /posts/image/i1/like');
  });

  it('has no emoji reactions, and does not ask for them', async () => {
    const { calls } = serve(true);
    show();
    await screen.findByRole('button', { name: 'Like (3)' });
    expect(screen.queryByRole('group', { name: 'Reactions' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.includes('/reaction'))).toBe(false);
    // nor the old badge and views line over the picture
    expect(screen.queryByText('40 views')).not.toBeInTheDocument();
  });
});
