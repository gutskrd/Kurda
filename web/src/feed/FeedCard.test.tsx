import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { jsonResponse, renderApp } from '../test/utils';
import type { FeedItem } from '../lib/types';
import { FeedCard, shortCount } from './FeedCard';
import { onNotice } from '../lib/notice';

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

/** Answers /me, logs every write to a post, and sets a like to the state asked for, as the server does. */
function serve(): { calls: string[] } {
  const calls: string[] = [];
  let liked = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/me')) return jsonResponse(200, { user: ME });
      const path = url.slice(url.indexOf('/', 8));
      // Only writes to posts; the app's presence heartbeat is not this card's.
      if (method !== 'GET' && !path.startsWith('/me')) calls.push(`${method} ${path}`);
      if (url.includes('/like')) {
        liked = (JSON.parse(String(init?.body)) as { on: boolean }).on;
        return jsonResponse(200, { on: liked, engagement: engagement({ likes: liked ? 1 : 0, liked }) });
      }
      return jsonResponse(200, {});
    }),
  );
  return { calls };
}

/** A card that keeps what the server answers, as the wall does. */
function Live({ start, onRemoved }: { start: FeedItem; onRemoved?: () => void }): React.JSX.Element {
  const [it, setIt] = useState(start);
  return <FeedCard item={it} onChanged={setIt} onRemoved={onRemoved} />;
}

