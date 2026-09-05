/**
 * Typing race (a new game mode).
 *
 * `race_texts` is the admin-curated pool a round draws from — the same shape as
 * the word pool and the quiz bank, so curating game content works the same way
 * everywhere. `race_games` is one attempt: the server records when it started
 * so speed is measured from ITS clock, not from anything the client reports.
 */

export const up = (pgm) => {
  pgm.createTable('race_texts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    title: { type: 'text', notNull: true },
    body: { type: 'text', notNull: true },
    language: { type: 'text', notNull: true, default: 'kmr' },
    /** 1 short and easy, 3 long — a racer picks how much they take on */
    difficulty: { type: 'integer', notNull: true, default: 1 },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('race_texts', 'race_texts_difficulty_check', { check: 'difficulty BETWEEN 1 AND 3' });
  // a text nobody can type is not a text; the UI also enforces this, the table
  // is what makes it true
  pgm.addConstraint('race_texts', 'race_texts_body_length', {
    check: 'char_length(btrim(body)) BETWEEN 20 AND 2000',
  });
  pgm.createIndex('race_texts', ['active', 'difficulty']);

  pgm.createTable('race_games', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    text_id: { type: 'uuid', notNull: true, references: 'race_texts', onDelete: 'CASCADE' },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' },
    /** what the racer typed, kept so a result can be re-scored or disputed */
    typed: { type: 'text' },
    wpm: { type: 'numeric(6,1)' },
    accuracy: { type: 'numeric(4,3)' },
    score: { type: 'integer' },
    xp_awarded: { type: 'integer', notNull: true, default: 0 },
  });
  pgm.createIndex('race_games', ['user_id', 'started_at']);
};

export const down = (pgm) => {
  pgm.dropTable('race_games');
  pgm.dropTable('race_texts');
};
