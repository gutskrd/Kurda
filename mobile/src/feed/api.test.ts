import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../api/client';
import { SITE_ORIGIN, getFeed, getSaved, postUrl, toggleEngagement } from './api';

/** Enough of the client to record what a call asked for. */
function spyClient(): { client: ApiClient; get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> } {
  const get = vi.fn().mockResolvedValue({ ok: true, data: {} });
  const post = vi.fn().mockResolvedValue({ ok: true, data: {} });
  return { client: { get, post } as unknown as ApiClient, get, post };
}

describe('the wall’s calls', () => {
  it('asks for one page of the feed, and leaves out what was not chosen', async () => {
    const { client, get } = spyClient();
    await getFeed(client, { section: 'gotin', kind: 'helbest', limit: 20, offset: 40 });
    expect(get).toHaveBeenCalledWith('/feed?section=gotin&kind=helbest&limit=20&offset=40');

    // a null kind is "no kind", not `kind=null` — the server would refuse that
    await getFeed(client, { section: 'all', kind: null });
    expect(get).toHaveBeenLastCalledWith('/feed?section=all');

    await getFeed(client);
    expect(get).toHaveBeenLastCalledWith('/feed');
  });

  it('toggles against the post it was given, on either half of the wall', async () => {
    const { client, post } = spyClient();
    await toggleEngagement(client, { targetType: 'library', id: 'abc' }, 'like');
    expect(post).toHaveBeenCalledWith('/posts/library/abc/like');

    await toggleEngagement(client, { targetType: 'image', id: 'xyz' }, 'bookmark');
    expect(post).toHaveBeenLastCalledWith('/posts/image/xyz/bookmark');

    await toggleEngagement(client, { targetType: 'library', id: 'abc' }, 'repost');
    expect(post).toHaveBeenLastCalledWith('/posts/library/abc/repost');
  });

  it('pages the saved list', async () => {
    const { client, get } = spyClient();
    await getSaved(client, { limit: 20, offset: 20 });
    expect(get).toHaveBeenCalledWith('/me/saved?limit=20&offset=20');
  });

  /**
   * A shared link has to be absolute and has to point at the real site: that is
   * the host whose Worker writes the post's title, author and picture into the
   * page head, which is the whole reason a pasted link unfurls into something
   * worth tapping.
   */
  it('shares an absolute link to the site, not a bare path', () => {
    expect(postUrl({ href: '/app/library/123' })).toBe(`${SITE_ORIGIN}/app/library/123`);
    expect(postUrl({ href: '/app/dimen/456' })).toMatch(/^https:\/\//);
  });
});
