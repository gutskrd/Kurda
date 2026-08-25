import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FavoritesPicker } from './FavoritesPicker';
import { renderApp, jsonResponse } from '../test/utils';
import type { MeProfile } from '../lib/types';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const me: MeProfile = {
  id: '1',
  email: 'a@b.com',
  username: 'ada',
  displayName: 'Ada',
  emailVerified: true,
  bio: null,
  xp: 0,
  streak: { current: 0, longest: 0, freezes: 0, lastActiveOn: null },
  profileVisibility: 'everyone',
  profilePhotoUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  favoritePoem: null,
  favoriteStory: { id: 's1', title: 'Old Tale' },
};

describe('FavoritesPicker', () => {
  it('browses published poems and pins one (PUT /me/favorites/poem)', async () => {
    const calls: Array<{ url: string; method?: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/me/favorites/poem')) {
          calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body as string) : null });
          return jsonResponse(200, { favoritePoemId: 'p1' });
        }
        if (url.includes('/library/posts')) {
          return jsonResponse(200, { posts: [{ id: 'p1', title: 'River Song', type: 'poem' }] });
        }
        return jsonResponse(200, {});
      }),
    );
    renderApp(<FavoritesPicker me={me} onChanged={() => {}} />, ['/app/profile']);

    const poemRow = screen.getByText('Favorite poem').closest('.fav-kind') as HTMLElement;
    expect(within(poemRow).getByText('None')).toBeInTheDocument();
    await userEvent.click(within(poemRow).getByRole('button', { name: 'Change' }));

    const option = await within(poemRow).findByRole('button', { name: 'River Song' });
    await userEvent.click(option);

    expect(await within(poemRow).findByText('River Song')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toEqual({ postId: 'p1' });
  });

  it('removes an existing favorite story (DELETE /me/favorites/story)', async () => {
    const calls: Array<{ method?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/me/favorites/story')) {
          calls.push({ method: init?.method });
          return jsonResponse(200, { favoriteStoryId: null });
        }
        return jsonResponse(200, {});
      }),
    );
    renderApp(<FavoritesPicker me={me} onChanged={() => {}} />, ['/app/profile']);

    const storyRow = screen.getByText('Favorite story').closest('.fav-kind') as HTMLElement;
    expect(within(storyRow).getByText('Old Tale')).toBeInTheDocument();
    await userEvent.click(within(storyRow).getByRole('button', { name: 'Remove' }));

    expect(await within(storyRow).findByText('None')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });
});
