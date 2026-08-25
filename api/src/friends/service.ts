import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { resolveAvatarUrl } from '../cosmetics/access.js';
import type { PublicUrl } from '../cosmetics/access.js';
import { isOnline } from '../social/presence.js';
import { canonicalPair, FRIEND_CAP, REQUEST_TTL_DAYS } from './pair.js';

export type RequestOutcome = 'requested' | 'accepted' | 'already_friends' | 'silent';

export interface FriendSummary {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  online: boolean;
}

/** Raw user columns joined for a friend/request row. */
interface FriendRow {
  id: string;
  username: string;
  display_name: string | null;
  profile_photo_key: string | null;
  selected_avatar_key: string | null;
  last_seen_at: Date | null;
}

function toFriendSummary(r: FriendRow, publicUrl: PublicUrl, now: Date): FriendSummary {
  return {
    userId: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl),
    online: isOnline(r.last_seen_at, now),
  };
}

/** A friend suggestion: a summary plus how many friends you have in common. */
export interface SuggestedFriend extends FriendSummary {
  mutualCount: number;
}

interface EdgeRow {
  status: string;
  requested_by: string | null;
}

/**
 * Friend system (KUR-081). Request → accept/decline over a single canonical
 * friendship row, with an absolute, silent block: a block cancels any pending
 * request in either direction and hides both users from each other everywhere
 * (searches, lists, friends boards) via `areBlocked`. Friends are capped at 500;
 * pending requests expire after 30 days.
 */
export class FriendService {
  constructor(private readonly pool: pg.Pool) {}

