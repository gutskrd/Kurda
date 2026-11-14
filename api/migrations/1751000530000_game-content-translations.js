/**
 * Riddles and proverbs (shared/src/lore.ts): their translations, one language
 * at a time, and each learner's riddles.
 *
 * - `game_content_translations`: what a `game_content` row says in one of the
 *   app's nine languages, beside its Kurdish. Each language is its own row
 *   with its own review (unreviewed, or reviewed by someone, when, with a
 *   note), so a translation is corrected without the row's Kurdish, its
 *   approval or its status being touched, and a published riddle stays
 *   published while one language of it is put right. The payload's shape is
 *   the kind's (`checkLoreTranslation`, validated before it is written); the
 *   table only insists on an object, a known language, and a note no longer
 *   than a row's own review note. `updated_at` is when the text last changed,
 *   which a review does not move.
 * - `riddle_progress`: one row per learner and riddle — hints taken, guesses
 *   made, when it was solved by a guess and when its answer was shown — and
 *   the XP the solve paid, which is paid once (the ledger's own ref keeps it
 *   so as well). A learner's rows go with their account (the cascade, and the
 *   erasure that keeps the user row).
 * - A riddle's and a proverb's slug names it in the learner routes
 *   (`/riddles/:slug`), so two live rows of a kind may not share one; an
 *   archived row gives its slug back.
 */
const LOCALES = "('ku', 'ckb', 'en', 'nl', 'de', 'es', 'fr', 'tr', 'ar')";

export const up = (pgm) => {
  pgm.createTable('game_content_translations', {
    content_id: { type: 'uuid', notNull: true, references: 'game_content', onDelete: 'CASCADE' },
    locale: { type: 'text', notNull: true },
    payload: { type: 'jsonb', notNull: true },
    review_status: { type: 'text', notNull: true, default: 'unreviewed' },
    reviewed_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    reviewed_at: { type: 'timestamptz' },
    review_note: { type: 'text' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('game_content_translations', 'game_content_translations_pkey', { primaryKey: ['content_id', 'locale'] });
  pgm.addConstraint('game_content_translations', 'game_content_translations_locale_check', { check: `locale IN ${LOCALES}` });
  pgm.addConstraint('game_content_translations', 'game_content_translations_payload_shape', { check: "jsonb_typeof(payload) = 'object'" });
  pgm.addConstraint('game_content_translations', 'game_content_translations_review_check', { check: "review_status IN ('unreviewed', 'reviewed')" });
  pgm.addConstraint('game_content_translations', 'game_content_translations_reviewed_when', { check: "review_status = 'unreviewed' OR reviewed_at IS NOT NULL" });
  pgm.addConstraint('game_content_translations', 'game_content_translations_note_length', { check: 'review_note IS NULL OR char_length(review_note) <= 600' });

  pgm.createTable('riddle_progress', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    content_id: { type: 'uuid', notNull: true, references: 'game_content', onDelete: 'CASCADE' },
    hints_used: { type: 'smallint', notNull: true, default: 0 },
    guesses: { type: 'smallint', notNull: true, default: 0 },
    revealed_at: { type: 'timestamptz' },
    solved_at: { type: 'timestamptz' },
    xp_awarded: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('riddle_progress', 'riddle_progress_pkey', { primaryKey: ['user_id', 'content_id'] });
  pgm.addConstraint('riddle_progress', 'riddle_progress_hints_check', { check: 'hints_used BETWEEN 0 AND 2' });
  pgm.addConstraint('riddle_progress', 'riddle_progress_guesses_check', { check: 'guesses >= 0' });
  pgm.addConstraint('riddle_progress', 'riddle_progress_xp_check', { check: 'xp_awarded >= 0' });
  pgm.createTrigger('riddle_progress', 'riddle_progress_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at',
  });
  // a row deleted from game_content takes every learner's record of it along: found by the riddle, not the learner
  pgm.createIndex('riddle_progress', 'content_id');

  pgm.sql(`CREATE UNIQUE INDEX game_content_lore_slug ON game_content (kind, (payload->>'slug'))
             WHERE kind IN ('riddle', 'proverb') AND status <> 'archived'`);
};

export const down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS game_content_lore_slug');
  pgm.dropTable('riddle_progress');
  pgm.dropTable('game_content_translations');
};
