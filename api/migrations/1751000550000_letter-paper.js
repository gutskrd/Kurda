/**
 * A letter's own paper, the drawing and notes on it, and the letter widget.
 *
 * `letters.decor` is the paper a letter is written on, what was drawn on it
 * and the notes stuck to it (shared/src/letter-paper.ts `LetterDecor`); NULL
 * is the default paper with nothing on it, which every letter written before
 * this has. The app checks a decor fully before it is stored
 * (`checkLetterDecor`); the check here is the backstop, its shape and its
 * size. jsonb's text puts a space after every comma and colon, which the
 * compact JSON the app measures against its 64 KB does not have, so the limit
 * here is half as much again.
 *
 * `letter_prefs` remembers the paper somebody last wrote on, so the composer
 * opens on it.
 *
 * The widget on a phone's home screen reads with a token of its own,
 * `letter_widget_tokens`: random, kept only as its SHA-256, one per phone and
 * a few phones per account, each removable. A token remembers the account's
 * token version when it was made, so signing out everywhere or a new password
 * ends the widgets too. `letter_widget_prefs` is the letter pinned to the
 * widgets, if any (a letter erased lets go of the pin), and whether they show
 * the words.
 */
export const up = (pgm) => {
  pgm.addColumn('letters', { decor: { type: 'jsonb' } });
  pgm.addConstraint('letters', 'letters_decor_shape', {
    check: `decor IS NULL OR (
      jsonb_typeof(decor) = 'object'
      AND jsonb_typeof(decor->'paper') = 'object'
      AND jsonb_typeof(decor->'strokes') = 'array'
      AND jsonb_typeof(decor->'notes') = 'array'
      AND jsonb_array_length(decor->'strokes') <= 300
      AND jsonb_array_length(decor->'notes') <= 8
      AND octet_length(decor::text) <= 98304)`,
  });

  pgm.createTable('letter_prefs', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    paper: { type: 'jsonb', notNull: true, check: "jsonb_typeof(paper) = 'object' AND octet_length(paper::text) <= 256" },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('letter_widget_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    token_hash: { type: 'text', notNull: true, unique: true, check: "token_hash ~ '^[0-9a-f]{64}$'" },
    token_version: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_used_at: { type: 'timestamptz' },
  });
  pgm.createIndex('letter_widget_tokens', 'user_id', { name: 'letter_widget_tokens_user' });

  pgm.createTable('letter_widget_prefs', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    pinned_letter_id: { type: 'uuid', references: 'letters', onDelete: 'SET NULL' },
    show_words: { type: 'boolean', notNull: true, default: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('letter_widget_prefs', 'pinned_letter_id', { name: 'letter_widget_prefs_pinned', where: 'pinned_letter_id IS NOT NULL' });
};

export const down = (pgm) => {
  pgm.dropTable('letter_widget_prefs');
  pgm.dropTable('letter_widget_tokens');
  pgm.dropTable('letter_prefs');
  pgm.dropConstraint('letters', 'letters_decor_shape');
  pgm.dropColumn('letters', 'decor');
};