  /** Are these two users blocked from each other (in either direction)? */
  async areBlocked(a: string, b: string, executor: Pick<pg.Pool, 'query'> = this.pool): Promise<boolean> {
    const r = await executor.query(
      `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
      [a, b],
    );
    return (r.rowCount ?? 0) > 0;
  }

  private async friendCount(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<number> {
    const r = await executor.query<{ n: number }>(
      `SELECT count(*)::int n FROM friendships
        WHERE status = 'accepted' AND (user_lo = $1 OR user_hi = $1)`,
      [userId],
    );
    return r.rows[0]!.n;
  }

  /** Send a friend request (or auto-accept if they already requested you). */
  async request(from: string, to: string): Promise<RequestOutcome> {
    if (from === to) throw new AppError('SELF_FRIEND', 400, 'you cannot friend yourself');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // I blocked them → they must be unblocked first (my own state, safe to reveal)
      const iBlocked = await client.query(
        `SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
        [from, to],
      );
      if ((iBlocked.rowCount ?? 0) > 0) {
        throw new AppError('YOU_BLOCKED', 409, 'unblock this user before adding them');
      }
      // they blocked me → act as if sent, but create nothing (never reveal a block)
      const theyBlocked = await client.query(
        `SELECT 1 FROM blocks WHERE blocker_id = $2 AND blocked_id = $1`,
        [from, to],
      );
      if ((theyBlocked.rowCount ?? 0) > 0) {
        await client.query('COMMIT');
        return 'silent';
      }

      const { lo, hi } = canonicalPair(from, to);
      const existing = await client.query<EdgeRow>(
        `SELECT status, requested_by FROM friendships WHERE user_lo = $1 AND user_hi = $2 FOR UPDATE`,
        [lo, hi],
      );
      const edge = existing.rows[0];

      if (edge?.status === 'accepted') {
        await client.query('COMMIT');
        return 'already_friends';
      }
      if (edge?.status === 'pending') {
        if (edge.requested_by === from) {
          await client.query('COMMIT');
          return 'requested'; // idempotent re-send
        }
        // they already requested me → mutual → accept (respect my cap)
        await this.assertUnderCap(client, from);
        await client.query(
          `UPDATE friendships SET status = 'accepted', responded_at = now() WHERE user_lo = $1 AND user_hi = $2`,
          [lo, hi],
        );
        await client.query('COMMIT');
        return 'accepted';
      }

      await this.assertUnderCap(client, from);
      await client.query(
        `INSERT INTO friendships (user_lo, user_hi, status, requested_by) VALUES ($1, $2, 'pending', $3)`,
        [lo, hi, from],
      );
      await client.query('COMMIT');
      return 'requested';
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async assertUnderCap(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<void> {
    if ((await this.friendCount(executor, userId)) >= FRIEND_CAP) {
      throw new AppError('FRIENDS_FULL', 409, `friend list is full (max ${FRIEND_CAP})`);
    }
  }

  /** Accept or decline a request that was sent to `user` by `other`. */
  async respond(user: string, other: string, accept: boolean): Promise<'accepted' | 'declined'> {
    const { lo, hi } = canonicalPair(user, other);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<EdgeRow>(
        `SELECT status, requested_by FROM friendships WHERE user_lo = $1 AND user_hi = $2 FOR UPDATE`,
        [lo, hi],
      );
      const edge = row.rows[0];
      if (!edge || edge.status !== 'pending' || edge.requested_by !== other) {
        throw new AppError('NO_REQUEST', 404, 'no pending request from that user');
      }
      if (accept) {
        await this.assertUnderCap(client, user);
        await client.query(
          `UPDATE friendships SET status = 'accepted', responded_at = now() WHERE user_lo = $1 AND user_hi = $2`,
          [lo, hi],
        );
      } else {
        await client.query(`DELETE FROM friendships WHERE user_lo = $1 AND user_hi = $2`, [lo, hi]);
      }
      await client.query('COMMIT');
      return accept ? 'accepted' : 'declined';
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Remove an accepted friendship. */
  async unfriend(user: string, other: string): Promise<void> {
    const { lo, hi } = canonicalPair(user, other);
    await this.pool.query(
      `DELETE FROM friendships WHERE user_lo = $1 AND user_hi = $2 AND status = 'accepted'`,
      [lo, hi],
    );
  }

  /**
   * Block a user: silent + absolute. Cancels any friendship/pending request in
   * either direction; the blocked user is never notified.
   */
  async block(blocker: string, blocked: string): Promise<void> {
    if (blocker === blocked) throw new AppError('SELF_BLOCK', 400, 'you cannot block yourself');
    const { lo, hi } = canonicalPair(blocker, blocked);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [blocker, blocked],
      );
      await client.query(`DELETE FROM friendships WHERE user_lo = $1 AND user_hi = $2`, [lo, hi]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async unblock(blocker: string, blocked: string): Promise<void> {
    await this.pool.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [blocker, blocked]);
  }

  /** Accepted friends of `user` (blocked users can't be friends). */
  async list(user: string, publicUrl: PublicUrl = () => null): Promise<FriendSummary[]> {
    const rows = await this.pool.query<FriendRow>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.last_seen_at FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_lo = $1 THEN f.user_hi ELSE f.user_lo END
        WHERE f.status = 'accepted' AND (f.user_lo = $1 OR f.user_hi = $1) AND u.deleted_at IS NULL
        ORDER BY u.username`,
      [user],
    );
    const now = new Date();
    return rows.rows.map((r) => toFriendSummary(r, publicUrl, now));
  }

  /** Incoming pending requests (not expired, requester not since blocked). */
  async incomingRequests(user: string, publicUrl: PublicUrl = () => null): Promise<FriendSummary[]> {
    const rows = await this.pool.query<FriendRow>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.last_seen_at FROM friendships f
         JOIN users u ON u.id = f.requested_by
        WHERE f.status = 'pending' AND f.requested_by <> $1
          AND (f.user_lo = $1 OR f.user_hi = $1)
          AND f.created_at > now() - ($2 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1)
          )
        ORDER BY f.created_at DESC`,
      [user, String(REQUEST_TTL_DAYS)],
    );
    const now = new Date();
    return rows.rows.map((r) => toFriendSummary(r, publicUrl, now));
  }

  /**
   * People-you-may-know: friends-of-friends the user isn't already connected to,
   * ranked by number of mutual friends. Excludes self, existing friends, anyone
   * with a pending request either way, blocked users, and profiles hidden from
   * discovery. Returns [] for a user with no friends yet.
   */
  async suggestions(user: string, publicUrl: PublicUrl = () => null, limit = 10): Promise<SuggestedFriend[]> {
    const rows = await this.pool.query<FriendRow & { mutual: number }>(
      `WITH my_friends AS (
         SELECT CASE WHEN user_lo = $1 THEN user_hi ELSE user_lo END AS fid
           FROM friendships
          WHERE status = 'accepted' AND (user_lo = $1 OR user_hi = $1)
       )
       SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.last_seen_at,
              count(*)::int AS mutual
         FROM my_friends mf
         JOIN friendships f2
           ON f2.status = 'accepted' AND (f2.user_lo = mf.fid OR f2.user_hi = mf.fid)
         JOIN users u
           ON u.id = CASE WHEN f2.user_lo = mf.fid THEN f2.user_hi ELSE f2.user_lo END
        WHERE u.id <> $1
          AND u.deleted_at IS NULL
          AND u.profile_visibility <> 'nobody'
          AND u.id NOT IN (SELECT fid FROM my_friends)
          AND NOT EXISTS (
            SELECT 1 FROM friendships fp
             WHERE fp.status = 'pending'
               AND ((fp.user_lo = $1 AND fp.user_hi = u.id) OR (fp.user_lo = u.id AND fp.user_hi = $1))
          )
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1)
          )
        GROUP BY u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.last_seen_at
        ORDER BY mutual DESC, u.username
        LIMIT $2`,
      [user, limit],
    );
    const now = new Date();
    return rows.rows.map((r) => ({ ...toFriendSummary(r, publicUrl, now), mutualCount: r.mutual }));
  }

  /** Relationship of `viewer` to `target` — powers friend buttons (KUR-082). */
  async statusBetween(
    viewer: string,
    target: string,
  ): Promise<'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked'> {
    if (await this.areBlocked(viewer, target)) return 'blocked';
    const { lo, hi } = canonicalPair(viewer, target);
    const row = await this.pool.query<EdgeRow>(
      `SELECT status, requested_by FROM friendships WHERE user_lo = $1 AND user_hi = $2`,
      [lo, hi],
    );
    const edge = row.rows[0];
    if (!edge) return 'none';
    if (edge.status === 'accepted') return 'friends';
    return edge.requested_by === viewer ? 'pending_out' : 'pending_in';
  }

  /** Accepted friend ids — for the friends leaderboard (KUR-063 follow-on). */
  async friendIds(user: string): Promise<string[]> {
    const rows = await this.pool.query<{ id: string }>(
      `SELECT CASE WHEN user_lo = $1 THEN user_hi ELSE user_lo END AS id
         FROM friendships WHERE status = 'accepted' AND (user_lo = $1 OR user_hi = $1)`,
      [user],
    );
    return rows.rows.map((r) => r.id);
  }

  /** Sweep expired pending requests (called on a schedule). */
  async expireOldRequests(): Promise<number> {
    const r = await this.pool.query(
      `DELETE FROM friendships WHERE status = 'pending' AND created_at < now() - ($1 || ' days')::interval`,
      [String(REQUEST_TTL_DAYS)],
    );
    return r.rowCount ?? 0;
  }
}
