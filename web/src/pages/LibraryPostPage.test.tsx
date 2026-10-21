import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { jsonResponse, renderApp } from '../test/utils';
import { LibraryPostPage } from './LibraryPostPage';

const AUTHOR = { id: 'a1', username: 'dilan', avatarUrl: null };

const post = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  authorId: AUTHOR.id,
  author: AUTHOR,
  type: 'gotin',
  title: null,
  body: 'Dar bi berê xwe tê naskirin.',
  media: [],
  meme: false,
  sourceCredit: null,
  status: 'published',
  audioUrl: null,
  viewCount: 12,
  commentCount: 0,
  createdAt: '2026-10-01T10:00:00Z',
  publishedAt: '2026-10-01T10:00:00Z',
  ...over,
});

function serve(body: unknown, me: { id: string; username: string } | null = null): void {
  if (me) localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/me')) return me ? jsonResponse(200, { user: me }) : jsonResponse(401, {});
      if (url.includes('/comments')) return jsonResponse(200, { comments: [] });
      if (url.includes('/posts/library/p1/engagement'))
        return jsonResponse(200, { engagement: { likes: 5, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false } });
      if (url.includes('/library/posts/p1')) return jsonResponse(200, body);
      if (url.includes('/me/library/drafts')) return jsonResponse(200, { posts: [] });
      return jsonResponse(200, {});
    }),
  );
}

const show = () =>
  renderApp(
    <Routes>
      <Route path="/app/library/:id" element={<LibraryPostPage />} />
    </Routes>,
    ['/app/library/p1'],
  );

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('LibraryPostPage', () => {
  it('shows a saying without a title, badged as a saying, with the way back to the wall', async () => {
    serve(post());
    show();
    expect(await screen.findByText('Dar bi berê xwe tê naskirin.')).toHaveClass('post-body-saying');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByText('Saying')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Community' })).toHaveAttribute('href', '/app/civak');
  });

  it('shows the pictures in the grid, by their descriptions, and the source under the post', async () => {
    serve(
      post({
        body: '',
        media: [
          { mediaKey: 'k1', url: 'https://cdn.test/1.webp', altText: 'A tulip in snow', width: 800, height: 600 },
          { mediaKey: 'k2', url: 'https://cdn.test/2.webp', altText: null, width: 800, height: 600 },
        ],
        sourceCredit: 'Photo by Rojda',
      }),
    );
    show();
    const group = await screen.findByRole('group', { name: '2 pictures' });
    expect(within(group).getByRole('button', { name: 'Open picture 1 of 2: A tulip in snow' })).toBeInTheDocument();
    expect(screen.getByText('Source: \u2068Photo by Rojda\u2069')).toBeInTheDocument();
  });

  it('badges a post marked as a meme as a meme only', async () => {
    serve(post({ meme: true, media: [{ mediaKey: 'k1', url: 'https://cdn.test/1.webp', altText: null, width: 1, height: 1 }] }));
    show();
    expect(await screen.findByText('Meme')).toBeInTheDocument();
    expect(screen.queryByText('Saying')).toBeNull();
  });

  it('offers Edit only to the author, and it opens the composer on this post', async () => {
    serve(post({ type: 'story', title: 'Rêwîtî' }), { id: AUTHOR.id, username: AUTHOR.username });
    show();
    expect(await screen.findByRole('heading', { level: 1, name: 'Rêwîtî' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit post' });
    expect(within(dialog).getByDisplayValue('Dar bi berê xwe tê naskirin.')).toBeInTheDocument();
  });

  it('carries the wall’s row of actions under the post, with the counts for whoever is reading', async () => {
    serve(post());
    show();
    const like = await screen.findByRole('button', { name: 'Sign in to like' });
    await waitFor(() => expect(like.textContent).toContain('5'));
    expect(screen.getByRole('button', { name: 'Share this post' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Reactions' })).toBeNull();
  });

  it('does not offer Edit to anybody else', async () => {
    serve(post(), { id: 'someone-else', username: 'rojda' });
    show();
    await screen.findByText('Dar bi berê xwe tê naskirin.');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
