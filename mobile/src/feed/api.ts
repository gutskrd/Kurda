import { DEFAULT_FEED_PERIOD, DEFAULT_FEED_SORT, sortRanks, type FeedPeriod, type FeedSort } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import type { EngagementKind, FeedItem, FeedSection, PostEngagement } from './types';

export interface FeedQuery {
  section?: FeedSection;
  kind?: string | null;
  /** Newest first unless asked. */
  sort?: FeedSort;
  /** How far back a ranked order looks. */
  period?: FeedPeriod;
  limit?: number;
  offset?: number;
}

function query(q: FeedQuery): string {
  const p = new URLSearchParams();
  if (q.section) p.set('section', q.section);
  if (q.kind) p.set('kind', q.kind);
  // Only what differs from how the wall opens: the plain wall asks the plain question.
  if (q.sort && q.sort !== DEFAULT_FEED_SORT) p.set('sort', q.sort);
  if (q.sort && sortRanks(q.sort) && q.period && q.period !== DEFAULT_FEED_PERIOD) p.set('period', q.period);
  if (q.limit != null) p.set('limit', String(q.limit));
  if (q.offset != null) p.set('offset', String(q.offset));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** One page of the wall, from the same `/feed` the web app reads, so written posts and pictures share one wall. */
export const getFeed = (client: ApiClient, q: FeedQuery = {}): Promise<ApiResult<{ items: FeedItem[] }>> =>
  client.get(`/feed${query(q)}`);

/**
 * Where a shared link points. The web derives it from `window.location.origin`; a phone has none, so it is named.
 * It must be the real site, which writes the post's title, author and picture into the page head so the link
 * unfurls wherever it is pasted.
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
 * Like, save or repost as one toggle; a second press undoes it. The server answers with fresh totals, which keeps
 * counts right when others act meanwhile.
 */
export const toggleEngagement = (
  client: ApiClient,
  item: Pick<FeedItem, 'targetType' | 'id'>,
  kind: EngagementKind,
): Promise<ApiResult<{ on: boolean; engagement: PostEngagement }>> =>
  client.post(`/posts/${item.targetType}/${item.id}/${kind}`);

/**
 * Delete your own post, written or a picture, as the web card does. The server checks ownership; the app only
 * decides whether to offer it.
 */
export const deletePost = (client: ApiClient, item: Pick<FeedItem, 'targetType' | 'id'>): Promise<ApiResult<unknown>> =>
  client.delete(item.targetType === 'image' ? `/images/${item.id}` : `/library/posts/${item.id}`);

/** The posts you bookmarked. Yours alone — the server scopes it to you. */
export const getSaved = (
  client: ApiClient,
  opts: { limit?: number; offset?: number } = {},
): Promise<ApiResult<{ items: FeedItem[] }>> =>
  client.get(`/me/saved${query({ limit: opts.limit, offset: opts.offset })}`);
