/**
 * Content review workflow + optimistic locking (KUR-100). Adds an `in_review`
 * status between draft and published so editor work can be reviewed before it
 * ships, and a `lock_version` counter so two editors working the same draft
 * can't silently clobber each other — a stale write is rejected with a conflict.
 */

export const up = (pgm) => {
  // widen the status CHECK to include the review state
  pgm.sql(`ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_status_check`);
  pgm.addConstraint('lessons', 'lessons_status_check', {
    check: "status IN ('draft', 'in_review', 'published', 'archived')",
  });

  // optimistic-lock counter, bumped on every draft edit
  pgm.addColumn('lessons', {
    lock_version: { type: 'integer', notNull: true, default: 0 },
  });
};

export const down = (pgm) => {
  pgm.dropColumn('lessons', 'lock_version');
  pgm.sql(`ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_status_check`);
  pgm.addConstraint('lessons', 'lessons_status_check', {
    check: "status IN ('draft', 'published', 'archived')",
  });
};
