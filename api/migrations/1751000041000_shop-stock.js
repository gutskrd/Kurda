/**
 * Shop catalog additions (KUR-069): a stock flag so an item can be pulled from
 * sale without deleting it (and without losing its history/entitlements). The
 * category column already exists (KUR-071); the catalog API constrains it to
 * cosmetic/powerup/freeze at the edge.
 */

export const up = (pgm) => {
  pgm.addColumns('shop_items', {
    in_stock: { type: 'boolean', notNull: true, default: true },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('shop_items', ['in_stock']);
};
