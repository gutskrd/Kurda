/**
 * Placement test + skill unlock (KUR-039). A placement_session tracks the
 * adaptive walk (current level, pending question, answer history) so a
 * half-finished test can resume. user_course_progress records the tested-out
 * level — written only on completion, so a quit never partially unlocks.
 */

export const up = (pgm) => {
  pgm.createTable('placement_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    course_id: { type: 'uuid', notNull: true, references: 'courses', onDelete: 'CASCADE' },
    current_level: { type: 'integer', notNull: true, default: 1 },
    /** the exercise the learner is currently being asked */
    current_exercise_id: { type: 'uuid' },
    /** [{ level, correct }] walk history */
    history: { type: 'jsonb', notNull: true, default: '[]' },
    placed_level: { type: 'integer' },
    completed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // at most one active (incomplete) placement per learner+course → resume
  pgm.createIndex('placement_sessions', ['user_id', 'course_id'], {
    unique: true,
    where: 'completed_at IS NULL',
    name: 'placement_active_uniq',
  });

  pgm.createTable('user_course_progress', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    course_id: { type: 'uuid', notNull: true, references: 'courses', onDelete: 'CASCADE' },
    /** skills with position ≤ this are unlocked / tested out (0 = none) */
    unlocked_through_position: { type: 'integer', notNull: true, default: 0 },
    placed_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('user_course_progress', 'user_course_progress_pkey', {
    primaryKey: ['user_id', 'course_id'],
  });
};

export const down = (pgm) => {
  pgm.dropTable('user_course_progress');
  pgm.dropTable('placement_sessions');
};
