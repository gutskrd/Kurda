import type pg from 'pg';
import { FEED_PERIOD_DAYS, sortRanks, type FeedImage, type FeedPeriod, type FeedSort } from '@kurda/shared';
import type { PublicUrl } from '../cosmetics/access.js';
import { loadAuthors, unknownAuthor, type Author } from '../social/authors.js';
import { writtenForSql } from '../users/age.js';
import { notBlockedSql } from '../friends/blocked.js';
import {
  EngagementService,
  NO_ENGAGEMENT,
  type Engagement,
  type EngagementKind,
  type TargetType,
} from '../social/engagement-service.js';

/**
 * One wall for stories, poems and pictures. Every query applies the library's rule that what a minor posts is shown
 * only to them and their friends (users/age.ts `writtenForSql`), since a byline on any card would be a way to find
 * a minor, and hides anything by someone with a block between them and the reader, in either direction
 * (friends/blocked.ts).
 */

/**
 * The wall's two halves and their kinds. Gotin is what people write and Dîmen what they photograph or make; pick a
 * half, then narrow it, with `all` meaning no narrowing at either level. The halves are about what a post has, not
 * its table: Gotin is posts with words (a meme's words are its caption, so not memes), Dîmen is posts with pictures,
 * and a photo with a paragraph is in both. Photos (wene) are pictured posts not marked as memes; Memes (mim) are.
 */
export const FEED_SECTIONS = ['all', 'gotin', 'dimen'] as const;
export type FeedSection = (typeof FEED_SECTIONS)[number];

/** The written kinds, and the picture kinds, as the database stores them. */
const GOTIN_KINDS = { gotin: 'gotin', cirok: 'story', helbest: 'poem' } as const;
const DIMEN_KINDS = { wene: 'image', mim: 'meme' } as const;

export const FEED_KINDS = ['all', ...Object.keys(GOTIN_KINDS), ...Object.keys(DIMEN_KINDS)] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export function isFeedSection(v: string): v is FeedSection {
  return (FEED_SECTIONS as readonly string[]).includes(v);
}
export function isFeedKind(v: string): v is FeedKind {
  return (FEED_KINDS as readonly string[]).includes(v);
}

/**
 * Which half a kind belongs to and its database name. A kind implies its half, so helbest inside Dîmen is reported
 * as a contradiction rather than an empty result.
 */
export function resolveKind(
  section: FeedSection,
  kind: FeedKind,
): { ok: true; section: FeedSection; dbType: string | null } | { ok: false } {
  if (kind === 'all') return { ok: true, section, dbType: null };

  const written = (GOTIN_KINDS as Record<string, string>)[kind];
  if (written) return section === 'dimen' ? { ok: false } : { ok: true, section: 'gotin', dbType: written };

  const pictured = (DIMEN_KINDS as Record<string, string>)[kind];
  if (pictured) return section === 'gotin' ? { ok: false } : { ok: true, section: 'dimen', dbType: pictured };

  return { ok: false };
}

export interface FeedItem {
  /** unique across both tables, since two ids could collide in principle */
  key: string;
  /** `library` for every new post, pictures or not — the installed apps open those already */
  targetType: TargetType;
  id: string;
  /** a written post's type, or an old picture post's category */
  kind: 'gotin' | 'story' | 'poem' | 'image' | 'meme';
  author: Author;
  /** stories and poems have one; a picture's caption is its body */
  title: string | null;
  /** the text, trimmed for a card — the full thing lives on the post's page */
  excerpt: string | null;
  /** The first picture, for apps installed before posts could have several. */
  imageUrl: string | null;
  /** the first picture's alt text — what a screen reader says for `imageUrl` */
  imageAlt: string | null;
  /** every picture, in order (at most four) */
  images: FeedImage[];
  /** marked as a meme: an old meme, or a written post with pictures marked so */
  meme: boolean;
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
  /** an old picture post's picture; a written post's are looked up per page */
  media: string | null;
  meme: boolean;
  at: Date;
  view_count: number;
  comment_count: number;
}

