/**
 * Allow compensating (negative) XP-ledger entries (KUR-110). Confirmed-bot
 * reversal writes a negative entry so `users.xp` stays exactly the ledger sum —
 * the append-only invariant is preserved, we just no longer forbid corrections.
 * Normal awards remain positive (XpService rejects amount <= 0); only admin
 * reversals/adjustments are negative. Zero is still disallowed.
 */

export const up = (pgm) => {
  pgm.dropConstraint('xp_ledger', 'xp_ledger_amount_check');
  pgm.addConstraint('xp_ledger', 'xp_ledger_amount_check', { check: 'amount <> 0' });
};

export const down = (pgm) => {
  pgm.dropConstraint('xp_ledger', 'xp_ledger_amount_check');
  pgm.addConstraint('xp_ledger', 'xp_ledger_amount_check', { check: 'amount > 0' });
};
