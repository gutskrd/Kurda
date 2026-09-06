import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Saved } from './Saved';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const engagement = (over = {}) => ({ likes: 0, bookmarks: 1, liked: false, bookmarked: true, ...over });

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

/** Serve /me/saved, and answer a bookmark toggle as an unsave. */
function savedFetch(items: unknown[]) {
  const urls: string[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/me/saved')) {
      urls.push(url.slice(url.indexOf('/me/saved')));
      return jsonResponse(200, { items });
    }
    if (url.includes('/posts/')) {
      urls.push(`${init?.method ?? 'GET'} ${url.slice(url.indexOf('/posts'))}`);
      return jsonResponse(200, { on: false, engagement: engagement({ bookmarks: 0, bookmarked: false }) });
    }
    if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetch);
  return { urls };
}

describe('Saved', () => {
  it('reads your own list, with no id in the path', async () => {
    signIn();
    const { urls } = savedFetch([item('library:s1')]);
    renderApp(<Saved />, ['/app/saved']);

    expect(await screen.findByText('Çîroka min')).toBeInTheDocument();
    // someone else's reading list is theirs; there is nothing to address here
    expect(urls[0]).toBe('/me/saved?limit=20&offset=0');
  });

  it('shows the same card the wall shows', async () => {
    signIn();
    savedFetch([item('library:s1', { commentCount: 7, engagement: engagement({ likes: 4 }) })]);
    renderApp(<Saved />, ['/app/saved']);

    // a reading list that rendered posts differently would make you re-read each
    // one to work out what it was
    const card = (await screen.findByText('Çîroka min')).closest<HTMLElement>('.fcard')!;
    expect(within(card).getByText('dilan')).toBeInTheDocument();
    expect(card.textContent).toContain('7');
    expect(within(card).getByRole('button', { name: 'Remove from saved' })).toBeInTheDocument();
  });

  it('takes a post off the list when you unsave it', async () => {
    signIn();
    savedFetch([item('library:s1'), item('library:s2', { title: 'Bajarê Kevn', href: '/app/library/s2' })]);
    renderApp(<Saved />, ['/app/saved']);

    const card = (await screen.findByText('Çîroka min')).closest<HTMLElement>('.fcard')!;
    const unsave = within(card).getByRole('button', { name: 'Remove from saved' });
    await waitFor(() => expect(unsave).toBeEnabled());
    await userEvent.click(unsave);

    // here the list *is* the saves, so a post you just removed sitting in it
    // would be a lie
    await waitFor(() => expect(screen.queryByText('Çîroka min')).not.toBeInTheDocument());
    expect(screen.getByText('Bajarê Kevn')).toBeInTheDocument();
  });

  it('leaves a post in place when unsaving fails', async () => {
    signIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/me/saved')) return jsonResponse(200, { items: [item('library:s1')] });
        if (url.includes('/posts/')) return jsonResponse(500, { code: 'INTERNAL', message: 'no' });
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Saved />, ['/app/saved']);

    const card = (await screen.findByText('Çîroka min')).closest<HTMLElement>('.fcard')!;
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Remove from saved' })).toBeEnabled());
    await userEvent.click(within(card).getByRole('button', { name: 'Remove from saved' }));

    // the server did not accept it, so nothing may disappear
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Çîroka min')).toBeInTheDocument();
  });

  it('says how to fill an empty list rather than just that it is empty', async () => {
    signIn();
    savedFetch([]);
    renderApp(<Saved />, ['/app/saved']);

    expect(await screen.findByText(/Nothing saved yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Civak' })).toHaveAttribute('href', '/app/civak');
  });
});
