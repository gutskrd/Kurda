import type pg from 'pg';
import { stripHiddenChars } from '@kurda/shared';
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
  type PendingPicture,
  type Role,
} from '@kurda/shared';
import { limitReached, lockPersonFor } from '../limits/limits.js';
import { unconfirmIfUnused } from '../media/groupPhoto.js';
import { filterText } from '../moderation/filter.js';
import { recordNotifications } from '../notifications/inbox-service.js';
import { parentalAllows } from '../parental/supervision.js';
import type { Notification } from '../push/service.js';
import { notBlockedSql } from '../friends/blocked.js';
import { isNotKnownAdultUser } from '../users/age.js';
import { accountUnavailable, availableSql } from '../moderation/availability.js';
import { approvedNotice, bannedNotice, declinedNotice, ownerChangedNotice, removedNotice, requestNotice, type NoticeGroup, type PushNotice } from './notices.js';

/** A group's name or description as stored: without control characters or the invisible ones a name could hide behind. */
function cleanGroupText(text: string): string {
  return stripHiddenChars(text).trim();
}

/**
 * Every member reads a group's name and description, and banned people its name, so words the chat would mask are
 * refused rather than published masked. Ban reasons and request notes are held to the same.
 */
function screenGroupText(...texts: Array<string | null | undefined>): void {
  for (const text of texts) {
    if (text && filterText(text).flagged) {
      throw new AppError('GROUP_TEXT_REJECTED', 422, 'the text has words that are not allowed here');
    }
  }
}

/** A ban reason or request note as stored: cleaned like group text, empty as null, refused past `max` or for banned words. */
function cleanNote(text: string | null | undefined, max: number): string | null {
  const clean = text != null ? cleanGroupText(text) || null : null;
  if (clean && clean.length > max) throw new AppError('TEXT_TOO_LONG', 400, `at most ${max} characters`);
  screenGroupText(clean);
  return clean;
}
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { canonicalPair } from '../friends/pair.js';

/** SQL: the ban behind `alias` is in force, permanent or not yet expired. `alias` is always a literal here. */
const inForce = (alias: string): string => `(${alias}.until IS NULL OR ${alias}.until > now())`;

/**
 * SQL: how many requests to come back wait in group `group` as owner or admin `viewer` sees them: from people still
 * banned, and not from anyone with a block between them and the viewer.
 */
function waitingRequestsSql(group: string, viewer: string): string {
  return `SELECT count(*)::int FROM group_rejoin_requests wr
             JOIN group_bans wb ON wb.group_id = wr.group_id AND wb.user_id = wr.user_id AND ${inForce('wb')}
            WHERE wr.group_id = ${group} AND wr.status = 'pending' AND ${notBlockedSql('wr.user_id', viewer)}`;
}

/** A ban in force on one person, as the paths that change it read it. */
interface BanRow {
  until: Date | null;
  declines: number;
  /** A request was turned down and the next may not be sent yet. */
  waiting: boolean;
  request_after: Date | null;
  requests_closed: boolean;
  /** a request of theirs is waiting */
  pending: boolean;
}

