/**
 * Seed the cosmetic catalog (backgrounds + premium icons) into shop_items from
 * the committed manifest (api/content/cosmetics.json). Idempotent: re-running
 * upserts by SKU. Default prices come from the manifest and can be changed by
 * admins afterwards (this never overwrites an admin-adjusted price back down —
 * see NOTE below). Default avatars are NOT catalog items (free choices resolved
 * from web static), so they are intentionally not seeded here.
 *
 *   npm run -w api seed:cosmetics      (or: npx tsx api/scripts/seed-cosmetics.ts)
 *
 * NOTE: to respect admin edits, existing rows only get name/asset/order refreshed
 * — price/active/premium_only are left as-is once a row exists. New rows get the
 * manifest defaults.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import pg from 'pg';
import { loadConfig } from '../src/config/env.js';

interface Icon {
  sku: string;
  name: string;
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
      // New rows: full manifest defaults. Existing rows: only refresh presentation
      // (name/asset/order) — never clobber an admin's price/active/premium changes.
      await client.query(
        `INSERT INTO shop_items
           (sku, name, description, category, currency, price, is_unique, active, in_stock,
            asset_key, premium_only, display_order)
         VALUES ($1,$2,NULL,$3,'zer',$4,true,true,true,$5,$6,$7)
         ON CONFLICT (sku) DO UPDATE SET
           name = EXCLUDED.name, asset_key = EXCLUDED.asset_key, display_order = EXCLUDED.display_order`,
        [r.sku, r.name, r.category, r.price, r.assetKey, r.premiumOnly, r.displayOrder],
      );
    }
    console.log(`cosmetics seed: upserted ${rows.length} items (${manifest.backgrounds.length} backgrounds, ${manifest.icons.length} icons)`);
  } finally {
    await client.end();
  }
}

void main();
