/**
 * Anger comes back; peace stays.
 *
 * `1751000105000_peace-reaction` swapped 'angry' out for 'peace' on the reading
 * that a community app has no need of a dedicated anger button. That was not
 * the ask — the ask was to *add* a peace sign — so both belong.
 *
 * The rows that migration rewrote cannot be recovered: it set them to 'peace'
 * and kept no record of which had been 'angry'. Everything since then is
 * unaffected, and nothing is lost from here on.
 */

const WITHOUT_ANGRY = ['like', 'laugh', 'love', 'wow', 'sad', 'peace'];
const WITH_ANGRY = ['like', 'laugh', 'love', 'wow', 'sad', 'peace', 'angry'];

const check = (values) => `reaction IN (${values.map((r) => `'${r}'`).join(',')})`;

// Widening only, so no row has to move: every existing value stays legal.
export const up = (pgm) => {
  pgm.dropConstraint('image_reactions', 'image_reactions_reaction_check');
  pgm.addConstraint('image_reactions', 'image_reactions_reaction_check', { check: check(WITH_ANGRY) });
};

// Narrowing again would strand any 'angry' row, so they go back to 'peace' —
// the same trade the migration above is undoing.
export const down = (pgm) => {
  pgm.dropConstraint('image_reactions', 'image_reactions_reaction_check');
  pgm.sql(`UPDATE image_reactions SET reaction = 'peace' WHERE reaction = 'angry'`);
  pgm.addConstraint('image_reactions', 'image_reactions_reaction_check', { check: check(WITHOUT_ANGRY) });
};
