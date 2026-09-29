/**
 * A second key, because `headword_normalized` was being asked to be two things.
 *
 * It is written two different ways today. The seed migration (1751000094000),
 * the admin screen and every game use `normalizeWord` — letters only, **keeping**
 * ç ê î ş û. `DictionaryRepository.createEntry`, which is the path an import
 * takes, uses a diacritic-**folding** form instead. Measured:
 *
 *     word      the importer stores   a game looks for
 *     sêv       sev                   sêv
 *     pirtûk    pirtuk                pirtûk
 *     çîrok     cirok                 çîrok
 *
 * Two consequences. One is already live: the dictionary search folds the query
 * and so finds none of the curated words — searching "sêv" today returns
 * nothing, and so does searching "sev". The other is waiting for the import:
 * every game validates a guess with `WHERE headword_normalized = $1`, so all
 * 447,000 imported words — nearly every one of them carrying a diacritic —
 * would be rejected as not words.
 *
 * One column cannot settle it, because the two readers genuinely disagree:
 *
 *   - **comparing** a typed guess wants the diacritics. So does the rhyme
 *     engine, which keys both its rimes and its curator rulings
 *     (`rhyme_overrides`) on this exact column — folding ê into e there would
 *     silently rewrite what rhymes with what.
 *   - **finding** an entry wants them folded. Somebody searching "sev" means
 *     sêv, and an importer meeting "zabît" after "zabit" is meeting the same
 *     headword twice.
 *
 * So `headword_normalized` keeps its meaning and its readers, and this is the
 * one to look a word up by. `dictionaryKey()` in @kurda/shared is its
 * definition and the application writes it; the backfill below is SQL's
 * approximation of the same thing, used once on the rows that exist now.
 */

export const up = (pgm) => {
  pgm.addColumns('dict_entries', {
    headword_folded: { type: 'text', notNull: true, default: '' },
  });

  pgm.sql(
    `UPDATE dict_entries
        SET headword_folded = regexp_replace(
              translate(lower(headword), 'êîûçş', 'eiucs'),
              '[^[:alpha:]]', '', 'g')`,
  );

  /*
   * Every lookup is either equality or a prefix, and both use this. Not unique:
   * folding makes zabit and zabît the same key, and about 7.5% of Wîkîferheng's
   * spellings collide that way — which is the importer's business to report,
   * not a constraint's to refuse.
   */
  pgm.createIndex('dict_entries', 'headword_folded', {
    name: 'dict_entries_headword_folded_idx',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('dict_entries', 'headword_folded', { name: 'dict_entries_headword_folded_idx' });
  pgm.dropColumn('dict_entries', 'headword_folded');
};
