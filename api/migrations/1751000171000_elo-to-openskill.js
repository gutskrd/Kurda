/**
 * The old skill rating moves into Game Ranks, and the old tables go
 * (contract-4 §T, api-ranks).
 *
 * One Elo per player, written only by the ranked quiz (deleted in 47ca163), has
 * been frozen since — read by profiles, the rating board, tournaments and the
 * season job, written by nothing. Whatever skill it measured is carried over
 * once, as a starting point that the first season then settles:
 *
 *   μ = 25 + (Elo − 1000) / 48    (200 Elo ≈ one TrueSkill skill class, β ≈ 4.17)
 *   σ = 4 with 20 or more games, else 6
 *
 * into each game a player's rated games were played in, when the history
 * says (a room id that is one of the games' own ids), and into Wordle Battle
 * otherwise — the quiz rooms are not any current game. Someone with five or
 * more rated games is past placement. Each move is a 'migration' event that
 * keeps the old numbers (`state_before.elo`), so nothing is lost by dropping
 * the tables: `player_ratings`, `rating_history`, and the `users.rating` and
 * `users.rating_games` columns nothing has read since KUR-061.
 *
 * Players who never finished a rated game have nothing to carry; deleted
 * accounts are left behind.
 *
 * Down recreates the old tables empty (the ratings live on in the events).
 */

export const up = (pgm) => {
  pgm.sql(`
    WITH season AS (
      SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-Q' || extract(quarter FROM now() AT TIME ZONE 'UTC')::int AS id
    ),
    -- the games their rated history was played in, where a room id is one of the games' own
    known AS (
      SELECT DISTINCT k.user_id, k.game FROM (
        SELECT h.user_id,
               CASE
                 WHEN EXISTS (SELECT 1 FROM rhyme_matches m WHERE m.id::text = h.game_room_id) THEN 'rhyme-match'
                 WHEN EXISTS (SELECT 1 FROM story_games g WHERE g.id::text = h.game_room_id) THEN 'stories'
                 WHEN EXISTS (SELECT 1 FROM wordle_battles b WHERE b.id::text = h.game_room_id) THEN 'wordle-battle'
               END AS game
          FROM rating_history h
      ) k WHERE k.game IS NOT NULL
    ),
    rated AS (
      SELECT r.user_id, r.rating, r.games_played
        FROM player_ratings r JOIN users u ON u.id = r.user_id
       WHERE r.games_played > 0 AND u.deleted_at IS NULL
    ),
    played AS (
      SELECT r.*, k.game FROM rated r JOIN known k ON k.user_id = r.user_id
      UNION ALL
      SELECT r.*, 'wordle-battle' FROM rated r WHERE NOT EXISTS (SELECT 1 FROM known k WHERE k.user_id = r.user_id)
    ),
    moved AS (
      SELECT p.*, 25 + (p.rating - 1000) / 48.0 AS mu,
             CASE WHEN p.games_played >= 20 THEN 4.0 ELSE 6.0 END AS sigma
        FROM played p
    ),
    shown AS (
      SELECT m.*, GREATEST(0, round(40 * (m.mu - 3 * m.sigma)))::int AS points FROM moved m
    ),
    rows AS (
      INSERT INTO game_ratings (user_id, game, mu, sigma, points, placement_done, season_id, peak_points, best_points)
      SELECT s.user_id, s.game, s.mu, s.sigma, s.points, s.games_played >= 5, season.id, s.points, s.points
        FROM shown s CROSS JOIN season
      ON CONFLICT (user_id, game) DO NOTHING
      RETURNING user_id, game
    )
    INSERT INTO rating_events (user_id, game, kind, season_id, mu_before, sigma_before, mu_after, sigma_after,
                               points_before, points_after, reason, state_before, state_after)
    SELECT s.user_id, s.game, 'migration', season.id, 25, 25 / 3.0, s.mu, s.sigma, 0, s.points, 'migration',
           jsonb_build_object('elo', s.rating, 'eloGames', s.games_played),
           jsonb_build_object('mu', s.mu, 'sigma', s.sigma, 'ratedGames', 0, 'wins', 0,
                              'placementDone', s.games_played >= 5, 'shieldGames', 0, 'lastRatedAt', NULL,
                              'seasonId', season.id, 'seasonGames', 0, 'seasonWins', 0,
                              'peakPoints', s.points, 'bestPoints', s.points)
      FROM shown s CROSS JOIN season
      JOIN rows ON rows.user_id = s.user_id AND rows.game = s.game
  `);

  pgm.dropTable('rating_history');
  pgm.dropTable('player_ratings');
  pgm.dropColumns('users', ['rating', 'rating_games']);
};

export const down = (pgm) => {
  pgm.addColumns('users', {
    rating: { type: 'integer', notNull: true, default: 1000 },
    rating_games: { type: 'integer', notNull: true, default: 0 },
  });
  pgm.createTable('player_ratings', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    rating: { type: 'integer', notNull: true, default: 1000 },
    games_played: { type: 'integer', notNull: true, default: 0 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('player_ratings', 'rating');
  pgm.createTable('rating_history', {
    id: { type: 'bigserial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    game_room_id: { type: 'text', notNull: true },
    rating_before: { type: 'integer', notNull: true },
    rating_after: { type: 'integer', notNull: true },
    delta: { type: 'integer', notNull: true },
    rank: { type: 'integer', notNull: true },
    forfeit: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('rating_history', 'rating_history_user_game_unique', { unique: ['user_id', 'game_room_id'] });
  pgm.createIndex('rating_history', ['user_id', 'created_at']);
};
