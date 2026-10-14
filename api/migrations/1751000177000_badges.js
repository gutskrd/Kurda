/**
 * Badges (contract 4 §B2): the catalogue lives in shared/src/badges.ts; these
 * tables hold where each learner is on it.
 *
 * `user_badges` is one row per learner and badge: the tier reached, the
 * progress counted (by the server, from what happened — never sent by a
 * client), when it was first earned and when each tier was. `floor_tier` is a
 * tier the badge never falls below (an old achievement, or an admin's award);
 * `cap_tier` one it never rises above (an admin's revoke, which a re-count
 * would otherwise undo). `seen_tier` is the last tier the learner has been
 * shown celebrating.
 *
 * `badge_users` marks a learner whose badges have been counted once: that
 * first count finds what they had done before badges existed, and records it
 * quietly instead of celebrating thirty things at once.
 *
 * The ranked family counts from what the rated games report
 * (`badge_rated_games`, one row per player and game) and from each season's
 * peak (`badge_rank_seasons`): the rating itself is another module's, and these
 * keep the badges from depending on its tables.
 *
 * `badge_rarity` is computed nightly; `badge_push_days` keeps badge pushes to
 * one a day; `badge_admin_actions` records every award and revoke, with the
 * reason.
 *
 * The old achievements move as LEGACY_ACHIEVEMENTS (shared/src/badges.ts) says:
 * streak-30 is Agir's second tier, newroz-2026 the Newroz badge, words-1000
 * Peyvên min's third tier — each as a floor, earned when the achievement was.
 * first-perfect and first-game-win are counted again from the lessons and games
 * themselves, and tournament-win stays where it is, a legacy award.
 */

const LEGACY = [
  ['streak-30', 'agir', 2],
  ['newroz-2026', 'newroz', 1],
  ['words-1000', 'peyven-min', 3],
];

export const up = (pgm) => {
  pgm.createTable('user_badges', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    badge_key: { type: 'text', notNull: true },
    tier: { type: 'smallint', notNull: true, default: 0 },
    progress: { type: 'integer', notNull: true, default: 0 },
    earned_at: { type: 'timestamptz' },
    tier_earned_at: { type: 'timestamptz[]', notNull: true, default: '{}' },
    floor_tier: { type: 'smallint', notNull: true, default: 0 },
    cap_tier: { type: 'smallint' },
    seen_tier: { type: 'smallint', notNull: true, default: 0 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('user_badges', 'user_badges_pkey', { primaryKey: ['user_id', 'badge_key'] });
  pgm.addConstraint('user_badges', 'user_badges_tier_range', {
    check: 'tier BETWEEN 0 AND 4 AND floor_tier BETWEEN 0 AND 4 AND (cap_tier IS NULL OR cap_tier BETWEEN 0 AND 4) AND seen_tier BETWEEN 0 AND 4',
  });
  // rarity: holders of each badge and tier
  pgm.createIndex('user_badges', ['badge_key', 'tier']);

  pgm.createTable('badge_users', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    counted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('badge_showcase', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    badge_keys: { type: 'text[]', notNull: true, default: '{}' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('badge_showcase', 'badge_showcase_size', { check: 'cardinality(badge_keys) <= 3' });

  pgm.createTable('badge_rarity', {
    badge_key: { type: 'text', notNull: true },
    tier: { type: 'smallint', notNull: true },
    holders: { type: 'integer', notNull: true },
    active_users: { type: 'integer', notNull: true },
    computed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('badge_rarity', 'badge_rarity_pkey', { primaryKey: ['badge_key', 'tier'] });

  pgm.createTable('badge_rated_games', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    game: { type: 'text', notNull: true },
    game_ref: { type: 'text', notNull: true },
    season_id: { type: 'text', notNull: true },
    finished_at: { type: 'timestamptz', notNull: true },
    place: { type: 'integer', notNull: true },
    players: { type: 'integer', notNull: true },
    left_game: { type: 'boolean', notNull: true, default: false },
    placement_done: { type: 'boolean', notNull: true, default: false },
    // rank tier after the game, 0 (Deşt) … 5 (Stêrk); null while placing
    tier_after: { type: 'smallint' },
    // how many tiers above them the strongest player they finished ahead of was
    beat_higher_by: { type: 'smallint', notNull: true, default: 0 },
  });
  pgm.addConstraint('badge_rated_games', 'badge_rated_games_pkey', { primaryKey: ['user_id', 'game', 'game_ref'] });

  pgm.createTable('badge_rank_seasons', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    season_id: { type: 'text', notNull: true },
    game: { type: 'text', notNull: true },
    peak_tier: { type: 'smallint' },
    rated_games: { type: 'integer', notNull: true, default: 0 },
  });
  pgm.addConstraint('badge_rank_seasons', 'badge_rank_seasons_pkey', { primaryKey: ['user_id', 'season_id', 'game'] });

  pgm.createTable('badge_push_days', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    day: { type: 'date', notNull: true },
  });
  pgm.addConstraint('badge_push_days', 'badge_push_days_pkey', { primaryKey: ['user_id', 'day'] });

  pgm.createTable('badge_admin_actions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    badge_key: { type: 'text', notNull: true },
    action: { type: 'text', notNull: true, check: `action IN ('award', 'revoke')` },
    tier: { type: 'smallint', notNull: true },
    reason: { type: 'text', notNull: true },
    admin_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('badge_admin_actions', ['user_id', 'created_at']);

  for (const [achievement, badge, tier] of LEGACY) {
    pgm.sql(`
      INSERT INTO user_badges (user_id, badge_key, tier, floor_tier, earned_at, tier_earned_at, seen_tier)
      SELECT a.user_id, '${badge}', ${tier}, ${tier}, a.earned_at, array_fill(a.earned_at, ARRAY[${tier}]),
             CASE WHEN a.seen_at IS NULL THEN 0 ELSE ${tier} END
        FROM user_achievements a
       WHERE a.achievement_id = '${achievement}'
      ON CONFLICT (user_id, badge_key) DO UPDATE SET
        floor_tier = GREATEST(user_badges.floor_tier, EXCLUDED.floor_tier),
        tier = GREATEST(user_badges.tier, EXCLUDED.tier)`);
  }
};

export const down = (pgm) => {
  pgm.dropTable('badge_admin_actions');
  pgm.dropTable('badge_push_days');
  pgm.dropTable('badge_rank_seasons');
  pgm.dropTable('badge_rated_games');
  pgm.dropTable('badge_rarity');
  pgm.dropTable('badge_showcase');
  pgm.dropTable('badge_users');
  pgm.dropTable('user_badges');
};
