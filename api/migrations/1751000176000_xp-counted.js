/**
 * XP that counts for the leagues, recorded beside the XP earned (contract 4 §L4).
 *
 * Every award is still paid in full to the learner's total (`amount`), which
 * drives their level and badges. What the weekly league and the weekly board
 * count is `counted`: game XP only up to 60 a day across all games, and a
 * day's XP past 300 at half, past 600 at a fifth (api/src/xp/rules.ts). The two
 * live in the same append-only row, worked out when it is written, so a week's
 * table is a plain sum and never a replay of the rules.
 *
 * Rows written before this have no `counted`; they count as their amount (a
 * reversal, which is negative, as nothing), which is what the league and the
 * board each did with them before — the board had ignored reversals, and the
 * league now does too, so the two agree. Nothing old is rewritten: the ledger
 * refuses updates, and its history should stay as it was.
 */

export const up = (pgm) => {
  pgm.addColumns('xp_ledger', {
    counted: { type: 'integer' },
  });
  pgm.addConstraint('xp_ledger', 'xp_ledger_counted_range', {
    check: 'counted IS NULL OR (counted >= 0 AND counted <= GREATEST(amount, 0))',
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('xp_ledger', 'xp_ledger_counted_range');
  pgm.dropColumns('xp_ledger', ['counted']);
};
