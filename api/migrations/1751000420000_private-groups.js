/**
 * Every group is private.
 *
 * A group used to be 'open' (anybody could find it, read it and walk in) or
 * 'invite' (its owner or an admin adds one of their own friends). Open groups
 * are gone: nobody can find a group or walk into one, and a new group is
 * 'invite' from the start, which is what the column now defaults to.
 *
 * `groups.privacy` itself stays, and keeps saying 'open' of the groups that
 * were. It no longer decides who may come in. It records how a group's
 * members came to be there, which the server still has to know: a private
 * group is safe to show whole to its members because somebody each of them
 * chose as a friend put them there, and nobody chose anybody in a group that
 * was open. Such a group goes on as what it was, a room for known adults
 * (groups/service.ts, play/access.ts, story-games/join-rule.ts read the column
 * for that and nothing else). It also means the server that is running while
 * this is applied, which still names the column, goes on working until its
 * replacement takes over.
 *
 * Members, roles, messages, bans and requests to come back stay as they are,
 * with one exception, made on purpose.
 *
 * In an open group a member who was not known to be an adult was left off
 * the roster and could not open the chat, a minor was taken out on the day
 * their age was recorded, and what a minor had written was shown to their
 * friends only. From now on every member of a group sees its whole roster
 * and every message, so those accounts, and those messages, would be handed
 * to a room of strangers. So, in the groups that are open when this runs,
 * and in no other:
 *
 *  1. anyone not known to be an adult — a minor, or an account with no birth
 *     month on record — leaves, as they would have on the day their age was
 *     recorded. They could not read these chats. A group whose owner leaves
 *     this way is handed on as when an owner's account is deleted: to its
 *     oldest moderator, else its oldest member, else it is archived;
 *  2. what somebody who is a minor today wrote there is deleted the way a
 *     moderator deletes a message, since nothing else would keep it from
 *     every member's view from now on.
 *
 * Neither touches an account known to be an adult's, or anything in a group
 * that was already private.
 *
 * Nothing of this is lost. Each thing done is written down first in
 * `open_group_closures`: who left a group (with the role and the day they
 * had joined), who was made owner in a leaver's place, which groups were
 * archived for want of anyone, and which messages were taken out of sight.
 * Down reads it back and puts every row where it was, so the choice made
 * here can be unmade by whoever decides otherwise. The rows go with their
 * group and their message, and an account that is closed has its own taken
 * out with the rest of what it left in groups (gdpr/service.ts), so the
 * table keeps nothing about anyone who has gone.
 */

/** SQL: the user behind `u` is known to be under 18 at statement time (api/src/users/age.ts `minorSql`, frozen here). */
const MINOR = `(u.birth_year IS NOT NULL AND (
  extract(year FROM now() AT TIME ZONE 'UTC')::int - u.birth_year
  - CASE WHEN extract(month FROM now() AT TIME ZONE 'UTC')::int <= u.birth_month THEN 1 ELSE 0 END
) < 18)`;

