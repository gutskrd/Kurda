import type pg from 'pg';
import { limitDetails, MAX_BLOCKS, MAX_FRIEND_REQUESTS_RECEIVED, MAX_FRIEND_REQUESTS_SENT } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { limitReached, lockPeopleFor, lockPersonFor } from '../limits/limits.js';
import { resolveAvatarUrl } from '../cosmetics/access.js';
import type { PublicUrl } from '../cosmetics/access.js';
import { isOnline } from '../social/presence.js';
import { canonicalPair, FRIEND_CAP, REQUEST_TTL_DAYS } from './pair.js';
import { isNotKnownAdultUser, notKnownAdultSql, shownToSql } from '../users/age.js';
import { notBlockedSql } from './blocked.js';

export type RequestOutcome = 'requested' | 'accepted' | 'already_friends' | 'silent';

/** Where two people stand, as one of them sees it (`statusBetween`). */
export type FriendEdgeStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked';

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
 * Someone you have blocked. Not a `FriendSummary`, because presence is a live signal of whereabouts the blocked
 * person would not want shared; enough to recognise who and when.
 */
export interface BlockedUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** When the block was placed. */
  blockedAt: string;
}

/** One page of a blocklist; a list can be as long as MAX_BLOCKS. */
export const BLOCKS_PAGE_SIZE = 25;
export const BLOCKS_PAGE_MAX = 100;

/**
 * The most friends one request returns. Equal to the cap on friends, so asking for that many returns all of them
 * and no caller, older phone apps included, is silently cut short.
 */
export const FRIENDS_PAGE_MAX = FRIEND_CAP;

interface EdgeRow {
  status: string;
  requested_by: string | null;
}

/**
 * Friend system: request and accept or decline over one canonical friendship row, with an absolute, silent block
 * that cancels pending requests both ways and hides the two from each other everywhere. Friends are capped at 500,
 * pending requests expire after 30 days, and requests out, requests waiting and blocks are capped by the shared
 * limits.
 *
 * A minor, or an account whose age is not on record yet (users/age.ts `notKnownAdultSql`), can send requests but
 * never receives one and is never suggested, so every friendship a minor has is one they started. The sender is
 * never told: a request to a minor is stored and answered like one to an adult who has not responded, but never
 * reaches the minor, since a refusal only minors gave would reveal which accounts are children's. Only the minor's
 * own request back makes the friendship (the mutual auto-accept). When an account turns out to be a minor's, its
 * waiting requests are removed.
 */
export class FriendService {
  private readonly blockListeners: Array<(blocker: string, blocked: string) => Promise<void> | void> = [];

  constructor(private readonly pool: pg.Pool) {}

  /**
   * Runs `listener` after every block commits, for what a block undoes elsewhere (story-game lobbies a pair shares).
   * Outside the transaction, so no game lock is taken inside it; a failing listener does not undo the block.
   */
  onBlocked(listener: (blocker: string, blocked: string) => Promise<void> | void): void {
    this.blockListeners.push(listener);
  }

