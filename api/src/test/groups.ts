import type pg from 'pg';
import { GroupService } from '../groups/service.js';
import { befriend } from './social.js';

/**
 * People in a group, for suites that need one to exist before what they test.
 *
 * Every group is private and there is one way in: its owner or an admin adds
 * one of their own friends. `addFriendsToGroup` does exactly that — makes each
 * person a friend of `staffId` and has `staffId` add them through
 * `GroupService.invite`, with every rule an add keeps (friends only, not while
 * banned, the group's size, each person's own limit). It leaves them friends,
 * as they would be.
 *
 * `seatInGroup` writes the membership rows and nothing else. It is for
 * scenarios that are not about how people came in and need members who are
 * NOT the staff's friends — strangers to one another in a room, which is what
 * a group that used to be open still holds, and what a test of blocks, gifts
 * between friends, or who a shared game lets in has to be able to say.
 */
export async function addFriendsToGroup(pool: pg.Pool, groupId: string, staffId: string, ...userIds: string[]): Promise<void> {
  const groups = new GroupService(pool);
  for (const userId of userIds) {
    await befriend(pool, staffId, userId);
    await groups.invite(staffId, groupId, userId);
  }
}

/** Members written straight to the roster, as plain members: no friendship is made and no rule is asked. */
export async function seatInGroup(pool: pg.Pool, groupId: string, ...userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await pool.query(
    `INSERT INTO group_members (group_id, user_id, role)
     SELECT $1, u, 'member' FROM unnest($2::uuid[]) AS u
     ON CONFLICT DO NOTHING`,
    [groupId, userIds],
  );
}
