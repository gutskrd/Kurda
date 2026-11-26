/**
 * A tree's water is counted in drops: a lesson earns two, and the stages and harvests ask for more of them (shared
 * `tree.ts`). Every tree keeps its stage, and its progress toward the next one is carried over as the same share of the
 * new need, rounded up, so no bar goes back; a full-grown tree keeps its harvests and its way to the next. Water held
 * becomes three drops for each, what it was worth. The numbers are written out here because the rules may change again
 * after this, and this step must always mean the same thing. Down undoes it exactly for every tree it carried over.
 */

/** Where each stage starts, then and now, up to the great tree. */
const BEFORE = [0, 1, 3, 7, 14, 24, 38];
const AFTER = [0, 2, 6, 18, 40, 76, 128];
/** A full-grown tree's way to its next harvest, then and now. */
const HARVEST = { before: 10, after: 20 };
/** Drops for each unit of water held, and the most anybody holds. */
const DROPS = 3;
const MOST = 9999;

/** The stages as rows: where each starts and ends, in the counting carried from (`from`) and to (`to`). */
const stages = (from, to) => from.slice(0, -1).map((lo, i) => `(${lo}, ${from[i + 1]}, ${to[i]}, ${to[i + 1]})`).join(', ');

/**
 * One statement, so no tree is carried over twice: a growing tree by the share of its stage it had, `round` rounding the
 * new count (up on the way up, down on the way back, which lands exactly where it began), and a full-grown one by its
 * whole harvests and the share of the next.
 */
const carry = (from, to, everyFrom, everyTo, round, water) => `
  UPDATE user_trees t SET waterings = m.next, water = ${water}
    FROM (
      SELECT u.user_id,
             CASE WHEN u.waterings >= ${from[from.length - 1]}
                  THEN ${to[to.length - 1]} + ((u.waterings - ${from[from.length - 1]}) / ${everyFrom}) * ${everyTo}
                       + ${round}(((u.waterings - ${from[from.length - 1]}) % ${everyFrom})::numeric * ${everyTo} / ${everyFrom})::int
                  ELSE s.lo_to + ${round}((u.waterings - s.lo_from)::numeric * (s.hi_to - s.lo_to) / (s.hi_from - s.lo_from))::int
             END AS next
        FROM user_trees u
        LEFT JOIN (VALUES ${stages(from, to)}) AS s(lo_from, hi_from, lo_to, hi_to) ON u.waterings >= s.lo_from AND u.waterings < s.hi_from
    ) m
   WHERE m.user_id = t.user_id`;

export const up = (pgm) => {
  pgm.sql(carry(BEFORE, AFTER, HARVEST.before, HARVEST.after, 'CEIL', `LEAST(${MOST}, t.water * ${DROPS})`));
};

export const down = (pgm) => {
  pgm.sql(carry(AFTER, BEFORE, HARVEST.after, HARVEST.before, 'FLOOR', `CEIL(t.water::numeric / ${DROPS})::int`));
};
