/**
 * Grammar tips (KUR-038): a markdown note attachable per skill, shown in a
 * "Tips" tab before lessons and mid-lesson. Stored as raw markdown; rendered
 * client-side.
 */

export const up = (pgm) => {
  pgm.addColumns('skills', {
    grammar_md: { type: 'text' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('skills', ['grammar_md']);
};
