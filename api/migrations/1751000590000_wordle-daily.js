/**
 * Peyvok's daily word, kept as a schedule rather than worked out again on
 * every request; one daily game per difficulty; and saving a game's word.
 *
 * **The schedule.** The daily word was a seeded permutation of the whole pool,
 * indexed by the day. That is stable only while the pool is: one word added by
 * an admin, or the pool grown by 1751000580000, reorders the permutation and
 * moves today's word for everybody who has not played yet — "the same word for
 * everyone" stops being true halfway through a day. `wordle_daily` holds a
 * day's word per difficulty from the first time it is asked for, and from then
 * on that is the word, whatever the pool does (wordle-service.ts).
 *
 * It is filled here with the days already played, the earliest game of each
 * day and difficulty, so the words of the last few months count as recently
 * set: a new day's word skips them (`dailyRepeatWindow`), and the day of the
 * deploy keeps the word its first players had.
 *
 * **One daily per difficulty.** Daily games were one per player per day,
 * whatever the difficulty, while both apps show the difficulty chips in daily
 * mode: after the first daily, another chip quietly gave back the same game.
 * Each difficulty now has its daily word and its own game, and the streak
 * counts the day once (wordle-daily.ts `applyGameResult`).
 *
 * **Saving the word.** `word_saved_at` marks a game whose answer the player
 * saved to their words, so it counts once toward `wordle_stats.words_learned`,
 * which nothing ever moved before.
 */

export const up = (pgm) => {
  pgm.createTable('wordle_daily', {
    day_index: { type: 'integer', notNull: true },
    difficulty: { type: 'text', notNull: true, check: "difficulty IN ('easy', 'medium', 'hard')" },
    word: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('wordle_daily', 'wordle_daily_pkey', { primaryKey: ['day_index', 'difficulty'] });

  // the days already played, each with the word its first player was given
  pgm.sql(
    `INSERT INTO wordle_daily (day_index, difficulty, word)
     SELECT DISTINCT ON (day_index, difficulty) day_index, difficulty, target
       FROM wordle_games
      WHERE mode = 'daily' AND day_index IS NOT NULL
      ORDER BY day_index, difficulty, started_at, id;`,
  );

  // the old index is stricter than the new one, so every row already satisfies the new one
  pgm.createIndex('wordle_games', ['user_id', 'day_index', 'difficulty'], {
    name: 'wordle_games_one_daily_per_difficulty',
    unique: true,
    where: "mode = 'daily'",
  });
  pgm.dropIndex('wordle_games', ['user_id', 'day_index'], { name: 'wordle_games_one_daily_per_day' });

  pgm.addColumns('wordle_games', {
    word_saved_at: { type: 'timestamptz' },
  });
};

/**
 * Back to one daily per day. A player who played two difficulties on one day
 * keeps the first of those games: the old index cannot hold the second.
 */
export const down = (pgm) => {
  pgm.dropColumns('wordle_games', ['word_saved_at']);
  pgm.sql(
    `DELETE FROM wordle_games g
      USING wordle_games f
      WHERE g.mode = 'daily' AND f.mode = 'daily' AND g.user_id = f.user_id AND g.day_index = f.day_index
        AND (f.started_at, f.id) < (g.started_at, g.id);`,
  );
  pgm.createIndex('wordle_games', ['user_id', 'day_index'], {
    name: 'wordle_games_one_daily_per_day',
    unique: true,
    where: "mode = 'daily'",
  });
  pgm.dropIndex('wordle_games', ['user_id', 'day_index', 'difficulty'], { name: 'wordle_games_one_daily_per_difficulty' });
  pgm.dropTable('wordle_daily');
};
