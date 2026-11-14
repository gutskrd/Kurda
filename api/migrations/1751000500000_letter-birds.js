/**
 * The pen pal bird each member chose.
 *
 * Until somebody chooses, their bird is worked out from their id (shared
 * `letterBirdOf`), so nobody is without one and nothing is stored. The first
 * choice is free and writes the row; a later change is paid for in Zêr, in
 * the same transaction that changes the bird, and `changes` counts them so
 * that each payment has a key of its own and a retry never pays twice.
 *
 * `bird` is a number into shared `LETTER_BIRDS`; the check follows that list,
 * and a longer list comes with a migration that widens it.
 */
export const up = (pgm) => {
  pgm.createTable('letter_birds', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    bird: { type: 'smallint', notNull: true, check: 'bird >= 0 AND bird < 8' },
    changes: { type: 'integer', notNull: true, default: 0, check: 'changes >= 0' },
    chosen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

export const down = (pgm) => {
  pgm.dropTable('letter_birds');
};
