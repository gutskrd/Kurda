/**
 * Daily streaks (KUR-031). One row per user tracking the current run of
 * consecutive active days, the all-time best, and a small freeze balance.
 *
 * "Active day" is a calendar date in the USER'S timezone (users.timezone),
 * stored as last_active_on. Because we compare calendar dates — not
 * timestamps — DST transitions never split or merge a day.
 *
 * A streak freeze (max 1 stored) auto-consumes to cover a single missed
 * day so the run survives. Consumption is settled lazily: the next read or
 * activity brings the row up to "today" and burns a freeze if one missed
 * day sits between last_active_on and today.
 */

export const up = (pgm) => {
  pgm.createTable('user_streaks', {
    user_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    current_streak: { type: 'integer', notNull: true, default: 0, check: 'current_streak >= 0' },
    longest_streak: { type: 'integer', notNull: true, default: 0, check: 'longest_streak >= 0' },
    /** calendar date (user tz) of the last goal-meeting activity */
    last_active_on: { type: 'date' },
    /** stored streak freezes; capped at 1 */
    freezes: { type: 'smallint', notNull: true, default: 0, check: 'freezes BETWEEN 0 AND 1' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Timezone-change guard (KUR-031 edge case): capped to 1/week so a user
  // can't hop timezones to manufacture extra "days".
  pgm.addColumns('users', {
    timezone_changed_at: { type: 'timestamptz' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['timezone_changed_at']);
  pgm.dropTable('user_streaks');
};
