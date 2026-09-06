import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dimen } from './Dimen';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const pic = (id: string, caption: string, extra: Record<string, unknown> = {}) => ({
  id,
  authorId: 'u1',
  author: { id: 'u1', username: 'dilan', avatarUrl: null },
  imageMediaId: `k/${id}`,
  imageUrl: `https://cdn.test/${id}.webp`,
  caption,
  category: 'image',
  language: 'kmr',
  viewCount: 3,
  reactionCount: 2,
  commentCount: 1,
  createdAt: '2026-09-01T10:00:00.000Z',
  ...extra,
});

/** Answer /images and remember every query string it was asked with. */
function wallFetch(posts: unknown[]) {
  const queries: string[] = [];
  return {
    queries,
    fetch: vi.fn(async (url: string) => {
      if (url.includes('/images')) {
        queries.push(url.slice(url.indexOf('/images')));
        return jsonResponse(200, { posts });
      }
      return jsonResponse(200, {});
    }),
  };
}

describe('Dimen', () => {
  it('shows each picture with who posted it, linked to its own page', async () => {
    const { fetch } = wallFetch([pic('a', 'Çiyayên welêt')]);
    vi.stubGlobal('fetch', fetch);
    renderApp(<Dimen />, ['/app/dimen']);

    expect(await screen.findByText('Çiyayên welêt')).toBeInTheDocument();
    expect(screen.getByText('dilan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Çiyayên welêt/ })).toHaveAttribute('href', '/app/dimen/a');
    // the caption is the alt text: a picture with no description is unreadable
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Çiyayên welêt');
  });

  it('asks the server for the filter you picked rather than filtering locally', async () => {
    const { fetch, queries } = wallFetch([pic('a', 'One')]);
    vi.stubGlobal('fetch', fetch);
    renderApp(<Dimen />, ['/app/dimen']);
    await screen.findByText('One');

    expect(queries[0]).toContain('sort=newest');
    expect(queries[0]).not.toContain('category=');

    await userEvent.click(screen.getByRole('button', { name: 'Memes' }));
    await waitFor(() => expect(queries.some((q) => q.includes('category=meme'))).toBe(true));

    await userEvent.click(screen.getByRole('button', { name: 'Popular' }));
    // both choices travel together — the wall shows one query's worth of posts,
    // not an intersection assembled in the browser
    await waitFor(() =>
      expect(queries.some((q) => q.includes('category=meme') && q.includes('sort=popular'))).toBe(true),
    );
  });

  it('says so plainly when there is nothing to show', async () => {
    const { fetch } = wallFetch([]);
    vi.stubGlobal('fetch', fetch);
    renderApp(<Dimen />, ['/app/dimen']);
    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('offers Show more only when a page came back full', async () => {
    const full = Array.from({ length: 24 }, (_, i) => pic(`p${i}`, `Picture ${i}`));
    const fetch = vi.fn(async (url: string) => {
      if (!url.includes('/images')) return jsonResponse(200, {});
      const offset = Number(/offset=(\d+)/.exec(url)?.[1] ?? 0);
      return jsonResponse(200, { posts: offset === 0 ? full : [pic('last', 'The last one')] });
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<Dimen />, ['/app/dimen']);

    await userEvent.click(await screen.findByRole('button', { name: 'Show more' }));

    expect(await screen.findByText('The last one')).toBeInTheDocument();
    expect(screen.getByText('Picture 0')).toBeInTheDocument(); // the first page stays
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument());
  });
});
