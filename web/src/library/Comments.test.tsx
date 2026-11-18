import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Comments } from './Comments';
import { renderApp, jsonResponse } from '../test/utils';
import { onNotice } from '../lib/notice';

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

/** Answers the comment endpoints and records every URL asked for, so a test can check which surface was used. */
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
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

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
    // The same component with a different set of paths.
    expect(urls[0]).toContain('/images/p1/comments');
  });

  it('plays a voice comment from the phone rather than showing it blank', async () => {
    const voice = comment('c1', '', { body: null, audioMediaId: 'voice/v1.m4a', audioUrl: 'https://media.example.test/voice/v1.m4a' });
    const { fetch } = commentFetch([voice, comment('c2', 'said and written', { audioMediaId: 'voice/v2.m4a', audioUrl: 'https://media.example.test/voice/v2.m4a' })]);
    vi.stubGlobal('fetch', fetch);
    renderApp(<Comments postId="p1" commentCount={2} />);

    expect(await screen.findByText('said and written')).toBeInTheDocument();
    const players = screen.getAllByRole('group', { name: 'Voice comment' });
    expect(players).toHaveLength(2);
    expect(within(players[0]!).getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('names a voice comment the server cannot serve, so it is not blank either', async () => {
    const { fetch } = commentFetch([comment('c1', '', { body: null, audioMediaId: 'voice/v1.m4a', audioUrl: null })]);
    vi.stubGlobal('fetch', fetch);
    renderApp(<Comments postId="p1" commentCount={1} />);

    expect(await screen.findByText('Voice comment')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
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

    // The count includes the comment just written.
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

    // The count follows what the server accepted, not what was typed.
    await waitFor(() => expect(document.querySelector('.msg-error')).not.toBeNull());
    expect(screen.getByText('4 comments')).toBeInTheDocument();
    // The text stays in the box after a rejection.
    expect(box).toHaveValue('spam');
  });

  it('deletes your own comment on the second press, and nobody else’s at all', async () => {
    signIn();
    const mine = comment('c1', 'my words', { author: { id: 'me', username: 'me', avatarUrl: null } });
    const theirs = comment('c2', 'their words');
    const { fetch, urls } = commentFetch([mine, theirs]);
    vi.stubGlobal('fetch', fetch);
    renderApp(<Comments postId="p1" commentCount={2} />);

    await screen.findByText('my words');
    // Only the author's own comment offers Delete.
    const del = screen.getByRole('button', { name: 'Delete this comment' });

    await userEvent.click(del);
    expect(urls.some((u) => u.startsWith('DELETE'))).toBe(false); // Armed, not fired.

    await userEvent.click(screen.getByRole('button', { name: /press again to confirm/i }));
    await waitFor(() => expect(urls.some((u) => u === 'DELETE /library/comments/c1')).toBe(true));
    expect(screen.getByText('1 comment')).toBeInTheDocument();
  });
});

/** The thread's server, holding each comment written until the test answers it. */
function heldPosts(thread: unknown[] = []) {
  const posts: Array<{ body: unknown; answer: (res: Response) => void }> = [];
  const deletes: Array<(res: Response) => void> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me') && !url.includes('comments')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
      if (init?.method === 'POST') return new Promise<Response>((answer) => posts.push({ body: JSON.parse(String(init.body)), answer }));
      if (init?.method === 'DELETE') return new Promise<Response>((answer) => deletes.push(answer));
      if (url.includes('/replies')) return jsonResponse(200, { comments: [] });
      return jsonResponse(200, { comments: thread });
    }),
  );
  return { posts, deletes };
}

describe('Comments shown before the server has them', () => {
  it('shows a comment at once as sending, then as sent in the same place', async () => {
    signIn();
    const { posts } = heldPosts([comment('c1', 'older')]);
    renderApp(<Comments postId="p1" commentCount={1} />);

    await userEvent.type(await screen.findByLabelText('Add a comment…'), 'Xweş e');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    const row = screen.getByText('Xweş e').closest('li')!;
    expect(row).toHaveClass('is-pending');
    expect(row).toHaveTextContent('Sending…');
    expect(screen.getByText('2 comments')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a comment…')).toHaveValue('');

    posts[0]!.answer(jsonResponse(201, comment('c9', 'Xweş e', { author: undefined })));
    await waitFor(() => expect(row).not.toHaveClass('is-pending'));
    // The same row, now an ordinary comment at the top.
    expect(screen.getByText('Xweş e').closest('li')).toBe(row);
    expect(screen.getAllByRole('listitem')[0]).toBe(row);
    expect(screen.getByText('2 comments')).toBeInTheDocument();
  });

  it('keeps one the server was not reached for, with a retry that sends it again', async () => {
    signIn();
    const { posts } = heldPosts();
    renderApp(<Comments postId="p1" commentCount={0} />);

    await userEvent.type(await screen.findByLabelText('Add a comment…'), 'Silav');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    posts[0]!.answer(jsonResponse(503, {}));
    expect(await screen.findByText('Not sent')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]!.body).toEqual({ body: 'Silav' });
    posts[1]!.answer(jsonResponse(201, comment('c3', 'Silav')));
    await waitFor(() => expect(screen.queryByText('Not sent')).not.toBeInTheDocument());
    expect(screen.getByText('1 comment')).toBeInTheDocument();
  });

  it('shows your comment removed at once, and back as it was if the server keeps it', async () => {
    signIn();
    const notices: string[] = [];
    const stop = onNotice((text) => notices.push(text));
    const { deletes } = heldPosts([comment('c1', 'my words', { author: { id: 'me', username: 'me', avatarUrl: null } })]);
    renderApp(<Comments postId="p1" commentCount={1} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete this comment' }));
    await userEvent.click(screen.getByRole('button', { name: /press again to confirm/i }));
    expect(screen.getByText('This comment was removed.')).toBeInTheDocument();
    expect(screen.getByText('0 comments')).toBeInTheDocument();
    deletes[0]!(jsonResponse(503, {}));
    expect(await screen.findByText('my words')).toBeInTheDocument();
    expect(screen.getByText('1 comment')).toBeInTheDocument();
    expect(notices).toHaveLength(1);
    stop();
  });
});
