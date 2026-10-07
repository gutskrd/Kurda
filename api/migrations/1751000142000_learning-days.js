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
 * Only sessions that were learning count, by the rule the app uses from now
 * on (streaks/streak-logic.ts `countsAsLearning`): at least half of the items,
 * and never fewer than one, answered. A session finished with nothing in it
 * adds no day here either.
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
      SELECT s.user_id, s.completed_at FROM lesson_sessions s
       WHERE s.completed_at IS NOT NULL
         AND (SELECT count(*) FROM session_answers a WHERE a.session_id = s.id)
             >= GREATEST(1, ceil(s.total_count / 2.0))
      UNION ALL
      SELECT p.user_id, p.completed_at FROM practice_sessions p
       WHERE p.completed_at IS NOT NULL
         AND (SELECT count(*) FROM practice_answers a WHERE a.session_id = p.id)
             >= GREATEST(1, ceil(p.total_count / 2.0))
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
