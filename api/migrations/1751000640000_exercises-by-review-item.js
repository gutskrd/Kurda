/**
 * The exercise behind a review item, found without reading every exercise.
 *
 * A review item names its exercise by the exercise's id as text
 * (`review_items.item_id`), so the reads that tag a learner's reviews with
 * their lesson join on `e.id::text = r.item_id`. The primary key is on the
 * uuid itself and cannot serve that, so each of those reads went through the
 * whole `exercises` table — every exercise of every lesson ever written, its
 * payload included — to find the few hundred a learner has met. They are on
 * the busiest page there is: the practice count (`/practice/due`) and every
 * course's map are read each time Learn comes into view, and the practice hub
 * and the placement strengths read the same join. With this index each is a
 * look at the learner's own items; for a learner who has met so many of them
 * that one pass over the table is cheaper, the planner still makes that pass,
 * and the table grows with every lesson written and every lesson corrected.
 *
 * Exercises are written only when a lesson is, which is rare beside those
 * reads, so keeping the index up to date costs next to nothing.
 *
 * Built CONCURRENTLY, so the old server keeps serving lessons while the new
 * one migrates; that cannot run inside a transaction, hence noTransaction(),
 * and a failed build is dropped first so a second run starts clean.
 */

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS exercises_id_text_idx');
  pgm.sql('CREATE INDEX CONCURRENTLY exercises_id_text_idx ON exercises ((id::text))');
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS exercises_id_text_idx');
};
