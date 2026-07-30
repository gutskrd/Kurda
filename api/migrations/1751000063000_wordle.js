/**
 * Wordle daily & practice backend (KUR-304). `wordle_games` is one row per game
 * (daily or practice) and holds the server-side target — the answer never ships
 * to the client until the game ends. A partial unique index enforces one daily
 * game per user per UTC day. `wordle_stats` is the per-user aggregate (streak,
 * win %, fastest solve, XP) folded in when a game finishes.
 */

export const up = (pgm) => {
  pgm.createTable('wordle_games', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    mode: { type: 'text', notNull: true, check: "mode IN ('daily','practice')" },
    difficulty: { type: 'text', notNull: true, check: "difficulty IN ('easy','medium','hard')" },
    // UTC day index (days since epoch) for daily games; null for practice
    day_index: { type: 'integer' },
    // server-authoritative answer — withheld from responses while status='playing'
    target: { type: 'text', notNull: true },
    target_length: { type: 'integer', notNull: true },
    // array of scored GuessRow objects ({guess,letters,feedback,correct}); no target
    guesses: { type: 'jsonb', notNull: true, default: '[]' },
    status: {
      type: 'text',
      notNull: true,
      default: 'playing',
      check: "status IN ('playing','won','lost')",
    },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' },
    time_ms: { type: 'integer' },
  });

  pgm.createIndex('wordle_games', ['user_id', 'status']);

  // one daily game per user per UTC day (practice is unlimited → excluded)
  pgm.createIndex('wordle_games', ['user_id', 'day_index'], {
    unique: true,
    where: "mode = 'daily'",
    name: 'wordle_games_one_daily_per_day',
  });

  pgm.createTable('wordle_stats', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    played: { type: 'integer', notNull: true, default: 0 },
    wins: { type: 'integer', notNull: true, default: 0 },
    losses: { type: 'integer', notNull: true, default: 0 },
    current_streak: { type: 'integer', notNull: true, default: 0 },
    longest_streak: { type: 'integer', notNull: true, default: 0 },
    // sum of guesses across *won* games — averaged over wins for display
    guesses_in_wins: { type: 'integer', notNull: true, default: 0 },
    fastest_ms: { type: 'integer' },
    total_xp: { type: 'integer', notNull: true, default: 0 },
    words_learned: { type: 'integer', notNull: true, default: 0 },
    last_daily_day_index: { type: 'integer' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

export const down = (pgm) => {
  pgm.dropTable('wordle_stats');
  pgm.dropTable('wordle_games');
};
