/**
 * Seed the cosmetic shop catalog (backgrounds + premium icons) from the committed
 * manifest (api/content/cosmetics.json) so the Shop is populated automatically on
 * deploy — no manual `seed:cosmetics` step. Idempotent upsert by SKU; on an
 * existing row it refreshes only presentation (name/asset/order) and never
 * clobbers an admin's price/active/premium_only edits. Default avatars are NOT
 * catalog items (free web-static choices), so they are not seeded here.
 *
 * Data-only migration. `down` removes the seeded catalog rows (safe: on a fresh
 * migrate up/down there are no entitlements referencing them).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

function loadRows() {
  const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'cosmetics.json');
  const m = JSON.parse(readFileSync(p, 'utf8'));
  return [
    ...m.backgrounds.map((b) => ({ ...b, category: 'background' })),
    ...m.icons.map((i) => ({ ...i, category: 'icon' })),
  ];
}

export const up = async (pgm) => {
  for (const r of loadRows()) {
    await pgm.db.query(
      `INSERT INTO shop_items
         (sku, name, description, category, currency, price, is_unique, active, in_stock,
          asset_key, premium_only, display_order)
       VALUES ($1,$2,NULL,$3,'zer',$4,true,true,true,$5,$6,$7)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name, asset_key = EXCLUDED.asset_key, display_order = EXCLUDED.display_order`,
      [r.sku, r.name, r.category, r.price, r.assetKey, r.premiumOnly, r.displayOrder],
    );
  }
};

export const down = async (pgm) => {
  const skus = loadRows().map((r) => r.sku);
  await pgm.db.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [skus]);
};
