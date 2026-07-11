/**
 * Per-user notification preferences (KUR-095). One row per user: a boolean per
 * category and an optional quiet-hours window (minutes-of-day in the user's
 * timezone; NULL = disabled). Marketing defaults OFF for GDPR (explicit opt-in).
 * Preferences are consulted at delivery time by the send pipeline, so a change
 * takes effect even for already-queued sends.
 */

export const up = (pgm) => {
  pgm.createTable('notification_prefs', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    streak: { type: 'boolean', notNull: true, default: true },
    friends: { type: 'boolean', notNull: true, default: true },
    games: { type: 'boolean', notNull: true, default: true },
    events: { type: 'boolean', notNull: true, default: true },
    marketing: { type: 'boolean', notNull: true, default: false },
    // minutes-of-day [0,1440); NULL/NULL = no quiet hours. Window may wrap midnight.
    quiet_start_min: { type: 'integer' },
    quiet_end_min: { type: 'integer' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('notification_prefs', 'notification_prefs_quiet_range', {
    check:
      '(quiet_start_min IS NULL AND quiet_end_min IS NULL) OR ' +
      '(quiet_start_min BETWEEN 0 AND 1439 AND quiet_end_min BETWEEN 0 AND 1439)',
  });
};

export const down = (pgm) => {
  pgm.dropTable('notification_prefs');
};
