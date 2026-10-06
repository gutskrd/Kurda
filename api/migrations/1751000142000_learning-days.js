/**
 * Days spent learning, beside the streak, and freezes earned by learning.
 *
 * The streak counts consecutive days, and one missed day takes it to zero — the
 * number most likely to make somebody give up just after a lapse. Two numbers
 * that never go down sit beside it now: the longest streak (already kept) and
 * the total of days learned, kept here.
 *
 * `last_learned_on` is the last day, in the user's own timezone, on which they
 * finished a lesson or a practice session. It differs from `last_active_on`,
 * which a daily Wordle win also moves: the daily Zêr is paid for learning, and
 * this is the day it checks.
 *
 * `freeze_progress` counts finished lessons and practice sessions towards the
 * next streak freeze (one per five). Freezes were capped at one and had no way
 * to be earned at all.
 *
 * Both totals are rebuilt from the sessions already finished, each counted on
 * the calendar day it was finished in the learner's timezone. A timezone the
 * database does not know falls back to UTC rather than failing the deploy.
 */

export const up = (pgm) => {
  pgm.addColumns('user_streaks', {
    days_learned: { type: 'integer', notNull: true, default: 0, check: 'days_learned >= 0' },
    last_learned_on: { type: 'date' },
    freeze_progress: {
      type: 'smallint',
      notNull: true,
      default: 0,
      check: 'freeze_progress BETWEEN 0 AND 5',
    },
  });

  pgm.sql(`
    WITH finished AS (
      SELECT user_id, completed_at FROM lesson_sessions WHERE completed_at IS NOT NULL
      UNION ALL
      SELECT user_id, completed_at FROM practice_sessions WHERE completed_at IS NOT NULL
    ),
    learned AS (
      SELECT f.user_id,
             (f.completed_at AT TIME ZONE
                CASE WHEN u.timezone IN (SELECT name FROM pg_timezone_names) THEN u.timezone ELSE 'UTC' END
             )::date AS day
        FROM finished f
        JOIN users u ON u.id = f.user_id
    )
    INSERT INTO user_streaks (user_id, days_learned, last_learned_on)
    SELECT user_id, count(DISTINCT day)::int, max(day)
      FROM learned
     GROUP BY user_id
    ON CONFLICT (user_id) DO UPDATE SET
      days_learned = EXCLUDED.days_learned,
      last_learned_on = EXCLUDED.last_learned_on`);
};

export const down = (pgm) => {
  pgm.dropColumns('user_streaks', ['days_learned', 'last_learned_on', 'freeze_progress']);
};
