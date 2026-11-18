import type pg from 'pg';
import { writtenForSql } from '../users/age.js';
import { notBlockedSql } from '../friends/blocked.js';

/**
 * The emoji reactions on an image post, in display order, warmest first. The check constraint in
 * `1751000107000_restore-angry-reaction` allows exactly this set.
 */
export const REACTIONS = ['love', 'peace', 'like', 'laugh', 'wow', 'sad', 'angry'] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface ReactionSummary {
  /** Count per emoji (only non-zero entries). */
  counts: Partial<Record<Reaction, number>>;
  total: number;
  /** The caller's current reaction, if any. */
  mine: Reaction | null;
}

export type SetResult = { ok: true; summary: ReactionSummary } | { ok: false; reason: 'post-not-found' };

/**
 * Reactions on image posts: at most one per user and post. `set` upserts it (changing emoji leaves the count, adding
 * is +1) and `clear` removes it (-1); `reaction_count` changes in the same transaction, so it never drifts.
 */
export class ImageReactionService {
  constructor(private readonly pool: pg.Pool) {}

  async set(postId: string, userId: string, reaction: Reaction): Promise<SetResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // A picture the user may not see (a minor's, or across a block) answers as missing.
      const post = await client.query(
        `SELECT 1 FROM image_posts
          WHERE id = $1 AND status = 'published' AND ${writtenForSql('image_posts.author_id', '$2::uuid')}
            AND ${notBlockedSql('image_posts.author_id', '$2::uuid')}
          FOR UPDATE`,
        [postId, userId],
      );
      if (post.rowCount === 0) { await client.query('ROLLBACK'); return { ok: false, reason: 'post-not-found' }; }

      const existing = await client.query(`SELECT reaction FROM image_reactions WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
      const isNew = existing.rowCount === 0;
      await client.query(
        `INSERT INTO image_reactions (post_id, user_id, reaction) VALUES ($1,$2,$3)
         ON CONFLICT (post_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now()`,
        [postId, userId, reaction],
      );
      if (isNew) {
        await client.query(`UPDATE image_posts SET reaction_count = reaction_count + 1 WHERE id = $1`, [postId]);
      }
      const summary = await this.summaryTx(client, postId, userId);
      await client.query('COMMIT');
      return { ok: true, summary };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Remove the caller's reaction (a no-op if they had none). Always succeeds. */
  async clear(postId: string, userId: string): Promise<ReactionSummary> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const del = await client.query(`DELETE FROM image_reactions WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
      if ((del.rowCount ?? 0) > 0) {
        await client.query(`UPDATE image_posts SET reaction_count = GREATEST(0, reaction_count - 1) WHERE id = $1`, [postId]);
      }
      const summary = await this.summaryTx(client, postId, userId);
      await client.query('COMMIT');
      return summary;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Public read: the emoji breakdown + the caller's own reaction (if signed in). */
  async summary(postId: string, userId: string | null): Promise<ReactionSummary> {
    return this.summaryTx(this.pool, postId, userId);
  }

  private async summaryTx(q: pg.Pool | pg.PoolClient, postId: string, userId: string | null): Promise<ReactionSummary> {
    const rows = await q.query<{ reaction: Reaction; n: string }>(
      `SELECT reaction, COUNT(*)::int AS n FROM image_reactions WHERE post_id = $1 GROUP BY reaction`,
      [postId],
    );
    const counts: Partial<Record<Reaction, number>> = {};
    let total = 0;
    for (const r of rows.rows) {
      counts[r.reaction] = Number(r.n);
      total += Number(r.n);
    }
    let mine: Reaction | null = null;
    if (userId) {
      const m = await q.query<{ reaction: Reaction }>(`SELECT reaction FROM image_reactions WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
      mine = m.rows[0]?.reaction ?? null;
    }
    return { counts, total, mine };
  }
}
