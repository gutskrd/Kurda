/**
 * GDPR (KUR-024): deletion grace period marker + data export tracking.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    deletion_requested_at: { type: 'timestamptz' },
  });
  pgm.createTable('user_exports', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    storage_key: { type: 'text' },
    requested_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('user_exports', ['user_id', 'requested_at']);
};

export const down = (pgm) => {
  pgm.dropTable('user_exports');
  pgm.dropColumns('users', ['deletion_requested_at']);
};
