/**
 * The typing race in either variety, and in an accent mode.
 *
 * A race is now started in a variety — Kurmancî or Soranî — and the text is
 * picked by `race_texts.language`, which `start()` used to ignore: a Kurmancî
 * racer could be handed a Soranî text. The column only ever held the two codes
 * the admin screen offers, but nothing said so, and since nothing read it,
 * nothing showed when it was wrong — and the screen offered Kurmancî first, so
 * a Soranî text saved without changing it is labelled Kurmancî. Reading the
 * label now would hand exactly those texts to Kurmancî racers. So each text is
 * labelled by its script — Soranî when more of it is Arabic script than Latin
 * letters, Kurmancî the other way round (@kurda/shared `scriptDialect`, which
 * the save now checks with: keep the two alike) — and only a text the count
 * cannot decide (no letters at all, or as many of each) keeps its label, read
 * as what it most likely meant. Then the two codes become the rule. (`down`
 * cannot know the labels it replaced; they were wrong or meant the same.)
 *
 * And a race is run in an accent mode (strict, forgiving or hidden, see
 * @kurda/shared `typing`), which changes what counts: a racer's best is per
 * mode, so the mode is stored with the race. Races run before this were scored
 * exactly as typed, which is `strict`. The dialect is stored too, because a
 * text can be edited or retired after the race it was used for. The new code
 * always says both, but the columns keep their defaults all the same: this
 * runs while the previous release is still serving (and stays serving if the
 * new one fails its health check), and that one starts a race without either —
 * scoring it exactly as typed, which is what `strict` records.
 *
 * `accent_misses` (accented letters typed without the accent) and `errors` are
 * what the result screen reports; they are null on races scored before them.
 */

/** The Arabic script's characters, and Latin letters (not × or ÷), as regular-expression ranges. */
const ARABIC = '\\u0600-\\u06ff\\u0750-\\u077f\\ufb50-\\ufdff\\ufe70-\\ufeff';
const LATIN = 'A-Za-z\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u024f';

export const up = (pgm) => {
  pgm.sql(`
    UPDATE race_texts t
       SET language = CASE
             WHEN s.arabic > s.latin THEN 'ckb'
             WHEN s.latin > s.arabic THEN 'kmr'
             WHEN lower(btrim(t.language)) IN ('ckb', 'sorani', 'soranî', 'sor') THEN 'ckb'
             ELSE 'kmr'
           END
      FROM (SELECT id,
                   length(regexp_replace(body, '[^${ARABIC}]', '', 'g')) AS arabic,
                   length(regexp_replace(body, '[^${LATIN}]', '', 'g')) AS latin
              FROM race_texts) s
     WHERE s.id = t.id`);
  pgm.addConstraint('race_texts', 'race_texts_language_check', { check: "language IN ('kmr', 'ckb')" });
  pgm.createIndex('race_texts', ['active', 'language', 'difficulty']);

  pgm.addColumns('race_games', {
    accent_mode: { type: 'text', notNull: true, default: 'strict' },
    dialect: { type: 'text', notNull: true, default: 'kurmanci' },
    accent_misses: { type: 'integer' },
    errors: { type: 'integer' },
  });
  pgm.sql(`
    UPDATE race_games g
       SET dialect = 'sorani'
      FROM race_texts t
     WHERE t.id = g.text_id AND t.language = 'ckb'`);
  pgm.addConstraint('race_games', 'race_games_accent_mode_check', {
    check: "accent_mode IN ('strict', 'forgiving', 'hidden')",
  });
  pgm.addConstraint('race_games', 'race_games_dialect_check', { check: "dialect IN ('kurmanci', 'sorani')" });
  // a racer's best in a mode: the finished runs, best first
  pgm.createIndex('race_games', ['user_id', 'accent_mode', { name: 'score', sort: 'DESC' }], {
    name: 'race_games_best_idx',
    where: 'finished_at IS NOT NULL',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('race_games', [], { name: 'race_games_best_idx' });
  pgm.dropConstraint('race_games', 'race_games_dialect_check');
  pgm.dropConstraint('race_games', 'race_games_accent_mode_check');
  pgm.dropColumns('race_games', ['accent_mode', 'dialect', 'accent_misses', 'errors']);
  pgm.dropIndex('race_texts', ['active', 'language', 'difficulty']);
  pgm.dropConstraint('race_texts', 'race_texts_language_check');
};
