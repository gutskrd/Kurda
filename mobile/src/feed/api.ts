import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import type { EngagementKind, FeedItem, FeedSection, PostEngagement } from './types';

export interface FeedQuery {
  section?: FeedSection;
  kind?: string | null;
  limit?: number;
  offset?: number;
}

function query(q: FeedQuery): string {
  const p = new URLSearchParams();
  if (q.section) p.set('section', q.section);
  if (q.kind) p.set('kind', q.kind);
  if (q.limit != null) p.set('limit', String(q.limit));
  if (q.offset != null) p.set('offset', String(q.offset));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * One page of the wall.
 *
 * The same `/feed` the web app reads, rather than `/library/posts` and the
 * image endpoints separately — which is the whole point: a poem posted this
 * morning was invisible to anyone on the meme feed, and the two screens were
 * the same screen twice.
 */
export const getFeed = (client: ApiClient, q: FeedQuery = {}): Promise<ApiResult<{ items: FeedItem[] }>> =>
  client.get(`/feed${query(q)}`);

/**
 * Where a shared link points.
 *
 * The web derives this from `window.location.origin`; a phone has no such
 * thing, so it is named. It matters that it is the real site: a link to
 * mykurda.com goes through the Worker that writes the post's own title, author
 * and picture into the page head, so it unfurls properly wherever it is pasted.
 */
export const SITE_ORIGIN = 'https://mykurda.com';

/** The absolute URL of a post — a share target is somewhere else, so it needs the origin. */
export const postUrl = (item: Pick<FeedItem, 'href'>): string => `${SITE_ORIGIN}${item.href}`;

/**
 * Like / save / repost, as one toggle.
 *
 * A second press is how somebody takes it back, and the server decides what the
 * state actually was — it answers with the fresh totals, which is what keeps
 * the count right when somebody else liked it while this screen was open.
 */
export const toggleEngagement = (
  client: ApiClient,
  item: Pick<FeedItem, 'targetType' | 'id'>,
  kind: EngagementKind,
): Promise<ApiResult<{ on: boolean; engagement: PostEngagement }>> =>
  client.post(`/posts/${item.targetType}/${item.id}/${kind}`);

/** The posts you bookmarked. Yours alone — the server scopes it to you. */
export const getSaved = (
  client: ApiClient,
  opts: { limit?: number; offset?: number } = {},
): Promise<ApiResult<{ items: FeedItem[] }>> =>
  client.get(`/me/saved${query({ limit: opts.limit, offset: opts.offset })}`);
