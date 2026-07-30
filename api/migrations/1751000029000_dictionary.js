/**
 * Dictionary / lexicon schema (KUR-043). One headword = one entry; multiple
 * parts of speech live as separate senses under it. Examples hang off senses;
 * audio + cross-references (synonym/root/…) hang off entries. Full-text search
 * runs over the headword + its diacritic-folded normalized form.
 */

const POS = "pos IN ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','particle','numeral','phrase','other')";
const RELATION = "relation IN ('synonym','antonym','root','derived','related')";

export const up = (pgm) => {
  pgm.createTable('dict_entries', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    headword: { type: 'text', notNull: true },
    /** diacritic-folded, lowercased form for search (@kurda/shared) */
    headword_normalized: { type: 'text', notNull: true },
    dialect: { type: 'text', notNull: true, default: 'kurmanji' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('dict_entries', 'headword_normalized'); // prefix / exact lookup
  // full-text index over headword + normalized form (immutable 'simple' config)
  pgm.sql(
    `CREATE INDEX dict_entries_fts ON dict_entries
     USING gin (to_tsvector('simple', headword || ' ' || headword_normalized))`,
  );

  pgm.createTable('dict_senses', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    entry_id: { type: 'uuid', notNull: true, references: 'dict_entries', onDelete: 'CASCADE' },
    position: { type: 'integer', notNull: true },
    pos: { type: 'text', notNull: true, check: POS },
    definition_en: { type: 'text', notNull: true },
    definition_ku: { type: 'text' },
  });
  pgm.addConstraint('dict_senses', 'dict_senses_entry_position_uniq', { unique: ['entry_id', 'position'] });

  pgm.createTable('dict_examples', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    sense_id: { type: 'uuid', notNull: true, references: 'dict_senses', onDelete: 'CASCADE' },
    position: { type: 'integer', notNull: true },
    text_ku: { type: 'text', notNull: true },
    text_en: { type: 'text' },
  });
  pgm.addConstraint('dict_examples', 'dict_examples_sense_position_uniq', { unique: ['sense_id', 'position'] });

  pgm.createTable('dict_audio', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    entry_id: { type: 'uuid', notNull: true, references: 'dict_entries', onDelete: 'CASCADE' },
    audio_url: { type: 'text', notNull: true },
    dialect: { type: 'text', notNull: true, default: 'kurmanji' },
  });
  pgm.createIndex('dict_audio', 'entry_id');

  pgm.createTable('dict_xrefs', {
    from_entry_id: { type: 'uuid', notNull: true, references: 'dict_entries', onDelete: 'CASCADE' },
    to_entry_id: { type: 'uuid', notNull: true, references: 'dict_entries', onDelete: 'CASCADE' },
    relation: { type: 'text', notNull: true, check: RELATION },
  });
  pgm.addConstraint('dict_xrefs', 'dict_xrefs_pkey', { primaryKey: ['from_entry_id', 'to_entry_id', 'relation'] });
  pgm.addConstraint('dict_xrefs', 'dict_xrefs_no_self', { check: 'from_entry_id <> to_entry_id' });
  pgm.createIndex('dict_xrefs', 'to_entry_id');
};

export const down = (pgm) => {
  pgm.dropTable('dict_xrefs');
  pgm.dropTable('dict_audio');
  pgm.dropTable('dict_examples');
  pgm.dropTable('dict_senses');
  pgm.dropTable('dict_entries');
};
