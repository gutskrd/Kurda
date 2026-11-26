/**
 * Bundles against real Postgres: the list priced for each person, a purchase that pays, gives every new cosmetic, fills
 * the gift bag and records itself in one transaction, the price less what is owned, retries and double submits, too
 * little Zêr, a full bag, and the age rules. A bundle of this file's own items is used, so nothing shipped is changed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { BAG_GIFTS_PER_DAY, giftSku, type BundlesView, type BundleView } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { issueAccessToken, issueTokenPair } from '../auth/tokens.js';
import { makeLearner } from '../test/progress.js';
import { WalletService } from '../wallet/service.js';
import { grantBagGiftWithin } from '../gifts/bag.js';
import { exportProgress } from '../gdpr/progress-export.js';
import { AuditService } from '../admin/audit-service.js';
import { BundleService } from './bundles.js';
import { ShopService } from './service.js';
import { pass2fa } from '../test/admin-2fa.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Account {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('bundles (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  let shop: ShopService;
  let bundles: BundleService;
  const suffix = Date.now().toString(36);
  const BUNDLE = `test-${suffix}`;
  const BG = `bg_${suffix}`;
  const FRAME = `frame_${suffix}`;
  const ICON = `icon_${suffix}`;
  const TAG = `tag-word-${suffix}`;
  const CAY = giftSku('cay');
  const QEHWE = giftSku('qehwe');
  const SEV = giftSku('sev');
  /** 200 + 350 + 250 + 150 and 5 teas, 2 coffees and an apple: 962 alone, 500 together. */
  const WORTH = 962;
  const PRICE = 500;

  let n = 0;
  const ip = (): string => `10.173.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  const person = async (tag: string, age: number | null = 30): Promise<Account> => {
    const who = await makeLearner(pool, `bu${tag.toLowerCase()}${suffix}`, { age });
    return { id: who.id, token: await issueAccessToken(config, { sub: who.id, ver: 0 }) };
  };
  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, who: Account, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, ...(payload === undefined ? {} : { payload: payload as object }), remoteAddress: ip() });
  let k = 0;
  const key = () => `bundle-${suffix}-${++k}`;
  const fund = (who: Account, amount: number) => wallet.credit({ userId: who.id, currency: 'zer', amount, reason: 'admin_adjustment' });
  const zer = async (who: Account) => (await wallet.balances(who.id)).zer;
  const owns = async (who: Account) =>
    (await pool.query<{ sku: string; source: string }>(`SELECT sku, source FROM user_entitlements WHERE user_id = $1 ORDER BY sku`, [who.id])).rows;
  const bag = async (who: Account) =>
    Object.fromEntries((await pool.query<{ sku: string; count: number }>(`SELECT sku, count FROM gift_bag WHERE user_id = $1`, [who.id])).rows.map((r) => [r.sku, r.count]));
  const listed = async (who: Account): Promise<{ view: BundlesView; mine: BundleView }> => {
    const res = await call('GET', '/shop/bundles', who);
    expect(res.statusCode).toBe(200);
    const view = res.json() as BundlesView;
    return { view, mine: view.bundles.find((b) => b.id === BUNDLE)! };
  };
  const buy = (who: Account, payload: Record<string, unknown>) => call('POST', '/shop/bundles/purchase', who, { bundle: BUNDLE, idempotencyKey: key(), ...payload });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    shop = new ShopService(pool, wallet);
    bundles = new BundleService(pool, wallet, () => null);
    await shop.createItem({ sku: BG, name: 'Kilîma Test', category: 'background', currency: 'zer', price: 200, assetKey: 'backgrounds/made-21-kilima-sor.webp', premiumOnly: true });
    await shop.createItem({ sku: FRAME, name: 'Xeleka Test', category: 'frame', currency: 'zer', price: 350, assetKey: 'frames/made-03-kilim.png' });
    await shop.createItem({ sku: ICON, name: 'Piyana Test', category: 'icon', currency: 'zer', price: 250, assetKey: 'icons/made-08-caydan.png', premiumOnly: true });
    await shop.createItem({ sku: TAG, name: 'Mêvanperwer', description: 'Hospitable', category: 'tag', currency: 'zer', price: 150 });
    await pool.query(`INSERT INTO shop_bundles (id, name, price, display_order) VALUES ($1, 'Çayxaneya Test', $2, 99)`, [BUNDLE, PRICE]);
    await pool.query(
      `INSERT INTO shop_bundle_parts (bundle_id, sku, quantity) VALUES ($1, $2, 1), ($1, $3, 1), ($1, $4, 1), ($1, $5, 1), ($1, $6, 5), ($1, $7, 2), ($1, $8, 1)`,
      [BUNDLE, BG, FRAME, ICON, TAG, CAY, QEHWE, SEV],
    );
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE $1`, [`bu%${suffix}@it.kurda.app`]);
      await client.query(`DELETE FROM shop_bundles WHERE id = $1`, [BUNDLE]);
      await client.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [[BG, FRAME, ICON, TAG]]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  // What each shipped bundle holds is checked against the catalogue (cosmetics/catalogue.test.ts): another suite rolls an
  // earlier migration back and forth, which takes its unowned pieces out of every bundle here for a moment.
  it('lists the six shipped bundles at their prices, in their order, and may tell an adult what they save', async () => {
    const { view } = await listed(await person('list'));
    const shipped = view.bundles.filter((b) => !b.id.startsWith('test-'));
    expect(shipped.map((b) => [b.id, b.listPrice])).toEqual([
      ['cayxane', 500],
      ['gund', 375],
      ['baxce', 400],
      ['zagros', 450],
      ['seva-sterkan', 600],
      ['newroz', 650],
    ]);
    expect(view.nudges).toBe(true);
  });

  it('pays, gives every cosmetic, fills the bag and records the purchase in one go', async () => {
    const buyer = await person('buy');
    await fund(buyer, 1000);
    const { mine } = await listed(buyer);
    expect(mine.quote).toEqual({ price: PRICE, worth: WORTH, saving: WORTH - PRICE, savingPercent: 48, owned: 0, complete: false });
    expect(mine.gifts.map((g) => [g.sku, g.count])).toEqual([
      [CAY, 5],
      [QEHWE, 2],
      [SEV, 1],
    ]);

    const res = await buy(buyer, { expectedPrice: PRICE });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      purchased: true,
      duplicate: false,
      bundle: BUNDLE,
      price: PRICE,
      balance: 500,
      granted: [BG, FRAME, ICON, TAG].sort(),
      gifts: [
        { sku: CAY, count: 5 },
        { sku: QEHWE, count: 2 },
        { sku: SEV, count: 1 },
      ],
    });
    expect(await zer(buyer)).toBe(500);
    expect(await owns(buyer)).toEqual([BG, FRAME, ICON, TAG].sort().map((sku) => ({ sku, source: 'bundle' })));
    expect(await bag(buyer)).toEqual({ [CAY]: 5, [QEHWE]: 2, [SEV]: 1 });

    const record = await pool.query(`SELECT bundle_id, price, worth, parts FROM bundle_purchases WHERE user_id = $1`, [buyer.id]);
    expect(record.rows).toHaveLength(1);
    expect(record.rows[0]).toMatchObject({ bundle_id: BUNDLE, price: PRICE, worth: WORTH });
    expect(record.rows[0].parts).toHaveLength(7);
    const ledger = await pool.query(`SELECT amount, reason, ref_id FROM wallet_ledger WHERE user_id = $1 AND reason = 'bundle_purchase'`, [buyer.id]);
    expect(ledger.rows).toEqual([{ amount: -PRICE, reason: 'bundle_purchase', ref_id: BUNDLE }]);
    // the bag says why its gifts came, already seen, one grant a kind
    const grants = await pool.query(`SELECT sku, source, quantity, seen_at IS NOT NULL AS seen FROM gift_bag_grants WHERE user_id = $1 ORDER BY sku`, [buyer.id]);
    expect(grants.rows).toEqual([
      { sku: CAY, source: 'bundle', quantity: 5, seen: true },
      { sku: QEHWE, source: 'bundle', quantity: 2, seen: true },
      { sku: SEV, source: 'bundle', quantity: 1, seen: true },
    ]);
    // and the record is history: nothing rewrites it
    await expect(pool.query(`UPDATE bundle_purchases SET price = 1 WHERE user_id = $1`, [buyer.id])).rejects.toThrow(/append-only/);
    // their data export says what they bought
    const exported = (await exportProgress(pool, buyer.id)) as { bundles: unknown[] };
    expect(exported.bundles).toHaveLength(1);
  });

  it('leaves the five earned gifts a day to be earned, whatever a bundle brought', async () => {
    const buyer = await person('earn');
    await fund(buyer, PRICE);
    expect((await buy(buyer, { expectedPrice: PRICE })).statusCode).toBe(200);
    const client = await pool.connect();
    try {
      let given = 0;
      for (let i = 0; i < BAG_GIFTS_PER_DAY; i++) {
        await client.query('BEGIN');
        if (await grantBagGiftWithin(client, { userId: buyer.id, source: 'win', ref: `game-${suffix}-${i}` })) given += 1;
        await client.query('COMMIT');
      }
      expect(given).toBe(BAG_GIFTS_PER_DAY);
    } finally {
      client.release();
    }
  });

  it('costs less by the share of what is owned already, and gives only what is new', async () => {
    const buyer = await person('part');
    await fund(buyer, 1000);
    await shop.purchase(buyer.id, FRAME, key());
    expect(await zer(buyer)).toBe(650);

    const { mine } = await listed(buyer);
    // 500 × 612 / 962 = 318.1, rounded up to 320: the frame the buyer has is not paid for twice
    expect(mine.quote).toMatchObject({ price: 320, worth: 612, saving: 292, owned: 1, complete: false });
    expect(mine.parts.find((p) => p.sku === FRAME)!.owned).toBe(true);

    // the full price is not what they are asked for any more
    expect((await buy(buyer, { expectedPrice: PRICE })).json()).toMatchObject({ code: 'PRICE_CHANGED' });
    const res = await buy(buyer, { expectedPrice: 320 });
    expect(res.json()).toMatchObject({ price: 320, balance: 330, granted: [BG, ICON, TAG].sort() });
    expect((await owns(buyer)).map((o) => [o.sku, o.source])).toEqual(
      [
        [BG, 'bundle'],
        [FRAME, 'purchase'],
        [ICON, 'bundle'],
        [TAG, 'bundle'],
      ].sort(),
    );
    const parts = (await pool.query(`SELECT parts FROM bundle_purchases WHERE user_id = $1`, [buyer.id])).rows[0].parts as { sku: string; owned: boolean }[];
    expect(parts.find((p) => p.sku === FRAME)!.owned).toBe(true);
  });

  it('is not sold to someone who owns every cosmetic in it', async () => {
    const buyer = await person('all');
    await fund(buyer, 2000);
    expect((await buy(buyer, {})).statusCode).toBe(200);
    const { mine } = await listed(buyer);
    expect(mine.quote.complete).toBe(true);
    const before = await zer(buyer);
    expect((await buy(buyer, {})).json()).toMatchObject({ code: 'ALREADY_OWNED' });
    expect(await zer(buyer)).toBe(before);
  });

  it('answers a retry with the first purchase, whatever case its key is written in, and charges once', async () => {
    const buyer = await person('retry');
    await fund(buyer, 1000);
    const same = `Retry-${suffix}-KEY`;
    const first = await call('POST', '/shop/bundles/purchase', buyer, { bundle: BUNDLE.toUpperCase(), idempotencyKey: same, expectedPrice: PRICE });
    expect(first.json()).toMatchObject({ duplicate: false, bundle: BUNDLE });
    const again = await call('POST', '/shop/bundles/purchase', buyer, { bundle: BUNDLE, idempotencyKey: same.toLowerCase(), expectedPrice: PRICE });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ duplicate: true, price: PRICE, balance: 500, granted: [BG, FRAME, ICON, TAG].sort() });
    expect(await zer(buyer)).toBe(500);
    expect(await bag(buyer)).toEqual({ [CAY]: 5, [QEHWE]: 2, [SEV]: 1 });
    // a key used for one bundle cannot settle another
    expect((await call('POST', '/shop/bundles/purchase', buyer, { bundle: 'gund', idempotencyKey: same, expectedPrice: 375 })).json()).toMatchObject({
      code: 'IDEMPOTENCY_REUSED',
    });
  });

  it('settles two submits at once as one purchase, with one key or two', async () => {
    const buyer = await person('race');
    await fund(buyer, 2000);
    const shared = key();
    const sameKey = await Promise.all([bundles.purchase(buyer.id, BUNDLE, shared, { expectedPrice: PRICE }), bundles.purchase(buyer.id, BUNDLE, shared, { expectedPrice: PRICE })]);
    expect(sameKey.map((r) => r.duplicate).sort()).toEqual([false, true]);
    expect(await zer(buyer)).toBe(1500);

    const other = await person('race2');
    await fund(other, 2000);
    const twoKeys = await Promise.allSettled([bundles.purchase(other.id, BUNDLE, key(), { expectedPrice: PRICE }), bundles.purchase(other.id, BUNDLE, key(), { expectedPrice: PRICE })]);
    expect(twoKeys.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const refused = twoKeys.find((r): r is PromiseRejectedResult => r.status === 'rejected')!;
    expect((refused.reason as { code: string }).code).toBe('ALREADY_OWNED');
    expect(await zer(other)).toBe(1500);
    expect(await bag(other)).toEqual({ [CAY]: 5, [QEHWE]: 2, [SEV]: 1 });
  });

  it('gives nothing and takes nothing without enough Zêr', async () => {
    const buyer = await person('poor');
    await fund(buyer, PRICE - 1);
    const res = await buy(buyer, { expectedPrice: PRICE });
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(await zer(buyer)).toBe(PRICE - 1);
    expect(await owns(buyer)).toEqual([]);
    expect(await bag(buyer)).toEqual({});
    expect((await pool.query(`SELECT 1 FROM bundle_purchases WHERE user_id = $1`, [buyer.id])).rowCount).toBe(0);
  });

  it('says when the bag has no room for its gifts, and refuses rather than lose them', async () => {
    const buyer = await person('full');
    await fund(buyer, 1000);
    await pool.query(`INSERT INTO gift_bag (user_id, sku, count) VALUES ($1, $2, 97)`, [buyer.id, CAY]);
    expect((await listed(buyer)).mine.bagFull).toBe(true);
    expect((await buy(buyer, { expectedPrice: PRICE })).json()).toMatchObject({ code: 'BAG_FULL' });
    expect(await zer(buyer)).toBe(1000);
  });

  it('is not sold while a part is off sale, unless the buyer owns that part', async () => {
    const buyer = await person('off');
    await fund(buyer, 1000);
    await pool.query(`UPDATE shop_items SET in_stock = false WHERE sku = $1`, [ICON]);
    try {
      expect((await listed(buyer)).mine.onSale).toBe(false);
      expect((await buy(buyer, { expectedPrice: PRICE })).json()).toMatchObject({ code: 'BUNDLE_UNAVAILABLE' });
      await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'grant')`, [buyer.id, ICON]);
      expect((await listed(buyer)).mine.onSale).toBe(true);
    } finally {
      await pool.query(`UPDATE shop_items SET in_stock = true WHERE sku = $1`, [ICON]);
    }
  });

  it('shows a teen the same bundles with no nudge, and lets them buy with their own Zêr', async () => {
    const teen = await person('teen', 15);
    await fund(teen, 1000);
    const { view, mine } = await listed(teen);
    expect(view.nudges).toBe(false);
    expect(mine.quote.price).toBe(PRICE);
    expect((await buy(teen, { expectedPrice: PRICE })).statusCode).toBe(200);
  });

  it('keeps a child’s profile away from bundles altogether', async () => {
    const child = await person('child', 9);
    await pool.query(`UPDATE users SET kind = 'child' WHERE id = $1`, [child.id]);
    await fund(child, 1000);
    await expect(bundles.purchase(child.id, BUNDLE, key(), { expectedPrice: PRICE })).rejects.toMatchObject({ code: 'CHILD_NO_PURCHASES' });
    expect(await owns(child)).toEqual([]);
    expect(await zer(child)).toBe(1000);
  });

  it('lets an admin take a bundle off sale and change its price, through Approvals from 500 and never to its parts’ worth', async () => {
    const admin = await person('admin');
    const audit = new AuditService(pool);
    await expect(bundles.editBundle(audit, admin.id, 'req-1', BUNDLE, { price: 520 })).rejects.toMatchObject({ code: 'PRICE_NEEDS_APPROVAL' });
    // a bundle of the tag alone is worth 150, so 150 or more would save nothing
    const small = `test-small-${suffix}`;
    await pool.query(`INSERT INTO shop_bundles (id, name, price, display_order) VALUES ($1, 'Biçûk', 100, 98)`, [small]);
    await pool.query(`INSERT INTO shop_bundle_parts (bundle_id, sku) VALUES ($1, $2)`, [small, TAG]);
    await expect(bundles.editBundle(audit, admin.id, 'req-2', small, { price: 150 })).rejects.toMatchObject({ code: 'BUNDLE_SAVES_NOTHING' });
    await pool.query(`DELETE FROM shop_bundles WHERE id = $1`, [small]);
    const cheaper = await bundles.editBundle(audit, admin.id, 'req-3', BUNDLE, { price: 450 });
    expect(cheaper).toMatchObject({ id: BUNDLE, price: 450, active: true, worth: WORTH });
    const off = await bundles.editBundle(audit, admin.id, 'req-4', BUNDLE, { active: false });
    expect(off.active).toBe(false);
    expect((await listed(await person('after'))).mine).toBeUndefined();
    const trail = await pool.query(`SELECT action, before, after FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at`, [BUNDLE]);
    expect(trail.rows).toEqual([
      { action: 'shop.bundle.edit', before: { price: PRICE, active: true }, after: { price: 450, active: true } },
      { action: 'shop.bundle.edit', before: { price: 450, active: true }, after: { price: 450, active: false } },
    ]);
    // back as it was, as an approved change would put it
    await pool.query(`UPDATE shop_bundles SET price = $2, active = true WHERE id = $1`, [BUNDLE, PRICE]);
  });

  it('changes a bundle’s price of 500 or more through Approvals, where a second admin signs off, as a shop item’s', async () => {
    // staff on a session of their own, which the console's second factor is entered for
    const staff = async (tag: string): Promise<Account> => {
      const who = await person(tag);
      await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [who.id]);
      const session = await issueTokenPair(config, pool, { id: who.id, token_version: 0 });
      const admin = { id: who.id, token: session.accessToken };
      await pass2fa(app, admin.token, ip());
      return admin;
    };
    const one = await staff('appr1');
    const two = await staff('appr2');
    const price = async () => (await pool.query<{ price: number }>(`SELECT price FROM shop_bundles WHERE id = $1`, [BUNDLE])).rows[0]!.price;
    expect((await call('PATCH', `/admin/shop/bundles/${BUNDLE}`, one, { price: 600 })).json()).toMatchObject({ code: 'PRICE_NEEDS_APPROVAL' });
    const proposed = await call('POST', '/admin/config/changes', one, { target: 'shop_bundle', payload: { id: BUNDLE, price: 600 } });
    expect(proposed.statusCode, proposed.body).toBe(202);
    expect(proposed.json()).toMatchObject({ status: 'pending' });
    expect(await price()).toBe(PRICE);
    const id = proposed.json().id as string;
    const listedChange = ((await call('GET', '/admin/config/changes', two)).json().pending as Array<{ id: string; target: string }>).find((c) => c.id === id);
    expect(listedChange).toMatchObject({ target: 'shop_bundle' });
    // not by the admin who asked
    expect((await call('POST', `/admin/config/changes/${id}/approve`, one)).statusCode).toBe(403);
    const approved = await call('POST', `/admin/config/changes/${id}/approve`, two);
    expect(approved.statusCode, approved.body).toBe(200);
    expect(await price()).toBe(600);
    const trail = await pool.query(`SELECT action, admin_id, after FROM admin_audit_log WHERE target_id = $1 AND action = 'shop.bundle.edit' ORDER BY created_at DESC LIMIT 1`, [BUNDLE]);
    expect(trail.rows[0]).toMatchObject({ admin_id: two.id, after: { price: 600 } });
    // never to its parts' worth, through Approvals either, and only a bundle there is
    expect((await call('POST', '/admin/config/changes', one, { target: 'shop_bundle', payload: { id: BUNDLE, price: WORTH } })).json()).toMatchObject({ code: 'BUNDLE_SAVES_NOTHING' });
    expect((await call('POST', '/admin/config/changes', one, { target: 'shop_bundle', payload: { id: 'no-such-bundle', price: 600 } })).json()).toMatchObject({ code: 'BUNDLE_NOT_FOUND' });
    // a price under 500 sent this way applies at once
    expect((await call('POST', '/admin/config/changes', one, { target: 'shop_bundle', payload: { id: BUNDLE, price: PRICE - 10 } })).json()).toMatchObject({ status: 'applied' });
    expect(await price()).toBe(PRICE - 10);
    await pool.query(`UPDATE shop_bundles SET price = $2, active = true WHERE id = $1`, [BUNDLE, PRICE]);
  });

  it('keeps a word tag someone bought when migration 1751000890000 is rolled back, and puts it on sale again when it runs again', async () => {
    const path = '../../migrations/1751000890000_fairer-prices-and-bundles.js';
    const migration = (await import(/* @vite-ignore */ path)) as Record<'up' | 'down', (pgm: unknown) => Promise<void>> & {
      TAGS: Array<[string, ...unknown[]]>;
    };
    const buyer = await person('rollback');
    await fund(buyer, 1000);
    const bought = await call('POST', '/shop/purchase', buyer, { sku: 'tag-heval', idempotencyKey: key() });
    expect(bought.statusCode, bought.body).toBe(200);
    const client = await pool.connect();
    try {
      // In a transaction it rolls back, so the catalogue everyone else here reads stays as it is.
      await client.query('BEGIN');
      const pgm = { db: { query: (sql: string, params?: unknown[]) => client.query(sql, params) } };
      const tag = async () =>
        (await client.query<{ active: boolean; retired: boolean }>(`SELECT active, retired_at IS NOT NULL AS retired FROM shop_items WHERE sku = 'tag-heval'`)).rows[0];
      const owned = async () => (await client.query(`SELECT 1 FROM user_entitlements WHERE user_id = $1 AND sku = 'tag-heval'`, [buyer.id])).rowCount;
      await migration.down(pgm);
      // what was paid for stays theirs, off sale; a tag nobody bought goes
      expect(await owned()).toBe(1);
      expect(await tag()).toEqual({ active: false, retired: true });
      const unowned = await client.query(
        `SELECT 1 FROM shop_items i WHERE i.sku = ANY($1) AND NOT EXISTS (SELECT 1 FROM user_entitlements e WHERE e.sku = i.sku)`,
        [migration.TAGS.map(([sku]) => sku)],
      );
      expect(unowned.rowCount).toBe(0);
      await migration.up(pgm);
      expect(await tag()).toEqual({ active: true, retired: false });
      expect(await owned()).toBe(1);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('lets a buyer wear the word tag by their name, and shows it on their profile only while they own it', async () => {
    const buyer = await person('wear');
    const viewer = await person('look');
    await fund(buyer, 1000);
    // not theirs yet
    expect((await call('PUT', '/me/cosmetics/tag', buyer, { sku: TAG })).statusCode).toBe(403);
    expect((await buy(buyer, { expectedPrice: PRICE })).statusCode).toBe(200);
    expect((await call('PUT', '/me/cosmetics/tag', buyer, { sku: TAG })).json()).toEqual({ tagSku: TAG });
    expect((await call('GET', `/users/${buyer.id}`, viewer)).json().tag).toEqual({ sku: TAG, label: 'Mêvanperwer', meaning: 'Hospitable' });
    expect((await call('GET', '/me', buyer)).json().user).toMatchObject({ equippedTagSku: TAG, tag: { sku: TAG } });
    // a frame is not a tag, and the Kurdish tag is a main tag, not a word by the name
    expect((await call('PUT', '/me/cosmetics/tag', buyer, { sku: FRAME })).json()).toMatchObject({ code: 'WRONG_CATEGORY' });
    expect((await call('PUT', '/me/cosmetics/tag', buyer, { sku: 'tag_kurdish' })).json()).toMatchObject({ code: 'WRONG_CATEGORY' });
    // a tag taken back is not shown, though it stays chosen
    await pool.query(`DELETE FROM user_entitlements WHERE user_id = $1 AND sku = $2`, [buyer.id, TAG]);
    expect((await call('GET', `/users/${buyer.id}`, viewer)).json().tag).toBeNull();
    expect((await call('PUT', '/me/cosmetics/tag', buyer, { sku: null })).json()).toEqual({ tagSku: null });
  });
});
