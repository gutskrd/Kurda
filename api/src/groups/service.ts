import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { weekStart } from '../leagues/league-logic.js';
import {
  banEndsAt,
  canEditGroup,
  canManage,
  canModerateGroup,
  canSetRole,
  GROUP_BAN_REASON_MAX,
  GROUP_DESCRIPTION_MAX,
  GROUP_NAME_MAX,
  GROUP_NAME_MIN,
  GROUP_REQUEST_NOTE_MAX,
  isRole,
  limitDetails,
  MAX_GROUP_MEMBERS,
  MAX_GROUP_MEMBERSHIPS,
  MAX_GROUPS_OWNED,
  requestCooldownDays,
  type GroupBan,
  type GroupBanDuration,
  type GroupRejoinRequest,
  type GroupRequestState,
  type GroupStanding,
  type Role,
} from '@kurda/shared';
import { limitReached, lockPersonFor } from '../limits/limits.js';
import { unconfirmIfUnused } from '../media/groupPhoto.js';
import { filterText } from '../moderation/filter.js';
import { recordNotifications } from '../notifications/inbox-service.js';
import type { Notification } from '../push/service.js';
import { notBlockedSql } from '../friends/blocked.js';
import { approvedNotice, bannedNotice, declinedNotice, removedNotice, requestNotice, type NoticeGroup, type PushNotice } from './notices.js';

/**
 * A group's name or description as it is kept: control characters out
 * (`stripControlChars`), and the invisible ones a name could hide behind —
 * the zero-width space, the byte-order mark and the bidi overrides and
 * isolates that can make text read back to front — out as well. The
 * zero-width joiner and non-joiner stay: Soranî spelling and emoji use them.
 */
function cleanGroupText(text: string): string {
  return stripControlChars(text)
    .replace(/[\u200B\uFEFF\u202A-\u202E\u2066-\u2069]/g, '')
    .trim();
}

/**
 * A group's name and description are read by everyone who finds it, so words
 * the chat would mask are refused outright rather than published masked. A
 * ban's reason and a request's note are held to the same.
 */
function screenGroupText(...texts: Array<string | null | undefined>): void {
  for (const text of texts) {
    if (text && filterText(text).flagged) {
      throw new AppError('GROUP_TEXT_REJECTED', 422, 'the text has words that are not allowed here');
    }
  }
}

/**
 * A ban's reason or a request's note as it is kept: cleaned like a group's
 * own text, empty as none, and refused past `max` or for words not allowed.
 */
function cleanNote(text: string | null | undefined, max: number): string | null {
  const clean = text != null ? cleanGroupText(text) || null : null;
  if (clean && clean.length > max) throw new AppError('TEXT_TOO_LONG', 400, `at most ${max} characters`);
  screenGroupText(clean);
  return clean;
}
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { isMinorUser, isNotKnownAdultUser, notKnownAdultSql, shownToSql, writtenForSql } from '../users/age.js';
import { canonicalPair } from '../friends/pair.js';

/** SQL: the ban behind `alias` is in force — for good, or not run out yet. `alias` is always a literal here. */
const inForce = (alias: string): string => `(${alias}.until IS NULL OR ${alias}.until > now())`;

/**
 * SQL: how many requests to come back are waiting in the group `group`, as the
 * owner or admin `viewer` sees them — from people still banned (a request
 * outlives its ban only until it is next met), and not from anyone with a
 * block between them and the viewer, whose words do not reach them.
 */
function waitingRequestsSql(group: string, viewer: string): string {
  return `SELECT count(*)::int FROM group_rejoin_requests wr
             JOIN group_bans wb ON wb.group_id = wr.group_id AND wb.user_id = wr.user_id AND ${inForce('wb')}
            WHERE wr.group_id = ${group} AND wr.status = 'pending' AND ${notBlockedSql('wr.user_id', viewer)}`;
}

/** A ban in force on one person, as the paths that change it read it (`GroupService.banInForce`). */
interface BanRow {
  until: Date | null;
  declines: number;
  /** a request was turned down and the next may not be sent yet */
  waiting: boolean;
  request_after: Date | null;
  requests_closed: boolean;
  /** a request of theirs is waiting */
  pending: boolean;
}

/** Where the viewer stands with a group, from `GroupService.get`'s read. */
function standingOf(
  role: Role | null,
  row: { banned: boolean; until: Date | null; reason: string | null; waiting: boolean; request_after: Date | null; requests_closed: boolean | null; request_sent_at: Date | null },
): GroupStanding {
  if (role) return { kind: 'member', role };
  if (!row.banned) return { kind: 'out' };
  let request: GroupRequestState = { kind: 'can_ask' };
  if (row.request_sent_at) request = { kind: 'pending', sentAt: row.request_sent_at.toISOString() };
  else if (row.requests_closed) request = { kind: 'closed' };
  else if (row.waiting && row.request_after) request = { kind: 'wait', until: row.request_after.toISOString() };
  return { kind: 'banned', until: row.until ? row.until.toISOString() : null, reason: row.reason, request };
}

