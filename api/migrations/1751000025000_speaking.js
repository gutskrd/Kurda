/**
 * Speaking exercises (KUR-036): record yourself saying a phrase. Widens the
 * exercises.type CHECK; adds users.skip_speaking so a learner who denies mic
 * permission has speaking exercises skipped course-wide.
 */

export const up = (pgm) => {
  pgm.dropConstraint('exercises', 'exercises_type_check');
  pgm.addConstraint('exercises', 'exercises_type_check', {
    check: "type IN ('multiple_choice', 'translate', 'match_pairs', 'listening', 'speaking')",
  });

  pgm.addColumns('users', {
    skip_speaking: { type: 'boolean', notNull: true, default: false },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['skip_speaking']);
  pgm.dropConstraint('exercises', 'exercises_type_check');
  pgm.addConstraint('exercises', 'exercises_type_check', {
    check: "type IN ('multiple_choice', 'translate', 'match_pairs', 'listening')",
  });
};
