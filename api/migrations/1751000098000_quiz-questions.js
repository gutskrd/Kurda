/**
 * Quiz questions, moved out of code.
 *
 * The 1v1 quiz drew from a constant array compiled into the server, so changing a
 * question meant a deploy and admins could not touch them at all. This table is
 * the editable source; the in-code bank stays as the fallback used when the table
 * is empty, so a fresh database still has a playable quiz.
 *
 * Questions are versioned only by `active`: retiring one keeps it for any finished
 * game that referenced it rather than deleting history out from under results.
 */
export const up = (pgm) => {
  pgm.createTable('quiz_questions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    prompt: { type: 'text', notNull: true },
    /** exactly four, in display order */
    options: { type: 'jsonb', notNull: true },
    correct_index: { type: 'integer', notNull: true },
    category: { type: 'text', notNull: true, default: 'vocabulary' },
    level: { type: 'integer', notNull: true, default: 1 },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('quiz_questions', 'quiz_questions_correct_index_check', {
    check: 'correct_index BETWEEN 0 AND 3',
  });
  pgm.addConstraint('quiz_questions', 'quiz_questions_category_check', {
    check: "category IN ('vocabulary','phrases')",
  });
  pgm.addConstraint('quiz_questions', 'quiz_questions_level_check', {
    check: 'level BETWEEN 1 AND 3',
  });
  // exactly four options, so a malformed row can never reach a game
  pgm.addConstraint('quiz_questions', 'quiz_questions_options_check', {
    check: "jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4",
  });
  pgm.createIndex('quiz_questions', 'active', { where: 'active' });
};

export const down = (pgm) => {
  pgm.dropTable('quiz_questions');
};