/** Where the viewer stands with a group, from `GroupService.get`'s read: a member, or someone banned from it. */
function standingOf(
  role: Role | null,
  row: { until: Date | null; reason: string | null; waiting: boolean; request_after: Date | null; requests_closed: boolean | null; request_sent_at: Date | null },
): GroupStanding {
  if (role) return { kind: 'member', role };
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
 * Holds a person to the group limits (`MAX_GROUPS_OWNED`, `MAX_GROUP_MEMBERSHIPS`) before giving them one more group,
 * under their lock in the caller's transaction; archived groups do not count. `theirs` is for a group someone else
 * hands them, so the refusal says whose limit it is. The person's lock is taken before any group row, the order
 * every path here keeps.
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

/**
 * A group as `GET /groups/:id` answers a member: its roster and where the viewer stands. A banned person gets the
 * same shape with only the name, picture and standing filled in.
 */
export interface GroupDetail extends Group {
  members: GroupMember[];
  myRole: Role | null;
  standing: GroupStanding;
  /** requests to come back waiting for an answer: for the owner and admins only */
  pendingRequests?: number;
}

/**
 * Groups with owner, moderator and member roles and a 100-member cap. Ownership transfers explicitly; when an
 * owner's account is deleted, the reconcile pass promotes the oldest moderator, else the oldest member, else
 * archives the group. Weekly XP is summed from members' ledgers for the group leaderboard.
 *
 * Every group is private: its name, picture, description, roster and messages are for members, it is a 404 to
 * anyone else, and nothing lists or suggests groups. A banned person is still told its name, picture and their
 * standing, so they can ask to come back.
 *
 * The only way in is the owner or a moderator adding one of their friends (`invite`). The rule is the same for every
 * account, so an add reveals nothing about age, and since a minor starts all their own friendships, every group a
 * minor is in was chosen for them by someone they chose. That is why members see each other whole, whatever their
 * ages. Groups that were open before (`groups.privacy` = 'open', migration 1751000420000) are the exception: their
 * members walked in, so they stay rooms for known adults (`staysAdultsOnly`), and a game shared there admits nobody
 * on that account (play/access.ts).
 *
 * A person owns at most MAX_GROUPS_OWNED groups and is in at most MAX_GROUP_MEMBERSHIPS (`assertGroupRoom`), except
 * for a group the server hands on (`handOnGroups`). Someone removed may be added again; someone banned may not until
 * the ban ends or is lifted, but may ask to come back, and an approval from an admin who is not their friend lifts
 * the ban without adding them.
 */
export class GroupService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: { push?: PushNotice; log?: { warn(obj: unknown, msg: string): void } } = {},
  ) {}

  /** Pushes notifications already written, after the change commits; a failed push is logged and the change stands. */
  private async push(items: ReadonlyArray<{ userId: string; notification: Notification }>): Promise<void> {
    const push = this.deps.push;
    if (!push) return;
    for (const { userId, notification } of items) {
      await push(userId, notification).catch((err: unknown) => this.deps.log?.warn({ err, userId }, 'group notice not pushed'));
    }
  }

  /** The user's role in the group, or null if not a member. */
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

  /** Start a group: a name is all it needs. Whoever makes it owns it and is its first member. */
  async create(ownerId: string, input: { name: string; description?: string }): Promise<{ id: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Strip control and invisible characters from user-visible text.
      const name = cleanGroupText(input.name);
      const description = input.description != null ? cleanGroupText(input.description) || null : null;
      screenGroupText(name, description);
      // the maker owns it and is in it: both limits, under their lock
      await assertGroupRoom(client, ownerId, { owning: true, joining: true });
      const g = await client.query<{ id: string }>(
        `INSERT INTO groups (name, description, owner_id) VALUES ($1, $2, $3) RETURNING id`,
        [name, description, ownerId],
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

  /**
   * Whether this group must stay closed to this person: it was open once, so its members are strangers, and the
   * person is not known to be an adult. The refusal says only that the group takes nobody new.
   */
  private async staysAdultsOnly(client: Pick<pg.Pool, 'query'>, groupId: string, userId: string): Promise<boolean> {
    const g = await client.query<{ was_open: boolean }>(`SELECT privacy = 'open' AS was_open FROM groups WHERE id = $1`, [groupId]);
    return g.rows[0]?.was_open === true && (await isNotKnownAdultUser(client, userId));
  }

  /**
   * Every way into a group comes here, so a teen whose parent switched group chats off is kept out whichever way it is
   * (added by an admin, or let back after asking while it was on), told as a held account is so nobody learns why.
   */
  private async addMember(client: Pick<pg.Pool, 'query'>, groupId: string, userId: string): Promise<void> {
    if (!(await parentalAllows(client, userId, 'chat'))) throw new AppError('CANNOT_JOIN_YET', 409, 'they can’t join groups right now');
    const g = await client.query<{ archived_at: Date | null; n: number }>(
      `SELECT archived_at,
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
   * The ban on `userId` in this group while in force, its row locked for the caller's transaction, or null. An expired
   * ban is deleted when met, closing any request still waiting on it as withdrawn, so neither returns with a later ban.
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
   * An owner or moderator adds one of their friends, the only way into a group. It never looks at the added person's
   * age, so no answer can tell a minor's account from an adult's. Refused while they are banned; the person's lock is
   * taken first, as a ban takes it, so a ban and an add cannot pass each other.
   */
  async invite(inviterId: string, groupId: string, targetId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const role = await this.requireRole(client, groupId, inviterId);
      if (role !== 'owner' && role !== 'moderator') throw new AppError('FORBIDDEN', 403, 'only staff can invite');
      if (!(await areFriends(client, inviterId, targetId))) {
        throw new AppError('NOT_FRIENDS', 403, 'you can only add your friends to a group');
      }
      if (await this.staysAdultsOnly(client, groupId, targetId)) {
        throw new AppError('FORBIDDEN', 403, 'this group takes nobody new');
      }
      // nobody suspended or banned is added, nor an account held while a person checks it (moderation/returns.ts)
      const target = await client.query<{ unavailable: boolean; held: boolean }>(
        `SELECT NOT ${availableSql('users')} AS unavailable, held_at IS NOT NULL AS held FROM users WHERE id = $1`,
        [targetId],
      );
      if (target.rows[0]?.unavailable) throw accountUnavailable();
      if (target.rows[0]?.held) throw new AppError('CANNOT_JOIN_YET', 409, 'they can’t join groups right now');
      if (!(await this.roleOf(client, groupId, targetId))) {
        // someone banned is let back by lifting the ban first, never by being added past it
        await lockPersonFor(client, 'groups', targetId);
        if (await this.banInForce(client, groupId, targetId)) {
          throw new AppError('MEMBER_BANNED', 409, 'they are banned from this group; lift the ban first');
        }
        // their limit, not the inviter's; like the rule above it is the same for every account
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

  /** Takes a member out without a ban, so they can be added again; their notification says so. */
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
   * Changes a group's name, description or both, as owner or admin (`canEditGroup`). The text is cleaned and limited
   * as at creation, and an empty description clears it. Who changed it and when are kept, so a report about the new
   * name reaches its author. To a non-member the group does not exist.
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
      const role = await this.roleOf(client, groupId, actorId);
      if (!g.rows[0] || g.rows[0].archived_at || !role) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
      if (!canEditGroup(role)) throw new AppError('NOT_GROUP_ADMIN', 403, 'only the owner and admins can change the group');
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
    const r = await executor.query<NoticeGroup>(`SELECT id, name FROM groups WHERE id = $1`, [groupId]);
    if (!r.rows[0]) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
    return r.rows[0];
  }

  /**
   * Bans someone, as owner or admin, over a member they outrank (`canManage`); nobody bans themselves or the owner.
   * The person must be in the group, have posted in it (so leaving first does not escape a ban), or be banned already,
   * in which case this replaces the ban but keeps their request standing. In one transaction: out of the group, the
   * ban, with `deleteMessages` their messages removed, and the notification. The caller removes them from the live
   * room and tells the room their messages went.
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
      // the person first, as an add takes it, so it cannot slip past the ban
      await lockPersonFor(client, 'groups', targetId);
      const g = await client.query<NoticeGroup & { archived_at: Date | null; actor_role: string | null; target_role: string | null; posted: boolean }>(
        `SELECT g.id, g.name, g.archived_at,
                (SELECT role FROM group_members WHERE group_id = g.id AND user_id = $2) AS actor_role,
                (SELECT role FROM group_members WHERE group_id = g.id AND user_id = $3) AS target_role,
                EXISTS (SELECT 1 FROM group_messages gm WHERE gm.group_id = g.id AND gm.sender_id = $3) AS posted
           FROM groups g WHERE g.id = $1`,
        [groupId, actorId, targetId],
      );
      const grp = g.rows[0];
      const actorRole = grp?.actor_role && isRole(grp.actor_role) ? grp.actor_role : null;
      // to someone who is not in it, there is no such group
      if (!grp || grp.archived_at || !actorRole) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
      if (!canModerateGroup(actorRole)) throw new AppError('NOT_GROUP_ADMIN', 403, 'only the owner and admins can ban');
      const targetRole = grp.target_role && isRole(grp.target_role) ? grp.target_role : null;
      if (targetRole === 'owner') throw new AppError('FORBIDDEN', 403, 'the owner cannot be banned');
      if (targetRole && !canManage(actorRole, targetRole)) throw new AppError('FORBIDDEN', 403, 'not allowed to ban that member');
      const already = await this.banInForce(client, groupId, targetId);
      if (!targetRole && !grp.posted && !already) throw new AppError('BAD_TARGET', 404, 'not a member');

      if (targetRole) await client.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, targetId]);
      // Expired bans were deleted above, so this replaces only a ban in force, keeping its declines and stop.
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
   * Lifts a ban, as owner or admin, without adding them back; they may be added again. A waiting request of theirs is
   * closed as withdrawn by that admin.
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

  /** The bans in force, newest first, for the owner and admins. */
  async bans(actorId: string, groupId: string, publicUrl: PublicUrl = () => null): Promise<GroupBan[]> {
    await this.requireModerator(this.pool, groupId, actorId);
    const r = await this.pool.query<{
      user_id: string; username: string; profile_photo_key: string | null; selected_avatar_key: string | null;
      until: Date | null; reason: string | null; banned_by: string | null; created_at: Date; requests_closed: boolean;
    }>(
      `SELECT b.user_id, u.username, u.profile_photo_key, u.selected_avatar_key, b.until, b.reason, a.username AS banned_by,
              b.created_at, b.requests_closed
         FROM group_bans b
         JOIN users u ON u.id = b.user_id
         LEFT JOIN users a ON a.id = b.banned_by
        WHERE b.group_id = $1 AND ${inForce('b')}
        ORDER BY b.created_at DESC`,
      [groupId],
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
   * Asks to come back, as someone banned now. One request waits at a time (enforced by the database), each refusal
   * lengthens the next wait, admins can stop requests, and the route caps them per day across groups. To anyone
   * neither banned nor a member the group does not exist.
   */
  async requestToRejoin(userId: string, groupId: string, rawNote?: string | null): Promise<GroupRequestState> {
    const note = cleanNote(rawNote, GROUP_REQUEST_NOTE_MAX);
    const { state, told } = await this.inTransaction(async (client) => {
      const g = await client.query<NoticeGroup & { archived_at: Date | null }>(`SELECT g.id, g.name, g.archived_at FROM groups g WHERE g.id = $1`, [groupId]);
      const grp = g.rows[0];
      if (!grp || grp.archived_at) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
      const ban = await this.banInForce(client, groupId, userId);
      if (!ban) {
        // a member has nothing to ask for; anyone else is told what a stranger is
        if (await this.roleOf(client, groupId, userId)) throw new AppError('NOT_BANNED', 409, 'you are not banned from this group');
        throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
      }
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
   * Notifies each owner and admin of waiting requests, if not told about this group in the last day ("Someone
   * asked…", later "3 people asked…"). Written in the caller's transaction under the group's lock, so two requests at
   * once notify once, with the count they will find.
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

  /** The waiting requests to come back, oldest first, for owner and admins (the ones `waitingRequestsSql` counts). */
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

  /** Answers the request `targetId` has waiting under a ban in force; 404 REQUEST_NOT_FOUND when there is none. */
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
   * Lets someone back, as owner or admin: in one transaction the ban is lifted and they rejoin, if every rule for
   * adding allows it (room in the group, their own limit, and the admin being their friend). Otherwise the ban is
   * still lifted and `rejoined` is false, so they can be added like anyone.
   */
  async approve(actorId: string, groupId: string, targetId: string): Promise<{ rejoined: boolean }> {
    const { rejoined, told } = await this.inTransaction(async (client) => {
      await lockPersonFor(client, 'groups', targetId);
      await this.requireModerator(client, groupId, actorId);
      await this.answer(client, groupId, targetId, actorId, 'approved');
      await client.query(`DELETE FROM group_bans WHERE group_id = $1 AND user_id = $2`, [groupId, targetId]);
      const grp = await this.noticeGroup(client, groupId);
      const allowed = (await areFriends(client, actorId, targetId)) && !(await this.staysAdultsOnly(client, groupId, targetId));
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
   * Turns a request down, as owner or admin: the next request waits longer (`requestCooldownDays`), and with
   * `stopRequests` no more are taken while this ban lasts.
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
   * A group as a member sees it: what it is, its whole roster and their role; owners and admins also get the count of
   * waiting requests. Someone banned from an unarchived group gets only its name, picture and their standing (until
   * when, and their request's state). Everyone else gets the same 404 as an unknown id. Two statements however many
   * members, since the apps poll it.
   */
  /**
   * A group as its viewer may see it. `pendingLink` turns a new photo still being checked into the private link its
   * owner, admins and whoever put it up are shown; the key is read in the same query, so the page costs nothing more.
   */
  async get(
    groupId: string,
    viewerId: string,
    publicUrl: PublicUrl = () => null,
    pendingLink?: (key: string) => Promise<PendingPicture | null>,
  ): Promise<GroupDetail & { photoPending?: PendingPicture | null }> {
    const g = await this.pool.query<{
      id: string; name: string; description: string | null; owner_id: string | null; archived_at: Date | null;
      n: number; photo_key: string | null; my_role: string | null; pending_photo_key: string | null;
      banned: boolean; until: Date | null; reason: string | null; waiting: boolean; request_after: Date | null; requests_closed: boolean | null;
      request_sent_at: Date | null; pending_requests: number | null;
    }>(
      `SELECT g.id, g.name, g.description, g.owner_id, g.archived_at, g.photo_key,
              CASE WHEN me.role IN ('owner', 'moderator') OR (me.role IS NOT NULL AND g.pending_photo_set_by = $2)
                   THEN g.pending_photo_key END AS pending_photo_key,
              (SELECT count(*)::int FROM group_members x WHERE x.group_id = g.id) AS n,
              me.role AS my_role,
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
    const myRole = grp?.my_role && isRole(grp.my_role) ? grp.my_role : null;
    // not in it, and not banned from a group that is still there: no such group
    if (!grp || (!myRole && (!grp.banned || grp.archived_at))) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
    const photoUrl = grp.photo_key ? publicUrl(grp.photo_key) : null;
    if (!myRole) {
      return {
        id: grp.id, name: grp.name, description: null, ownerId: null, archivedAt: null, memberCount: 0, photoUrl,
        members: [], myRole: null, standing: standingOf(null, grp),
      };
    }
    const members = await this.pool.query<{
      user_id: string; username: string; role: string; joined_at: Date;
      profile_photo_key: string | null; selected_avatar_key: string | null;
    }>(
      `SELECT m.user_id, u.username, m.role, m.joined_at, u.profile_photo_key, u.selected_avatar_key
         FROM group_members m JOIN users u ON u.id = m.user_id
        WHERE m.group_id = $1
        ORDER BY m.role = 'owner' DESC, m.role = 'moderator' DESC, u.username`,
      [groupId],
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
      ownerId: grp.owner_id,
      archivedAt: grp.archived_at ? grp.archived_at.toISOString() : null,
      memberCount: grp.n,
      photoUrl,
      members: list,
      myRole,
      standing: standingOf(myRole, grp),
      ...(canModerateGroup(myRole) ? { pendingRequests: grp.pending_requests ?? 0 } : {}),
      ...(pendingLink && (canEditGroup(myRole) || grp.pending_photo_key)
        ? { photoPending: grp.pending_photo_key ? await pendingLink(grp.pending_photo_key) : null }
        : {}),
    };
  }

  /** Groups the user belongs to: the only list of groups there is. */
  async myGroups(userId: string, publicUrl: PublicUrl = () => null): Promise<Array<Group & { myRole: Role }>> {
    const rows = await this.pool.query<{
      id: string; name: string; description: string | null; owner_id: string | null; archived_at: Date | null; role: string; n: number;
      photo_key: string | null;
    }>(
      `SELECT g.id, g.name, g.description, g.owner_id, g.archived_at, m.role, g.photo_key,
              (SELECT count(*)::int FROM group_members x WHERE x.group_id = g.id) AS n
         FROM group_members m JOIN groups g ON g.id = m.group_id
        WHERE m.user_id = $1 ORDER BY g.name`,
      [userId],
    );
    return rows.rows.map((r) => ({
      id: r.id, name: r.name, description: r.description, ownerId: r.owner_id,
      archivedAt: r.archived_at ? r.archived_at.toISOString() : null, memberCount: r.n,
      photoUrl: r.photo_key ? publicUrl(r.photo_key) : null,
      myRole: isRole(r.role) ? r.role : 'member',
    }));
  }

  /** The group's total XP this week, for the group leaderboard. */
  async weeklyXp(groupId: string, now: Date = new Date()): Promise<number> {
    const r = await this.pool.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(l.amount), 0)::text sum
         FROM group_members m JOIN xp_ledger l ON l.user_id = m.user_id
        WHERE m.group_id = $1 AND l.amount > 0 AND l.created_at >= $2::date`,
      [groupId, weekStart(now)],
    );
    return Number(r.rows[0]?.sum ?? 0);
  }

  /** Heals groups whose owner's account was deleted: oldest moderator, else oldest member, else archive. */
  async reconcileOwnerless(): Promise<number> {
    const orphans = await this.pool.query<{ id: string }>(
      `SELECT id FROM groups WHERE owner_id IS NULL AND archived_at IS NULL`,
    );
    await handOnGroups(this.pool, orphans.rows.map((g) => g.id));
    return orphans.rows.length;
  }
}

/**
 * Gives each ownerless group a new owner in one statement: its oldest moderator, else its oldest member, else the
 * group is archived. Runs in the caller's transaction when given one.
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
 * The groups a suspended or banned person owns pass on, in the ban's transaction: to its oldest admin, else its oldest
 * member, whose account is available; the person stays an admin, and the new owner is told in their inbox. A group
 * with nobody else to take it is left as it is, since nobody else sees it.
 */
export async function handOverOwnedGroups(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<number> {
  const moved = await executor.query<{ id: string; name: string; new_owner: string }>(
    `WITH owned AS (
       SELECT id, name FROM groups WHERE owner_id = $1 AND archived_at IS NULL ORDER BY id FOR UPDATE
     ), next AS (
       SELECT DISTINCT ON (m.group_id) m.group_id, m.user_id FROM group_members m
         JOIN owned o ON o.id = m.group_id
         JOIN users u ON u.id = m.user_id
        WHERE m.user_id <> $1 AND u.deleted_at IS NULL AND ${availableSql('u')}
        ORDER BY m.group_id, m.role = 'moderator' DESC, m.joined_at ASC
     ), demoted AS (
       UPDATE group_members gm SET role = 'moderator' FROM next WHERE gm.group_id = next.group_id AND gm.user_id = $1
     ), promoted AS (
       UPDATE group_members gm SET role = 'owner' FROM next WHERE gm.group_id = next.group_id AND gm.user_id = next.user_id
     )
     UPDATE groups g SET owner_id = next.user_id FROM next, owned
      WHERE g.id = next.group_id AND owned.id = g.id
      RETURNING g.id, owned.name, next.user_id AS new_owner`,
    [userId],
  );
  await recordNotifications(
    executor,
    moved.rows.map((g) => ({ userId: g.new_owner, notification: ownerChangedNotice({ id: g.id, name: g.name }) })),
  );
  return moved.rows.length;
}
