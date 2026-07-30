/**
 * Friend system (KUR-081). `friendships` stores one row per canonically-ordered
 * pair (user_lo < user_hi) for both pending requests and accepted friendships;
 * `requested_by` records a pending request's direction. `blocks` is directional
 * and silent — a block hides both users from each other everywhere and cancels
 * any pending request in either direction.
 */

export const up = (pgm) => {
  pgm.createTable('friendships', {
    user_lo: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    user_hi: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    status: { type: 'text', notNull: true },
    /** who sent the pending request (direction); null once accepted is fine too */
    requested_by: { type: 'uuid', references: 'users', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    responded_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('friendships', 'friendships_pkey', { primaryKey: ['user_lo', 'user_hi'] });
  pgm.addConstraint('friendships', 'friendships_status_check', {
    check: "status IN ('pending','accepted')",
  });
  pgm.addConstraint('friendships', 'friendships_order_check', { check: 'user_lo < user_hi' });
  pgm.createIndex('friendships', 'user_hi');
  pgm.createIndex('friendships', ['status', 'created_at']);

  pgm.createTable('blocks', {
    blocker_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    blocked_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('blocks', 'blocks_pkey', { primaryKey: ['blocker_id', 'blocked_id'] });
  pgm.createIndex('blocks', 'blocked_id');
};

export const down = (pgm) => {
  pgm.dropTable('blocks');
  pgm.dropTable('friendships');
};
