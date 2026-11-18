import type pg from 'pg';
import { GroupService } from '../groups/service.js';
import { befriend } from './social.js';

/**
 * People in a group for suites that need one. `addFriendsToGroup` takes the one real way in: it befriends each person
 * with `staffId` and has `staffId` add them through `GroupService.invite`, keeping every add rule, and leaves them
 * friends. `seatInGroup` writes only the membership rows, for scenarios that need members who are not the staff's
 * friends, as in a formerly open group.
 */
export async function addFriendsToGroup(pool: pg.Pool, groupId: string, staffId: string, ...userIds: string[]): Promise<void> {
  const groups = new GroupService(pool);
  for (const userId of userIds) {
    await befriend(pool, staffId, userId);
    await groups.invite(staffId, groupId, userId);
  }
}

/** Members written straight to the roster as plain members, with no friendship made and no rule asked. */
export async function seatInGroup(pool: pg.Pool, groupId: string, ...userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await pool.query(
    `INSERT INTO group_members (group_id, user_id, role)
     SELECT $1, u, 'member' FROM unnest($2::uuid[]) AS u
     ON CONFLICT DO NOTHING`,
    [groupId, userIds],
  );
}
