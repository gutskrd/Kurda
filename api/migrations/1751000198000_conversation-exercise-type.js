/**
 * Add the 'conversation' exercise type: two to four people talking, line by
 * line, then a question about what was said, graded as a multiple-choice
 * item is. Each line's recording is filed under its conversation and part
 * (`conversationLineKey` in @kurda/shared), in the same lesson_audio table.
 */

export const up = (pgm) => {
  pgm.dropConstraint('exercises', 'exercises_type_check');
  pgm.addConstraint('exercises', 'exercises_type_check', {
    check:
      "type IN ('multiple_choice', 'translate', 'match_pairs', 'listening', 'speaking', 'writing', 'conversation')",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('exercises', 'exercises_type_check');
  pgm.addConstraint('exercises', 'exercises_type_check', {
    check: "type IN ('multiple_choice', 'translate', 'match_pairs', 'listening', 'speaking', 'writing')",
  });
};
