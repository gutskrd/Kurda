import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { jsonResponse, renderApp } from '../test/utils';
import type { FeedItem } from '../lib/types';
import { FeedCard } from './FeedCard';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const ME = { id: 'me', username: 'baran' };
const signIn = (): void => localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const engagement = (over: Partial<FeedItem['engagement']> = {}): FeedItem['engagement'] => ({
  likes: 0,
  bookmarks: 0,
  reposts: 0,
  liked: false,
  bookmarked: false,
  reposted: false,
  ...over,
});

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  key: 'library:s1',
  targetType: 'library',
  id: 's1',
  kind: 'story',
  author: { id: 'a1', username: 'dilan', avatarUrl: null },
  title: 'Çîroka min',
  excerpt: 'Rojeke em derketin rê.',
  imageUrl: null,
  href: '/app/library/s1',
  viewCount: 3,
  commentCount: 0,
  engagement: engagement(),
  at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  ...over,
});

const picture = (over: Partial<FeedItem> = {}): FeedItem =>
  item({
    key: 'image:i1',
    targetType: 'image',
    id: 'i1',
    kind: 'image',
    title: null,
    excerpt: 'Çiyayên welêt',
    imageUrl: 'https://cdn.test/a.webp',
    images: [{ url: 'https://cdn.test/a.webp', alt: null, width: 1200, height: 900 }],
    href: '/app/dimen/i1',
    ...over,
  });

/** Answer /me, log every write to a post, and toggle a like the way the server does. */
function serve(): { calls: string[] } {
  const calls: string[] = [];
  let liked = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/me')) return jsonResponse(200, { user: ME });
      const path = url.slice(url.indexOf('/', 8));
      // only what is done to posts; the app's own heartbeat is not this card's
      if (method !== 'GET' && !path.startsWith('/me')) calls.push(`${method} ${path}`);
      if (url.includes('/like')) {
        liked = !liked;
        return jsonResponse(200, { on: liked, engagement: engagement({ likes: liked ? 1 : 0, liked }) });
      }
      return jsonResponse(200, {});
    }),
  );
  return { calls };
}

/** A card that keeps what the server answers, the way the wall does. */
function Live({ start, onRemoved }: { start: FeedItem; onRemoved?: () => void }): React.JSX.Element {
  const [it, setIt] = useState(start);
  return <FeedCard item={it} onChanged={setIt} onRemoved={onRemoved} />;
}

