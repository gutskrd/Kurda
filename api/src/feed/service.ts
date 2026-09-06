import type pg from 'pg';
import type { PublicUrl } from '../cosmetics/access.js';
import { loadAuthors, unknownAuthor, type Author } from '../social/authors.js';
import { EngagementService, NO_ENGAGEMENT, type Engagement, type TargetType } from '../social/engagement-service.js';

/**
 * One wall for everything the community writes and posts.
 *
 * Stories, poems and pictures lived on three pages that were the same page three
 * times — same authors, same comments, same shape of card. Merging them is not
 * only tidier to look at: a poem posted this morning was invisible to anyone who
 * happened to be browsing pictures.
 */

/** What a card can be. `all` is the unfiltered wall. */
export const FEED_KINDS = ['all', 'stories', 'poems', 'images'] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export function isFeedKind(v: string): v is FeedKind {
  return (FEED_KINDS as readonly string[]).includes(v);
}

export interface FeedItem {
  /** unique across both tables, since two ids could collide in principle */
  key: string;
  targetType: TargetType;
  id: string;
  kind: 'story' | 'poem' | 'image' | 'meme';
  author: Author;
  /** stories and poems have one; a picture's caption is its body */
  title: string | null;
  /** the text, trimmed for a card — the full thing lives on the post's page */
  excerpt: string | null;
  imageUrl: string | null;
  href: string;
  viewCount: number;
  commentCount: number;
  engagement: Engagement;
  at: Date;
}

interface FeedRow {
  source: TargetType;
  id: string;
  author_id: string;
  subtype: string;
  title: string | null;
  body: string | null;
  media: string | null;
  at: Date;
  view_count: number;
  comment_count: number;
}

/**
 * Both tables, one shape, one ordering.
 *
 * A UNION rather than two queries merged in JavaScript: paging a merge done in
 * the client means over-fetching both sides to be sure of the boundary, and
 * getting it subtly wrong the first time someone posts two things in the same
 * second.
 */
const FEED_SQL = `
  SELECT source, id, author_id, subtype, title, body, media, at, view_count, comment_count FROM (
    SELECT 'library' AS source, l.id, l.author_id, l.type AS subtype, l.title, l.body,
           NULL::text AS media, COALESCE(l.published_at, l.created_at) AS at,
           l.view_count, l.comment_count
      FROM library_posts l
     WHERE l.status = 'published' AND ($1 = 'all' OR $1 = l.type || 's')
    UNION ALL
    SELECT 'image', i.id, i.author_id, i.category, NULL, i.caption,
           i.image_media_id, i.created_at, i.view_count, i.comment_count
      FROM image_posts i
     WHERE i.status = 'published' AND ($1 = 'all' OR $1 = 'images')
  ) AS wall
  ORDER BY at DESC, id DESC
  LIMIT $2 OFFSET $3`;

/**
 * The same shape as the wall, for a known set of posts.
 *
 * Saved posts arrive as pointers with no ordering the database can apply, so
 * this fetches them and the caller puts them back in the order they were saved.
 */
const BY_IDS_SQL = `
  SELECT source, id, author_id, subtype, title, body, media, at, view_count, comment_count FROM (
    SELECT 'library' AS source, l.id, l.author_id, l.type AS subtype, l.title, l.body,
           NULL::text AS media, COALESCE(l.published_at, l.created_at) AS at,
           l.view_count, l.comment_count
      FROM library_posts l
     WHERE l.status = 'published' AND l.id = ANY($1)
    UNION ALL
    SELECT 'image', i.id, i.author_id, i.category, NULL, i.caption,
           i.image_media_id, i.created_at, i.view_count, i.comment_count
      FROM image_posts i
     WHERE i.status = 'published' AND i.id = ANY($2)
  ) AS chosen`;

/** Enough of a post to fill a card; the rest is on the post's own page. */
const EXCERPT_CHARS = 240;

export class FeedService {
  private readonly engagement: EngagementService;

  constructor(private readonly pool: pg.Pool) {
    this.engagement = new EngagementService(pool);
  }

  async list(
    viewerId: string | null,
    opts: { kind?: FeedKind; limit?: number; offset?: number; publicUrl?: PublicUrl } = {},
  ): Promise<FeedItem[]> {
    const kind = opts.kind ?? 'all';
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const publicUrl = opts.publicUrl ?? (() => null);

    const rows = await this.pool.query<FeedRow>(FEED_SQL, [kind, limit, offset]);
    return this.hydrate(rows.rows, viewerId, publicUrl);
  }

  /**
   * What you have saved, most recently saved first.
   *
   * Always your own: someone else's reading list is theirs, and the profile tab
   * already covers what they have chosen to show. Posts that have since been
   * removed simply drop out rather than leaving holes.
   */
  async saved(
    userId: string,
    opts: { limit?: number; offset?: number; publicUrl?: PublicUrl } = {},
  ): Promise<FeedItem[]> {
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const publicUrl = opts.publicUrl ?? (() => null);

    const refs = await this.engagement.listFor(userId, 'bookmark', limit, offset);
    if (refs.length === 0) return [];

    const rows = await this.pool.query<FeedRow>(BY_IDS_SQL, [
      refs.filter((r) => r.targetType === 'library').map((r) => r.targetId),
      refs.filter((r) => r.targetType === 'image').map((r) => r.targetId),
    ]);

    const items = await this.hydrate(rows.rows, userId, publicUrl);
    // the database cannot order by when you saved something, so the pointers do
    const byKey = new Map(items.map((i) => [i.key, i]));
    return refs
      .map((r) => byKey.get(`${r.targetType}:${r.targetId}`))
      .filter((i): i is FeedItem => i !== undefined);
  }

  /** Attach authors and engagement to a page of rows, in three lookups. */
  private async hydrate(rows: FeedRow[], viewerId: string | null, publicUrl: PublicUrl): Promise<FeedItem[]> {
    if (rows.length === 0) return [];

    // three lookups for the whole page, not three per card
    const [authors, libraryEngagement, imageEngagement] = await Promise.all([
      loadAuthors(this.pool, rows.map((r) => r.author_id), publicUrl),
      this.engagement.forPosts(viewerId, 'library', rows.filter((r) => r.source === 'library').map((r) => r.id)),
      this.engagement.forPosts(viewerId, 'image', rows.filter((r) => r.source === 'image').map((r) => r.id)),
    ]);

    return rows.map((r) => {
      const isImage = r.source === 'image';
      const engagement = (isImage ? imageEngagement : libraryEngagement).get(r.id) ?? { ...NO_ENGAGEMENT };
      return {
        key: `${r.source}:${r.id}`,
        targetType: r.source,
        id: r.id,
        kind: r.subtype as FeedItem['kind'],
        author: authors.get(r.author_id) ?? unknownAuthor(r.author_id),
        title: r.title,
        excerpt: excerpt(r.body),
        imageUrl: r.media ? publicUrl(r.media) : null,
        href: isImage ? `/app/dimen/${r.id}` : `/app/library/${r.id}`,
        viewCount: r.view_count,
        commentCount: r.comment_count,
        engagement,
        at: r.at,
      };
    });
  }
}

function excerpt(body: string | null): string | null {
  if (!body) return null;
  const clean = body.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return null;
  return clean.length > EXCERPT_CHARS ? `${clean.slice(0, EXCERPT_CHARS).trimEnd()}…` : clean;
}
