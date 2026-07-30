/**
 * Event quest reward claims (KUR-091). Quest *definitions* live in the event
 * config (KUR-089/090) and *progress* is derived from the existing ledgers
 * (xp_ledger, lesson_sessions, rating_history) scoped to the event window — so
 * there is no per-action counter to drift and final-second progress always
 * counts. This table records only the explicit claim: one row per
 * (user, event, quest), which is the idempotency gate for paying the reward.
 * Rewards stay claimable for a grace period after the event ends.
 */

export const up = (pgm) => {
  pgm.createTable('event_quest_claims', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    event_key: { type: 'text', notNull: true },
    quest_id: { type: 'text', notNull: true },
    reward: { type: 'jsonb', notNull: true, default: '{}' },
    claimed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // one claim per user per quest per event → paying a reward twice is impossible
  pgm.addConstraint('event_quest_claims', 'event_quest_claims_unique', {
    unique: ['user_id', 'event_key', 'quest_id'],
  });
  pgm.createIndex('event_quest_claims', ['user_id', 'event_key']);
};

export const down = (pgm) => {
  pgm.dropTable('event_quest_claims');
};
