/**
 * Daily quests: three small things to do each day, each paying a chest of Zêr.
 *
 * One row per learner, day and kind. `day` is the learner's own calendar date
 * ('YYYY-MM-DD' in their timezone, as the streak's days are), so a quest never
 * straddles two of their days. The three rows of a day are made the first time
 * the day is read or moved, by a deterministic pick (api/src/quests/daily.ts),
 * so making them twice makes the same rows and the key turns the second into
 * nothing.
 *
 * `done_at` is set as the progress reaches the target, and only then;
 * `claimed_at` and the Zêr paid (`amount`) are set together when the chest is
 * opened, which the Zêr ledger records under the reason 'daily_quest' (the
 * ledger's reasons are free text, so it needs nothing here). The key's
 * (user_id, day) prefix is also what this month's finished quests are counted
 * by, so no other index is needed.
 */

export const up = (pgm) => {
  pgm.createTable('user_quests', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    day: { type: 'date', notNull: true },
    kind: {
      type: 'text',
      notNull: true,
      check: "kind IN ('streak', 'lessons', 'accuracy', 'xp', 'listening', 'perfect')",
    },
    target: { type: 'smallint', notNull: true, check: 'target > 0' },
    progress: { type: 'smallint', notNull: true, default: 0 },
    chest: { type: 'text', notNull: true, check: "chest IN ('common', 'rare', 'epic')" },
    done_at: { type: 'timestamptz' },
    claimed_at: { type: 'timestamptz' },
    /** Zêr the chest paid, set when it was opened */
    amount: { type: 'smallint', check: 'amount > 0' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('user_quests', 'user_quests_pkey', { primaryKey: ['user_id', 'day', 'kind'] });
  pgm.addConstraint('user_quests', 'user_quests_progress_check', { check: 'progress >= 0 AND progress <= target' });
  // done exactly when the target is reached, and a chest opened only once it is done
  pgm.addConstraint('user_quests', 'user_quests_done_check', { check: '(done_at IS NOT NULL) = (progress = target)' });
  pgm.addConstraint('user_quests', 'user_quests_claim_check', {
    check: '(claimed_at IS NULL) = (amount IS NULL) AND (claimed_at IS NULL OR done_at IS NOT NULL)',
  });
};

export const down = (pgm) => {
  pgm.dropTable('user_quests');
};
