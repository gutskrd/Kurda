/**
 * Per-day active-user records (KUR-106 follow-up).
 *
 * DAU/WAU/MAU were read from `analytics_events`, which only the client ingest
 * endpoint writes — and no client emits them, so the activity dashboard could
 * never show anything. `users.last_seen_at` is overwritten in place, so it can
 * answer "active now" but keeps no history to count a past day from.
 *
 * This is the missing history: one row per user per day, written by the presence
 * heartbeat. Deliberately minimal — a day and a user id, no event payloads — so
 * it answers the activity question without becoming a behaviour log. Rows follow
 * the user on delete.
 */
export const up = (pgm) => {
  pgm.createTable('user_activity_days', {
    day: { type: 'date', notNull: true },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
  });
  // one row per user per day; the heartbeat upserts against this
  pgm.addConstraint('user_activity_days', 'user_activity_days_pkey', {
    primaryKey: ['day', 'user_id'],
  });
  // range scans for the DAU/WAU/MAU windows
  pgm.createIndex('user_activity_days', 'day');
};

export const down = (pgm) => {
  pgm.dropTable('user_activity_days');
};
