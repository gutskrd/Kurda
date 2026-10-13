/**
 * Migration 1751000161000 against real Postgres: an item on a removed file is
 * given new art and withdrawn, and each owner is recorded with what they paid.
 *
 * The migration is run again here on purpose, against rows made for the test —
 * it is written to be re-runnable, and that is part of what is being checked.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { WalletService } from '../wallet/service.js';
import { ShopService } from '../shop/service.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATION = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations', '1751000161000_code-made-cosmetics.js');

interface Migration {
  up(pgm: unknown): Promise<void>;
  down(pgm: unknown): Promise<void>;
  REPLACED_BY: Record<string, string>;
  MADE: [string, string, string, string, string, number, boolean, number][];
}

describe.skipIf(!DATABASE_URL)('the code-made cosmetics migration (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  let shop: ShopService;
  let migration: Migration;
  const s = Date.now().toString(36);
  /** an item an admin made by hand on a file that is no longer shipped */
  const SKU = `bg-handmade-${s}`;
  const ids: Record<string, string> = {};

  const pgm = () => ({ db: { query: (text: string, params?: unknown[]) => pool.query(text, params) } });

  async function register(tag: string, ip: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `refresh_${tag}_${s}@it.kurda.app`,
        username: `rf_${tag}_${s}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    ids[tag] = res.json().user.id;
  }

  const refreshOf = async (user: string) =>
    (
      await pool.query<{ refund_amount: number; refund_currency: string; returned_at: Date | null }>(
        `SELECT refund_amount, refund_currency, returned_at FROM cosmetic_refreshes WHERE user_id = $1 AND sku = $2`,
        [user, SKU],
      )
    ).rows[0];

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    shop = new ShopService(pool, wallet);
    migration = (await import(pathToFileURL(MIGRATION).href)) as Migration;

    await register('buyer', '10.91.0.1');
    await register('friend', '10.91.0.2');
    await register('granted', '10.91.0.3');
    await register('nobody', '10.91.0.4');

    await pool.query(
      `INSERT INTO shop_items (sku, name, description, category, currency, price, is_unique, active, in_stock, asset_key, premium_only)
       VALUES ($1, 'Handmade', 'by an admin', 'background', 'zer', 300, true, true, true, 'backgrounds/background-02.webp', true)`,
      [SKU],
    );
    await wallet.credit({ userId: ids.buyer!, currency: 'zer', amount: 2000, reason: 'admin_adjustment' });
    // bought for themselves at 300 …
    await shop.purchase(ids.buyer!, SKU, `rf-buy-${s}`);
    // … then, at a new price, bought again as a present for a friend
    await pool.query(`UPDATE shop_items SET price = 450 WHERE sku = $1`, [SKU]);
    await shop.gift(ids.buyer!, ids.friend!, SKU, `rf-gift-${s}`);
    await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'grant')`, [ids.granted, SKU]);
    // equipped on premium alone, owned by nobody
    await pool.query(`UPDATE users SET equipped_background_sku = $2 WHERE id = $1`, [ids.nobody, SKU]);

    await migration.up(pgm());
  });

  afterAll(async () => {
    await pool?.query(`DELETE FROM shop_items WHERE sku = $1`, [SKU]).catch(() => undefined);
    await pool?.end();
    await app?.close();
  });

  it('gives the item the art and name of the file it pointed at, and takes it off sale', async () => {
    const made = migration.MADE.find(([sku]) => sku === migration.REPLACED_BY['bg-background-02'])!;
    const row = (await pool.query(`SELECT name, description, asset_key, active, price FROM shop_items WHERE sku = $1`, [SKU])).rows[0];
    expect(row).toEqual({ name: made[2], description: made[3], asset_key: made[4], active: false, price: 450 });
  });

  it('keeps what the item looked like before', async () => {
    const before = (await pool.query(`SELECT * FROM cosmetic_replacements WHERE sku = $1`, [SKU])).rows[0];
    expect(before).toMatchObject({
      previous_asset_key: 'backgrounds/background-02.webp',
      previous_name: 'Handmade',
      previous_description: 'by an admin',
      previous_active: true,
    });
  });

  it('records what each owner paid: their own purchase, not the present they bought, and nothing for a gift or a grant', async () => {
    expect(await refreshOf(ids.buyer!)).toMatchObject({ refund_amount: 300, refund_currency: 'zer', returned_at: null });
    expect(await refreshOf(ids.friend!)).toMatchObject({ refund_amount: 0 });
    expect(await refreshOf(ids.granted!)).toMatchObject({ refund_amount: 0 });
    // somebody wearing it without owning it is not an owner
    expect(await refreshOf(ids.nobody!)).toBeUndefined();
  });

  it('can be run again without changing anything', async () => {
    await migration.up(pgm());
    const before = (await pool.query(`SELECT previous_asset_key, previous_name FROM cosmetic_replacements WHERE sku = $1`, [SKU])).rows[0];
    expect(before).toEqual({ previous_asset_key: 'backgrounds/background-02.webp', previous_name: 'Handmade' });
    const n = await pool.query(`SELECT count(*)::int n FROM cosmetic_refreshes WHERE sku = $1`, [SKU]);
    expect(n.rows[0].n).toBe(3);
  });

  it('goes down to how the item was, and up again keeping each owner’s record', async () => {
    await pool.query(`UPDATE cosmetic_refreshes SET noticed_at = now() WHERE user_id = $1 AND sku = $2`, [ids.buyer, SKU]);
    await migration.down(pgm());
    const restored = (await pool.query(`SELECT name, asset_key, active FROM shop_items WHERE sku = $1`, [SKU])).rows[0];
    expect(restored).toEqual({ name: 'Handmade', asset_key: 'backgrounds/background-02.webp', active: true });

    await migration.up(pgm());
    const again = (await pool.query(`SELECT active FROM shop_items WHERE sku = $1`, [SKU])).rows[0];
    expect(again.active).toBe(false);
    const buyer = await pool.query(`SELECT refund_amount, noticed_at FROM cosmetic_refreshes WHERE user_id = $1 AND sku = $2`, [ids.buyer, SKU]);
    expect(buyer.rows[0].refund_amount).toBe(300);
    expect(buyer.rows[0].noticed_at).not.toBeNull();
    // the made pieces are back on sale
    const live = await pool.query(`SELECT count(*)::int n FROM shop_items WHERE sku = ANY($1) AND active`, [migration.MADE.map(([sku]) => sku)]);
    expect(live.rows[0].n).toBe(migration.MADE.length);
  });
});
