/**
 * Give every cosmetic a real name, and retire two items.
 *
 * The catalog was seeded with placeholder names straight off the filenames —
 * "Background 37", "Accessoire Icon 12" — which told a shopper nothing about
 * what they were buying. The manifest now carries written names, so this
 * refreshes what is already in `shop_items` to match.
 *
 * A data migration rather than a re-run of the original seed: node-pg-migrate
 * records that one as applied, so editing the manifest alone would change
 * nothing in a database that already exists. Presentation only — price,
 * `active` and `premium_only` are left exactly as an admin has set them.
 *
 * Two items go entirely: `icon-accessoire-icon-06`, and
 * `bg-background-45`, which was the one video background in a catalog of
 * stills. Their art is deleted in the same commit, so leaving the rows would
 * put items in the shop that render as nothing. The schema already handles the
 * fallout — `users.equipped_*_sku` is ON DELETE SET NULL, so anyone wearing one
 * is quietly unequipped, and `user_entitlements.sku` is ON DELETE CASCADE, so
 * ownership goes with it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const RETIRED = ['icon-accessoire-icon-06', 'bg-background-45'];

function manifestRows() {
  const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'cosmetics.json');
  const m = JSON.parse(readFileSync(p, 'utf8'));
  return [...m.backgrounds, ...m.icons];
}

export const up = async (pgm) => {
  for (const r of manifestRows()) {
    await pgm.db.query(`UPDATE shop_items SET name = $2 WHERE sku = $1`, [r.sku, r.name]);
  }
  // cascades the entitlements and unequips anyone wearing them
  await pgm.db.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [RETIRED]);
};

/**
 * Puts the placeholder names back. The two retired items are NOT recreated:
 * their image files are gone from the repo, so a restored row would be an
 * unbuyable blank in the shop rather than a return to how things were.
 */
export const down = async (pgm) => {
  for (const r of manifestRows()) {
    const n = r.assetKey.match(/(\d+)(?=\D*$)/)[1];
    const placeholder = r.sku.startsWith('bg-') ? `Background ${n}` : `Accessoire Icon ${n}`;
    await pgm.db.query(`UPDATE shop_items SET name = $2 WHERE sku = $1`, [r.sku, placeholder]);
  }
};
