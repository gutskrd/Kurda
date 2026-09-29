/**
 * Separate the words the games *choose from* from the dictionary they *accept*.
 *
 * `dict_entries` has been doing both jobs. Wordle picks its target with
 * `SELECT headword FROM dict_entries ORDER BY id` and then filters by length in
 * JavaScript; Rhyme picks its prompt from the same table; and all of them check
 * a guess with `SELECT EXISTS (… WHERE headword_normalized = $1)`.
 *
 * That works at the few hundred curated Kurmancî headwords seeded in
 * 1751000094000 and stops working the moment a real lexicon arrives. Kurdish
 * Wiktionary alone is ~447,000 Kurmancî entries — inflected forms, proper nouns,
 * abbreviations, and a long tail nobody would recognise. Importing it as-is
 * would mean Wordle setting "abdurrahman" as a five-letter answer, the rhyme
 * admin classifying 447,000 candidates on every page load, and every game start
 * pulling the whole table across the wire.
 *
 * The two jobs want opposite things, which is why one column cannot serve both:
 *
 *   - **choosing** a target wants a small, curated, recognisable set. A bad
 *     target is an unplayable round.
 *   - **accepting** a guess wants the largest dictionary available. A missing
 *     word is a correct answer rejected, and that is the more annoying failure.
 *
 * So `in_games` marks the first set. Everything already here is curated by hand
 * — that is what 1751000094000 seeded and what admins have added since — so it
 * is backfilled true, and the default is false: an import adds searchable,
 * guessable words without ever putting one in front of a player as the answer.
 */

export const up = (pgm) => {
  pgm.addColumns('dict_entries', {
    in_games: { type: 'boolean', notNull: true, default: false },
  });

  // everything present before this migration was curated, so it keeps its job
  pgm.sql(`UPDATE dict_entries SET in_games = true`);

  /*
   * Partial, because every query that uses this asks for the true rows and
   * there will be orders of magnitude more false ones once a lexicon lands.
   */
  pgm.createIndex('dict_entries', 'in_games', {
    name: 'dict_entries_in_games_idx',
    where: 'in_games',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('dict_entries', 'in_games', { name: 'dict_entries_in_games_idx' });
  pgm.dropColumn('dict_entries', 'in_games');
};
