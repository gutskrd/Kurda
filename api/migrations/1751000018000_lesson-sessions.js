/**
 * Lesson sessions (KUR-028). A session pins one lesson id (hence one
 * published version — KUR-026), so a learner mid-lesson is unaffected by
 * a new version publishing. Answers are recorded once per (session,
 * exercise) — the PK is the idempotency gate. Sessions expire 24h after
 * they start; grading is always server-side (KUR-027).
 */

export const up = (pgm) => {
  pgm.createTable('lesson_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    lesson_id: { type: 'uuid', notNull: true, references: 'lessons', onDelete: 'CASCADE' },
    total_count: { type: 'integer', notNull: true },
    correct_count: { type: 'integer', notNull: true, default: 0 },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    completed_at: { type: 'timestamptz' },
  });
  // one active (unfinished, unexpired) session per user+lesson — enforced
  // in the service; this index makes the lookup fast
  pgm.createIndex('lesson_sessions', ['user_id', 'lesson_id'], {
    where: 'completed_at IS NULL',
    name: 'lesson_sessions_active',
  });

  pgm.createTable('session_answers', {
    session_id: {
      type: 'uuid',
      notNull: true,
      references: 'lesson_sessions',
      onDelete: 'CASCADE',
    },
    exercise_id: { type: 'uuid', notNull: true, references: 'exercises', onDelete: 'CASCADE' },
    verdict: { type: 'text', notNull: true, check: "verdict IN ('correct', 'typo', 'wrong')" },
    accepted: { type: 'boolean', notNull: true },
    answered_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('session_answers', 'session_answers_pkey', {
    primaryKey: ['session_id', 'exercise_id'],
  });
};

export const down = (pgm) => {
  pgm.dropTable('session_answers');
  pgm.dropTable('lesson_sessions');
};
