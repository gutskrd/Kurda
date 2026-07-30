/**
 * Add the 'writing' exercise type (KUR-037): free-text production, graded
 * punctuation/case-insensitively and diacritic-tolerantly in app code.
 */

export const up = (pgm) => {
  pgm.dropConstraint('exercises', 'exercises_type_check');
  pgm.addConstraint('exercises', 'exercises_type_check', {
    check:
      "type IN ('multiple_choice', 'translate', 'match_pairs', 'listening', 'speaking', 'writing')",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('exercises', 'exercises_type_check');
  pgm.addConstraint('exercises', 'exercises_type_check', {
    check: "type IN ('multiple_choice', 'translate', 'match_pairs', 'listening', 'speaking')",
  });
};
