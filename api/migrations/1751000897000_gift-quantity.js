/**
 * A gift can be several of one thing at once ("3 × Çay"): one row per recipient keeps its count, and everything that
 * counts gifts (the day's caps, the spending limits, a post's gifts) counts each one. Old rows are one each.
 */

export const up = (pgm) => {
  pgm.addColumn('gifts', { quantity: { type: 'integer', notNull: true, default: 1 } });
  pgm.addConstraint('gifts', 'gifts_quantity_range', { check: 'quantity BETWEEN 1 AND 100' });
};

export const down = (pgm) => {
  pgm.dropConstraint('gifts', 'gifts_quantity_range');
  pgm.dropColumn('gifts', 'quantity');
};
