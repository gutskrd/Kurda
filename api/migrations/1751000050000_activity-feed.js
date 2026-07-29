/**
 * Friend activity feed (KUR-087). activity_events is the source of truth for
 * friend milestones (streak milestones, league promotions, achievements);
 * activity_congrats records "congratulate" reactions. Per-user feeds are
 * fanned out to Redis lists (capped at 100) on write; Postgres is the rebuild
 * fallback. Fan-out respects blocks + profile privacy.
 */

export const up = (pgm) => {
  pgm.createTable('activity_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    actor_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    type: { type: 'text', notNull: true },
    payload: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('activity_events', 'activity_events_type_check', {
    check: "type IN ('streak_milestone','league_promotion','achievement')",
  });
  pgm.createIndex('activity_events', ['actor_id', 'created_at']);

  pgm.createTable('activity_congrats', {
    event_id: { type: 'uuid', notNull: true, references: 'activity_events', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('activity_congrats', 'activity_congrats_pkey', { primaryKey: ['event_id', 'user_id'] });
  pgm.createIndex('activity_congrats', 'event_id');
};

export const down = (pgm) => {
  pgm.dropTable('activity_congrats');
  pgm.dropTable('activity_events');
};
