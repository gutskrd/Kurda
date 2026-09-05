import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stories } from './Library';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const post = {
  id: 'p1',
  authorId: 'u1',
  authorRole: 'user',
  author: { id: 'u1', username: 'zana', avatarUrl: null },
  type: 'story',
  title: 'The Mountain Fox',
  body: 'Li çiyayekî bilind rovîyek dijiya...',
  language: 'kmr',
  viewCount: 42,
  commentCount: 0,
  audioUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  publishedAt: '2026-01-01T00:00:00.000Z',
};

describe('Stories (library)', () => {
  it('renders posts returned by the public endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { posts: [post] })),
    );
    renderApp(<Stories />);
    expect(await screen.findByText('The Mountain Fox')).toBeInTheDocument();
    expect(screen.getByText(/42 reads/)).toBeInTheDocument();
  });

  it('lets a signed-in user write and publish a story', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/library/posts') && init?.method === 'POST') {
          calls.push({ url, body: init.body ? JSON.parse(init.body as string) : null });
          return jsonResponse(201, { ...post, title: 'My New Tale' });
        }
        if (url.includes('/library/posts')) return jsonResponse(200, { posts: [] });
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'u1', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Stories />);

    // the Write button only appears once the session is restored (signed in)
    await userEvent.click(await screen.findByRole('button', { name: /write a story/i }));
    await userEvent.type(screen.getByLabelText('Title'), 'My New Tale');
    await userEvent.type(screen.getByLabelText('Text'), 'Once upon a time…');
    await userEvent.click(screen.getByRole('button', { name: /publish story/i }));

    const created = calls.find((c) => c.url.includes('/library/posts'));
    expect(created?.body).toMatchObject({ type: 'story', title: 'My New Tale', body: 'Once upon a time…', publish: true });
  });

  it('shows an error state with a retry when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { code: 'SERVER_ERROR', message: 'boom' })),
    );
    renderApp(<Stories />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
