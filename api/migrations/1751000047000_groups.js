/**
 * Groups / clubs (KUR-084). `groups` holds config + owner + archived flag;
 * `group_members` is the roster with a role per user. Owner deletion is handled
 * by SET NULL on owner_id + a reconcile pass that promotes the oldest moderator
 * (or archives). Group weekly XP is derived from members' xp_ledger.
 */

export const up = (pgm) => {
  pgm.createTable('groups', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    description: { type: 'text' },
    privacy: { type: 'text', notNull: true, default: 'open' },
    owner_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    archived_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('groups', 'groups_privacy_check', { check: "privacy IN ('open','invite')" });
  pgm.createIndex('groups', 'owner_id');

  pgm.createTable('group_members', {
    group_id: { type: 'uuid', notNull: true, references: 'groups', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    role: { type: 'text', notNull: true, default: 'member' },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('group_members', 'group_members_pkey', { primaryKey: ['group_id', 'user_id'] });
  pgm.addConstraint('group_members', 'group_members_role_check', {
    check: "role IN ('owner','moderator','member')",
  });
  pgm.createIndex('group_members', 'user_id');
};

export const down = (pgm) => {
  pgm.dropTable('group_members');
  pgm.dropTable('groups');
};
