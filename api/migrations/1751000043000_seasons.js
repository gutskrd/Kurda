/**
 * Season resets + rewards (KUR-065). `seasons` archives each player's peak tier
 * and final rating per quarter (their profile history) and is unique on
 * (user_id, season_key) so the end-of-season job is idempotent. `season_state`
 * marks a season fully processed (so the scheduler doesn't re-scan). A
 * `peak_tier` column on user_league tracks the highest tier reached this season.
 */

export const up = (pgm) => {
  pgm.addColumns('user_league', {
    peak_tier: { type: 'text', notNull: true, default: 'bronze' },
  });

  pgm.createTable('seasons', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    season_key: { type: 'text', notNull: true },
    peak_tier: { type: 'text', notNull: true },
    final_rating: { type: 'integer' },
    reward_gems: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('seasons', 'seasons_user_season_unique', { unique: ['user_id', 'season_key'] });
  pgm.createIndex('seasons', ['user_id', 'season_key']);

  pgm.createTable('season_state', {
    season_key: { type: 'text', primaryKey: true },
    completed_at: { type: 'timestamptz' },
  });
};

export const down = (pgm) => {
  pgm.dropTable('season_state');
  pgm.dropTable('seasons');
  pgm.dropColumns('user_league', ['peak_tier']);
};
