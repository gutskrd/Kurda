/**
 * Every group is private.
 *
 * A group used to be 'open' (anybody could find it, read it and walk in) or
 * 'invite' (its owner or an admin adds one of their own friends). Open groups
 * are gone: there is one kind of group, the second, and nothing left for a
 * column to say. So every group is set to 'invite' and `groups.privacy` is
 * dropped, its check with it. No view, trigger or index reads the column.
 *
 * Members, roles, messages, bans and requests to come back stay as they are,
 * with one exception, made on purpose and before the column goes, while the
 * open groups can still be told apart.
 *
 * A private group shows every member and every message to every other
 * member. That is safe because of how people get into one: somebody they
 * chose as a friend put them there. Nobody chose anybody in an open group,
 * so there a member who was not known to be an adult was left off the roster
 * and could not open the chat, a minor was taken out on the day their age was
 * recorded, and what a minor had written was shown to their friends only.
 * Turning such a group private as it stands would hand those accounts, and
 * those messages, to a room of strangers. So, in the groups that are open
 * when this runs, and in no other:
 *
 *  1. anyone not known to be an adult — a minor, or an account with no birth
 *     month on record — leaves, as they would have on the day their age was
 *     recorded. They could not read these chats, and a friend who is the
 *     owner or an admin can add them again. A group whose owner leaves this
 *     way is handed on as when an owner's account is deleted: to its oldest
 *     moderator, else its oldest member, else it is archived;
 *  2. what somebody who is a minor today wrote there is deleted the way a
 *     moderator deletes a message, since nothing else would keep it from
 *     every member's view from now on.
 *
 * Neither touches an account known to be an adult's, or anything in a group
 * that was already private. Taking statements 1 and 2 out keeps every row
 * exactly as it is, at the price described above.
 *
 * Down brings the column back as it was declared, with every group 'invite':
 * which groups were open, and who left them here, is not kept anywhere.
 */

/** SQL: the user behind `u` is known to be under 18 at statement time (api/src/users/age.ts `minorSql`, frozen here). */
const MINOR = `(u.birth_year IS NOT NULL AND (
  extract(year FROM now() AT TIME ZONE 'UTC')::int - u.birth_year
  - CASE WHEN extract(month FROM now() AT TIME ZONE 'UTC')::int <= u.birth_month THEN 1 ELSE 0 END
) < 18)`;

export const up = (pgm) => {
  // 1. out of the open groups, everyone not known to be an adult; a group they owned waits for a new owner
  pgm.sql(`
    WITH gone AS (
      DELETE FROM group_members m USING groups g, users u
       WHERE g.id = m.group_id AND g.privacy = 'open' AND u.id = m.user_id
         AND (u.birth_year IS NULL OR ${MINOR})
      RETURNING m.group_id, m.user_id, m.role
    )
    UPDATE groups g SET owner_id = NULL
      FROM gone
     WHERE gone.role = 'owner' AND g.id = gone.group_id AND g.owner_id = gone.user_id`);
  // each open group left without an owner: the oldest moderator, else the oldest member, else archived
  pgm.sql(`
    WITH ownerless AS (
      SELECT id FROM groups WHERE privacy = 'open' AND owner_id IS NULL AND archived_at IS NULL
    ), next AS (
      SELECT DISTINCT ON (m.group_id) m.group_id, m.user_id
        FROM group_members m JOIN ownerless o ON o.id = m.group_id
       ORDER BY m.group_id, m.role = 'moderator' DESC, m.joined_at ASC
    ), promoted AS (
      UPDATE group_members gm SET role = 'owner' FROM next WHERE gm.group_id = next.group_id AND gm.user_id = next.user_id
    ), owned AS (
      UPDATE groups g SET owner_id = next.user_id FROM next WHERE g.id = next.group_id
    )
    UPDATE groups g SET archived_at = now()
      FROM ownerless o
     WHERE g.id = o.id AND NOT EXISTS (SELECT 1 FROM next WHERE next.group_id = g.id)`);
  // 2. what a minor wrote in an open group, which only their friends were shown
  pgm.sql(`
    UPDATE group_messages gm SET deleted_at = now()
      FROM groups g, users u
     WHERE g.id = gm.group_id AND g.privacy = 'open' AND u.id = gm.sender_id
       AND gm.deleted_at IS NULL AND ${MINOR}`);

  pgm.sql(`UPDATE groups SET privacy = 'invite' WHERE privacy <> 'invite'`);
  pgm.dropColumn('groups', 'privacy');
};

export const down = (pgm) => {
  pgm.addColumn('groups', { privacy: { type: 'text', notNull: true, default: 'invite' } });
  pgm.addConstraint('groups', 'groups_privacy_check', { check: "privacy IN ('open','invite')" });
};
