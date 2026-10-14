/**
 * Game Ranks (contract-4 §R): one OpenSkill rating per online game, chosen
 * per game as Rated or Friendly, seasonal.
 *
 * - `game_ratings`: a player's standing in one game — μ and σ, the points they
 *   show (40 × (μ − 3σ), kept so boards can sort on it), the counters placement,
 *   the shield and the season need.
 * - `rated_games` and `rated_game_players`: every game that counted, decided
 *   when it started (who was in it, the repeat-opponent weight, who was a new
 *   account) and finished (each player's place and whether they left). With
 *   the history below this is enough to replay any player's later games — what
 *   an admin's "void this game" does.
 * - `rating_events`: the history, one row per change: a game, a season's soft
 *   reset, an admin's reset, the move from the old Elo. Ordered by id.
 * - `rated_leaves`: leaving a started rated game, and the cooldown it brought.
 * - `rank_preferences`: the host's last Rated/Friendly choice per game.
 * - `rating_pair_signals`: signals about pairs of players (games together,
 *   who won, the busiest day, a shared device or network) for the admin's
 *   "suspicious pairs" list. Signals only; nothing acts on them by itself.
 * - `rank_seasons`, `rank_season_results`, `rank_season_rewards`: the quarterly
 *   seasons, each player's result per game (the emblem, kept forever) and the
 *   one reward per player per season (idempotent by its primary key).
 *
 * The three games gain `rated` (the host's choice, shown before anyone joins)
 * and `rated_state` (decided at the start: 'rated', 'damped' when it counts
 * less because the same players played rated a lot today, or why it plays as
 * friendly). The season frames are cosmetics in the existing catalogue — not
 * for sale, granted — with a slot on the profile, and the Stêrk title is a tag.
 */

const GAMES = "('wordle-battle','rhyme-match','stories')";
const TIERS = "('dest','gir','zozan','ciya','lutke','sterk')";
const STATES =
  "('rated','damped','chosen','solo','need-two','unverified','no-birth-month','restricted','cooldown','repeat-opponent')";

const FRAMES = [
  ['frame_rank_dest', 'Deşt frame', 'Season frame: Deşt (Plain).'],
  ['frame_rank_gir', 'Gir frame', 'Season frame: Gir (Hill).'],
  ['frame_rank_zozan', 'Zozan frame', 'Season frame: Zozan (High pasture).'],
  ['frame_rank_ciya', 'Çiya frame', 'Season frame: Çiya (Mountain).'],
  ['frame_rank_lutke_animated', 'Lûtke frame', 'Season frame: Lûtke (Summit), with a shine.'],
  ['frame_rank_sterk_animated', 'Stêrk frame', 'Season frame: Stêrk (Star), with a shine.'],
];

