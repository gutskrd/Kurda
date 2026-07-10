/**
 * Daily Zêr rewards (KUR-067). One row per user tracking their position in the
 * escalating 7-day claim cycle. last_claim_on is the tz-local calendar date
 * (text, like the streak system's last_active_on) so day boundaries never drift
 * across timezones/DST. The actual Zêr grant lives in the append-only
 * wallet_ledger, keyed idempotently per (user, day).
 */

export const up = (pgm) => {
  pgm.createTable('daily_rewards', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    cycle_day: { type: 'integer', notNull: true, default: 0 },
    /** tz-local 'YYYY-MM-DD' of the last claim, or null */
    last_claim_on: { type: 'text' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

export const down = (pgm) => {
  pgm.dropTable('daily_rewards');
};