/** Whether `a` and `b` are friends. */
async function areFriends(executor: Pick<pg.Pool, 'query'>, a: string, b: string): Promise<boolean> {
  const { lo, hi } = canonicalPair(a, b);
  const r = await executor.query(`SELECT 1 FROM friendships WHERE user_lo = $1 AND user_hi = $2 AND status = 'accepted'`, [lo, hi]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Open groups are for adults. Anyone can walk into one and talk to everyone in
 * it, which is exactly the stranger contact a minor should not get by default.
 */
export function openGroupsAdultsOnly(): AppError {
  return new AppError('OPEN_GROUPS_ADULTS_ONLY', 403, 'open groups are for members aged 18 and over');
}

/**
 * Hold a person to the group limits (@kurda/shared `MAX_GROUPS_OWNED`,
 * `MAX_GROUP_MEMBERSHIPS`) before they are given one more group to own or to
 * be in, under their lock, inside the caller's transaction. Archived groups
 * count for neither. `theirs` is for a group someone else is handing them —
 * an invite, or ownership passed on — so the refusal says whose limit it is.
 *
 * The lock is taken before any group row is (`addMember` locks the group), the
 * one order every path here keeps.
 */
async function assertGroupRoom(
  client: Pick<pg.Pool, 'query'>,
  userId: string,
  need: { owning?: boolean; joining?: boolean; theirs?: boolean },
): Promise<void> {
  await lockPersonFor(client, 'groups', userId);
  const r = await client.query<{ owned: number; memberships: number }>(
    `SELECT (SELECT count(*)::int FROM groups WHERE owner_id = $1 AND archived_at IS NULL) AS owned,
            (SELECT count(*)::int FROM group_members m JOIN groups g ON g.id = m.group_id
              WHERE m.user_id = $1 AND g.archived_at IS NULL) AS memberships`,
    [userId],
  );
  const { owned, memberships } = r.rows[0]!;
  const theirs = need.theirs === true;
  if (need.owning && owned >= MAX_GROUPS_OWNED) {
    const message = theirs ? `they already own ${MAX_GROUPS_OWNED} groups` : `you can own at most ${MAX_GROUPS_OWNED} groups`;
    throw limitReached('groups_owned', message, { theirs });
  }
  if (need.joining && memberships >= MAX_GROUP_MEMBERSHIPS) {
    const message = theirs ? `they are already in ${MAX_GROUP_MEMBERSHIPS} groups` : `you can be in at most ${MAX_GROUP_MEMBERSHIPS} groups`;
    throw limitReached('group_memberships', message, { theirs });
  }
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  privacy: 'open' | 'invite';
  ownerId: string | null;
  archivedAt: string | null;
  memberCount: number;
  /** the group's own picture on the CDN, or null for its initials */
  photoUrl: string | null;
}

export interface GroupMember {
  userId: string;
  username: string;
  /** resolved server-side, so the roster shows real faces not initials */
  avatarUrl: string | null;
  role: Role;
  joinedAt: string;
}

/** A group as `GET /groups/:id` answers: its roster, and where the viewer stands with it. */
export interface GroupDetail extends Group {
  members: GroupMember[];
  myRole: Role | null;
  standing: GroupStanding;
  /** requests to come back waiting for an answer: for the owner and admins only */
  pendingRequests?: number;
}

/**
 * Groups / clubs (KUR-084). Discord-style clubs with owner/moderator/member
 * roles, open or invite privacy, and a 100-member cap. Ownership transfers
 * explicitly; when an owner's account is deleted the reconcile pass promotes the
 * oldest moderator (else oldest member, else archives). Group weekly XP is
 * summed from members' ledgers for the group leaderboard.
 *
 * One person owns at most MAX_GROUPS_OWNED groups and is in at most
 * MAX_GROUP_MEMBERSHIPS (`assertGroupRoom`), whether they start a group, join
 * one, are added to one or are handed one. A group passed on by the server
 * itself (`handOnGroup`) is not held to it: nobody asked for that.
 *
 * Minors (worked out from age when asked) live in invite-only groups. They
 * cannot see, join or start an open one, and are taken out of any they were
 * in when their age is recorded.
 *
 * An "invite" here adds somebody outright rather than asking them, so it is
 * for friends only — anybody's, not just a minor's — and only into an
 * invite-only group: an open one anyone can join for themselves. Both rules
 * are the same for every account, so the answer to an invite says nothing
 * about the age of the person invited; and since every friendship a minor has
 * is one they started, every group a minor is in is one that someone they
 * chose put them in.
 *
 * Removed and banned differ (@kurda/shared group-membership.ts): someone
 * removed may join or be added again like anybody; someone banned may not
 * until the ban runs out or is lifted, but may ask to come back. Letting them
 * back in keeps the rules above, so a request answered yes by an admin who is
 * not their friend lifts an invite-only group's ban without adding them.
 */
export class GroupService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: { push?: PushNotice; log?: { warn(obj: unknown, msg: string): void } } = {},
  ) {}

  /**
   * Push lines already written to people's notifications, after the change
   * they tell of has committed. A push that fails is logged and the change
   * stands: the line is in their list either way.
   */
  private async push(items: ReadonlyArray<{ userId: string; notification: Notification }>): Promise<void> {
    const push = this.deps.push;
    if (!push) return;
    for (const { userId, notification } of items) {
      await push(userId, notification).catch((err: unknown) => this.deps.log?.warn({ err, userId }, 'group notice not pushed'));
    }
  }

  /** The user's role in the group, or null if not a member (KUR-085 authz). */
  async memberRole(groupId: string, userId: string): Promise<Role | null> {
    return this.roleOf(this.pool, groupId, userId);
  }

  private async roleOf(executor: Pick<pg.Pool, 'query'>, groupId: string, userId: string): Promise<Role | null> {
    const r = await executor.query<{ role: string }>(
      `SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    const role = r.rows[0]?.role;
    return role && isRole(role) ? role : null;
  }

  private async requireRole(client: Pick<pg.Pool, 'query'>, groupId: string, userId: string): Promise<Role> {
    const role = await this.roleOf(client, groupId, userId);
    if (!role) throw new AppError('NOT_A_MEMBER', 403, 'you are not in this group');
    return role;
  }

  async create(ownerId: string, input: { name: string; description?: string; privacy?: 'open' | 'invite' }): Promise<{ id: string }> {
    if ((input.privacy ?? 'open') === 'open' && (await isMinorUser(this.pool, ownerId))) {
      throw openGroupsAdultsOnly();
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // strip control/invisible chars from user-visible text (#108)
      const name = cleanGroupText(input.name);
      const description = input.description != null ? cleanGroupText(input.description) || null : null;
      screenGroupText(name, description);
      // the maker owns it and is in it: both limits, under their lock
      await assertGroupRoom(client, ownerId, { owning: true, joining: true });
      const g = await client.query<{ id: string }>(
        `INSERT INTO groups (name, description, privacy, owner_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [name, description, input.privacy ?? 'open', ownerId],
      );
      const id = g.rows[0]!.id;
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [id, ownerId],
      );
      await client.query('COMMIT');
      return { id };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async addMember(client: Pick<pg.Pool, 'query'>, groupId: string, userId: string): Promise<void> {
    const g = await client.query<{ privacy: string; archived_at: Date | null; n: number }>(
      `SELECT privacy, archived_at,
              (SELECT count(*)::int FROM group_members m WHERE m.group_id = groups.id) AS n
         FROM groups WHERE id = $1 FOR UPDATE`,
      [groupId],
    );
    const grp = g.rows[0];
    if (!grp || grp.archived_at) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
    if (grp.n >= MAX_GROUP_MEMBERS) {
      throw new AppError('GROUP_FULL', 409, `group is full (max ${MAX_GROUP_MEMBERS})`, limitDetails('group_members'));
    }
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [groupId, userId],
    );
  }

  /**
   * The ban on `userId` in this group while it is in force, its row locked
   * for the caller's transaction; null when there is none. One that has run
   * out is deleted as it is met, and a request still waiting on it is closed
   * with it (withdrawn: nobody had to decide it), so neither turns up again
   * if they are banned another time.
   */
  private async banInForce(client: Pick<pg.Pool, 'query'>, groupId: string, userId: string): Promise<BanRow | null> {
    const r = await client.query<BanRow>(
      `WITH gone AS (
         DELETE FROM group_bans WHERE group_id = $1 AND user_id = $2 AND until <= now() RETURNING user_id
       ), closed AS (
         UPDATE group_rejoin_requests SET status = 'withdrawn', decided_at = now()
          WHERE group_id = $1 AND user_id = $2 AND status = 'pending' AND EXISTS (SELECT 1 FROM gone)
       )
       SELECT b.until, b.declines, b.request_after, b.requests_closed, COALESCE(b.request_after > now(), false) AS waiting,
              EXISTS (SELECT 1 FROM group_rejoin_requests r WHERE r.group_id = $1 AND r.user_id = $2 AND r.status = 'pending') AS pending
         FROM group_bans b WHERE b.group_id = $1 AND b.user_id = $2 AND ${inForce('b')}
          FOR UPDATE OF b`,
      [groupId, userId],
    );
    return r.rows[0] ?? null;
  }

  /**
   * Join an open group directly. Not while banned from it: the person's lock
   * first (as a ban takes it), so a ban and a join of the same person cannot
   * pass each other.
   */
  async join(userId: string, groupId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const grp = await client.query<{ privacy: string }>(`SELECT privacy FROM groups WHERE id = $1`, [groupId]);
      if (grp.rows[0]?.privacy !== 'open') throw new AppError('INVITE_ONLY', 403, 'this group is invite-only');
      if (await isMinorUser(client, userId)) throw openGroupsAdultsOnly();
      // joining a group you are in already changes nothing, so it is never refused for a limit
      if (!(await this.roleOf(client, groupId, userId))) {
        await lockPersonFor(client, 'groups', userId);
        const ban = await this.banInForce(client, groupId, userId);
        if (ban) {
          throw new AppError('GROUP_BANNED', 403, 'you are banned from this group', { until: ban.until ? ban.until.toISOString() : null });
        }
        await assertGroupRoom(client, userId, { joining: true });
      }
      await this.addMember(client, groupId, userId);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Owner/moderator adds one of their friends to an invite-only group.
   *
   * The same two rules for everybody (see the class note): the group must be
   * invite-only, and the person added a friend of whoever adds them. Neither
   * looks at the age of the person being added, so no answer here can tell a
   * minor's account from an adult's.
   */
  async invite(inviterId: string, groupId: string, targetId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const role = await this.requireRole(client, groupId, inviterId);
      if (role !== 'owner' && role !== 'moderator') throw new AppError('FORBIDDEN', 403, 'only staff can invite');
      const g = await client.query<{ privacy: string }>(`SELECT privacy FROM groups WHERE id = $1`, [groupId]);
      if (g.rows[0]?.privacy === 'open') {
        throw new AppError('OPEN_GROUP_NO_INVITES', 409, 'anyone can join an open group; there is no one to add');
      }
      if (!(await areFriends(client, inviterId, targetId))) {
        throw new AppError('NOT_FRIENDS', 403, 'you can only add your friends to a group');
      }
      if (!(await this.roleOf(client, groupId, targetId))) {
        // someone banned is let back by lifting the ban first, never by being added past it
        await lockPersonFor(client, 'groups', targetId);
        if (await this.banInForce(client, groupId, targetId)) {
          throw new AppError('MEMBER_BANNED', 409, 'they are banned from this group; lift the ban first');
        }
        // their limit, not the inviter's; like the two rules above it is the same for every account
        await assertGroupRoom(client, targetId, { joining: true, theirs: true });
      }
      await this.addMember(client, groupId, targetId);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Leave a group. The owner must transfer or delete first. */
  async leave(userId: string, groupId: string): Promise<void> {
    const role = await this.roleOf(this.pool, groupId, userId);
    if (!role) return;
    if (role === 'owner') throw new AppError('OWNER_CANNOT_LEAVE', 409, 'transfer ownership or delete the group first');
    await this.pool.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, userId]);
  }

  async setRole(actorId: string, groupId: string, targetId: string, role: Role): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const actorRole = await this.requireRole(client, groupId, actorId);
      if (!canSetRole(actorRole, role)) throw new AppError('FORBIDDEN', 403, 'not allowed to set that role');
      const targetRole = await this.roleOf(client, groupId, targetId);
      if (!targetRole || targetRole === 'owner') throw new AppError('BAD_TARGET', 400, 'cannot change that member');
      await client.query(`UPDATE group_members SET role = $3 WHERE group_id = $1 AND user_id = $2`, [groupId, targetId, role]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Take a member out. It leaves no ban: they can join an open group again,
   * or be added again to an invite-only one, and their notifications say so.
   */
  async removeMember(actorId: string, groupId: string, targetId: string): Promise<void> {
    const told = await this.inTransaction(async (client) => {
      const actorRole = await this.requireRole(client, groupId, actorId);
      const targetRole = await this.roleOf(client, groupId, targetId);
      if (!targetRole) throw new AppError('BAD_TARGET', 404, 'not a member');
      if (!canManage(actorRole, targetRole)) throw new AppError('FORBIDDEN', 403, 'not allowed to remove that member');
      await client.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, targetId]);
      const lines = [{ userId: targetId, notification: removedNotice(await this.noticeGroup(client, groupId)) }];
      await recordNotifications(client, lines);
      return lines;
    });
    await this.push(told);
  }

  async transferOwnership(ownerId: string, groupId: string, newOwnerId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if ((await this.requireRole(client, groupId, ownerId)) !== 'owner') {
        throw new AppError('FORBIDDEN', 403, 'only the owner can transfer ownership');
      }
      if (!(await this.roleOf(client, groupId, newOwnerId))) {
        throw new AppError('BAD_TARGET', 400, 'new owner must be a member');
      }
      // handing a group on is giving the other member one more to own; they are in it already
      if (newOwnerId !== ownerId) await assertGroupRoom(client, newOwnerId, { owning: true, theirs: true });
      await client.query(`UPDATE group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`, [groupId, newOwnerId]);
      await client.query(`UPDATE group_members SET role = 'moderator' WHERE group_id = $1 AND user_id = $2`, [groupId, ownerId]);
      await client.query(`UPDATE groups SET owner_id = $2 WHERE id = $1`, [groupId, newOwnerId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteGroup(ownerId: string, groupId: string): Promise<void> {
    const role = await this.roleOf(this.pool, groupId, ownerId);
    if (role !== 'owner') throw new AppError('FORBIDDEN', 403, 'only the owner can delete the group');
    const gone = await this.pool.query<{ photo_key: string | null }>(`DELETE FROM groups WHERE id = $1 RETURNING photo_key`, [groupId]);
    // its picture goes to the orphan job, unless another group shows the same one
    await unconfirmIfUnused(this.pool, gone.rows[0]?.photo_key ?? null);
  }

  /**
   * Change how a group presents itself — its name, its description, or both —
   * as its owner or one of its admins (`canEditGroup`). The text is cleaned as
   * it is when a group is made: invisible and control characters taken out,
   * trimmed, and held to the same lengths; an empty description clears it.
   * Who changed it, and when, is kept, so a report about the new name reaches
   * the person who wrote it.
   */
  async update(actorId: string, groupId: string, input: { name?: string; description?: string | null }): Promise<{ name: string; description: string | null }> {
    const name = input.name !== undefined ? cleanGroupText(input.name) : undefined;
    if (name !== undefined && (name.length < GROUP_NAME_MIN || name.length > GROUP_NAME_MAX)) {
      throw new AppError('GROUP_NAME_LENGTH', 400, `a group's name is ${GROUP_NAME_MIN} to ${GROUP_NAME_MAX} characters`);
    }
    const description = input.description === undefined ? undefined : cleanGroupText(input.description ?? '') || null;
    if (description && description.length > GROUP_DESCRIPTION_MAX) {
      throw new AppError('GROUP_DESCRIPTION_LENGTH', 400, `a group's description is at most ${GROUP_DESCRIPTION_MAX} characters`);
    }
    screenGroupText(name, description);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const g = await client.query<{ archived_at: Date | null }>(`SELECT archived_at FROM groups WHERE id = $1 FOR UPDATE`, [groupId]);
      if (!g.rows[0] || g.rows[0].archived_at) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
      if (!canEditGroup(await this.roleOf(client, groupId, actorId))) {
        throw new AppError('NOT_GROUP_ADMIN', 403, 'only the owner and admins can change the group');
      }
      const r = await client.query<{ name: string; description: string | null }>(
        `UPDATE groups
            SET name = COALESCE($2, name),
                description = CASE WHEN $3::boolean THEN $4 ELSE description END,
                edited_by = $5, edited_at = now()
          WHERE id = $1
          RETURNING name, description`,
        [groupId, name ?? null, description !== undefined, description ?? null, actorId],
      );
      await client.query('COMMIT');
      return r.rows[0]!;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** The owner or an admin of the group (`canModerateGroup`), or 403 NOT_GROUP_ADMIN. */
  private async requireModerator(executor: Pick<pg.Pool, 'query'>, groupId: string, userId: string): Promise<Role> {
    const role = await this.roleOf(executor, groupId, userId);
    if (!role || !canModerateGroup(role)) throw new AppError('NOT_GROUP_ADMIN', 403, 'only the owner and admins can do that');
    return role;
  }

  /** What a line in someone's notifications names: the group. */
  private async noticeGroup(executor: Pick<pg.Pool, 'query'>, groupId: string): Promise<NoticeGroup> {
    const r = await executor.query<NoticeGroup>(`SELECT id, name, privacy FROM groups WHERE id = $1`, [groupId]);
    if (!r.rows[0]) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
    return r.rows[0];
  }

  /**
   * Ban someone, as the owner or an admin, over someone they outrank when
   * that person is a member (`canManage`); nobody bans themselves or the
   * owner. The person must be in the group now, or have posted in it (so
   * leaving just before a ban does not escape it — in an open group, posted
   * something the admin could read), or be banned already, which this
   * replaces: how long, why and by whom, keeping where their asking stands.
   *
   * In one transaction: out of the group, the ban, with `deleteMessages`
   * every message of theirs in the group gone, and the line in their
   * notifications. The caller takes them out of the live room and tells the
   * room their messages went.
   */
  async ban(
    actorId: string,
    groupId: string,
    input: { userId: string; duration: GroupBanDuration; reason?: string | null; deleteMessages?: boolean },
    publicUrl: PublicUrl = () => null,
  ): Promise<GroupBan> {
    const targetId = input.userId;
    const reason = cleanNote(input.reason, GROUP_BAN_REASON_MAX);
    if (targetId === actorId) throw new AppError('BAD_TARGET', 400, 'you cannot ban yourself');
    const until = banEndsAt(input.duration, new Date());
    const { ban, told } = await this.inTransaction(async (client) => {
      // the person first, as a join or an add takes it, so neither slips past the ban
      await lockPersonFor(client, 'groups', targetId);
      const g = await client.query<NoticeGroup & { archived_at: Date | null; actor_role: string | null; target_role: string | null; posted: boolean }>(
        `SELECT g.id, g.name, g.privacy, g.archived_at,
                (SELECT role FROM group_members WHERE group_id = g.id AND user_id = $2) AS actor_role,
                (SELECT role FROM group_members WHERE group_id = g.id AND user_id = $3) AS target_role,
                EXISTS (SELECT 1 FROM group_messages gm WHERE gm.group_id = g.id AND gm.sender_id = $3
                          AND (g.privacy <> 'open' OR ${writtenForSql('gm.sender_id', '$2::uuid')})) AS posted
           FROM groups g WHERE g.id = $1`,
        [groupId, actorId, targetId],
      );
      const grp = g.rows[0];
      if (!grp || grp.archived_at) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
      const actorRole = grp.actor_role && isRole(grp.actor_role) ? grp.actor_role : null;
      if (!actorRole || !canModerateGroup(actorRole)) throw new AppError('NOT_GROUP_ADMIN', 403, 'only the owner and admins can ban');
      const targetRole = grp.target_role && isRole(grp.target_role) ? grp.target_role : null;
      if (targetRole === 'owner') throw new AppError('FORBIDDEN', 403, 'the owner cannot be banned');
      if (targetRole && !canManage(actorRole, targetRole)) throw new AppError('FORBIDDEN', 403, 'not allowed to ban that member');
      const already = await this.banInForce(client, groupId, targetId);
      if (!targetRole && !grp.posted && !already) throw new AppError('BAD_TARGET', 404, 'not a member');

      if (targetRole) await client.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, targetId]);
      // one that ran out was deleted above, so this replaces only a ban in force, keeping its declines and its stop
      const row = await client.query<{
        until: Date | null; reason: string | null; created_at: Date; requests_closed: boolean;
        username: string; profile_photo_key: string | null; selected_avatar_key: string | null; banned_by: string | null;
      }>(
        `WITH b AS (
           INSERT INTO group_bans (group_id, user_id, banned_by, reason, until) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (group_id, user_id) DO UPDATE
              SET banned_by = EXCLUDED.banned_by, reason = EXCLUDED.reason, until = EXCLUDED.until, created_at = now()
           RETURNING user_id, banned_by, reason, until, created_at, requests_closed
         )
         SELECT b.until, b.reason, b.created_at, b.requests_closed, u.username, u.profile_photo_key, u.selected_avatar_key,
                a.username AS banned_by
           FROM b JOIN users u ON u.id = b.user_id LEFT JOIN users a ON a.id = b.banned_by`,
        [groupId, targetId, actorId, reason, until],
      );
      if (input.deleteMessages) {
        await client.query(
          `UPDATE group_messages SET deleted_at = now() WHERE group_id = $1 AND sender_id = $2 AND deleted_at IS NULL`,
          [groupId, targetId],
        );
      }
      const lines = [{ userId: targetId, notification: bannedNotice(grp, input.duration, until, reason) }];
      await recordNotifications(client, lines);
      const r = row.rows[0]!;
      const ban: GroupBan = {
        userId: targetId,
        username: r.username,
        avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl),
        until: r.until ? r.until.toISOString() : null,
        reason: r.reason,
        bannedBy: r.banned_by,
        at: r.created_at.toISOString(),
        requestsClosed: r.requests_closed,
      };
      return { ban, told: lines };
    });
    await this.push(told);
    return ban;
  }

  /**
   * Lift a ban, as the owner or an admin. It does not add them back: they may
   * join or be added again. A request of theirs still waiting is closed with
   * it (withdrawn, by the admin who lifted the ban).
   */
  async unban(actorId: string, groupId: string, targetId: string): Promise<void> {
    await this.requireModerator(this.pool, groupId, actorId);
    await this.pool.query(
      `WITH gone AS (DELETE FROM group_bans WHERE group_id = $1 AND user_id = $2 RETURNING user_id)
       UPDATE group_rejoin_requests SET status = 'withdrawn', decided_at = now(), decided_by = $3
        WHERE group_id = $1 AND user_id = $2 AND status = 'pending' AND EXISTS (SELECT 1 FROM gone)`,
      [groupId, targetId, actorId],
    );
  }

  /**
   * The bans in force, newest first, for the owner and admins. In an open
   * group, as on its roster, nobody they may not see is named (`shownToSql`).
   */
  async bans(actorId: string, groupId: string, publicUrl: PublicUrl = () => null): Promise<GroupBan[]> {
    await this.requireModerator(this.pool, groupId, actorId);
    const r = await this.pool.query<{
      user_id: string; username: string; profile_photo_key: string | null; selected_avatar_key: string | null;
      until: Date | null; reason: string | null; banned_by: string | null; created_at: Date; requests_closed: boolean;
    }>(
      `SELECT b.user_id, u.username, u.profile_photo_key, u.selected_avatar_key, b.until, b.reason, a.username AS banned_by,
              b.created_at, b.requests_closed
         FROM group_bans b
         JOIN groups g ON g.id = b.group_id
         JOIN users u ON u.id = b.user_id
         LEFT JOIN users a ON a.id = b.banned_by
        WHERE b.group_id = $1 AND ${inForce('b')} AND (g.privacy = 'invite' OR ${shownToSql('u', '$2::uuid')})
        ORDER BY b.created_at DESC`,
      [groupId, actorId],
    );
    return r.rows.map((b) => ({
      userId: b.user_id,
      username: b.username,
      avatarUrl: resolveAvatarUrl(b.profile_photo_key, b.selected_avatar_key, publicUrl),
      until: b.until ? b.until.toISOString() : null,
      reason: b.reason,
      bannedBy: b.banned_by,
      at: b.created_at.toISOString(),
      requestsClosed: b.requests_closed,
    }));
  }

  /**
   * Ask to come back, as someone banned from the group right now. Never a
   * way to pester its admins: one request waits at a time (the database holds
   * it), each one turned down makes the next wait longer, the admins can stop
   * them, and the route caps how many a person sends a day across all groups.
   * An open group is for known adults, so only one may ask to come back to it.
   */
  async requestToRejoin(userId: string, groupId: string, rawNote?: string | null): Promise<GroupRequestState> {
    const note = cleanNote(rawNote, GROUP_REQUEST_NOTE_MAX);
    const { state, told } = await this.inTransaction(async (client) => {
      const g = await client.query<NoticeGroup & { archived_at: Date | null; not_adult: boolean }>(
        `SELECT g.id, g.name, g.privacy, g.archived_at, ${notKnownAdultSql('u')} AS not_adult
           FROM groups g JOIN users u ON u.id = $2 WHERE g.id = $1`,
        [groupId, userId],
      );
      const grp = g.rows[0];
      if (!grp || grp.archived_at) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
      if (grp.privacy === 'open' && grp.not_adult) throw openGroupsAdultsOnly();
      const ban = await this.banInForce(client, groupId, userId);
      if (!ban) throw new AppError('NOT_BANNED', 409, 'you are not banned from this group: join it or be added');
      if (ban.requests_closed) throw new AppError('REQUESTS_CLOSED', 403, 'the admins are not taking requests from you');
      if (ban.pending) throw new AppError('REQUEST_PENDING', 409, 'your request is already waiting');
      if (ban.waiting && ban.request_after) {
        throw new AppError('REQUEST_WAIT', 429, 'you can ask again later', {
          until: ban.request_after.toISOString(),
          retryAfterSec: Math.ceil((ban.request_after.getTime() - Date.now()) / 1000),
        });
      }
      const sent = await client.query<{ created_at: Date }>(
        `INSERT INTO group_rejoin_requests (group_id, user_id, note) VALUES ($1, $2, $3) RETURNING created_at`,
        [groupId, userId, note],
      );
      const state: GroupRequestState = { kind: 'pending', sentAt: sent.rows[0]!.created_at.toISOString() };
      return { state, told: await this.tellAdmins(client, grp) };
    });
    await this.push(told);
    return state;
  }

  /**
   * The line to each owner and admin about the requests waiting, for those
   * not told about this group in the last day ("Someone asked…", a day later
   * "3 people asked…"). Written in the caller's transaction under the group's
   * own lock, so two requests at once tell them once; the count is what each
   * of them will find waiting.
   */
  private async tellAdmins(client: Pick<pg.Pool, 'query'>, group: NoticeGroup): Promise<Array<{ userId: string; notification: Notification }>> {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`group-requests:${group.id}`]);
    const admins = await client.query<{ user_id: string; n: number }>(
      `SELECT m.user_id, (${waitingRequestsSql('m.group_id', 'm.user_id')}) AS n
         FROM group_members m
        WHERE m.group_id = $1 AND m.role IN ('owner', 'moderator')
          AND NOT EXISTS (SELECT 1 FROM notifications x
                           WHERE x.user_id = m.user_id AND x.created_at > now() - interval '1 day'
                             AND x.data->>'kind' = 'group_request' AND x.data->>'groupId' = $1::text)`,
      [group.id],
    );
    const lines = admins.rows.filter((a) => a.n > 0).map((a) => ({ userId: a.user_id, notification: requestNotice(group, a.n) }));
    await recordNotifications(client, lines);
    return lines;
  }

  /** Take back a request still waiting. It adds no wait before the next. */
  async withdrawRequest(userId: string, groupId: string): Promise<void> {
    await this.pool.query(
      `UPDATE group_rejoin_requests SET status = 'withdrawn', decided_at = now()
        WHERE group_id = $1 AND user_id = $2 AND status = 'pending'`,
      [groupId, userId],
    );
  }

  /** The requests to come back waiting, oldest first, for the owner and admins (the ones `waitingRequestsSql` counts). */
  async requests(actorId: string, groupId: string, publicUrl: PublicUrl = () => null): Promise<GroupRejoinRequest[]> {
    await this.requireModerator(this.pool, groupId, actorId);
    const r = await this.pool.query<{
      user_id: string; username: string; profile_photo_key: string | null; selected_avatar_key: string | null;
      note: string | null; created_at: Date; declines: number;
    }>(
      `SELECT r.user_id, u.username, u.profile_photo_key, u.selected_avatar_key, r.note, r.created_at, b.declines
         FROM group_rejoin_requests r
         JOIN group_bans b ON b.group_id = r.group_id AND b.user_id = r.user_id AND ${inForce('b')}
         JOIN users u ON u.id = r.user_id
        WHERE r.group_id = $1 AND r.status = 'pending' AND ${notBlockedSql('r.user_id', '$2::uuid')}
        ORDER BY r.created_at ASC`,
      [groupId, actorId],
    );
    return r.rows.map((q) => ({
      userId: q.user_id,
      username: q.username,
      avatarUrl: resolveAvatarUrl(q.profile_photo_key, q.selected_avatar_key, publicUrl),
      note: q.note,
      sentAt: q.created_at.toISOString(),
      declines: q.declines,
    }));
  }

  /** Answer the request `targetId` has waiting under a ban in force; 404 REQUEST_NOT_FOUND when there is none. */
  private async answer(client: Pick<pg.Pool, 'query'>, groupId: string, targetId: string, actorId: string, status: 'approved' | 'declined'): Promise<BanRow> {
    const ban = await this.banInForce(client, groupId, targetId);
    const answered = ban?.pending
      ? await client.query(
          `UPDATE group_rejoin_requests SET status = $3, decided_at = now(), decided_by = $4
            WHERE group_id = $1 AND user_id = $2 AND status = 'pending'`,
          [groupId, targetId, status, actorId],
        )
      : null;
    if (!ban || !answered?.rowCount) throw new AppError('REQUEST_NOT_FOUND', 404, 'no request from them is waiting');
    return ban;
  }

  /**
   * Let someone back, as the owner or an admin: in one transaction the ban
   * is lifted and they are a member again — when every rule for being put in
   * a group allows it: room in the group, their own group limit, an open
   * group only for a known adult, and an invite-only one only by a friend of
   * theirs (the rule an add keeps). When one does not, the ban is still
   * lifted and `rejoined` is false: they can join, or be added, as anyone can.
   */
  async approve(actorId: string, groupId: string, targetId: string): Promise<{ rejoined: boolean }> {
    const { rejoined, told } = await this.inTransaction(async (client) => {
      await lockPersonFor(client, 'groups', targetId);
      await this.requireModerator(client, groupId, actorId);
      await this.answer(client, groupId, targetId, actorId, 'approved');
      await client.query(`DELETE FROM group_bans WHERE group_id = $1 AND user_id = $2`, [groupId, targetId]);
      const grp = await this.noticeGroup(client, groupId);
      const allowed = grp.privacy === 'open' ? !(await isNotKnownAdultUser(client, targetId)) : await areFriends(client, actorId, targetId);
      let back = false;
      if (allowed) {
        // a limit or a full group refuses with an error; the ban stays lifted all the same
        await client.query('SAVEPOINT rejoin');
        try {
          await assertGroupRoom(client, targetId, { joining: true, theirs: true });
          await this.addMember(client, groupId, targetId);
          await client.query('RELEASE SAVEPOINT rejoin');
          back = true;
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          await client.query('ROLLBACK TO SAVEPOINT rejoin');
        }
      }
      const lines = [{ userId: targetId, notification: approvedNotice(grp, back) }];
      await recordNotifications(client, lines);
      return { rejoined: back, told: lines };
    });
    await this.push(told);
    return { rejoined };
  }

  /**
   * Turn a request down, as the owner or an admin: one more turned down, the
   * next request waits longer (`requestCooldownDays`), and with `stopRequests`
   * none is taken from them again while this ban lasts.
   */
  async decline(actorId: string, groupId: string, targetId: string, stopRequests = false): Promise<void> {
    const told = await this.inTransaction(async (client) => {
      await this.requireModerator(client, groupId, actorId);
      const ban = await this.answer(client, groupId, targetId, actorId, 'declined');
      const declines = ban.declines + 1;
      const next = await client.query<{ request_after: Date }>(
        `UPDATE group_bans SET declines = $3, request_after = now() + make_interval(days => $4), requests_closed = $5
          WHERE group_id = $1 AND user_id = $2 RETURNING request_after`,
        [groupId, targetId, declines, requestCooldownDays(declines), stopRequests],
      );
      const grp = await this.noticeGroup(client, groupId);
      const lines = [{ userId: targetId, notification: declinedNotice(grp, stopRequests ? null : next.rows[0]!.request_after) }];
      await recordNotifications(client, lines);
      return lines;
    });
    await this.push(told);
  }

  /**
   * A group with its roster, for any signed-in viewer, and where the viewer
   * stands with it (`standing`): a member, out (free to join or be added), or
   * banned with where asking to come back stands. Its owner and admins are
   * also told how many requests to come back wait for them.
   *
   * The roster names a minor (or an account whose age is not on record yet)
   * only to the people already around them: themselves, their friends, and the
   * other members of an invite-only group they are in — a group someone they
   * chose put them in. Anyone else reading any group's roster, which takes no
   * more than its id, sees the adults only (users/age.ts `shownToSql`) — and
   * no `ownerId` either when the owner is one they may not see, or the id
   * would name the one person the roster leaves out. `memberCount` stays the
   * group's real size, the number every list of groups shows.
   *
   * Two statements however many members (the apps poll it): the group with
   * everything about the viewer, then the roster.
   */
  async get(groupId: string, viewerId: string, publicUrl: PublicUrl = () => null): Promise<GroupDetail> {
    const g = await this.pool.query<{
      id: string; name: string; description: string | null; privacy: 'open' | 'invite'; owner_id: string | null; archived_at: Date | null;
      n: number; photo_key: string | null; my_role: string | null; owner_shown: boolean;
      banned: boolean; until: Date | null; reason: string | null; waiting: boolean; request_after: Date | null; requests_closed: boolean | null;
      request_sent_at: Date | null; pending_requests: number | null;
    }>(
      `SELECT g.id, g.name, g.description, g.privacy, g.owner_id, g.archived_at, g.photo_key,
              (SELECT count(*)::int FROM group_members x WHERE x.group_id = g.id) AS n,
              me.role AS my_role,
              (g.owner_id IS NULL OR COALESCE((SELECT ${shownToSql('o', '$2::uuid')} FROM users o WHERE o.id = g.owner_id), false)) AS owner_shown,
              b.user_id IS NOT NULL AS banned, b.until, b.reason, b.request_after, b.requests_closed,
              COALESCE(b.request_after > now(), false) AS waiting,
              (SELECT r.created_at FROM group_rejoin_requests r
                WHERE r.group_id = g.id AND r.user_id = $2 AND r.status = 'pending') AS request_sent_at,
              CASE WHEN me.role IN ('owner', 'moderator') THEN (${waitingRequestsSql('g.id', '$2::uuid')}) END AS pending_requests
         FROM groups g
         LEFT JOIN group_members me ON me.group_id = g.id AND me.user_id = $2
         LEFT JOIN group_bans b ON b.group_id = g.id AND b.user_id = $2 AND ${inForce('b')}
        WHERE g.id = $1`,
      [groupId, viewerId],
    );
    const grp = g.rows[0];
    if (!grp) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
    const myRole = grp.my_role && isRole(grp.my_role) ? grp.my_role : null;
    const seesEveryone = myRole !== null && grp.privacy === 'invite';
    const members = await this.pool.query<{
      user_id: string; username: string; role: string; joined_at: Date;
      profile_photo_key: string | null; selected_avatar_key: string | null;
    }>(
      `SELECT m.user_id, u.username, m.role, m.joined_at, u.profile_photo_key, u.selected_avatar_key
         FROM group_members m JOIN users u ON u.id = m.user_id
        WHERE m.group_id = $1 AND ($3::boolean OR ${shownToSql('u', '$2::uuid')})
        ORDER BY m.role = 'owner' DESC, m.role = 'moderator' DESC, u.username`,
      [groupId, viewerId, seesEveryone],
    );
    const list: GroupMember[] = members.rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl),
      role: isRole(r.role) ? r.role : 'member',
      joinedAt: r.joined_at.toISOString(),
    }));
    return {
      id: grp.id,
      name: grp.name,
      description: grp.description,
      privacy: grp.privacy,
      ownerId: seesEveryone || grp.owner_shown ? grp.owner_id : null,
      archivedAt: grp.archived_at ? grp.archived_at.toISOString() : null,
      memberCount: grp.n,
      photoUrl: grp.photo_key ? publicUrl(grp.photo_key) : null,
      members: list,
      myRole,
      standing: standingOf(myRole, grp),
      ...(canModerateGroup(myRole) ? { pendingRequests: grp.pending_requests ?? 0 } : {}),
    };
  }

  /** Groups the user belongs to. */
  async myGroups(userId: string, publicUrl: PublicUrl = () => null): Promise<Array<Group & { myRole: Role }>> {
    const rows = await this.pool.query<{
      id: string; name: string; description: string | null; privacy: 'open' | 'invite'; owner_id: string | null; archived_at: Date | null; role: string; n: number;
      photo_key: string | null;
    }>(
      `SELECT g.id, g.name, g.description, g.privacy, g.owner_id, g.archived_at, m.role, g.photo_key,
              (SELECT count(*)::int FROM group_members x WHERE x.group_id = g.id) AS n
         FROM group_members m JOIN groups g ON g.id = m.group_id
        WHERE m.user_id = $1 ORDER BY g.name`,
      [userId],
    );
    return rows.rows.map((r) => ({
      id: r.id, name: r.name, description: r.description, privacy: r.privacy, ownerId: r.owner_id,
      archivedAt: r.archived_at ? r.archived_at.toISOString() : null, memberCount: r.n,
      photoUrl: r.photo_key ? publicUrl(r.photo_key) : null,
      myRole: isRole(r.role) ? r.role : 'member',
    }));
  }

  /**
   * Open groups for discovery (not archived, not full). None for a minor, who
   * cannot join any of them, nor for an account whose age is not on record yet.
   * `banned` marks one the viewer is banned from, which offers no Join.
   */
  async discover(viewerId: string, limit = 30, publicUrl: PublicUrl = () => null): Promise<Array<Group & { joined: boolean; banned: boolean }>> {
    if (await isNotKnownAdultUser(this.pool, viewerId)) return [];
    const rows = await this.pool.query<{
      id: string; name: string; description: string | null; privacy: 'open' | 'invite'; owner_id: string | null; archived_at: Date | null; n: number;
      photo_key: string | null; joined: boolean; banned: boolean;
    }>(
      // an open group's owner is a known adult (a minor's are handed on when
      // their age is recorded), but one whose age is not on record yet is not named
      `SELECT g.id, g.name, g.description, g.privacy,
              CASE WHEN o.id IS NULL OR ${shownToSql('o', '$2::uuid')} THEN g.owner_id END AS owner_id,
              g.archived_at, g.photo_key,
              (SELECT count(*)::int FROM group_members x WHERE x.group_id = g.id) AS n,
              EXISTS (SELECT 1 FROM group_members y WHERE y.group_id = g.id AND y.user_id = $2::uuid) AS joined,
              EXISTS (SELECT 1 FROM group_bans b WHERE b.group_id = g.id AND b.user_id = $2::uuid AND ${inForce('b')}) AS banned
         FROM groups g LEFT JOIN users o ON o.id = g.owner_id
        WHERE g.privacy = 'open' AND g.archived_at IS NULL
        ORDER BY n DESC LIMIT $1`,
      [limit, viewerId],
    );
    return rows.rows.map((r) => ({
      id: r.id, name: r.name, description: r.description, privacy: r.privacy, ownerId: r.owner_id,
      archivedAt: r.archived_at ? r.archived_at.toISOString() : null, memberCount: r.n,
      photoUrl: r.photo_key ? publicUrl(r.photo_key) : null,
      joined: r.joined,
      banned: r.banned,
    }));
  }

  /** Group's total XP this week (group leaderboard hook, KUR-084). */
  async weeklyXp(groupId: string, now: Date = new Date()): Promise<number> {
    const r = await this.pool.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(l.amount), 0)::text sum
         FROM group_members m JOIN xp_ledger l ON l.user_id = m.user_id
        WHERE m.group_id = $1 AND l.amount > 0 AND l.created_at >= $2::date`,
      [groupId, weekStart(now)],
    );
    return Number(r.rows[0]?.sum ?? 0);
  }

  /**
   * Heal groups whose owner's account was deleted (owner_id nulled): promote the
   * oldest moderator, else the oldest member, else archive the empty group.
   */
  async reconcileOwnerless(): Promise<number> {
    const orphans = await this.pool.query<{ id: string }>(
      `SELECT id FROM groups WHERE owner_id IS NULL AND archived_at IS NULL`,
    );
    await handOnGroups(this.pool, orphans.rows.map((g) => g.id));
    return orphans.rows.length;
  }
}

/**
 * Give a group with no owner a new one: the oldest moderator, else the oldest
 * member, else the group is archived. Runs in the caller's transaction when
 * given one. Used for an owner whose account was deleted, and for one taken
 * out of an open group because they turned out to be a minor.
 */
export async function handOnGroup(executor: Pick<pg.Pool, 'query'>, groupId: string): Promise<void> {
  await handOnGroups(executor, [groupId]);
}

/**
 * `handOnGroup` for every one of these groups, in one statement: each
 * group's successor is picked as there, promoted and named owner, and a group
 * with nobody left is archived. Each group is decided on its own rows only.
 */
export async function handOnGroups(executor: Pick<pg.Pool, 'query'>, groupIds: readonly string[]): Promise<void> {
  if (groupIds.length === 0) return;
  await executor.query(
    `WITH next AS (
       SELECT DISTINCT ON (m.group_id) m.group_id, m.user_id FROM group_members m
        WHERE m.group_id = ANY($1::uuid[])
        ORDER BY m.group_id, m.role = 'moderator' DESC, m.joined_at ASC
     ), promoted AS (
       UPDATE group_members gm SET role = 'owner' FROM next WHERE gm.group_id = next.group_id AND gm.user_id = next.user_id
     ), owned AS (
       UPDATE groups g SET owner_id = next.user_id FROM next WHERE g.id = next.group_id
     )
     UPDATE groups g SET owner_id = NULL, archived_at = now()
      WHERE g.id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM next WHERE next.group_id = g.id)`,
    [groupIds],
  );
}

/**
 * Take a user out of every open group they are in, handing on any they own,
 * and say which groups they left so the caller can close their live rooms.
 *
 * For the day an account is found to be a minor's: minors cannot be in an
 * open group, and one left in it would stay on the roster everybody reads, or
 * be the owner of a group whose chat they can no longer open.
 */
export async function leaveOpenGroups(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<string[]> {
  const left = await executor.query<{ group_id: string; role: string }>(
    `DELETE FROM group_members m USING groups g
      WHERE m.group_id = g.id AND g.privacy = 'open' AND m.user_id = $1
      RETURNING m.group_id, m.role`,
    [userId],
  );
  // the ones they owned handed on together, not one by one
  const owned = left.rows.filter((r) => r.role === 'owner').map((r) => r.group_id);
  if (owned.length > 0) {
    await executor.query(`UPDATE groups SET owner_id = NULL WHERE id = ANY($1::uuid[]) AND owner_id = $2`, [owned, userId]);
    await handOnGroups(executor, owned);
  }
  return left.rows.map((r) => r.group_id);
}
