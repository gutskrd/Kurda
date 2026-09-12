import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import type { FeedItem, FeedSection } from './types';

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
