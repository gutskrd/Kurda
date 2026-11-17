/**
 * A unit's level in its course's plan.
 *
 * The lesson path shows a course a section at a time, and a section is the
 * units of one level: the Kurmanji Road's plan has chapters 1 to 4 at A1, 5
 * to 9 at A2 and 10 to 12 at B1. That is a fact about the content, so it is
 * kept with the unit it describes rather than written into the apps.
 *
 * `units.cefr` is one of the six levels of the Common European Framework, or
 * NULL for a unit whose course gives none (a course without levels is one
 * section). The road's seed sets it from the plan on each start
 * (content/road-seed.ts); nothing else writes it.
 *
 * A column that may be NULL and has no default is added without rewriting
 * the table, so this takes its lock only for a moment. Written to be run
 * again safely, either way.
 */

export const up = (pgm) => {
  pgm.sql(`ALTER TABLE units ADD COLUMN IF NOT EXISTS cefr text CONSTRAINT units_cefr_check CHECK (cefr IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'))`);
};

export const down = (pgm) => {
  // the column's check goes with it
  pgm.sql('ALTER TABLE units DROP COLUMN IF EXISTS cefr');
};
