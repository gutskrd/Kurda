/**
 * Free gems become rare.
 *
 * Two of the gem rules paid for things a learner can do as often as they
 * like: a first perfect completion of every lesson, and every achievement.
 * Now that gems restore a streak, those two would let anybody grind the price
 * of one. They are switched off here; league promotions, tournament wins,
 * season rewards and event quests pay as before.
 *
 * Switched off rather than removed or set to nothing: `active` is the column
 * the table was given for this (an amount must stay above zero), the code that
 * asks for each grant stays where it is and is simply answered `no_rule`, and
 * an admin can switch either back on from the gem rules page.
 */

const FARMABLE = `('perfect_lesson', 'achievement_milestone')`;

export const up = (pgm) => {
  pgm.sql(`UPDATE gem_rules SET active = false, updated_at = now() WHERE key IN ${FARMABLE}`);
};

export const down = (pgm) => {
  pgm.sql(`UPDATE gem_rules SET active = true, updated_at = now() WHERE key IN ${FARMABLE}`);
};
