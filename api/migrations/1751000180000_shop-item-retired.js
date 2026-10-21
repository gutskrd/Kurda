/**
 * When an admin deleted a shop item that people own.
 *
 * Deleting a `shop_items` row takes everything that points at it with it:
 * `user_entitlements`, `gifts` and the refund records cascade, and an equipped
 * background or icon is quietly taken off. So an item somebody owns, has been
 * given, or is wearing is never deleted — it is retired: off sale, out of the
 * catalogue, and kept for the people who have it, who can still wear it
 * (cosmetics/access.ts `hasAccess`). `retired_at` records that, so the admin's
 * catalogue can leave retired items out by default and tell them from an item
 * merely taken off sale for now. Listing the item again clears it.
 *
 * Nothing is set here for rows that exist already: items withdrawn when the
 * shop's art was replaced (1751000161000) were taken off sale, not deleted.
 */

export const up = (pgm) => {
  pgm.addColumns('shop_items', {
    retired_at: { type: 'timestamptz' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('shop_items', ['retired_at']);
};
