/**
 * Device push tokens (KUR-094). One row per (user, device token). A user may
 * have many devices; a token is globally unique and belongs to whichever user
 * last registered it, so an OS restore that re-registers a token on a new
 * account reassigns it rather than duplicating. `last_seen_at` supports pruning
 * stale devices; invalid tokens are deleted on first provider rejection.
 */

export const up = (pgm) => {
  pgm.createTable('device_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    platform: { type: 'text', notNull: true },
    token: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('device_tokens', 'device_tokens_platform_check', {
    check: "platform IN ('ios', 'android')",
  });
  pgm.createIndex('device_tokens', 'user_id');
};

export const down = (pgm) => {
  pgm.dropTable('device_tokens');
};
