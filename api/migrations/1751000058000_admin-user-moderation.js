/**
 * Admin user moderation (KUR-101). `banned_until` turns the existing `banned_at`
 * flag into a temp/perm distinction (perm = no expiry); `muted_until` is a chat
 * mute deadline. `admin_actions` is the immutable audit trail — one row per
 * moderation action with its mandatory reason and the acting admin.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    banned_until: { type: 'timestamptz' }, // null + banned_at set = permanent
    muted_until: { type: 'timestamptz' },
  });

  pgm.createTable('admin_actions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    target_user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    admin_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    action: { type: 'text', notNull: true },
    reason: { type: 'text', notNull: true },
    meta: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('admin_actions', 'admin_actions_action_check', {
    check: "action IN ('warn', 'mute', 'temp_ban', 'perm_ban', 'unban', 'wallet_adjust')",
  });
  pgm.createIndex('admin_actions', ['target_user_id', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('admin_actions');
  pgm.dropColumns('users', ['banned_until', 'muted_until']);
};
