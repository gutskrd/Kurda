import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { weekStart } from '../leagues/league-logic.js';
import { canManage, canSetRole, isRole, MAX_GROUP_MEMBERS, type Role } from './roles.js';
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  privacy: 'open' | 'invite';
  ownerId: string | null;
  archivedAt: string | null;
  memberCount: number;
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
 * Groups / clubs (KUR-084). Discord-style clubs with owner/moderator/member
 * roles, open or invite privacy, and a 100-member cap. Ownership transfers
 * explicitly; when an owner's account is deleted the reconcile pass promotes the
 * oldest moderator (else oldest member, else archives). Group weekly XP is
 * summed from members' ledgers for the group leaderboard.
 */
export class GroupService {
  constructor(private readonly pool: pg.Pool) {}

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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // strip control/invisible chars from user-visible text (#108)
      const name = stripControlChars(input.name).trim();
      const description = input.description != null ? stripControlChars(input.description).trim() : null;
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
    if (grp.n >= MAX_GROUP_MEMBERS) throw new AppError('GROUP_FULL', 409, `group is full (max ${MAX_GROUP_MEMBERS})`);
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [groupId, userId],
    );
  }

  /** Join an open group directly. */
  async join(userId: string, groupId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const grp = await client.query<{ privacy: string }>(`SELECT privacy FROM groups WHERE id = $1`, [groupId]);
      if (grp.rows[0]?.privacy !== 'open') throw new AppError('INVITE_ONLY', 403, 'this group is invite-only');
      await this.addMember(client, groupId, userId);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Owner/moderator adds a member (works for invite-only groups). */
  async invite(inviterId: string, groupId: string, targetId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const role = await this.requireRole(client, groupId, inviterId);
      if (role !== 'owner' && role !== 'moderator') throw new AppError('FORBIDDEN', 403, 'only staff can invite');
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

  async removeMember(actorId: string, groupId: string, targetId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const actorRole = await this.requireRole(client, groupId, actorId);
      const targetRole = await this.roleOf(client, groupId, targetId);
      if (!targetRole) throw new AppError('BAD_TARGET', 404, 'not a member');
      if (!canManage(actorRole, targetRole)) throw new AppError('FORBIDDEN', 403, 'not allowed to remove that member');
      await client.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, targetId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
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
    await this.pool.query(`DELETE FROM groups WHERE id = $1`, [groupId]);
  }

  async get(
    groupId: string,
    viewerId: string,
    publicUrl: PublicUrl = () => null,
  ): Promise<Group & { members: GroupMember[]; myRole: Role | null }> {
    const g = await this.pool.query<{
      id: string; name: string; description: string | null; privacy: 'open' | 'invite'; owner_id: string | null; archived_at: Date | null;
    }>(`SELECT id, name, description, privacy, owner_id, archived_at FROM groups WHERE id = $1`, [groupId]);
    const grp = g.rows[0];
    if (!grp) throw new AppError('GROUP_NOT_FOUND', 404, 'no such group');
    const members = await this.pool.query<{
      user_id: string; username: string; role: string; joined_at: Date;
      profile_photo_key: string | null; selected_avatar_key: string | null;
    }>(
      `SELECT m.user_id, u.username, m.role, m.joined_at, u.profile_photo_key, u.selected_avatar_key
         FROM group_members m JOIN users u ON u.id = m.user_id
        WHERE m.group_id = $1 ORDER BY m.role = 'owner' DESC, m.role = 'moderator' DESC, u.username`,
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
      privacy: grp.privacy,
      ownerId: grp.owner_id,
      archivedAt: grp.archived_at ? grp.archived_at.toISOString() : null,
      memberCount: list.length,
      members: list,
      myRole: list.find((m) => m.userId === viewerId)?.role ?? null,
    };
  }

  /** Groups the user belongs to. */
  async myGroups(userId: string): Promise<Array<Group & { myRole: Role }>> {
    const rows = await this.pool.query<{
      id: string; name: string; description: string | null; privacy: 'open' | 'invite'; owner_id: string | null; archived_at: Date | null; role: string; n: number;
    }>(
      `SELECT g.id, g.name, g.description, g.privacy, g.owner_id, g.archived_at, m.role,
              (SELECT count(*)::int FROM group_members x WHERE x.group_id = g.id) AS n
         FROM group_members m JOIN groups g ON g.id = m.group_id
        WHERE m.user_id = $1 ORDER BY g.name`,
      [userId],
    );
    return rows.rows.map((r) => ({
      id: r.id, name: r.name, description: r.description, privacy: r.privacy, ownerId: r.owner_id,
      archivedAt: r.archived_at ? r.archived_at.toISOString() : null, memberCount: r.n,
      myRole: isRole(r.role) ? r.role : 'member',
    }));
  }

  /** Open groups for discovery (not archived, not full). */
  async discover(limit = 30): Promise<Group[]> {
    const rows = await this.pool.query<{
      id: string; name: string; description: string | null; privacy: 'open' | 'invite'; owner_id: string | null; archived_at: Date | null; n: number;
    }>(
      `SELECT g.id, g.name, g.description, g.privacy, g.owner_id, g.archived_at,
              (SELECT count(*)::int FROM group_members x WHERE x.group_id = g.id) AS n
         FROM groups g
        WHERE g.privacy = 'open' AND g.archived_at IS NULL
        ORDER BY n DESC LIMIT $1`,
      [limit],
    );
    return rows.rows.map((r) => ({
      id: r.id, name: r.name, description: r.description, privacy: r.privacy, ownerId: r.owner_id,
      archivedAt: r.archived_at ? r.archived_at.toISOString() : null, memberCount: r.n,
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
    let healed = 0;
    for (const g of orphans.rows) {
      const candidate = await this.pool.query<{ user_id: string }>(
        `SELECT user_id FROM group_members WHERE group_id = $1
          ORDER BY role = 'moderator' DESC, joined_at ASC LIMIT 1`,
        [g.id],
      );
      const next = candidate.rows[0]?.user_id;
      if (next) {
        await this.pool.query(`UPDATE group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`, [g.id, next]);
        await this.pool.query(`UPDATE groups SET owner_id = $2 WHERE id = $1`, [g.id, next]);
      } else {
        await this.pool.query(`UPDATE groups SET archived_at = now() WHERE id = $1`, [g.id]);
      }
      healed += 1;
    }
    return healed;
  }
}
