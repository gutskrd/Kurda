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
  /** when they were last seen, so a list can say how long ago; null if never */
  lastSeenAt: string | null;
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
    lastSeenAt: r.last_seen_at ? r.last_seen_at.toISOString() : null,
  };
}

/** A friend suggestion: a summary plus how many friends you have in common. */
export interface SuggestedFriend extends FriendSummary {
  mutualCount: number;
}

/**
 * Someone you have blocked.
 *
 * Deliberately not a `FriendSummary`: presence is the one field a blocked user
 * would not want the person who blocked them to have. A block is meant to end
 * the relationship in both directions, and "online now" is a live signal about
 * somebody's whereabouts. Enough to recognise who you blocked and when, and
 * nothing beyond that.
 */
export interface BlockedUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** when the block was placed, so an old one can be told from a new one */
  blockedAt: string;
}

/** One page of a blocklist. Bounded because nothing caps how many you may block. */
export const BLOCKS_PAGE_SIZE = 25;
export const BLOCKS_PAGE_MAX = 100;

/**
 * The most friends one request will answer with.
 *
 * `FRIEND_CAP` rather than something smaller on purpose: 500 is already the
 * most friends anyone can have, so asking for that many is asking for all of
 * them, and no caller is ever silently cut short — not the friends page, not
 * a picker, not a copy of the phone app that shipped before this did. What
 * changes is that a caller drawing eight avatars can now say eight.
 */
export const FRIENDS_PAGE_MAX = FRIEND_CAP;

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

  /**
   * Who this user has blocked, newest first.
   *
   * The list has to exist for the block to be reversible at all: blocking hides
   * the other person everywhere at once — out of search, off your friends list,
   * and their profile answers 404 — so once it is done there is no surface left
   * that could offer you an unblock. Without this, a block placed by accident
   * or in a moment is permanent in practice.
   *
   * Strictly one-directional: `blocker_id = $1` and nothing else. Who has
   * blocked *you* is not in here and must never be, or the silent block stops
   * being silent — see `block`.
   *
   * Soft-deleted accounts drop out, as they do from every other list. The row
   * in `blocks` stays: if that account ever comes back the block is still in
   * force, which is the safe direction to fail in.
   */
  async blocked(
    user: string,
    publicUrl: PublicUrl = () => null,
    limit = BLOCKS_PAGE_SIZE,
    offset = 0,
  ): Promise<{ blocked: BlockedUser[]; total: number }> {
    const rows = await this.pool.query<{
      id: string;
      username: string;
      display_name: string | null;
      profile_photo_key: string | null;
      selected_avatar_key: string | null;
      blocked_at: Date;
      total: number;
    }>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key,
              b.created_at AS blocked_at, count(*) OVER ()::int AS total
         FROM blocks b
         JOIN users u ON u.id = b.blocked_id
        WHERE b.blocker_id = $1 AND u.deleted_at IS NULL
        ORDER BY b.created_at DESC, u.username
        LIMIT $2 OFFSET $3`,
      [user, Math.min(Math.max(limit, 1), BLOCKS_PAGE_MAX), Math.max(offset, 0)],
    );

    // count(*) OVER () rides along with the page, so the heading costs no second
    // query — except on an empty page past the end, where there is no row to
    // carry it and a bare 0 would understate the list.
    const total = rows.rows[0]?.total ?? (offset > 0 ? await this.blockedCount(user) : 0);

    return {
      total,
      blocked: rows.rows.map((r) => ({
        userId: r.id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl),
        blockedAt: r.blocked_at.toISOString(),
      })),
    };
  }

  /** How many live accounts this user has blocked. */
  private async blockedCount(user: string): Promise<number> {
    const r = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int n FROM blocks b JOIN users u ON u.id = b.blocked_id
        WHERE b.blocker_id = $1 AND u.deleted_at IS NULL`,
      [user],
    );
    return r.rows[0]?.n ?? 0;
  }

  /**
   * One page of `user`'s accepted friends, by username. Blocked users cannot
   * be friends, so there is nothing to filter out here.
   *
   * Paged because all but one caller draws a handful and was being sent the
   * lot: a profile puts eight avatars in a stack, the list on somebody else's
   * profile shows twelve. Up to five hundred rows of username, display name,
   * avatar key and presence crossed the wire to do that, on the most-visited
   * screen there is.
   *
   * `total` rides along on the page through `count(*) OVER ()`, so "and 328
   * more" costs no second query and is the true number rather than the length
   * of whatever happened to arrive.
   */
  async list(
    user: string,
    publicUrl: PublicUrl = () => null,
    limit: number = FRIENDS_PAGE_MAX,
    offset = 0,
  ): Promise<{ total: number; friends: FriendSummary[] }> {
    const rows = await this.pool.query<FriendRow & { total: number }>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.last_seen_at,
              count(*) OVER ()::int AS total FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_lo = $1 THEN f.user_hi ELSE f.user_lo END
        WHERE f.status = 'accepted' AND (f.user_lo = $1 OR f.user_hi = $1) AND u.deleted_at IS NULL
        ORDER BY u.username
        LIMIT $2 OFFSET $3`,
      [user, Math.min(Math.max(limit, 1), FRIENDS_PAGE_MAX), Math.max(offset, 0)],
    );
    const now = new Date();
    // a page past the end carries no row to hold the count, and a bare 0 there
    // would say the list is empty when it is only finished
    const total = rows.rows[0]?.total ?? (offset > 0 ? await this.activeFriendCount(user) : 0);
    return { total, friends: rows.rows.map((r) => toFriendSummary(r, publicUrl, now)) };
  }

  /**
   * Friends who still have an account — exactly the set `list` pages over.
   *
   * Not `friendCount`, which counts friendship rows without joining `users`:
   * that one guards the 500 cap, where an account that has since been deleted
   * still occupying a slot is the answer you want. This one has to agree with
   * a page, or the heading contradicts the list underneath it.
   */
  private async activeFriendCount(user: string): Promise<number> {
    const r = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int n FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_lo = $1 THEN f.user_hi ELSE f.user_lo END
        WHERE f.status = 'accepted' AND (f.user_lo = $1 OR f.user_hi = $1) AND u.deleted_at IS NULL`,
      [user],
    );
    return r.rows[0]!.n;
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
   * Requests this user has sent and nobody has answered yet.
   *
   * The mirror of `incomingRequests`, and the reason it exists: a request you
   * sent is invisible to you otherwise, so a misfire — the wrong name in a
   * search, a tap on the wrong row — leaves a standing invitation you cannot
   * see and cannot take back.
   */
  async outgoingRequests(user: string, publicUrl: PublicUrl = () => null): Promise<FriendSummary[]> {
    const rows = await this.pool.query<FriendRow>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.last_seen_at FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_lo = $1 THEN f.user_hi ELSE f.user_lo END
        WHERE f.status = 'pending' AND f.requested_by = $1
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
   * Withdraw a request you sent.
   *
   * Scoped to `requested_by = user` so this can never be used to delete a
   * request someone sent *to* you — declining is `respond`, and it is the other
   * person's business who knows about it.
   */
  async cancelRequest(user: string, other: string): Promise<void> {
    const { lo, hi } = canonicalPair(user, other);
    await this.pool.query(
      `DELETE FROM friendships WHERE user_lo = $1 AND user_hi = $2 AND status = 'pending' AND requested_by = $3`,
      [lo, hi, user],
    );
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
