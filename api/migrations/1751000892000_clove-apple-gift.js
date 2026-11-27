/**
 * The clove apple (shared gift-catalogue.ts) on sale beside the apple: given for love, so the server offers it and lets
 * it go only between two known adults. Like every gift it carries no picture of its own; its sku finds its drawing.
 */

/** The retired time `down` gives it while someone holds one, so a later `up` lists it again and nothing an admin retired. */
const KEPT_BY_DOWN = "'1970-01-01T00:00:00Z'";

export const up = (pgm) => {
  pgm.sql(
    `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock, asset_key, display_order)
     VALUES ('gift-sev-mexek', 'Sêva mêxekî', 'gift', 'zer', 100, false, true, true, NULL, 33)
     ON CONFLICT (sku) DO UPDATE SET active = true, in_stock = true, retired_at = NULL
      WHERE shop_items.category = 'gift' AND shop_items.retired_at = ${KEPT_BY_DOWN}`,
  );
};

/** Gone if nobody was ever given one; otherwise off sale and kept, so every gift of it still reads where it was given. */
export const down = (pgm) => {
  pgm.sql(`
    DELETE FROM shop_items s WHERE s.sku = 'gift-sev-mexek'
       AND NOT EXISTS (SELECT 1 FROM user_entitlements e WHERE e.sku = s.sku)
       AND NOT EXISTS (SELECT 1 FROM gifts g WHERE g.sku = s.sku)`);
  pgm.sql(
    `UPDATE shop_items SET active = false, in_stock = false, retired_at = ${KEPT_BY_DOWN} WHERE sku = 'gift-sev-mexek' AND retired_at IS NULL`,
  );
};
