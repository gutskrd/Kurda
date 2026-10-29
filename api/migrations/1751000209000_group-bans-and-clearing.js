/**
 * Removed or banned from a group, asking to come back, and clearing a group's
 * chat (@kurda/shared group-membership.ts).
 *
 * - `groups.chat_cleared_at` / `chat_cleared_by`: the owner or an admin
 *   cleared the chat for everyone, when and who. Kept when that account goes
 *   (SET NULL), and the chat then says an admin cleared it.
 * - `group_members.chat_cleared_at`: a member cleared the chat for
 *   themselves. It goes with the membership.
 *   No member is shown a message from before the later of the two.
 * - `group_bans`: who may not come back by themselves, until when (NULL for
 *   good). A ban is in force while `until IS NULL OR until > now()`; one that
 *   has run out is as if it were not there and is cleaned up when next met.
 *   `declines`, `request_after` and `requests_closed` are where asking to come
 *   back stands: how many requests were turned down, when the next may be
 *   sent, and whether the admins stopped them.
 * - `group_rejoin_requests`: the requests themselves, kept with how each was
 *   answered. One waits at a time per group and person, which the database
 *   holds (the partial unique index), not just the code.
 */

export const up = (pgm) => {
  pgm.addColumns('groups', {
    chat_cleared_at: { type: 'timestamptz' },
    chat_cleared_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
  });
  pgm.addColumns('group_members', {
    chat_cleared_at: { type: 'timestamptz' },
  });

  pgm.createTable('group_bans', {
    group_id: { type: 'uuid', notNull: true, references: 'groups', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    banned_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    reason: { type: 'text' },
    /** NULL = for good */
    until: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    declines: { type: 'integer', notNull: true, default: 0 },
    request_after: { type: 'timestamptz' },
    requests_closed: { type: 'boolean', notNull: true, default: false },
  });
  pgm.addConstraint('group_bans', 'group_bans_pkey', { primaryKey: ['group_id', 'user_id'] });
  pgm.addConstraint('group_bans', 'group_bans_declines_check', { check: 'declines >= 0' });
  // the groups a person is banned from
  pgm.createIndex('group_bans', 'user_id');

  pgm.createTable('group_rejoin_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    group_id: { type: 'uuid', notNull: true, references: 'groups', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    note: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'pending' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    decided_at: { type: 'timestamptz' },
    decided_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
  });
  pgm.addConstraint('group_rejoin_requests', 'group_rejoin_requests_status_check', {
    check: "status IN ('pending', 'approved', 'declined', 'withdrawn')",
  });
  // one waiting request per group and person; led by the group, it is also
  // how the requests a group's admins have to answer are found
  pgm.createIndex('group_rejoin_requests', ['group_id', 'user_id'], {
    name: 'group_rejoin_requests_one_pending',
    unique: true,
    where: "status = 'pending'",
  });
};

export const down = (pgm) => {
  pgm.dropTable('group_rejoin_requests');
  pgm.dropTable('group_bans');
  pgm.dropColumns('group_members', ['chat_cleared_at']);
  pgm.dropColumns('groups', ['chat_cleared_at', 'chat_cleared_by']);
};
