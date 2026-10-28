import type pg from 'pg';
import { notBlockedSql } from '../friends/blocked.js';
import { AppError } from '../plugins/errors.js';
import { writtenForSql } from '../users/age.js';

/**
 * Liking, saving and reposting a post, whatever kind of post it is.
 *
 * Stories, poems and pictures share one feed, so they share one heart, one
 * bookmark and one repost. Everything here works in (type, id) pairs rather
 * than knowing which table a post came from — the feed already knows that, and
 * teaching this service too would mean two of everything.
 *
 * A repost is the third kind rather than a table of its own: one per person
 * per post, counted on the post, listed newest-first for whoever made it. That
 * is a like, with a different name and a different meaning to a reader.
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
   * Add or remove, and say which it ended up being.
   *
   * A toggle rather than separate add/remove calls: the button is one button,
   * and a client that thinks it knows the current state can be wrong — two
   * tabs, a stale poll. Letting the database decide from what is actually
   * stored means the answer is always the truth.
   *
   * Only a post the person can read is liked, saved or reposted (`readable`);
   * taking one off always works, so a post that has since gone out of their
   * reach can still be let go of.
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
   * Whether `userId` can read this post where it is shown: published, not a
   * minor's they are no friend of, nobody blocked either way — the rules the
   * wall and the post's own page read it by (feed/service.ts). Anything else
   * was taken as readily, by id: a like on a draft, on a post that was taken
   * down, on a child's poem its reader may not see, or on a post of somebody
   * who blocked them, each one counted in what the post shows its readers.
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

  /**
   * Totals and the viewer's own state, for a page of posts at once.
   *
   * One query for the whole page rather than one per card: a feed of 24 posts
   * would otherwise be 24 round trips to draw 24 hearts.
   */
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
      // COALESCE because a signed-out viewer makes every `user_id = $3` NULL,
      // and bool_or over nothing but NULLs is NULL rather than false
      `SELECT target_id, kind, count(*)::int AS n,
              COALESCE(bool_or(user_id = $3), false) AS mine
         FROM post_engagements
        WHERE target_type = $1 AND target_id = ANY($2)
        GROUP BY target_id, kind`,
      [type, unique, viewerId],
    );

    for (const r of rows.rows) {
      const e = out.get(r.target_id)!;
      // named rather than if/else: an `else` branch counted a repost as a
      // bookmark the moment 'repost' existed, silently and on every card
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
   * Drop everything pointing at a post that no longer exists.
   *
   * Called when a post is removed. Nothing depends on it having run — reads
   * start from live posts — but leaving the rows would let a deleted post keep
   * inflating someone's "liked" count.
   */
  async sweepOrphans(type: TargetType, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM post_engagements WHERE target_type = $1 AND target_id = $2`, [type, id]);
  }
}
