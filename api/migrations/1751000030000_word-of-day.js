/**
 * Word-of-the-day curated pool (KUR-046). An ordered list of dictionary
 * entries; the daily word steps through it by local-day index so words don't
 * repeat until the whole pool cycles (curate ≥90 for a 90-day no-repeat).
 */

export const up = (pgm) => {
  pgm.createTable('dict_wotd_pool', {
    entry_id: { type: 'uuid', notNull: true, references: 'dict_entries', onDelete: 'CASCADE' },
    position: { type: 'integer', notNull: true, unique: true },
  });
  pgm.addConstraint('dict_wotd_pool', 'dict_wotd_pool_entry_uniq', { unique: ['entry_id'] });
};

export const down = (pgm) => {
  pgm.dropTable('dict_wotd_pool');
};
