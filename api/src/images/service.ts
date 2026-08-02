import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';

export type AuthorRole = 'user' | 'admin' | 'founder';
export type Category = 'meme' | 'image';
export type PostStatus = 'published' | 'removed';

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
}

export interface ListFilters {
  category?: Category;
  language?: string;
  authorId?: string;
  sort?: 'newest' | 'popular';
  limit?: number;
  offset?: number;
}

export type CreateResult = { ok: true; post: ImagePost } | { ok: false; reason: 'invalid' };
export type MutateResult = { ok: true; post: ImagePost } | { ok: false; reason: 'not-found' | 'forbidden' };

interface Row {
  id: string; author_id: string; author_role: AuthorRole; image_media_id: string; caption: string | null;
  category: Category; language: string | null; status: PostStatus; view_count: number; reaction_count: number;
  comment_count: number; created_at: Date; updated_at: Date;
}

/**
 * Community image & meme sharing (KUR-290). Image required (a confirmed #013
 * media key), caption optional; users, admins, and the founder publish, guests
 * view. Caption is control-char-stripped on input (#108); web/mobile escape on
 * render. Removal is soft (retained for moderation #292). Auto image-scan (#294)
 * and reports (#292) are wired separately.
 */
export class ImagePostService {
  constructor(private readonly pool: pg.Pool) {}

  async create(authorId: string, authorRole: AuthorRole, input: CreateInput): Promise<CreateResult> {
    const imageMediaId = input.imageMediaId?.trim();
    if (!imageMediaId) return { ok: false, reason: 'invalid' };
    const caption = input.caption != null ? clean(input.caption) : null;
    const category: Category = input.category === 'image' ? 'image' : 'meme';
    const res = await this.pool.query<Row>(
      `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, category, language)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [authorId, authorRole, imageMediaId, caption, category, input.language ?? null],
    );
    return { ok: true, post: toPost(res.rows[0]!) };
  }

  async list(filters: ListFilters = {}): Promise<ImagePost[]> {
    const conds = [`status = 'published'`];
    const params: unknown[] = [];
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

  async get(id: string): Promise<ImagePost | null> {
    const res = await this.pool.query<Row>(
      `UPDATE image_posts SET view_count = view_count + 1 WHERE id = $1 AND status = 'published' RETURNING *`,
      [id],
    );
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
  };
}
