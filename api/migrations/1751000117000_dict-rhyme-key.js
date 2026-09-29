/**
 * Make "what rhymes with this?" a question about a suffix.
 *
 * A rhyme is now decided by how many letters two words end with in common:
 * two or more is perfect, one is near. That means the set of words rhyming
 * with W is exactly the set sharing W's last letter, and the perfect ones are
 * exactly those sharing its last two — so a rhyme group *is* a suffix group.
 *
 * A database cannot index the end of a string. Reversed, it can: the words
 * ending in `-an` all begin `na-` here, and a prefix is what a btree is for.
 *
 *     kurdistan → natsidruk        baran → narab
 *                 ^^                       ^^
 *     both start "na": two shared letters, a perfect rhyme
 *
 * `text_pattern_ops` for the same reason as 1751000116000: a plain btree in a
 * UTF-8 collation does not answer `LIKE 'na%'`, and the index is ignored.
 *
 * **Generated, not written by the application** — unlike `headword_folded` and
 * `letter_count`, which the app owns because their definitions (Kurdish
 * diacritic folding, Unicode letter classes) are not things SQL expresses
 * exactly. `reverse()` of a column already stored is exact, immutable, and the
 * same in Latin and Arabic script, so the database can keep it in step itself
 * and no writer can forget it. There are four places that insert a headword.
 *
 * It reverses `headword_normalized`, not `headword_folded`: rhyme compares
 * letters as written, and ê and e are different letters in Kurmancî.
 */

export const up = (pgm) => {
  pgm.sql(
    `ALTER TABLE dict_entries
       ADD COLUMN rhyme_key text
       GENERATED ALWAYS AS (reverse(headword_normalized)) STORED`,
  );

  pgm.sql(
    `CREATE INDEX dict_entries_rhyme_key_idx ON dict_entries (rhyme_key text_pattern_ops)`,
  );
};

export const down = (pgm) => {
  pgm.dropIndex('dict_entries', 'rhyme_key', { name: 'dict_entries_rhyme_key_idx' });
  pgm.dropColumn('dict_entries', 'rhyme_key');
};
