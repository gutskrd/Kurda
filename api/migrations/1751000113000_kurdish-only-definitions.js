/**
 * Let a sense be defined in Kurdish alone.
 *
 * `definition_en` has been NOT NULL since the dictionary was built (1751000029000),
 * which assumed every entry is a Kurdish headword explained in English. That is
 * one kind of dictionary and not the only one: Wîkîferheng, the largest Kurdish
 * lexicon there is, is Kurmancî explained in Kurmancî — 447,000 headwords whose
 * glosses are Kurdish and which cannot be stored here at all.
 *
 * The alternative was writing those Kurdish glosses into `definition_en`, which
 * would have put Kurdish text under an "English" heading in both apps and made
 * the column a lie. A sense now needs *a* definition rather than an English one,
 * and the check enforces that: at least one side must be present and non-blank.
 *
 * Nothing existing changes. Every row already has an English definition, so the
 * constraint is satisfied the moment it is added, and `NOT NULL` is only
 * loosened — no data is rewritten and the down migration restores it (safely,
 * because a row that has only Kurdish could not have existed before this).
 */

export const up = (pgm) => {
  pgm.alterColumn('dict_senses', 'definition_en', { notNull: false });

  /*
   * A sense with neither definition is a sense that says nothing. Blank-checked
   * rather than merely NOT NULL, because an empty string would otherwise satisfy
   * the column and render as an entry with no meaning.
   */
  pgm.addConstraint('dict_senses', 'dict_senses_has_a_definition', {
    check: `
      coalesce(btrim(definition_en), '') <> ''
      OR coalesce(btrim(definition_ku), '') <> ''
    `,
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('dict_senses', 'dict_senses_has_a_definition');
  /*
   * Kurdish-only senses cannot go back into a NOT NULL English column. They are
   * given the Kurdish text rather than being deleted: reversing a migration
   * should not throw away what somebody imported, and a readable definition in
   * the wrong column is recoverable where a dropped row is not.
   */
  pgm.sql(`UPDATE dict_senses SET definition_en = definition_ku WHERE definition_en IS NULL`);
  pgm.alterColumn('dict_senses', 'definition_en', { notNull: true });
};