  /** Are these two users blocked from each other (in either direction)? */
  async areBlocked(a: string, b: string, executor: Pick<pg.Pool, 'query'> = this.pool): Promise<boolean> {
    const r = await executor.query(
      `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
      [a, b],
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** `areBlocked` between `a` and any of `others`, in one query. */
  async blockedWithAny(a: string, others: readonly string[]): Promise<boolean> {
    if (others.length === 0) return false;
    const r = await this.pool.query(
      `SELECT 1 FROM blocks
        WHERE (blocker_id = $1 AND blocked_id = ANY($2::uuid[])) OR (blocker_id = ANY($2::uuid[]) AND blocked_id = $1) LIMIT 1`,
      [a, others],
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

  /**
   * Sends a friend request, or accepts if they already asked you. Both people's locks are taken first in one order
   * (`lockPeopleFor`), so concurrent requests cannot both slip under a limit. The sender's friends and sent requests
   * and the recipient's waiting ones are all checked before anything about a block, so a sender at a limit is refused
   * by everyone alike.
   */
  async request(from: string, to: string): Promise<RequestOutcome> {
    if (from === to) throw new AppError('SELF_FRIEND', 400, 'you cannot friend yourself');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockPeopleFor(client, 'friends', from, to);
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
      const blocked = (theyBlocked.rowCount ?? 0) > 0;

      const { lo, hi } = canonicalPair(from, to);
      const existing = await client.query<EdgeRow>(
        `SELECT status, requested_by FROM friendships WHERE user_lo = $1 AND user_hi = $2 FOR UPDATE`,
        [lo, hi],
      );
      const edge = blocked ? undefined : existing.rows[0];

      if (edge?.status === 'accepted') {
        await client.query('COMMIT');
        return 'already_friends';
      }
      // No age check on the recipient here: a request to a minor is answered like any other and simply never reaches
      // them, so the reply reveals nothing.
      if (edge?.status === 'pending') {
        if (edge.requested_by === from) {
          await client.query('COMMIT');
          return 'requested'; // idempotent re-send
        }
        // they already requested me → mutual → accept (respect both caps)
        await this.assertUnderCap(client, from);
        await this.assertUnderCap(client, to, true);
        await client.query(
          `UPDATE friendships SET status = 'accepted', responded_at = now() WHERE user_lo = $1 AND user_hi = $2`,
          [lo, hi],
        );
        await client.query('COMMIT');
        return 'accepted';
      }

      // a new request, as far as the sender can tell — blocked or not
      await this.assertUnderCap(client, from);
      await this.assertRequestRoom(client, from, to);
      if (blocked) {
        await client.query('COMMIT');
        return 'silent';
      }
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

  /** `theirs` when the full list is the other person's: the requester being accepted, or accepted by a request back. */
  private async assertUnderCap(executor: Pick<pg.Pool, 'query'>, userId: string, theirs = false): Promise<void> {
    if ((await this.friendCount(executor, userId)) >= FRIEND_CAP) {
      const message = theirs ? `their friend list is full (max ${FRIEND_CAP})` : `friend list is full (max ${FRIEND_CAP})`;
      throw new AppError('FRIENDS_FULL', 409, message, limitDetails('friends', { theirs }));
    }
  }

  /**
   * Room for one more unanswered request under the sender's and recipient's limits. Expired requests not yet swept
   * count for neither; a request to a minor counts like any other, as it is listed like any other.
   */
  private async assertRequestRoom(executor: Pick<pg.Pool, 'query'>, from: string, to: string): Promise<void> {
    const r = await executor.query<{ sent: number; waiting: number }>(
      `SELECT count(*) FILTER (WHERE requested_by = $1 AND (user_lo = $1 OR user_hi = $1))::int AS sent,
              count(*) FILTER (WHERE requested_by <> $2 AND (user_lo = $2 OR user_hi = $2))::int AS waiting
         FROM friendships
        WHERE status = 'pending' AND (user_lo IN ($1, $2) OR user_hi IN ($1, $2))
          AND created_at > now() - ($3 || ' days')::interval`,
      [from, to, String(REQUEST_TTL_DAYS)],
    );
    const { sent, waiting } = r.rows[0]!;
    if (sent >= MAX_FRIEND_REQUESTS_SENT) {
      throw limitReached('friend_requests_sent', `you have ${MAX_FRIEND_REQUESTS_SENT} friend requests waiting for an answer`);
    }
    if (waiting >= MAX_FRIEND_REQUESTS_RECEIVED) {
      throw limitReached('friend_requests_received', 'they have too many friend requests waiting', { theirs: true });
    }
  }

  /** Accept or decline a request that was sent to `user` by `other`. */
  async respond(user: string, other: string, accept: boolean): Promise<'accepted' | 'declined'> {
    const { lo, hi } = canonicalPair(user, other);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // both lists change: both locks, before the row (see `request`)
      if (accept) await lockPeopleFor(client, 'friends', user, other);
      const row = await client.query<EdgeRow>(
        `SELECT status, requested_by FROM friendships WHERE user_lo = $1 AND user_hi = $2 FOR UPDATE`,
        [lo, hi],
      );
      const edge = row.rows[0];
      if (!edge || edge.status !== 'pending' || edge.requested_by !== other) {
        throw new AppError('NO_REQUEST', 404, 'no pending request from that user');
      }
      if (accept) {
        // A request to someone not known to be an adult never reached them, so accepting it answers as absent.
        if (await isNotKnownAdultUser(client, user)) {
          throw new AppError('NO_REQUEST', 404, 'no pending request from that user');
        }
        // theirs too: a request sent while they had room is no way past their limit
        await this.assertUnderCap(client, user);
        await this.assertUnderCap(client, other, true);
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
   * Blocks a user, silently and absolutely: cancels any friendship or pending request both ways, and the blocked user
   * is never told. At most MAX_BLOCKS live accounts, counted as the blocklist counts them, under the blocker's lock;
   * blocking someone already blocked is never refused.
   */
  async block(blocker: string, blocked: string): Promise<void> {
    if (blocker === blocked) throw new AppError('SELF_BLOCK', 400, 'you cannot block yourself');
    const { lo, hi } = canonicalPair(blocker, blocked);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockPersonFor(client, 'blocks', blocker);
      const r = await client.query<{ already: boolean; n: number }>(
        `SELECT EXISTS (SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2) AS already,
                (SELECT count(*)::int FROM blocks b JOIN users u ON u.id = b.blocked_id
                  WHERE b.blocker_id = $1 AND u.deleted_at IS NULL) AS n`,
        [blocker, blocked],
      );
      if (!r.rows[0]!.already && r.rows[0]!.n >= MAX_BLOCKS) {
        throw limitReached('blocks', `you can block at most ${MAX_BLOCKS} accounts`);
      }
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
    for (const listener of this.blockListeners) {
      await Promise.resolve()
        .then(() => listener(blocker, blocked))
        .catch(() => undefined);
    }
  }

  async unblock(blocker: string, blocked: string): Promise<void> {
    await this.pool.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [blocker, blocked]);
  }

  /**
   * Who this user has blocked, newest first. Blocking hides the other person everywhere, so this list is the only
   * place left to unblock them. Strictly `blocker_id = $1`: who blocked you must never appear, or the block stops
   * being silent. Soft-deleted accounts drop out, but their block rows stay in force if they come back.
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

    // count(*) OVER () rides along with the page, except on an empty page past the end, where 0 would understate it.
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
   * One page of `user`'s friends by username, with `total` from `count(*) OVER ()` so the true count costs no second
   * query. Paged because most callers draw a handful of avatars. `viewer` is who is looking (the owner by default,
   * null when signed out): someone else's list leaves out friends who are minors or have no age on record, unless the
   * viewer is that friend or one of their friends (users/age.ts `shownToSql`), and anyone with a block between them
   * and the viewer; the count agrees. A block ends a friendship, so your own list has nobody to leave out.
   */
  async list(
    user: string,
    publicUrl: PublicUrl = () => null,
    limit: number = FRIENDS_PAGE_MAX,
    offset = 0,
    viewer: string | null = user,
  ): Promise<{ total: number; friends: FriendSummary[] }> {
    const rows = await this.pool.query<FriendRow & { total: number }>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.last_seen_at,
              count(*) OVER ()::int AS total FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_lo = $1 THEN f.user_hi ELSE f.user_lo END
        WHERE f.status = 'accepted' AND (f.user_lo = $1 OR f.user_hi = $1) AND u.deleted_at IS NULL
          AND ($4::uuid = $1 OR ${shownToSql('u', '$4::uuid')})
          AND ${notBlockedSql('u.id', '$4::uuid')}
        ORDER BY u.username
        LIMIT $2 OFFSET $3`,
      [user, Math.min(Math.max(limit, 1), FRIENDS_PAGE_MAX), Math.max(offset, 0), viewer],
    );
    const now = new Date();
    // A page past the end has no row to carry the count, and 0 would say the list is empty rather than finished.
    const total = rows.rows[0]?.total ?? (offset > 0 ? await this.activeFriendCount(user, viewer) : 0);
    return { total, friends: rows.rows.map((r) => toFriendSummary(r, publicUrl, now)) };
  }

