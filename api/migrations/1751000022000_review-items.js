/**
 * Spaced-repetition review items (KUR-033). One row per (user, item) holds
 * that item's SM-2 state and when it next falls due. `item_id` is an opaque
 * key so the engine is decoupled from any specific word model — today it is
 * an exercise id; once the dictionary lands (KUR-043) it can be a lexeme id.
 */

export const up = (pgm) => {
  pgm.createTable('review_items', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    item_id: { type: 'text', notNull: true },
    repetitions: { type: 'integer', notNull: true, default: 0 },
    interval_days: { type: 'integer', notNull: true, default: 0 },
    easiness: { type: 'real', notNull: true, default: 2.5 },
    due_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_reviewed_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('review_items', 'review_items_pkey', { primaryKey: ['user_id', 'item_id'] });
  // the due-queue read: a user's items ordered by urgency
  pgm.createIndex('review_items', ['user_id', 'due_at']);
};

export const down = (pgm) => {
  pgm.dropTable('review_items');
};