/** The columns every wall query selects, in its UNION's order. */
const COLUMNS = 'source, id, author_id, subtype, title, body, media, meme, at, view_count, comment_count';
const LIBRARY_COLUMNS = `'library' AS source, l.id, l.author_id, l.type AS subtype, l.title, l.body,
           NULL::text AS media, l.is_meme AS meme, COALESCE(l.published_at, l.created_at) AS at,
           l.view_count, l.comment_count`;
const IMAGE_COLUMNS = `'image', i.id, i.author_id, i.category, NULL, i.caption,
           i.image_media_id, i.category = 'meme', i.created_at, i.view_count, i.comment_count`;

/** A written post with at least one picture. */
const HAS_PICTURES = 'EXISTS (SELECT 1 FROM library_post_media pm WHERE pm.post_id = l.id)';

/** Each order's sort. All end on the post's time and id, so ties keep the same order on every page for offset paging. */
const ORDER: Record<FeedSort, string> = {
  newest: 'at DESC, id DESC',
  oldest: 'at ASC, id ASC',
  popular: 'score DESC, at DESC, id DESC',
  discussed: 'comment_count DESC, at DESC, id DESC',
};

/** "Most popular": hearts and reposts, one per person, plus comments; computed only when the wall is ranked by it. */
const POPULARITY = `(SELECT count(*) FROM post_engagements e
                      WHERE e.target_type = wall.source AND e.target_id = wall.id
                        AND e.kind IN ('like', 'repost'))::int + wall.comment_count`;

/**
 * The two time orders per table, as the wall indexes hold them (migration `wall-in-time-order`). Ordered by these,
 * each half of the wall reads no further than the page's end instead of sorting every post.
 */
const HALF_ORDER: Partial<Record<FeedSort, { library: string; image: string }>> = {
  newest: { library: 'COALESCE(l.published_at, l.created_at) DESC, l.id DESC', image: 'i.created_at DESC, i.id DESC' },
  oldest: { library: 'COALESCE(l.published_at, l.created_at) ASC, l.id ASC', image: 'i.created_at ASC, i.id ASC' },
};

/** One half of the wall, cut at the page's end when the wall is in time order; a ranked wall needs every row. */
const half = (select: string, order: string | undefined): string =>
  order ? `(${select}\n     ORDER BY ${order} LIMIT ($3::int + $4::int))` : select;

/**
 * Both tables in one shape and one ordering. A UNION, because paging a merge done in code needs over-fetching both
 * sides to find the boundary. The order is one of four fixed strings, and `$6` is how far back a ranked wall looks
 * (null for all time, and always for the time orders, whose halves are cut at the page's end).
 */
const feedSql = (sort: FeedSort): string => `
  SELECT ${COLUMNS} FROM (
    SELECT wall.*, ${sort === 'popular' ? POPULARITY : '0'} AS score FROM (
    ${half(`SELECT ${LIBRARY_COLUMNS}
      FROM library_posts l
     WHERE l.status = 'published'
       AND ($1 = 'all'
            -- the written half: words that are not a meme's caption, of one type if asked
            OR ($1 = 'gotin' AND l.body <> '' AND NOT l.is_meme AND ($2::text IS NULL OR l.type = $2))
            -- the pictured half: photos, or memes, or both
            OR ($1 = 'dimen' AND ${HAS_PICTURES} AND ($2::text IS NULL OR l.is_meme = ($2 = 'meme'))))
       AND ${writtenForSql('l.author_id', '$5::uuid')}
       AND ${notBlockedSql('l.author_id', '$5::uuid')}`, HALF_ORDER[sort]?.library)}
    UNION ALL
    ${half(`SELECT ${IMAGE_COLUMNS}
      FROM image_posts i
     WHERE i.status = 'published'
       AND ($1 = 'all' OR $1 = 'dimen')
       AND ($2::text IS NULL OR i.category = $2)
       AND ${writtenForSql('i.author_id', '$5::uuid')}
       AND ${notBlockedSql('i.author_id', '$5::uuid')}`, HALF_ORDER[sort]?.image)}
    ) AS wall
     WHERE ($6::timestamptz IS NULL OR wall.at >= $6::timestamptz)
  ) AS ranked
  ORDER BY ${Object.hasOwn(ORDER, sort) ? ORDER[sort] : ORDER.newest}
  LIMIT $3 OFFSET $4`;

