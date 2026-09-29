/**
 * Make the dictionary's prefix search use an index.
 *
 * `headword_folded` got a plain btree in 1751000115000, and a plain btree in a
 * UTF-8 collation cannot answer `LIKE 'sev%'` — the operator classes for a
 * non-C collation do not sort the way a prefix comparison needs, so Postgres
 * ignores the index and reads the table. That is the *main* dictionary query,
 * run on every keystroke of a search box.
 *
 * Measured at 400,000 rows: a parallel sequential scan at 70ms, against 0.48ms
 * with `text_pattern_ops`.
 *
 * It replaces the plain index rather than joining it. `text_pattern_ops`
 * answers equality too — which is the other thing this column is asked, by
 * every game checking whether a guess is a word — and it did so as an index
 * *only* scan at 0.13ms, so keeping both would be paying twice for one answer.
 */

export const up = (pgm) => {
  pgm.dropIndex('dict_entries', 'headword_folded', { name: 'dict_entries_headword_folded_idx' });
  pgm.sql(
    `CREATE INDEX dict_entries_headword_folded_idx
       ON dict_entries (headword_folded text_pattern_ops)`,
  );
};

export const down = (pgm) => {
  pgm.dropIndex('dict_entries', 'headword_folded', { name: 'dict_entries_headword_folded_idx' });
  pgm.createIndex('dict_entries', 'headword_folded', { name: 'dict_entries_headword_folded_idx' });
};
