/**
 * Review items name their exercise by its id as text, so the practice count,
 * the course maps, the practice hub and the placement strengths join on
 * `e.id::text = r.item_id`, which the uuid primary key cannot serve: each read
 * the whole of `exercises`. This index lets them look up the learner's own
 * items. Built CONCURRENTLY, outside a transaction, so lessons go on being
 * served during the deploy.
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
