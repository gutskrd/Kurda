/**
 * Streak-reminder send log (KUR-096). One row per (user, local date, kind) is
 * the idempotency gate so the hourly job never sends the same reminder twice in
 * a day even if it runs more than once. `sent_on` is the user's LOCAL date.
 */

export const up = (pgm) => {
  pgm.createTable('streak_reminders_sent', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    sent_on: { type: 'date', notNull: true },
    kind: { type: 'text', notNull: true },
    sent_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('streak_reminders_sent', 'streak_reminders_sent_pkey', {
    primaryKey: ['user_id', 'sent_on', 'kind'],
  });
  pgm.addConstraint('streak_reminders_sent', 'streak_reminders_sent_kind_check', {
    check: "kind IN ('primary', 'last_chance')",
  });
};

export const down = (pgm) => {
  pgm.dropTable('streak_reminders_sent');
};