describe('FeedCard', () => {
  it('reads in the wall’s order: who, the picture, the actions, the caption, the comments, when', async () => {
    renderApp(<FeedCard item={picture({ commentCount: 5 })} />);
    const post = screen.getByRole('article');
    const order = [...post.querySelectorAll('.fcard-head, .fcard-media, .fcard-actions, .fcard-caption, .fcard-comments, .fcard-when')].map(
      (el) => el.className.split(' ')[0],
    );
    expect(order).toEqual(['fcard-head', 'fcard-media', 'fcard-actions', 'fcard-caption', 'fcard-comments', 'fcard-when']);
    // the kind is a quiet line under the name, and the time is said in words
    expect(within(post).getByText('Photo')).toHaveClass('fcard-kind');
    expect(within(post).getByText('2 days ago')).toBeInTheDocument();
  });

  it('shows each count beside its icon', async () => {
    renderApp(<FeedCard item={item({ commentCount: 12, engagement: engagement({ likes: 1234, reposts: 3 }) })} />);
    const like = screen.getByRole('button', { name: 'Sign in to like' });
    expect(like.querySelector('svg')).not.toBeNull();
    expect(like.querySelector('.fcard-count')?.textContent).toBe('1,234');
    expect(screen.getByRole('link', { name: '12 comments' }).querySelector('.fcard-count')?.textContent).toBe('12');
    expect(screen.getByRole('button', { name: 'Sign in to repost' }).querySelector('.fcard-count')?.textContent).toBe('3');
  });

  it('likes, then takes the like back', async () => {
    signIn();
    const { calls } = serve();
    renderApp(<Live start={item()} />);

    const like = await screen.findByRole('button', { name: 'Like' });
    await waitFor(() => expect(like).toBeEnabled());
    await userEvent.click(like);
    const unlike = await screen.findByRole('button', { name: 'Unlike (1)' });
    expect(unlike).toHaveAttribute('aria-pressed', 'true');
    expect(unlike).toHaveClass('is-on');

    await userEvent.click(unlike);
    expect(await screen.findByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'false');
    expect(calls).toEqual(['POST /posts/library/s1/like', 'POST /posts/library/s1/like']);
  });

  it('likes a picture post on a double click, with a heart over the picture — and never unlikes it that way', async () => {
    signIn();
    const { calls } = serve();
    renderApp(<Live start={picture()} />);

    const open = await screen.findByRole('button', { name: 'Open picture 1 of 1' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Like' })).toBeEnabled());
    await userEvent.dblClick(open);
    expect(await screen.findByRole('button', { name: 'Unlike (1)' })).toBeInTheDocument();
    expect(document.querySelector('.fcard-heart-pop')).not.toBeNull();
    // two clicks are a like, not a request to open the picture
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.dblClick(open);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole('button', { name: 'Unlike (1)' })).toBeInTheDocument();
    expect(calls).toEqual(['POST /posts/image/i1/like']);
  });

  it('still opens the picture on one click', async () => {
    renderApp(<FeedCard item={picture()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open picture 1 of 1' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('links to the comments when there are any, and says how many', () => {
    const { unmount } = renderApp(<FeedCard item={picture({ commentCount: 7 })} />);
    expect(screen.getByRole('link', { name: 'View all 7 comments' })).toHaveAttribute('href', '/app/dimen/i1');
    unmount();

    const once = renderApp(<FeedCard item={picture({ commentCount: 1 })} />);
    expect(screen.getByRole('link', { name: 'View 1 comment' })).toBeInTheDocument();
    once.unmount();

    renderApp(<FeedCard item={picture({ commentCount: 0 })} />);
    expect(screen.queryByText(/View/)).not.toBeInTheDocument();
  });

  it('keeps Report in the ⋯ for somebody else’s post, out of the row of actions', async () => {
    signIn();
    serve();
    renderApp(<FeedCard item={item()} />);

    const more = await screen.findByRole('button', { name: 'More about this post' });
    expect(more.closest('.fcard-head')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Report' }));
    expect(screen.getByRole('dialog', { name: 'Report this post' })).toBeInTheDocument();
  });

  it('deletes your own post from the ⋯, asking once more first', async () => {
    signIn();
    const { calls } = serve();
    const removed = vi.fn();
    renderApp(<Live start={item({ author: { id: ME.id, username: ME.username, avatarUrl: null } })} onRemoved={removed} />);

    await userEvent.click(await screen.findByRole('button', { name: 'More about this post' }));
    expect(screen.queryByRole('menuitem', { name: 'Report' })).not.toBeInTheDocument();
    const del = screen.getByRole('menuitem', { name: 'Delete this post' });
    await userEvent.click(del);
    expect(calls).toEqual([]);
    expect(del.textContent).toBe('Delete?');
    await userEvent.click(del);
    await waitFor(() => expect(removed).toHaveBeenCalled());
    expect(calls).toEqual(['DELETE /library/posts/s1']);
  });

  it('gives a guest no ⋯ at all', () => {
    renderApp(<FeedCard item={item()} />);
    expect(screen.queryByRole('button', { name: 'More about this post' })).not.toBeInTheDocument();
  });

  it('has no row of emoji reactions: the heart is the only one', () => {
    renderApp(<FeedCard item={picture()} />);
    expect(screen.queryByRole('group', { name: 'Reactions' })).not.toBeInTheDocument();
    expect(document.querySelector('.reaction, .reactions')).toBeNull();
  });
});
