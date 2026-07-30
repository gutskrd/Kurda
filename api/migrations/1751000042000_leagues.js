/**
 * Weekly leagues (KUR-062). user_league holds each player's current tier.
 * league_cohorts are the per-week, per-tier buckets of up to 30; league_members
 * assigns a user to exactly one cohort per week (lazily, on their first XP of
 * the week). Weekly XP is derived from the xp_ledger window at read/settle time,
 * so there's no counter to keep in sync. `settled` makes the end-of-week
 * promotion/demotion idempotent.
 */

export const up = (pgm) => {
  pgm.createTable('user_league', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    tier: { type: 'text', notNull: true, default: 'bronze' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('league_cohorts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    week_key: { type: 'text', notNull: true },
    tier: { type: 'text', notNull: true },
    settled: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('league_cohorts', ['week_key', 'tier']);
  pgm.createIndex('league_cohorts', ['settled', 'week_key']);

  pgm.createTable('league_members', {
    cohort_id: { type: 'uuid', notNull: true, references: 'league_cohorts', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    week_key: { type: 'text', notNull: true },
    tier: { type: 'text', notNull: true },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // one cohort per user per week
  pgm.addConstraint('league_members', 'league_members_pkey', { primaryKey: ['week_key', 'user_id'] });
  pgm.createIndex('league_members', 'cohort_id');
};

export const down = (pgm) => {
  pgm.dropTable('league_members');
  pgm.dropTable('league_cohorts');
  pgm.dropTable('user_league');
};