  /**
   * Friends who still have an account, exactly the set `list` pages over, so the heading agrees with the list. Not
   * `friendCount`, which guards the 500 cap and rightly counts deleted accounts' rows too.
   */
  private async activeFriendCount(user: string, viewer: string | null): Promise<number> {
    const r = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int n FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_lo = $1 THEN f.user_hi ELSE f.user_lo END
        WHERE f.status = 'accepted' AND (f.user_lo = $1 OR f.user_hi = $1) AND u.deleted_at IS NULL
          AND ($2::uuid = $1 OR ${shownToSql('u', '$2::uuid')})
          AND ${notBlockedSql('u.id', '$2::uuid')}`,
      [user, viewer],
    );
    return r.rows[0]!.n;
  }

  /**
   * Incoming pending requests, not expired and not from someone since blocked. None for a minor or an account with no
   * age on record, since requests to them are held where they never see them.
   */
  async incomingRequests(user: string, publicUrl: PublicUrl = () => null): Promise<FriendSummary[]> {
    const rows = await this.pool.query<FriendRow>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.last_seen_at FROM friendships f
         JOIN users u ON u.id = f.requested_by
         JOIN users me ON me.id = $1
        WHERE f.status = 'pending' AND f.requested_by <> $1
          AND (f.user_lo = $1 OR f.user_hi = $1)
          AND NOT ${notKnownAdultSql('me')}
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

  /** Requests this user sent that nobody has answered, so a misfired one can be seen and withdrawn. */
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

  /** Withdraws a request you sent; scoped to `requested_by = user`, so it can never delete one sent to you. */
  async cancelRequest(user: string, other: string): Promise<void> {
    const { lo, hi } = canonicalPair(user, other);
    await this.pool.query(
      `DELETE FROM friendships WHERE user_lo = $1 AND user_hi = $2 AND status = 'pending' AND requested_by = $3`,
      [lo, hi, user],
    );
  }

  /**
   * Friends of friends the user is not connected to, ranked by mutual friends. Excludes self, friends, pending
   * requests either way, blocks, profiles hidden from discovery, and anyone not known to be an adult. Empty for a user
   * with no friends.
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
          AND NOT ${notKnownAdultSql('u')}
          -- a guest cannot be befriended, so is never suggested (auth/guest.ts)
          AND NOT u.guest
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

  /**
   * The relationship of `viewer` to `target`, for friend buttons. A request held for a viewer not known to be an adult
   * reads as 'none', so their button offers a request of their own, which then makes the friendship.
   */
  async statusBetween(viewer: string, target: string): Promise<FriendEdgeStatus> {
    return (await this.statusesBetween(viewer, [target])).get(target)!;
  }

  /**
   * `statusBetween` for each of `targets` in one query: blocks either way, the pair's row, and, for a request the
   * viewer received, whether they may be offered it (never a minor or an account with no age on record).
   */
  async statusesBetween(viewer: string, targets: readonly string[]): Promise<Map<string, FriendEdgeStatus>> {
    const out = new Map<string, FriendEdgeStatus>();
    if (targets.length === 0) return out;
    const pairs = targets.map((t) => canonicalPair(viewer, t));
    const rows = await this.pool.query<{ n: number; blocked: boolean; status: string | null; requested_by: string | null; shielded: boolean }>(
      `SELECT t.n::int AS n,
              EXISTS (SELECT 1 FROM blocks b
                       WHERE (b.blocker_id = $1 AND b.blocked_id = t.target) OR (b.blocker_id = t.target AND b.blocked_id = $1)) AS blocked,
              f.status, f.requested_by,
              COALESCE((SELECT ${notKnownAdultSql('u')} FROM users u WHERE u.id = $1), true) AS shielded
         FROM unnest($2::uuid[], $3::uuid[], $4::uuid[]) WITH ORDINALITY AS t(target, lo, hi, n)
         LEFT JOIN friendships f ON f.user_lo = t.lo AND f.user_hi = t.hi`,
      [viewer, targets, pairs.map((p) => p.lo), pairs.map((p) => p.hi)],
    );
    for (const r of rows.rows) {
      const target = targets[r.n - 1]!;
      let status: FriendEdgeStatus;
      if (r.blocked) status = 'blocked';
      else if (r.status === null) status = 'none';
      else if (r.status === 'accepted') status = 'friends';
      else if (r.requested_by === viewer) status = 'pending_out';
      else status = r.shielded ? 'none' : 'pending_in';
      out.set(target, status);
    }
    return out;
  }

  /** Accepted friend ids. */
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