/** The wall's shape for a known set of posts; the caller restores the order they were saved in. */
const BY_IDS_SQL = `
  SELECT ${COLUMNS} FROM (
    SELECT ${LIBRARY_COLUMNS}
      FROM library_posts l
     WHERE l.status = 'published' AND l.id = ANY($1) AND ${writtenForSql('l.author_id', '$3::uuid')}
       AND ${notBlockedSql('l.author_id', '$3::uuid')}
    UNION ALL
    SELECT ${IMAGE_COLUMNS}
      FROM image_posts i
     WHERE i.status = 'published' AND i.id = ANY($2) AND ${writtenForSql('i.author_id', '$3::uuid')}
       AND ${notBlockedSql('i.author_id', '$3::uuid')}
  ) AS chosen`;

/** Everything one person published, newest first, ordered and paged in SQL across both tables. */
const BY_AUTHOR_SQL = `
  SELECT ${COLUMNS} FROM (
    SELECT ${LIBRARY_COLUMNS}
      FROM library_posts l
     WHERE l.status = 'published' AND l.author_id = $1 AND ${writtenForSql('l.author_id', '$4::uuid')}
       AND ${notBlockedSql('l.author_id', '$4::uuid')}
    UNION ALL
    SELECT ${IMAGE_COLUMNS}
      FROM image_posts i
     WHERE i.status = 'published' AND i.author_id = $1 AND ${writtenForSql('i.author_id', '$4::uuid')}
       AND ${notBlockedSql('i.author_id', '$4::uuid')}
  ) AS mine
  ORDER BY at DESC, id DESC
  LIMIT $2 OFFSET $3`;

/** Enough of a post to fill a card; the rest is on the post's own page. */
const EXCERPT_CHARS = 240;

export class FeedService {
  private readonly engagement: EngagementService;

  constructor(private readonly pool: pg.Pool) {
    this.engagement = new EngagementService(pool);
  }

  async list(
    viewerId: string | null,
    opts: {
      section?: FeedSection;
      kind?: FeedKind;
      /** newest first unless asked otherwise */
      sort?: FeedSort;
      /** how far back a ranked wall looks; newest and oldest read everything */
      period?: FeedPeriod;
      limit?: number;
      offset?: number;
      publicUrl?: PublicUrl;
      /** for tests: the moment a range is counted back from */
      now?: Date;
    } = {},
  ): Promise<FeedItem[] | null> {
    const resolved = resolveKind(opts.section ?? 'all', opts.kind ?? 'all');
    // A kind that cannot be in the half asked for is a contradiction, not an empty wall.
    if (!resolved.ok) return null;

    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const publicUrl = opts.publicUrl ?? (() => null);

    const sort = opts.sort ?? 'newest';
    const period = sortRanks(sort) ? (opts.period ?? 'all') : 'all';
    const since = period === 'all' ? null : new Date((opts.now ?? new Date()).getTime() - FEED_PERIOD_DAYS[period] * 86_400_000);

    const rows = await this.pool.query<FeedRow>(feedSql(sort), [resolved.section, resolved.dbType, limit, offset, viewerId, since]);
    return this.hydrate(rows.rows, viewerId, publicUrl);
  }

  /** What you have saved, most recently saved first; posts since removed drop out. */
  async saved(
    userId: string,
    opts: { limit?: number; offset?: number; publicUrl?: PublicUrl } = {},
  ): Promise<FeedItem[]> {
    return this.engagedBy(userId, 'bookmark', { ...opts, viewerId: userId });
  }

  /**
   * The posts one person liked or saved, as whole posts. `viewerId` is who is looking, which differs from `userId` on
   * somebody else's profile tab: engagement is resolved for the viewer, so a heart shows whether you liked it.
   */
  async engagedBy(
    userId: string,
    kind: EngagementKind,
    opts: { limit?: number; offset?: number; publicUrl?: PublicUrl; viewerId?: string | null } = {},
  ): Promise<FeedItem[]> {
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const publicUrl = opts.publicUrl ?? (() => null);

    const refs = await this.engagement.listFor(userId, kind, limit, offset);
    if (refs.length === 0) return [];

    const rows = await this.pool.query<FeedRow>(BY_IDS_SQL, [
      refs.filter((r) => r.targetType === 'library').map((r) => r.targetId),
      refs.filter((r) => r.targetType === 'image').map((r) => r.targetId),
      opts.viewerId ?? null,
    ]);

    const items = await this.hydrate(rows.rows, opts.viewerId ?? null, publicUrl);
    // the database cannot order by when you saved something, so the pointers do
    const byKey = new Map(items.map((i) => [i.key, i]));
    return refs
      .map((r) => byKey.get(`${r.targetType}:${r.targetId}`))
      .filter((i): i is FeedItem => i !== undefined);
  }

