import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
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
