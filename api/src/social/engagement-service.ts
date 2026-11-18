import type pg from 'pg';
import { notBlockedSql } from '../friends/blocked.js';
import { AppError } from '../plugins/errors.js';
import { writtenForSql } from '../users/age.js';

/**
 * Liking, saving and reposting any kind of post. Stories, poems and pictures share one feed, so they share one heart,
 * bookmark and repost, keyed by (type, id) without knowing which table a post came from. A repost is a third kind
 * rather than its own table: one per person per post, counted on the post and listed newest first for its maker.
 */

export const TARGET_TYPES = ['library', 'image'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const ENGAGEMENT_KINDS = ['like', 'bookmark', 'repost'] as const;
export type EngagementKind = (typeof ENGAGEMENT_KINDS)[number];

export function isTargetType(v: string): v is TargetType {
  return (TARGET_TYPES as readonly string[]).includes(v);
}
export function isEngagementKind(v: string): v is EngagementKind {
  return (ENGAGEMENT_KINDS as readonly string[]).includes(v);
}

/** What one post's buttons need to render: the totals, and your own state. */
export interface Engagement {
  likes: number;
  bookmarks: number;
  reposts: number;
  liked: boolean;
  bookmarked: boolean;
  reposted: boolean;
}

export const NO_ENGAGEMENT: Engagement = {
  likes: 0,
  bookmarks: 0,
  reposts: 0,
  liked: false,
  bookmarked: false,
  reposted: false,
};

/** A post someone liked or saved, as a pointer for the feed to hydrate. */
export interface EngagedRef {
  targetType: TargetType;
  targetId: string;
  at: Date;
}

export class EngagementService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Adds or removes, and reports which. A toggle, because the client's idea of the state can be stale (two tabs, an old
   * poll), so the database decides from what is stored. Only a post the person can read can be engaged with
   * (`readable`); removing always works, so a post since out of reach can be let go.
   */
  async toggle(
    userId: string,
    type: TargetType,
    id: string,
    kind: EngagementKind,
  ): Promise<{ on: boolean }> {
    const removed = await this.pool.query(
      `DELETE FROM post_engagements
        WHERE user_id = $1 AND target_type = $2 AND target_id = $3 AND kind = $4`,
      [userId, type, id, kind],
    );
    if (removed.rowCount && removed.rowCount > 0) return { on: false };
    if (!(await this.readable(userId, type, id))) throw new AppError('NOT_FOUND', 404, 'no such post');

    await this.pool.query(
      `INSERT INTO post_engagements (user_id, target_type, target_id, kind)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [userId, type, id, kind],
    );
    return { on: true };
  }

  /**
   * Whether `userId` can read this post where it is shown: published, not a minor's they are not friends with, no
   * block either way, as the wall and post page decide (feed/service.ts). Otherwise drafts, removed posts, a child's
   * poem or a blocker's post could be liked by id and counted.
   */
  async readable(userId: string, type: TargetType, id: string): Promise<boolean> {
    // the table is one of two literals, chosen by the type checked above it
    const table = type === 'library' ? 'library_posts' : 'image_posts';
    const res = await this.pool.query(
      `SELECT 1 FROM ${table} p
        WHERE p.id = $1 AND p.status = 'published'
          AND ${writtenForSql('p.author_id', '$2::uuid')} AND ${notBlockedSql('p.author_id', '$2::uuid')}`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Totals and the viewer's own state for a page of posts, in one query rather than one per card. */
  async forPosts(
    viewerId: string | null,
    type: TargetType,
    ids: readonly string[],
  ): Promise<Map<string, Engagement>> {
    const unique = [...new Set(ids)];
    const out = new Map<string, Engagement>(unique.map((id) => [id, { ...NO_ENGAGEMENT }]));
    if (unique.length === 0) return out;

    const rows = await this.pool.query<{
      target_id: string;
      kind: EngagementKind;
      n: number;
      mine: boolean;
    }>(
      // COALESCE because a signed-out viewer makes every `user_id = $3` NULL, and bool_or over only NULLs is NULL.
      `SELECT target_id, kind, count(*)::int AS n,
              COALESCE(bool_or(user_id = $3), false) AS mine
         FROM post_engagements
        WHERE target_type = $1 AND target_id = ANY($2)
        GROUP BY target_id, kind`,
      [type, unique, viewerId],
    );

    for (const r of rows.rows) {
      const e = out.get(r.target_id)!;
      // Each kind is named explicitly; an else branch would count any new kind as a bookmark.
      if (r.kind === 'like') {
        e.likes = r.n;
        e.liked = r.mine;
      } else if (r.kind === 'bookmark') {
        e.bookmarks = r.n;
        e.bookmarked = r.mine;
      } else if (r.kind === 'repost') {
        e.reposts = r.n;
        e.reposted = r.mine;
      }
    }
    return out;
  }

  /** What this person has liked or saved, newest first — pointers only. */
  async listFor(
    userId: string,
    kind: EngagementKind,
    limit: number,
    offset: number,
  ): Promise<EngagedRef[]> {
    const rows = await this.pool.query<{ target_type: TargetType; target_id: string; created_at: Date }>(
      `SELECT target_type, target_id, created_at
         FROM post_engagements
        WHERE user_id = $1 AND kind = $2
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4`,
      [userId, kind, limit, offset],
    );
    return rows.rows.map((r) => ({ targetType: r.target_type, targetId: r.target_id, at: r.created_at }));
  }

  /**
   * Drops everything pointing at a removed post. Reads start from live posts, so nothing depends on it, but leftover
   * rows would inflate someone's "liked" count.
   */
  async sweepOrphans(type: TargetType, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM post_engagements WHERE target_type = $1 AND target_id = $2`, [type, id]);
  }
}
