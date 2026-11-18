import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../api/client';
import { SITE_ORIGIN, getFeed, getSaved, postUrl, setEngagement } from './api';

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

    // A null kind is "no kind", not `kind=null` — the server would refuse that.
    await getFeed(client, { section: 'all', kind: null });
    expect(get).toHaveBeenLastCalledWith('/feed?section=all');

    await getFeed(client);
    expect(get).toHaveBeenLastCalledWith('/feed');
  });

  it('sets the wanted state on the post it was given, on either half of the wall', async () => {
    const { client, post } = spyClient();
    await setEngagement(client, { targetType: 'library', id: 'abc' }, 'like', true);
    expect(post).toHaveBeenCalledWith('/posts/library/abc/like', { on: true });

    await setEngagement(client, { targetType: 'image', id: 'xyz' }, 'bookmark', false);
    expect(post).toHaveBeenLastCalledWith('/posts/image/xyz/bookmark', { on: false });

    await setEngagement(client, { targetType: 'library', id: 'abc' }, 'repost', true);
    expect(post).toHaveBeenLastCalledWith('/posts/library/abc/repost', { on: true });
  });

  it('pages the saved list', async () => {
    const { client, get } = spyClient();
    await getSaved(client, { limit: 20, offset: 20 });
    expect(get).toHaveBeenCalledWith('/me/saved?limit=20&offset=20');
  });

  /**
   * A shared link must be absolute and point at the real site, which writes the post's title, author and picture
   * into the page head so a pasted link unfurls.
   */
  it('shares an absolute link to the site, not a bare path', () => {
    expect(postUrl({ href: '/app/library/123' })).toBe(`${SITE_ORIGIN}/app/library/123`);
    expect(postUrl({ href: '/app/dimen/456' })).toMatch(/^https:\/\//);
  });
});