  /** Everything one person has published, newest first — as whole posts. */
  async byAuthor(
    authorId: string,
    opts: { limit?: number; offset?: number; publicUrl?: PublicUrl; viewerId?: string | null } = {},
  ): Promise<FeedItem[]> {
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const publicUrl = opts.publicUrl ?? (() => null);

    const rows = await this.pool.query<FeedRow>(BY_AUTHOR_SQL, [authorId, limit, offset, opts.viewerId ?? null]);
    return this.hydrate(rows.rows, opts.viewerId ?? null, publicUrl);
  }

  /** Attach authors, engagement and pictures to a page of rows, in four lookups. */
  private async hydrate(rows: FeedRow[], viewerId: string | null, publicUrl: PublicUrl): Promise<FeedItem[]> {
    if (rows.length === 0) return [];
    const libraryIds = rows.filter((r) => r.source === 'library').map((r) => r.id);

    // four lookups for the whole page, not four per card
    const [authors, libraryEngagement, imageEngagement, pictures] = await Promise.all([
      loadAuthors(this.pool, rows.map((r) => r.author_id), publicUrl),
      this.engagement.forPosts(viewerId, 'library', libraryIds),
      this.engagement.forPosts(viewerId, 'image', rows.filter((r) => r.source === 'image').map((r) => r.id)),
      this.pictures(libraryIds, publicUrl),
    ]);

    return rows.map((r) => {
      const isImage = r.source === 'image';
      const engagement = (isImage ? imageEngagement : libraryEngagement).get(r.id) ?? { ...NO_ENGAGEMENT };
      // an old picture post has its one picture on the row, with no alt text or size
      const oldPicture = r.media ? publicUrl(r.media) : null;
      let images: FeedImage[] = pictures.get(r.id) ?? [];
      if (isImage) images = oldPicture ? [{ url: oldPicture, alt: null, width: null, height: null }] : [];
      return {
        key: `${r.source}:${r.id}`,
        targetType: r.source,
        id: r.id,
        kind: r.subtype as FeedItem['kind'],
        author: authors.get(r.author_id) ?? unknownAuthor(r.author_id),
        title: r.title,
        excerpt: excerpt(r.body),
        imageUrl: images[0]?.url ?? null,
        imageAlt: images[0]?.alt ?? null,
        images,
        meme: r.meme,
        href: isImage ? `/app/dimen/${r.id}` : `/app/library/${r.id}`,
        viewCount: r.view_count,
        commentCount: r.comment_count,
        engagement,
        at: r.at,
      };
    });
  }

  /** The pictures on these written posts, in order, as cards show them. */
  private async pictures(postIds: string[], publicUrl: PublicUrl): Promise<Map<string, FeedImage[]>> {
    const byPost = new Map<string, FeedImage[]>();
    if (postIds.length === 0) return byPost;
    const res = await this.pool.query<{
      post_id: string; media_key: string; alt_text: string | null; width: number | null; height: number | null;
    }>(
      `SELECT post_id, media_key, alt_text, width, height FROM library_post_media
        WHERE post_id = ANY($1::uuid[]) ORDER BY post_id, position`,
      [postIds],
    );
    for (const r of res.rows) {
      const url = publicUrl(r.media_key);
      if (!url) continue;
      const list = byPost.get(r.post_id) ?? [];
      list.push({ url, alt: r.alt_text, width: r.width, height: r.height });
      byPost.set(r.post_id, list);
    }
    return byPost;
  }
}

function excerpt(body: string | null): string | null {
  if (!body) return null;
  const clean = body.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return null;
  return clean.length > EXCERPT_CHARS ? `${clean.slice(0, EXCERPT_CHARS).trimEnd()}…` : clean;
}
