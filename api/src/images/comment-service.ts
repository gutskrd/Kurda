import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';
import type { PublicUrl } from '../cosmetics/access.js';
import { loadAuthors, unknownAuthor, type Author } from '../social/authors.js';

export type AuthorRole = 'user' | 'admin' | 'founder';
export const MAX_COMMENT_LEN = 2_000;

export interface CreateCommentInput {
  body?: string | null;
  parentId?: string | null;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorRole: AuthorRole;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  status: 'visible' | 'removed';
  replyCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentWithAuthor extends Comment {
  author: Author;
}

export interface Page {
  limit?: number;
  offset?: number;
  sort?: 'newest' | 'oldest';
}

export type CreateResult =
  | { ok: true; comment: Comment }
  | { ok: false; reason: 'empty' | 'post-not-found' | 'parent-not-found' };
export type MutateResult = { ok: true; comment: Comment } | { ok: false; reason: 'not-found' | 'forbidden' | 'empty' };

interface Row {
  id: string; post_id: string; author_id: string; author_role: AuthorRole; parent_comment_id: string | null;
  depth: number; body: string | null; status: 'visible' | 'removed'; reply_count: number; created_at: Date; updated_at: Date;
}

/**
 * Threaded text comments on image/meme posts (KUR-291), mirroring the library
 * comment model (KUR-283): unbounded reply tree via `parent_comment_id`, thread
 * loads top-level-first with per-branch load-more, soft-delete tombstones the node
 * so a removed parent keeps its subtree. Post `comment_count` and parent
 * `reply_count` are kept in step inside each mutation's transaction.
 */
export class ImageCommentService {
  constructor(private readonly pool: pg.Pool) {}

  async create(postId: string, authorId: string, authorRole: AuthorRole, input: CreateCommentInput): Promise<CreateResult> {
    const body = input.body != null ? clean(input.body) : null;
    if (!body) return { ok: false, reason: 'empty' };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const post = await client.query(`SELECT id FROM image_posts WHERE id = $1 AND status = 'published' FOR UPDATE`, [postId]);
      if (post.rowCount === 0) { await client.query('ROLLBACK'); return { ok: false, reason: 'post-not-found' }; }

      let depth = 0;
      if (input.parentId) {
        const parent = await client.query<{ depth: number }>(
          `SELECT depth FROM image_comments WHERE id = $1 AND post_id = $2 AND status = 'visible' FOR UPDATE`,
          [input.parentId, postId],
        );
        if (parent.rowCount === 0) { await client.query('ROLLBACK'); return { ok: false, reason: 'parent-not-found' }; }
        depth = parent.rows[0]!.depth + 1;
        await client.query(`UPDATE image_comments SET reply_count = reply_count + 1 WHERE id = $1`, [input.parentId]);
      }

      const res = await client.query<Row>(
        `INSERT INTO image_comments (post_id, author_id, author_role, parent_comment_id, depth, body)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [postId, authorId, authorRole, input.parentId ?? null, depth, body],
      );
      await client.query(`UPDATE image_posts SET comment_count = comment_count + 1 WHERE id = $1`, [postId]);
      await client.query('COMMIT');
      return { ok: true, comment: toComment(res.rows[0]!) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Top-level comments of a post (paginated). */
  async topLevel(postId: string, page: Page = {}): Promise<Comment[]> {
    return this.fetchChildren(postId, null, page);
  }

  /** Direct replies to a comment (paginated, oldest-first by default). */
  async replies(parentId: string, page: Page = {}): Promise<Comment[]> {
    const parent = await this.pool.query<{ post_id: string }>(`SELECT post_id FROM image_comments WHERE id = $1`, [parentId]);
    if (parent.rowCount === 0) return [];
    return this.fetchChildren(parent.rows[0]!.post_id, parentId, { sort: 'oldest', ...page });
  }

  /** Attach authors, using the loader posts use so the same face appears twice. */
  async withAuthors(comments: Comment[], publicUrl: PublicUrl = () => null): Promise<CommentWithAuthor[]> {
    const authors = await loadAuthors(this.pool, comments.map((c) => c.authorId), publicUrl);
    return comments.map((c) => ({ ...c, author: authors.get(c.authorId) ?? unknownAuthor(c.authorId) }));
  }

  private async fetchChildren(postId: string, parentId: string | null, page: Page): Promise<Comment[]> {
    const limit = Math.min(100, Math.max(1, page.limit ?? 20));
    const offset = Math.max(0, page.offset ?? 0);
    const order = page.sort === 'oldest' ? 'created_at ASC' : 'created_at DESC';
    const res = await this.pool.query<Row>(
      `SELECT * FROM image_comments
       WHERE post_id = $1 AND parent_comment_id ${parentId === null ? 'IS NULL' : '= $4'}
       ORDER BY ${order} LIMIT $2 OFFSET $3`,
      parentId === null ? [postId, limit, offset] : [postId, limit, offset, parentId],
    );
    return res.rows.map(toComment);
  }

  /** Edit own comment. Admins may edit any. */
  async edit(commentId: string, actorId: string, actorIsAdmin: boolean, patch: CreateCommentInput): Promise<MutateResult> {
    return this.owned(commentId, actorId, actorIsAdmin, async (client, row) => {
      const nextBody = patch.body !== undefined ? (patch.body != null ? clean(patch.body) : null) : row.body;
      if (!nextBody) return { ok: false as const, reason: 'empty' as const };
      const res = await client.query<Row>(
        `UPDATE image_comments SET body = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [commentId, nextBody],
      );
      return { ok: true as const, comment: toComment(res.rows[0]!) };
    });
  }

  /** Soft-delete: tombstone the node (content cleared, subtree preserved) and
   *  decrement the post's visible comment count. Author or admin only. */
  async remove(commentId: string, actorId: string, actorIsAdmin: boolean): Promise<MutateResult> {
    return this.owned(commentId, actorId, actorIsAdmin, async (client, row) => {
      if (row.status === 'removed') return { ok: true as const, comment: toComment(row) };
      const res = await client.query<Row>(
        `UPDATE image_comments SET status = 'removed', body = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
        [commentId],
      );
      await client.query(`UPDATE image_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = $1`, [row.post_id]);
      return { ok: true as const, comment: toComment(res.rows[0]!) };
    });
  }

  private async owned(
    commentId: string,
    actorId: string,
    actorIsAdmin: boolean,
    fn: (client: pg.PoolClient, row: Row) => Promise<MutateResult>,
  ): Promise<MutateResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<Row>(`SELECT * FROM image_comments WHERE id = $1 FOR UPDATE`, [commentId]);
      const row = res.rows[0];
      if (!row) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (row.author_id !== actorId && !actorIsAdmin) { await client.query('ROLLBACK'); return { ok: false, reason: 'forbidden' }; }
      const result = await fn(client, row);
      if (result.ok) await client.query('COMMIT');
      else await client.query('ROLLBACK');
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
  return stripControlChars(input).trim().slice(0, MAX_COMMENT_LEN);
}

function toComment(r: Row): Comment {
  return {
    id: r.id, postId: r.post_id, authorId: r.author_id, authorRole: r.author_role,
    parentCommentId: r.parent_comment_id, depth: r.depth, body: r.body, status: r.status,
    replyCount: r.reply_count, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
