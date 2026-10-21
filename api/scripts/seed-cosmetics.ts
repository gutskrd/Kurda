/**
 * Seed the cosmetic catalog (backgrounds + premium icons) into shop_items from
 * the committed manifest (api/content/cosmetics.json). Idempotent: re-running
 * adds only the rows that are missing. Default avatars are NOT catalog items
 * (free choices resolved from web static), so they are intentionally not
 * seeded here.
 *
 *   npm run -w api seed:cosmetics      (or: npx tsx api/scripts/seed-cosmetics.ts)
 *
 * NOTE: once a row exists it is the admins' — this never touches it. It used
 * to refresh an existing row's name, description, art and order from the
 * manifest, which was harmless while those could only be changed here; now
 * that the admin's shop page edits them, a re-run would quietly undo those
 * edits. Changing what shipped is a migration's job (1751000179000 renamed
 * two icons that way). An item an admin deleted while people owned it, or one
 * from this manifest, is kept as a retired row (shop/catalogue.ts), so a re-run
 * does not put it back either. New rows get the manifest defaults, including
 * `active: false` on the items that were withdrawn when the shop's art was
 * replaced (see migration 1751000161000).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import pg from 'pg';
import { loadConfig } from '../src/config/env.js';

interface Icon {
  sku: string;
  name: string;
  description?: string;
  /** absent means on sale */
  active?: boolean;
  assetKey: string;
  price: number;
  premiumOnly: boolean;
  displayOrder: number;
}
interface Background extends Icon {
  type: 'image' | 'gif' | 'video';
}
interface Manifest {
  icons: Icon[];
  backgrounds: Background[];
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('DATABASE_URL is not set — nothing to seed against.');
    process.exit(1);
  }
  const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'cosmetics.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;

  const rows = [
    ...manifest.backgrounds.map((b) => ({ ...b, category: 'background' as const })),
    ...manifest.icons.map((i) => ({ ...i, category: 'icon' as const })),
  ];

  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  try {
    for (const r of rows) {
      // New rows: full manifest defaults. Existing rows: left exactly as the admins have them.
      await client.query(
        `INSERT INTO shop_items
           (sku, name, description, category, currency, price, is_unique, active, in_stock,
            asset_key, premium_only, display_order)
         VALUES ($1,$2,$3,$4,'zer',$5,true,$6,true,$7,$8,$9)
         ON CONFLICT (sku) DO NOTHING`,
        [r.sku, r.name, r.description ?? null, r.category, r.price, r.active ?? true, r.assetKey, r.premiumOnly, r.displayOrder],
      );
    }
    console.log(`cosmetics seed: checked ${rows.length} items (${manifest.backgrounds.length} backgrounds, ${manifest.icons.length} icons)`);
  } finally {
    await client.end();
  }
}

void main();
