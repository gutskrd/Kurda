import type pg from 'pg';
import type { PublicUrl } from '../cosmetics/access.js';
import { loadAuthors, unknownAuthor, type Author } from '../social/authors.js';
import { writtenForSql } from '../users/age.js';
import { notBlockedSql } from '../friends/blocked.js';
import { claimPostPictures, type PictureClaimFailure } from '../media/postMedia.js';
import { attachPostContext } from '../moderation/pictures-service.js';
import { stripControlChars } from '@kurda/shared';

export type AuthorRole = 'user' | 'admin' | 'founder';
export type Category = 'meme' | 'image';
/** `held`: its picture waits for a person, and only its author sees it meanwhile */
export type PostStatus = 'published' | 'removed' | 'held';

export const MAX_CAPTION_LEN = 2_000;

export interface CreateInput {
  imageMediaId: string;
  caption?: string | null;
  category?: Category;
  language?: string;
}

export interface ImagePost {
  id: string;
  authorId: string;
  authorRole: AuthorRole;
  imageMediaId: string;
  caption: string | null;
  category: Category;
  language: string | null;
  status: PostStatus;
  viewCount: number;
  reactionCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
  /** the author's own copy of a post whose picture a person is checking; nobody else is shown it */
  review?: 'held';
}

/** A post with its author attached; a separate type because read paths always fill it and write paths never do. */
export interface ImagePostWithAuthor extends ImagePost {
  author: Author;
}

export interface ListFilters {
  category?: Category;
  language?: string;
  authorId?: string;
  sort?: 'newest' | 'popular';
  limit?: number;
  offset?: number;
  /** who is looking: a minor's pictures are listed only for them and their friends */
  viewerId?: string | null;
}

/** `invalid`: no image named; otherwise why the picture named cannot be used (media/postMedia.ts). */
export type CreateResult = { ok: true; post: ImagePost } | { ok: false; reason: 'invalid' | PictureClaimFailure };
export type MutateResult = { ok: true; post: ImagePost } | { ok: false; reason: 'not-found' | 'forbidden' };

interface Row {
  id: string; author_id: string; author_role: AuthorRole; image_media_id: string; caption: string | null;
  category: Category; language: string | null; status: PostStatus; view_count: number; reaction_count: number;
  comment_count: number; created_at: Date; updated_at: Date;
}

/**
 * Community image posts: an image required (a confirmed media key), a caption optional. Captions are stripped of
 * control characters on input and escaped by the apps; removal is soft, kept for moderation. A minor's pictures are
 * only for them and their friends (users/age.ts `writtenForSql`), and nobody's are shown across a block
 * (friends/blocked.ts).
 */
