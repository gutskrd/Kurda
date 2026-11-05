/**
 * Kurdish Kingdom: the village a learner builds by learning.
 *
 * The village itself is never stored: each building's level is worked out
 * again from the learner's own records on every visit (kingdom/service.ts).
 * What is stored is what must happen once:
 *
 * - `kingdom_villages`: one row per learner, made on their first visit. It
 *   tells the first visit from the rest (the one sentence on how the village
 *   grows is shown until `intro_seen_at`), and levels found on that first
 *   visit — built by learning done before the village existed — are recorded
 *   without a celebration each.
 * - `kingdom_levels`: each level a building reached, recorded once. Its key
 *   (user, building, level) is what makes the celebration show once and the
 *   Zêr for a level be paid once: the row and the wallet credit are written in
 *   one transaction, and a second visit at the same moment finds the row
 *   there and pays nothing. `zer` is what was paid (0 for a guest, or an
 *   account the economy does not pay); `seen_at` is when it was celebrated.
 *
 * Both go with the account (ON DELETE CASCADE): they are worth nothing
 * without the learner whose learning built them.
 */

export const up = (pgm) => {
  pgm.createTable('kingdom_villages', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    founded_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    intro_seen_at: { type: 'timestamptz' },
  });

  pgm.createTable('kingdom_levels', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    building: {
      type: 'text',
      notNull: true,
      check: "building IN ('houses', 'school', 'teahouse', 'spring', 'market', 'orchard')",
    },
    level: { type: 'smallint', notNull: true, check: 'level BETWEEN 1 AND 5' },
    reached_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    seen_at: { type: 'timestamptz' },
    zer: { type: 'integer', notNull: true, default: 0, check: 'zer >= 0' },
  });
  // the one rule that matters: a level is reached, celebrated and paid for once
  pgm.addConstraint('kingdom_levels', 'kingdom_levels_pkey', { primaryKey: ['user_id', 'building', 'level'] });
};

export const down = (pgm) => {
  pgm.dropTable('kingdom_levels');
  pgm.dropTable('kingdom_villages');
};
