/**
 * Store how many letters a headword has, so the admin screen can ask for them.
 *
 * `GET /admin/dictionary` filters by letter length, and it does it in JavaScript
 * after selecting every matching row — because the count is `[^\p{L}]` stripped
 * from an NFC string, which is what the games use and what SQL has no exact
 * equivalent of. The route's own comment says this is "survivable at a few
 * hundred curated words and is not once a lexicon has been imported", and it is
 * right: the *dictionary-only* view is precisely the one that will hold ~447,000
 * rows, and it is the view an admin has to use to promote words into the games.
 * Every keystroke in that search box would pull the whole table into the API.
 *
 * A column moves the filter and the pagination into SQL, where a partial index
 * makes it an index scan instead.
 *
 * **The application owns this value.** `letterCount()` in @kurda/shared is the
 * definition, `createEntry` writes it, and that is the one both the admin screen
 * and the Wordle engine read. The backfill below is SQL's approximation of the
 * same thing, used once, on the few hundred hand-curated rows that exist before
 * this runs: `[[:alpha:]]` depends on the database's ctype, and measured on a
 * UTF-8 database it agrees exactly — sêv-a is 4, şûşe is 4, ڕۆژ is 3. On a
 * C-locale database it would undercount, which is why nothing after this
 * migration relies on it.
 */

export const up = (pgm) => {
  pgm.addColumns('dict_entries', {
    letter_count: { type: 'integer', notNull: true, default: 0 },
  });

  pgm.sql(`UPDATE dict_entries SET letter_count = length(regexp_replace(headword, '[^[:alpha:]]', '', 'g'))`);

  /*
   * Two indexes, because the screen asks two different questions and both were
   * measured at 400,000 dictionary rows.
   *
   * Neither is partial on `in_games` like `dict_entries_in_games_idx` above:
   * that one exists for the true rows, and the whole problem here is the false
   * ones, which are the hundreds of thousands.
   *
   * Each ends in `headword` so the browse's ORDER BY is the index's own order
   * and the LIMIT stops early. Without that the unfiltered dictionary view —
   * the first thing an admin opens after an import — sorts every row to hand
   * back fifty: 75ms, against 0.2ms with it.
   */
  pgm.createIndex('dict_entries', ['in_games', 'headword'], {
    name: 'dict_entries_in_games_headword_idx',
  });
  pgm.createIndex('dict_entries', ['in_games', 'letter_count', 'headword'], {
    name: 'dict_entries_in_games_letter_count_idx',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('dict_entries', ['in_games', 'letter_count', 'headword'], {
    name: 'dict_entries_in_games_letter_count_idx',
  });
  pgm.dropIndex('dict_entries', ['in_games', 'headword'], {
    name: 'dict_entries_in_games_headword_idx',
  });
  pgm.dropColumn('dict_entries', 'letter_count');
};