export class ImagePostService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Creates a picture post and claims its picture: the author's own upload, cleared by the scan and on no other post
   * (media/postMedia.ts), confirmed in the post's transaction.
   */
  async create(authorId: string, authorRole: AuthorRole, input: CreateInput): Promise<CreateResult> {
    const imageMediaId = input.imageMediaId?.trim();
    if (!imageMediaId) return { ok: false, reason: 'invalid' };
    const caption = input.caption != null ? clean(input.caption) : null;
    const category: Category = input.category === 'image' ? 'image' : 'meme';
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const claim = await claimPostPictures(client, authorId, [imageMediaId]);
      if (!claim.ok) {
        await client.query('ROLLBACK');
        return { ok: false, reason: claim.code };
      }
      const held = claim.pictures.some((p) => p.held);
      const res = await client.query<Row>(
        `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, category, language, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [authorId, authorRole, imageMediaId, caption, category, input.language ?? null, held ? 'held' : 'published'],
      );
      // the person checking its picture reads its caption with it
      if (held) await attachPostContext(client, [imageMediaId], caption, res.rows[0]!.id);
      await client.query('COMMIT');
      return { ok: true, post: toPost(res.rows[0]!) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async list(filters: ListFilters = {}): Promise<ImagePost[]> {
    const params: unknown[] = [filters.viewerId ?? null];
    const conds = [
      // an author's own list shows them their posts still waiting for a person; nobody else ever sees those
      filters.authorId && filters.authorId === filters.viewerId ? `status IN ('published','held')` : `status = 'published'`,
      writtenForSql('image_posts.author_id', '$1::uuid'),
      notBlockedSql('image_posts.author_id', '$1::uuid'),
    ];
    if (filters.category) { params.push(filters.category); conds.push(`category = $${params.length}`); }
    if (filters.language) { params.push(filters.language); conds.push(`language = $${params.length}`); }
    if (filters.authorId) { params.push(filters.authorId); conds.push(`author_id = $${params.length}`); }
    const order = filters.sort === 'popular' ? 'view_count DESC, created_at DESC' : 'created_at DESC';
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = Math.max(0, filters.offset ?? 0);
    params.push(limit, offset);
    const res = await this.pool.query<Row>(
      `SELECT * FROM image_posts WHERE ${conds.join(' AND ')} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return res.rows.map(toPost);
  }

  /** Attach authors in one extra query, however many posts came back. */
  async withAuthors(posts: ImagePost[], publicUrl: PublicUrl = () => null): Promise<ImagePostWithAuthor[]> {
    const authors = await loadAuthors(this.pool, posts.map((p) => p.authorId), publicUrl);
    return posts.map((p) => ({ ...p, author: authors.get(p.authorId) ?? unknownAuthor(p.authorId) }));
  }

  async get(id: string, viewerId: string | null = null): Promise<ImagePost | null> {
    const res = await this.pool.query<Row>(
      `UPDATE image_posts SET view_count = view_count + CASE WHEN status = 'held' THEN 0 ELSE 1 END
        WHERE id = $1 AND (status = 'published' OR (status = 'held' AND author_id IS NOT DISTINCT FROM $2::uuid))
          AND ${writtenForSql('image_posts.author_id', '$2::uuid')}
          AND ${notBlockedSql('image_posts.author_id', '$2::uuid')}
        RETURNING *`,
      [id, viewerId],
    );
    return res.rows[0] ? toPost(res.rows[0]) : null;
  }

  /** A post as it stands, for deciding what an edit needs: no view counted and no reader rules, since the edit checks access. */
  async current(id: string): Promise<ImagePost | null> {
    const res = await this.pool.query<Row>(`SELECT * FROM image_posts WHERE id = $1 AND status <> 'removed'`, [id]);
    return res.rows[0] ? toPost(res.rows[0]) : null;
  }

  /** Author or admin edits the caption. */
  async editCaption(id: string, actorId: string, actorIsAdmin: boolean, caption: string | null): Promise<MutateResult> {
    return this.owned(id, actorId, actorIsAdmin, async (client) => {
      const res = await client.query<Row>(
        `UPDATE image_posts SET caption = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [id, caption != null ? clean(caption) : null],
      );
      return { ok: true as const, post: toPost(res.rows[0]!) };
    });
  }

  /** Soft-remove (author or admin); retained for moderation/audit. */
  async remove(id: string, actorId: string, actorIsAdmin: boolean): Promise<MutateResult> {
    return this.owned(id, actorId, actorIsAdmin, async (client) => {
      const res = await client.query<Row>(
        `UPDATE image_posts SET status = 'removed', updated_at = now() WHERE id = $1 RETURNING *`,
        [id],
      );
      return { ok: true as const, post: toPost(res.rows[0]!) };
    });
  }

  private async owned(
    id: string,
    actorId: string,
    actorIsAdmin: boolean,
    fn: (client: pg.PoolClient) => Promise<MutateResult>,
  ): Promise<MutateResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<{ author_id: string }>(
        `SELECT author_id FROM image_posts WHERE id = $1 AND status <> 'removed' FOR UPDATE`,
        [id],
      );
      const post = row.rows[0];
      if (!post) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (post.author_id !== actorId && !actorIsAdmin) { await client.query('ROLLBACK'); return { ok: false, reason: 'forbidden' }; }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

function clean(input: string): string {
  return stripControlChars(input).trim().slice(0, MAX_CAPTION_LEN);
}

function toPost(r: Row): ImagePost {
  return {
    id: r.id, authorId: r.author_id, authorRole: r.author_role, imageMediaId: r.image_media_id, caption: r.caption,
    category: r.category, language: r.language, status: r.status, viewCount: r.view_count,
    reactionCount: r.reaction_count, commentCount: r.comment_count, createdAt: r.created_at, updatedAt: r.updated_at,
    ...(r.status === 'held' ? { review: 'held' as const } : {}),
  };
}
