/**
 * Which catalogue a learner's badges were last counted against.
 *
 * A learner's first count records what they did before badges existed
 * quietly, as already seen (badges/service.ts). Badges added to the catalogue
 * later get the same: `badge_users.catalogue` is the version of the catalogue
 * a learner was last counted against, and a learner behind the current one is
 * counted once, quietly, for the badges added since — so eleven new badges do
 * not arrive as eleven celebrations for things done months ago.
 *
 * Every learner already counted was counted against the first catalogue.
 */

export const up = (pgm) => {
  pgm.addColumns('badge_users', {
    catalogue: { type: 'integer', notNull: true, default: 1 },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('badge_users', ['catalogue']);
};
