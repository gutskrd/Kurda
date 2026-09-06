import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Comments } from './Comments';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const comment = (id: string, body: string, extra: Record<string, unknown> = {}) => ({
  id,
  postId: 'p1',
  author: { id: 'u1', username: 'dilan', avatarUrl: null },
  parentCommentId: null,
  depth: 0,
  body,
  status: 'visible',
  replyCount: 0,
  createdAt: '2026-09-01T10:00:00.000Z',
  ...extra,
});

/**
 * Answer the comment endpoints and remember every URL asked for, so a test can
 * assert which surface's paths were used.
 */
function commentFetch(thread: unknown[] = []) {
  const urls: string[] = [];
  return {
    urls,
    fetch: vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me') && !url.includes('comments')) {
        return jsonResponse(200, { user: { id: 'me', username: 'me' } });
      }
      urls.push(`${init?.method ?? 'GET'} ${url.slice(url.indexOf('/', 8))}`);
      if (url.includes('/replies')) return jsonResponse(200, { comments: [] });
      if ((init?.method ?? 'GET') === 'POST') return jsonResponse(201, comment('new', 'posted'));
      return jsonResponse(200, { comments: thread });
    }),
  };
}

const signIn = () =>
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

describe('Comments', () => {
  it('talks to the library paths by default', async () => {
    const { fetch, urls } = commentFetch([comment('c1', 'hello')]);
    vi.stubGlobal('fetch', fetch);
    renderApp(<Comments postId="p1" commentCount={1} />);

    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(urls[0]).toContain('/library/posts/p1/comments');
  });

  it('talks to the image paths on the Dîmen surface', async () => {
    const { fetch, urls } = commentFetch([comment('c1', 'nice picture')]);
    vi.stubGlobal('fetch', fetch);
    renderApp(<Comments postId="p1" commentCount={1} surface="images" />);

    expect(await screen.findByText('nice picture')).toBeInTheDocument();
    // the same tree, a different set of paths — not a second component
    expect(urls[0]).toContain('/images/p1/comments');
  });

  it('counts the comment you just wrote', async () => {
    signIn();
    const { fetch } = commentFetch([]);
    vi.stubGlobal('fetch', fetch);
    renderApp(<Comments postId="p1" commentCount={0} surface="images" />);

    expect(await screen.findByText('0 comments')).toBeInTheDocument();

    const box = await screen.findByLabelText('Add a comment…');
    await userEvent.type(box, 'Xweş e');
    await userEvent.click(screen.getByRole('button', { name: /post|comment|send/i }));

    // "0 comments" above the comment you just wrote reads as a bug
    await waitFor(() => expect(screen.getByText('1 comment')).toBeInTheDocument());
  });

  it('leaves the count alone when the post is rejected', async () => {
    signIn();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me') && !url.includes('comments')) {
        return jsonResponse(200, { user: { id: 'me', username: 'me' } });
      }
      if ((init?.method ?? 'GET') === 'POST') return jsonResponse(403, { code: 'AUTO_MODERATED', message: 'no' });
      return jsonResponse(200, { comments: [] });
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<Comments postId="p1" commentCount={4} surface="images" />);

    const box = await screen.findByLabelText('Add a comment…');
    await userEvent.type(box, 'spam');
    await userEvent.click(screen.getByRole('button', { name: /post|comment|send/i }));

    // the count follows what the server accepted, not what was typed
    await waitFor(() => expect(document.querySelector('.msg-error')).not.toBeNull());
    expect(screen.getByText('4 comments')).toBeInTheDocument();
    // and the text stays in the box, so it is not lost to a rejection
    expect(box).toHaveValue('spam');
  });
});
