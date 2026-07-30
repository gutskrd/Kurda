/**
 * Skill rating (KUR-061). player_ratings holds each player's current ELO and
 * how many ranked games they've finished (drives K-factor decay out of
 * placement). rating_history is the append-per-game audit trail — one row per
 * player per ranked game, unique on (user_id, game_room_id) so a result can
 * only ever be applied once (idempotent rating writes). Both cascade on user
 * delete so GDPR erasure (KUR-024) stays a plain DELETE.
 */

export const up = (pgm) => {
  pgm.createTable('player_ratings', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    rating: { type: 'integer', notNull: true, default: 1000 },
    games_played: { type: 'integer', notNull: true, default: 0 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // leaderboard reads sort by rating (KUR-062 will build on this)
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
  // one rating write per player per game → idempotent apply
  pgm.addConstraint('rating_history', 'rating_history_user_game_unique', {
    unique: ['user_id', 'game_room_id'],
  });
  pgm.createIndex('rating_history', ['user_id', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('rating_history');
  pgm.dropTable('player_ratings');
};