export const up = (pgm) => {
  pgm.createTable('open_group_closures', {
    id: { type: 'bigserial', primaryKey: true },
    // 'left': this member was taken out; 'promoted': this member was made owner, from `role`;
    // 'archived': the group was archived with nobody left to own it; 'message': this message was taken out of sight
    what: { type: 'text', notNull: true },
    group_id: { type: 'uuid', notNull: true, references: 'groups', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', references: 'users', onDelete: 'CASCADE' },
    message_id: { type: 'uuid', references: 'group_messages', onDelete: 'CASCADE' },
    // a leaver's membership as it was, and a promoted member's role before
    role: { type: 'text' },
    joined_at: { type: 'timestamptz' },
    chat_cleared_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('open_group_closures', 'open_group_closures_what_check', { check: "what IN ('left','promoted','archived','message')" });
  pgm.createIndex('open_group_closures', 'group_id');
  pgm.createIndex('open_group_closures', 'user_id', { where: 'user_id IS NOT NULL' });
  pgm.createIndex('open_group_closures', 'message_id', { where: 'message_id IS NOT NULL' });

  // 1. out of the open groups, everyone not known to be an adult; a group they owned waits for a new owner
  pgm.sql(`
    WITH gone AS (
      DELETE FROM group_members m USING groups g, users u
       WHERE g.id = m.group_id AND g.privacy = 'open' AND u.id = m.user_id
         AND (u.birth_year IS NULL OR ${MINOR})
      RETURNING m.group_id, m.user_id, m.role, m.joined_at, m.chat_cleared_at
    ), noted AS (
      INSERT INTO open_group_closures (what, group_id, user_id, role, joined_at, chat_cleared_at)
      SELECT 'left', group_id, user_id, role, joined_at, chat_cleared_at FROM gone
    )
    UPDATE groups g SET owner_id = NULL
      FROM gone
     WHERE gone.role = 'owner' AND g.id = gone.group_id AND g.owner_id = gone.user_id`);
  // each group whose owner left just now: the oldest moderator, else the oldest member, else archived
  pgm.sql(`
    WITH ownerless AS (
      SELECT g.id FROM groups g
       WHERE g.owner_id IS NULL AND g.archived_at IS NULL
         AND EXISTS (SELECT 1 FROM open_group_closures c WHERE c.what = 'left' AND c.role = 'owner' AND c.group_id = g.id)
    ), next AS (
      SELECT DISTINCT ON (m.group_id) m.group_id, m.user_id, m.role
        FROM group_members m JOIN ownerless o ON o.id = m.group_id
       ORDER BY m.group_id, m.role = 'moderator' DESC, m.joined_at ASC
    ), noted AS (
      INSERT INTO open_group_closures (what, group_id, user_id, role) SELECT 'promoted', group_id, user_id, role FROM next
    ), promoted AS (
      UPDATE group_members gm SET role = 'owner' FROM next WHERE gm.group_id = next.group_id AND gm.user_id = next.user_id
    ), owned AS (
      UPDATE groups g SET owner_id = next.user_id FROM next WHERE g.id = next.group_id
    ), archived AS (
      UPDATE groups g SET archived_at = now()
        FROM ownerless o
       WHERE g.id = o.id AND NOT EXISTS (SELECT 1 FROM next WHERE next.group_id = g.id)
      RETURNING g.id
    )
    INSERT INTO open_group_closures (what, group_id) SELECT 'archived', id FROM archived`);
  // 2. what a minor wrote in an open group, which only their friends were shown
  pgm.sql(`
    WITH hidden AS (
      UPDATE group_messages gm SET deleted_at = now()
        FROM groups g, users u
       WHERE g.id = gm.group_id AND g.privacy = 'open' AND u.id = gm.sender_id
         AND gm.deleted_at IS NULL AND ${MINOR}
      RETURNING gm.id, gm.group_id
    )
    INSERT INTO open_group_closures (what, group_id, message_id) SELECT 'message', group_id, id FROM hidden`);

  // a group made from now on is private from the start; the ones that were open go on saying so
  pgm.alterColumn('groups', 'privacy', { default: 'invite' });
};

export const down = (pgm) => {
  // back as it was written down: the messages in sight, the archived groups live, the promoted in the role
  // they had, the leavers in again and the owners among them owners
  pgm.alterColumn('groups', 'privacy', { default: 'open' });
  pgm.sql(`UPDATE group_messages gm SET deleted_at = NULL FROM open_group_closures c WHERE c.what = 'message' AND c.message_id = gm.id`);
  pgm.sql(`UPDATE groups g SET archived_at = NULL FROM open_group_closures c WHERE c.what = 'archived' AND c.group_id = g.id`);
  pgm.sql(`
    UPDATE group_members gm SET role = c.role
      FROM open_group_closures c
     WHERE c.what = 'promoted' AND c.group_id = gm.group_id AND c.user_id = gm.user_id`);
  pgm.sql(`
    INSERT INTO group_members (group_id, user_id, role, joined_at, chat_cleared_at)
    SELECT group_id, user_id, role, joined_at, chat_cleared_at FROM open_group_closures WHERE what = 'left'
    ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role, joined_at = EXCLUDED.joined_at`);
  pgm.sql(`UPDATE groups g SET owner_id = c.user_id FROM open_group_closures c WHERE c.what = 'left' AND c.role = 'owner' AND c.group_id = g.id`);
  pgm.dropTable('open_group_closures');
};
