/**
 * Jumping ahead on the lesson path: a short test that opens a later unit.
 *
 * A test is a practice session (practice_sessions holds its items and its
 * answers, and the apps play it in the same player), and this row is what
 * makes it a test: which unit of which course it opens, up to which skill
 * (`position`, the skill's place in the course from 1, what
 * user_course_progress.unlocked_through_position is raised to on a pass), and
 * once finished whether it was passed. The server alone decides that, when the
 * session is completed.
 *
 * Tests started per learner and unit are counted per day, to keep a pass from
 * being tried for until it lands: the index serves that count.
 */

export const up = (pgm) => {
  pgm.createTable('path_jumps', {
    session_id: { type: 'uuid', primaryKey: true, references: 'practice_sessions', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    course_id: { type: 'uuid', notNull: true, references: 'courses', onDelete: 'CASCADE' },
    unit_id: { type: 'uuid', notNull: true, references: 'units', onDelete: 'CASCADE' },
    position: { type: 'integer', notNull: true, check: 'position >= 1' },
    /** null until the test is finished */
    passed: { type: 'boolean' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('path_jumps', ['user_id', 'unit_id', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('path_jumps');
};
