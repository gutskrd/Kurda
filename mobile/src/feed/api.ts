import { DEFAULT_FEED_PERIOD, DEFAULT_FEED_SORT, sortRanks, type FeedPeriod, type FeedSort } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import type { EngagementKind, FeedItem, FeedSection, PostEngagement } from './types';

export interface FeedQuery {
  section?: FeedSection;
  kind?: string | null;
  /** newest first unless asked */
  sort?: FeedSort;
  /** how far back a ranked order looks */
  period?: FeedPeriod;
  limit?: number;
  offset?: number;
}

function query(q: FeedQuery): string {
  const p = new URLSearchParams();
  if (q.section) p.set('section', q.section);
  if (q.kind) p.set('kind', q.kind);
  // only what differs from how the wall opens: the plain wall asks the plain question
  if (q.sort && q.sort !== DEFAULT_FEED_SORT) p.set('sort', q.sort);
  if (q.sort && sortRanks(q.sort) && q.period && q.period !== DEFAULT_FEED_PERIOD) p.set('period', q.period);
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
 * hevalo.app goes through the Worker that writes the post's own title, author
 * and picture into the page head, so it unfurls properly wherever it is pasted.
 */
export const SITE_ORIGIN = 'https://hevalo.app';

/** The absolute URL of a post — a share target is somewhere else, so it needs the origin. */
export const postUrl = (item: Pick<FeedItem, 'href'>): string => `${SITE_ORIGIN}${item.href}`;

/** One post's likes, reposts and saves, and your part in them: what its own page shows under it. */
export const getEngagement = (
  client: ApiClient,
  item: Pick<FeedItem, 'targetType' | 'id'>,
): Promise<ApiResult<{ engagement: PostEngagement }>> => client.get(`/posts/${item.targetType}/${item.id}/engagement`);

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

/**
 * Delete your own post, written or a picture — the calls the website's card
 * makes. The server checks it is yours; the app only decides whether to offer.
 */
export const deletePost = (client: ApiClient, item: Pick<FeedItem, 'targetType' | 'id'>): Promise<ApiResult<unknown>> =>
  client.delete(item.targetType === 'image' ? `/images/${item.id}` : `/library/posts/${item.id}`);

/** The posts you bookmarked. Yours alone — the server scopes it to you. */
export const getSaved = (
  client: ApiClient,
  opts: { limit?: number; offset?: number } = {},
): Promise<ApiResult<{ items: FeedItem[] }>> =>
  client.get(`/me/saved${query({ limit: opts.limit, offset: opts.offset })}`);