describe('FeedCard', () => {
  it('reads as a list: one line of who, what and when, then the words, then the picture, then the actions', () => {
    renderApp(<FeedCard item={picture({ title: 'Zozan', commentCount: 5 })} />);
    const post = screen.getByRole('article');
    const order = [...post.querySelectorAll('.fcard-head, .fcard-body, .fcard-media, .fcard-actions')].map((el) => el.className.split(' ')[0]);
    expect(order).toEqual(['fcard-head', 'fcard-body', 'fcard-media', 'fcard-actions']);
    // The kind and age share the name's line in the header.
    const head = post.querySelector('.fcard-head')!;
    expect(within(head as HTMLElement).getByText('Photo')).toHaveClass('fcard-kind');
    const when = within(head as HTMLElement).getByText('2d ago');
    expect(when.tagName).toBe('TIME');
    expect(when).toHaveAttribute('dateTime');
    // A picture's words are above it as title and text, not a caption below.
    expect(within(post).getByRole('heading', { name: 'Zozan' })).toBeInTheDocument();
    expect(post.querySelector('.fcard-body')).toHaveAttribute('href', '/app/dimen/i1');
    expect(post.querySelector('.fcard-caption, .fcard-comments')).toBeNull();
    expect(post.querySelectorAll('time')).toHaveLength(1);
  });

  it('says how long ago briefly in the first week, and the date after it', () => {
    const { unmount } = renderApp(<FeedCard item={item({ at: new Date(Date.now() - 42 * 60 * 1000).toISOString() })} />);
    expect(screen.getByText('42m ago')).toBeInTheDocument();
    unmount();
    renderApp(<FeedCard item={item({ at: '2020-03-21T10:00:00Z' })} />);
    expect(document.querySelector('.fcard-when')?.textContent).toMatch(/2020/);
  });

  it('puts what is counted in pills at the start, and share and save at the end', () => {
    renderApp(<FeedCard item={item({ commentCount: 4, engagement: engagement({ likes: 18 }) })} />);
    const row = document.querySelector('.fcard-actions')!;
    const names = [...row.querySelectorAll('.fcard-act')].map((el) => el.getAttribute('aria-label'));
    expect(names).toEqual(['Sign in to like', '4 comments', 'Sign in to repost', 'Share this post', 'Sign in to save']);
    // An unreposted post shows no repost count; share and save never have one.
    expect(screen.getByRole('button', { name: 'Sign in to repost' }).querySelector('.fcard-count')).toBeNull();
    expect(screen.getByRole('button', { name: 'Share this post' }).querySelector('.fcard-count')).toBeNull();
    // The comment pill links to the comments; there is no separate line for them.
    expect(screen.getByRole('link', { name: '4 comments' })).toHaveAttribute('href', '/app/library/s1');
    expect(screen.queryByText(/View/)).not.toBeInTheDocument();
  });

  it('keeps a big count short enough for its pill', () => {
    expect(shortCount(1495, 'en')).toBe('1,495');
    expect(shortCount(12_345, 'en')).toBe('12.3K');
    expect(shortCount(2_400_000, 'en')).toBe('2.4M');
  });

  it('shows what is yours: a red heart, a green repost, a filled bookmark', async () => {
    signIn();
    serve();
    renderApp(<FeedCard item={item({ engagement: engagement({ likes: 2, reposts: 1, liked: true, reposted: true, bookmarked: true }) })} />);
    const like = await screen.findByRole('button', { name: 'Unlike (2)' });
    expect(like).toHaveClass('fcard-like', 'is-on');
    expect(screen.getByRole('button', { name: 'Undo repost (1)' })).toHaveClass('fcard-repost', 'is-on');
    expect(screen.getByRole('button', { name: 'Remove from saved' })).toHaveClass('fcard-save', 'is-on');
  });

  it('draws the post whole on its own page, with no line under it', () => {
    renderApp(<FeedCard item={item()} onPage={{ onComment: () => {} }} />);
    const post = screen.getByRole('article');
    expect(post).toHaveClass('is-page');
    // The words do not link to the page the reader is already on.
    expect(post.querySelector('a.fcard-body')).toBeNull();
    expect(post.querySelector('.fcard-body')).not.toBeNull();
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

  it('likes at once, and takes the like back with the reason when the server refuses', async () => {
    signIn();
    let answer!: (res: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/me')) return jsonResponse(200, { user: ME });
        if (init?.method === 'POST' && url.includes('/like')) return new Promise<Response>((r) => (answer = r));
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Live start={item()} />);

    const like = await screen.findByRole('button', { name: 'Like' });
    await waitFor(() => expect(like).toBeEnabled());
    await userEvent.click(like);
    // Red, and counted, before the server has said anything.
    expect(screen.getByRole('button', { name: 'Unlike (1)' })).toHaveAttribute('aria-pressed', 'true');
    answer(jsonResponse(503, {}));
    expect(await screen.findByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('Something went wrong on our end. Please try again shortly.');
  });

  it('ends quick presses on the heart in the last one, one request at a time', async () => {
    signIn();
    const sent: Array<{ on: boolean; answer: (res: Response) => void }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/me')) return jsonResponse(200, { user: ME });
        if (init?.method === 'POST' && url.includes('/like')) {
          const { on } = JSON.parse(String(init.body)) as { on: boolean };
          return new Promise<Response>((answer) => sent.push({ on, answer }));
        }
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Live start={item()} />);

    const like = await screen.findByRole('button', { name: 'Like' });
    await waitFor(() => expect(like).toBeEnabled());
    await userEvent.click(like);
    await userEvent.click(screen.getByRole('button', { name: 'Unlike (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Like' }));
    await userEvent.click(screen.getByRole('button', { name: 'Unlike (1)' }));
    expect(screen.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'false');
    expect(sent.map((s) => s.on)).toEqual([true]);
    sent[0]!.answer(jsonResponse(200, { on: true, engagement: engagement({ likes: 1, liked: true }) }));
    await waitFor(() => expect(sent.map((s) => s.on)).toEqual([true, false]));
    sent[1]!.answer(jsonResponse(200, { on: false, engagement: engagement() }));
    expect(await screen.findByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'false');
    expect(sent).toHaveLength(2);
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
    // A double click likes rather than opening the picture.
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

  it('takes your post away at once, and puts it back in its place if the server keeps it', async () => {
    signIn();
    const notices: string[] = [];
    const stop = onNotice((text) => notices.push(text));
    let answer!: (res: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/me')) return jsonResponse(200, { user: ME });
        if (init?.method === 'DELETE') return new Promise<Response>((r) => (answer = r));
        return jsonResponse(200, {});
      }),
    );
    const removed = vi.fn();
    renderApp(<Live start={item({ author: { id: ME.id, username: ME.username, avatarUrl: null } })} onRemoved={removed} />);

    await userEvent.click(await screen.findByRole('button', { name: 'More about this post' }));
    const del = screen.getByRole('menuitem', { name: 'Delete this post' });
    await userEvent.click(del);
    await userEvent.click(del);
    expect(screen.queryByText('Çîroka min')).not.toBeInTheDocument();
    answer(jsonResponse(503, {}));
    expect(await screen.findByText('Çîroka min')).toBeInTheDocument();
    expect(removed).not.toHaveBeenCalled();
    expect(notices).toHaveLength(1);
    stop();
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

describe('a post whose picture is still being checked', () => {
  const mine = { id: ME.id, username: ME.username, avatarUrl: null };

  it('tells its author calmly that only they can see it, and offers no way to pass it on', async () => {
    signIn();
    serve();
    renderApp(<FeedCard item={picture({ author: mine, review: 'held' })} />);

    expect(await screen.findByText('Being checked')).toBeInTheDocument();
    expect(screen.getByText('Only you can see this until it’s checked. It usually takes a few hours.')).toBeInTheDocument();
    // Nobody else can open it yet, so it is neither reposted nor shared.
    expect(screen.queryByRole('button', { name: 'Share this post' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /repost/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Like' })).toBeInTheDocument();
  });

  it('says nothing of it to anyone but the author', async () => {
    signIn();
    serve();
    renderApp(<FeedCard item={picture({ review: 'held' })} />);
    await screen.findByRole('button', { name: 'More about this post' });
    expect(screen.queryByText('Being checked')).not.toBeInTheDocument();
    expect(screen.queryByText(/Only you can see this/)).not.toBeInTheDocument();
  });

  it('shares as usual once it is clear', async () => {
    signIn();
    serve();
    renderApp(<FeedCard item={picture({ author: mine })} />);
    expect(await screen.findByRole('button', { name: 'Share this post' })).toBeInTheDocument();
    expect(screen.queryByText('Being checked')).not.toBeInTheDocument();
  });
});
