/**
 * A peace sign in place of anger.
 *
 * Six reactions, and one of them existed only to let people tell each other they
 * were angry. A community app does not need a dedicated button for that, and
 * this one in particular has a better use for the space.
 *
 * Existing `angry` rows become `peace`. Deleting them instead would silently
 * drop reactions people had left and leave every affected post's
 * `reaction_count` too high; changing them keeps the counts honest, and the
 * worst case is that someone's tap now reads as something kinder than they
 * meant.
 */

const OLD = ['like', 'laugh', 'love', 'wow', 'sad', 'angry'];
const NEW = ['like', 'laugh', 'love', 'wow', 'sad', 'peace'];

const check = (values) => `reaction IN (${values.map((r) => `'${r}'`).join(',')})`;

// Drop, migrate, then re-add: Postgres validates a check constraint as it is
// added, so adding the new one while `angry` rows are still there would fail.
export const up = (pgm) => {
  pgm.dropConstraint('image_reactions', 'image_reactions_reaction_check');
  pgm.sql(`UPDATE image_reactions SET reaction = 'peace' WHERE reaction = 'angry'`);
  pgm.addConstraint('image_reactions', 'image_reactions_reaction_check', { check: check(NEW) });
};

export const down = (pgm) => {
  pgm.dropConstraint('image_reactions', 'image_reactions_reaction_check');
  pgm.sql(`UPDATE image_reactions SET reaction = 'angry' WHERE reaction = 'peace'`);
  pgm.addConstraint('image_reactions', 'image_reactions_reaction_check', { check: check(OLD) });
};
