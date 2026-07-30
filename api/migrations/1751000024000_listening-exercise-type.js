/**
 * Add the 'listening' exercise type (KUR-035): play audio → transcribe.
 * Widens the exercises.type CHECK constraint; payload shape is validated in
 * application code (exercises.ts).
 */

export const up = (pgm) => {
  pgm.dropConstraint('exercises', 'exercises_type_check');
  pgm.addConstraint('exercises', 'exercises_type_check', {
    check: "type IN ('multiple_choice', 'translate', 'match_pairs', 'listening')",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('exercises', 'exercises_type_check');
  pgm.addConstraint('exercises', 'exercises_type_check', {
    check: "type IN ('multiple_choice', 'translate', 'match_pairs')",
  });
};
