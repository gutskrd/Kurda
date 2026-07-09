/**
 * Saved dictionary words (KUR-047). Bookmarking an entry schedules it into
 * SM-2 (as item_id 'dict:<entryId>'), capped at 10 new/day. Unsaving removes
 * the bookmark but keeps the review_items history; the review queue only
 * surfaces dict items whose word is still saved.
 *
 * review_items.created_at is added so "10 new/day" can be counted per local
 * day; existing rows default to now().
 */

export const up = (pgm) => {
  pgm.createTable('saved_words', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    entry_id: { type: 'uuid', notNull: true, references: 'dict_entries', onDelete: 'CASCADE' },
    saved_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('saved_words', 'saved_words_pkey', { primaryKey: ['user_id', 'entry_id'] });
  pgm.createIndex('saved_words', ['user_id', 'saved_at']);

  pgm.addColumns('review_items', {
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('review_items', ['created_at']);
  pgm.dropTable('saved_words');
};
