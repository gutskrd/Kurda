/**
 * Practice/review sessions (KUR-034). A practice session is generated from
 * the spaced-repetition due queue (padded with weak words when short). It
 * mirrors lesson sessions but is sourced from review state rather than a
 * lesson: item_ids pins the chosen exercises so answers can be validated
 * and XP awarded server-side.
 */

export const up = (pgm) => {
  pgm.createTable('practice_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    /** exercise ids chosen for this session, in presentation order */
    item_ids: { type: 'uuid[]', notNull: true },
    total_count: { type: 'integer', notNull: true },
    correct_count: { type: 'integer', notNull: true, default: 0 },
    xp_awarded: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('practice_sessions', ['user_id', 'created_at']);

  pgm.createTable('practice_answers', {
    session_id: { type: 'uuid', notNull: true, references: 'practice_sessions', onDelete: 'CASCADE' },
    exercise_id: { type: 'uuid', notNull: true },
    verdict: { type: 'text', notNull: true, check: "verdict IN ('correct', 'typo', 'wrong')" },
    accepted: { type: 'boolean', notNull: true },
    answered_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('practice_answers', 'practice_answers_pkey', {
    primaryKey: ['session_id', 'exercise_id'],
  });
};

export const down = (pgm) => {
  pgm.dropTable('practice_answers');
  pgm.dropTable('practice_sessions');
};
