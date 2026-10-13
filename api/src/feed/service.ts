import type pg from 'pg';
import type { FeedImage } from '@kurda/shared';
import type { PublicUrl } from '../cosmetics/access.js';
import { loadAuthors, unknownAuthor, type Author } from '../social/authors.js';
import { writtenForSql } from '../users/age.js';
import {
  EngagementService,
  NO_ENGAGEMENT,
  type Engagement,
  type EngagementKind,
  type TargetType,
} from '../social/engagement-service.js';

/**
 * One wall for everything the community writes and posts.
 *
 * Stories, poems and pictures lived on three pages that were the same page three
 * times — same authors, same comments, same shape of card. Merging them is not
 * only tidier to look at: a poem posted this morning was invisible to anyone who
 * happened to be browsing pictures.
 *
 * Every query here goes through the same rule as the library and the picture
 * wall: what a minor posts is shown to them and their friends only
 * (users/age.ts `writtenForSql`). The wall, somebody's profile tabs and the
 * cards somebody liked are all ways of reading the same posts, and a byline on
 * any of them would be a way to find a minor.
 */

/**
 * The wall has two halves and each has its own kinds.
 *
 * Gotin is what people write, Dîmen is what they photograph or make. They read
 * differently and are looked for differently, so the filter is two levels: pick
 * a half, then narrow it. `all` at either level means "do not narrow".
 *
 * A written post can carry pictures now, so the halves are about what a post
 * has rather than which table it is in: the Gotin half is posts with words
 * (not memes — a meme's words are its caption), the Dîmen half is posts with
 * pictures, old picture posts included. A photo with a paragraph under it is
 * in both. Photos (wene) are the pictured posts not marked as memes; Memes
 * (mim) are the ones that are, old and new.
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
 * Which half a kind belongs to, and what it is called in the database.
 *
 * A kind implies its half — asking for helbest inside Dîmen is a contradiction,
 * not an empty result, so the caller is told rather than quietly given nothing.
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
  /**
   * The first picture. Kept for the apps installed before posts had several:
   * they show this one on the card, and the rest once they are updated.
   */
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

/**
 * Both tables, one shape, one ordering.
 *
 * A UNION rather than two queries merged in JavaScript: paging a merge done in
 * the client means over-fetching both sides to be sure of the boundary, and
 * getting it subtly wrong the first time someone posts two things in the same
 * second.
 */
const FEED_SQL = `
  SELECT ${COLUMNS} FROM (
    SELECT ${LIBRARY_COLUMNS}
      FROM library_posts l
     WHERE l.status = 'published'
       AND ($1 = 'all'
            -- the written half: words that are not a meme's caption, of one type if asked
            OR ($1 = 'gotin' AND l.body <> '' AND NOT l.is_meme AND ($2::text IS NULL OR l.type = $2))
            -- the pictured half: photos, or memes, or both
            OR ($1 = 'dimen' AND ${HAS_PICTURES} AND ($2::text IS NULL OR l.is_meme = ($2 = 'meme'))))
       AND ${writtenForSql('l.author_id', '$5::uuid')}
    UNION ALL
    SELECT ${IMAGE_COLUMNS}
      FROM image_posts i
     WHERE i.status = 'published'
       AND ($1 = 'all' OR $1 = 'dimen')
       AND ($2::text IS NULL OR i.category = $2)
       AND ${writtenForSql('i.author_id', '$5::uuid')}
  ) AS wall
  ORDER BY at DESC, id DESC
  LIMIT $3 OFFSET $4`;

/**
 * The same shape as the wall, for a known set of posts.
 *
 * Saved posts arrive as pointers with no ordering the database can apply, so
 * this fetches them and the caller puts them back in the order they were saved.
 */
const BY_IDS_SQL = `
  SELECT ${COLUMNS} FROM (
    SELECT ${LIBRARY_COLUMNS}
      FROM library_posts l
     WHERE l.status = 'published' AND l.id = ANY($1) AND ${writtenForSql('l.author_id', '$3::uuid')}
    UNION ALL
    SELECT ${IMAGE_COLUMNS}
      FROM image_posts i
     WHERE i.status = 'published' AND i.id = ANY($2) AND ${writtenForSql('i.author_id', '$3::uuid')}
  ) AS chosen`;

/**
 * Everything one person published, newest first.
 *
 * Ordered and paged in SQL across both tables, so "their tenth post" means the
 * tenth of everything they wrote rather than the tenth of whichever table it
 * happened to come from.
 */
const BY_AUTHOR_SQL = `
  SELECT ${COLUMNS} FROM (
    SELECT ${LIBRARY_COLUMNS}
      FROM library_posts l
     WHERE l.status = 'published' AND l.author_id = $1 AND ${writtenForSql('l.author_id', '$4::uuid')}
    UNION ALL
    SELECT ${IMAGE_COLUMNS}
      FROM image_posts i
     WHERE i.status = 'published' AND i.author_id = $1 AND ${writtenForSql('i.author_id', '$4::uuid')}
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
    opts: { section?: FeedSection; kind?: FeedKind; limit?: number; offset?: number; publicUrl?: PublicUrl } = {},
  ): Promise<FeedItem[] | null> {
    const resolved = resolveKind(opts.section ?? 'all', opts.kind ?? 'all');
    // a kind that cannot live in the half asked for is a contradiction, and the
    // caller should hear that rather than an empty wall
    if (!resolved.ok) return null;

    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const publicUrl = opts.publicUrl ?? (() => null);

    const rows = await this.pool.query<FeedRow>(FEED_SQL, [resolved.section, resolved.dbType, limit, offset, viewerId]);
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
    return this.engagedBy(userId, 'bookmark', { ...opts, viewerId: userId });
  }

  /**
   * The posts one person liked, or saved — as whole posts.
   *
   * A profile used to show these as a line of text with a thumbnail beside it,
   * which meant a picture arrived as a 40px square and a poem as an icon. The
   * thing somebody liked is a post, so this returns the post.
   *
   * `viewerId` is who is *looking*, which is not the same person as `userId`
   * when this fills somebody else's profile tab. Engagement is resolved for the
   * viewer, so the heart on a card in your friend's likes tab reflects whether
   * **you** liked it — passing the owner's id would paint every card as already
   * liked and let a stranger act on it by mistake.
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