export const up = (pgm) => {
  pgm.createTable('game_ratings', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    game: { type: 'text', notNull: true, check: `game IN ${GAMES}` },
    mu: { type: 'double precision', notNull: true },
    sigma: { type: 'double precision', notNull: true },
    points: { type: 'integer', notNull: true, default: 0 },
    rated_games: { type: 'integer', notNull: true, default: 0 },
    wins: { type: 'integer', notNull: true, default: 0 },
    placement_done: { type: 'boolean', notNull: true, default: false },
    shield_games: { type: 'smallint', notNull: true, default: 0 },
    last_rated_at: { type: 'timestamptz' },
    season_id: { type: 'text', notNull: true },
    season_games: { type: 'integer', notNull: true, default: 0 },
    season_wins: { type: 'integer', notNull: true, default: 0 },
    peak_points: { type: 'integer', notNull: true, default: 0 },
    best_points: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('game_ratings', 'game_ratings_pkey', { primaryKey: ['user_id', 'game'] });
  // boards and standing: the game's players by points
  pgm.createIndex('game_ratings', ['game', { name: 'points', sort: 'DESC' }], { name: 'game_ratings_board' });
  pgm.createIndex('game_ratings', ['game', 'season_id'], { name: 'game_ratings_season' });

  pgm.createTable('rated_games', {
    game: { type: 'text', notNull: true, check: `game IN ${GAMES}` },
    game_ref: { type: 'uuid', notNull: true },
    season_id: { type: 'text', notNull: true },
    /** repeat-opponent damping (1 = full), decided at the start */
    weight: { type: 'real', notNull: true, default: 1 },
    decided_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    applied_at: { type: 'timestamptz' },
    /** 'rated' once applied; 'void' when it ended with fewer than two to rank */
    outcome: { type: 'text', check: "outcome IS NULL OR outcome IN ('rated','void')" },
    voided_at: { type: 'timestamptz' },
    voided_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    void_reason: { type: 'text' },
  });
  pgm.addConstraint('rated_games', 'rated_games_pkey', { primaryKey: ['game', 'game_ref'] });
  pgm.createIndex('rated_games', ['game', 'applied_at']);

  pgm.createTable('rated_game_players', {
    game: { type: 'text', notNull: true },
    game_ref: { type: 'uuid', notNull: true },
    /** NULL once an erased child's rows are gone: the numbers stay for the others' replays */
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    seat: { type: 'smallint', notNull: true },
    new_account: { type: 'boolean', notNull: true, default: false },
    place: { type: 'smallint' },
    left_game: { type: 'boolean', notNull: true, default: false },
    mu_before: { type: 'double precision' },
    sigma_before: { type: 'double precision' },
    decided_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('rated_game_players', 'rated_game_players_pkey', { primaryKey: ['game', 'game_ref', 'seat'] });
  pgm.addConstraint('rated_game_players', 'rated_game_players_game_fk', {
    foreignKeys: { columns: ['game', 'game_ref'], references: 'rated_games(game, game_ref)', onDelete: 'CASCADE' },
  });
  pgm.addConstraint('rated_game_players', 'rated_game_players_once', { unique: ['game', 'game_ref', 'user_id'] });
  // repeat-opponent damping: a player's rated games of the last day
  pgm.createIndex('rated_game_players', ['user_id', 'game', 'decided_at'], { name: 'rated_game_players_recent' });

  pgm.createTable('rating_events', {
    id: { type: 'bigserial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    game: { type: 'text', notNull: true, check: `game IN ${GAMES}` },
    /** the game for a 'game' event; NULL for the others */
    game_ref: { type: 'uuid' },
    kind: { type: 'text', notNull: true, check: "kind IN ('game','season-reset','admin-reset','migration')" },
    season_id: { type: 'text', notNull: true },
    mu_before: { type: 'double precision', notNull: true },
    sigma_before: { type: 'double precision', notNull: true },
    mu_after: { type: 'double precision', notNull: true },
    sigma_after: { type: 'double precision', notNull: true },
    points_before: { type: 'integer', notNull: true },
    points_after: { type: 'integer', notNull: true },
    /** the reason code shown with a game's change (shared RANK_REASONS); the kind otherwise */
    reason: { type: 'text', notNull: true },
    place: { type: 'smallint' },
    weight: { type: 'real' },
    /** the whole standing before and after (counters too): what a replay starts from */
    state_before: { type: 'jsonb', notNull: true },
    state_after: { type: 'jsonb', notNull: true },
    voided_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('rating_events', ['user_id', 'game', 'id']);
  pgm.createIndex('rating_events', ['game', 'game_ref']);
  pgm.addConstraint('rating_events', 'rating_events_one_per_game', {
    unique: ['user_id', 'game', 'game_ref'],
  });

  pgm.createTable('rated_leaves', {
    id: { type: 'bigserial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    game: { type: 'text', notNull: true, check: `game IN ${GAMES}` },
    game_ref: { type: 'uuid', notNull: true },
    /** where this leave sits on the ladder (1 = the first in 24 h) */
    step: { type: 'smallint', notNull: true },
    cooldown_until: { type: 'timestamptz' },
    left_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('rated_leaves', 'rated_leaves_once', { unique: ['user_id', 'game', 'game_ref'] });
  pgm.createIndex('rated_leaves', ['user_id', 'left_at']);

  pgm.createTable('rank_preferences', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    game: { type: 'text', notNull: true, check: `game IN ${GAMES}` },
    rated: { type: 'boolean', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('rank_preferences', 'rank_preferences_pkey', { primaryKey: ['user_id', 'game'] });

  pgm.createTable('rating_pair_signals', {
    game: { type: 'text', notNull: true, check: `game IN ${GAMES}` },
    /** the pair, smaller id first */
    user_lo: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    user_hi: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    games: { type: 'integer', notNull: true, default: 0 },
    lo_wins: { type: 'integer', notNull: true, default: 0 },
    hi_wins: { type: 'integer', notNull: true, default: 0 },
    draws: { type: 'integer', notNull: true, default: 0 },
    /** the most rated games they played together inside one 24 h window */
    peak_24h: { type: 'integer', notNull: true, default: 0 },
    shared_device: { type: 'boolean', notNull: true, default: false },
    shared_ip: { type: 'boolean', notNull: true, default: false },
    last_game_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('rating_pair_signals', 'rating_pair_signals_pkey', { primaryKey: ['game', 'user_lo', 'user_hi'] });
  pgm.addConstraint('rating_pair_signals', 'rating_pair_signals_order', { check: 'user_lo < user_hi' });

  pgm.createTable('rank_seasons', {
    id: { type: 'text', primaryKey: true },
    starts_at: { type: 'timestamptz', notNull: true },
    ends_at: { type: 'timestamptz', notNull: true },
    /** every rating was rolled into the next season and its results recorded */
    closed_at: { type: 'timestamptz' },
    /** its rewards were handed out */
    rewarded_at: { type: 'timestamptz' },
  });

  pgm.createTable('rank_season_results', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    season_id: { type: 'text', notNull: true },
    game: { type: 'text', notNull: true, check: `game IN ${GAMES}` },
    rated_games: { type: 'integer', notNull: true },
    wins: { type: 'integer', notNull: true },
    peak_points: { type: 'integer', notNull: true },
    final_points: { type: 'integer', notNull: true },
    /** what Stêrk is judged on at the season's end: rated games ever, and the last one */
    total_games: { type: 'integer', notNull: true, default: 0 },
    last_rated_at: { type: 'timestamptz' },
    /** the peak tier — the season emblem, kept forever; NULL while the season ended mid-placement */
    peak_tier: { type: 'text', check: `peak_tier IS NULL OR peak_tier IN ${TIERS}` },
    sterk: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('rank_season_results', 'rank_season_results_pkey', { primaryKey: ['user_id', 'season_id', 'game'] });
  pgm.createIndex('rank_season_results', ['season_id', 'game']);

  pgm.createTable('rank_season_rewards', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    season_id: { type: 'text', notNull: true },
    best_game: { type: 'text', notNull: true },
    best_tier: { type: 'text', notNull: true, check: `best_tier IN ${TIERS}` },
    gems: { type: 'integer', notNull: true, default: 0 },
    frame_sku: { type: 'text' },
    title: { type: 'text' },
    granted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('rank_season_rewards', 'rank_season_rewards_pkey', { primaryKey: ['user_id', 'season_id'] });

  for (const table of ['wordle_battles', 'rhyme_matches', 'story_games']) {
    pgm.addColumns(table, {
      rated: { type: 'boolean', notNull: true, default: false },
      rated_state: { type: 'text', check: `rated_state IS NULL OR rated_state IN ${STATES}` },
    });
  }

  // the season frames: in the catalogue, never on sale, granted by the season job
  for (const [sku, name, description] of FRAMES) {
    pgm.sql(
      `INSERT INTO shop_items (sku, name, description, category, currency, price, is_unique, active)
       VALUES ('${sku}', '${name}', '${description}', 'frame', 'gems', 0, true, false)
       ON CONFLICT (sku) DO NOTHING`,
    );
  }
  pgm.addColumns('users', {
    equipped_frame_sku: { type: 'text', references: 'shop_items', onDelete: 'SET NULL' },
  });
  pgm.sql(`
    INSERT INTO tags (key, label, kind, category, acquisition)
    VALUES ('season_title', 'Season title', 'claimable', 'title', 'auto_grant')
    ON CONFLICT (key) DO NOTHING`);
};

export const down = (pgm) => {
  pgm.sql(`DELETE FROM tags WHERE key = 'season_title'`);
  pgm.dropColumns('users', ['equipped_frame_sku']);
  pgm.sql(`DELETE FROM user_entitlements WHERE sku LIKE 'frame_rank_%'`);
  pgm.sql(`DELETE FROM shop_items WHERE sku LIKE 'frame_rank_%'`);
  for (const table of ['wordle_battles', 'rhyme_matches', 'story_games']) {
    pgm.dropColumns(table, ['rated', 'rated_state']);
  }
  pgm.dropTable('rank_season_rewards');
  pgm.dropTable('rank_season_results');
  pgm.dropTable('rank_seasons');
  pgm.dropTable('rating_pair_signals');
  pgm.dropTable('rank_preferences');
  pgm.dropTable('rated_leaves');
  pgm.dropTable('rating_events');
  pgm.dropTable('rated_game_players');
  pgm.dropTable('rated_games');
  pgm.dropTable('game_ratings');
};
