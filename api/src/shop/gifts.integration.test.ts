/** Gifting a shop item, against real Postgres: money, ownership, and consent. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { WalletService } from '../wallet/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('shop gifts (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  const SKU = `gift_${suffix}`;
  const PRICE = 300;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  async function register(tag: string, ip: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `gift_${tag}_${suffix}@it.kurda.app`,
        username: `gift_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    ids[tag] = res.json().user.id;
    tokens[tag] = res.json().tokens.accessToken;
  }

  const call = (method: 'GET' | 'POST', url: string, token: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
      remoteAddress: '10.88.4.4',
    });

  /** Top up through the wallet service — it owns how a balance is stored. */
  async function fund(userId: string, amount: number): Promise<void> {
    await wallet.credit({ userId, currency: 'zer', amount, reason: 'admin_adjustment' });
  }

  /** Make two accounts friends, since gifting requires it. */
  async function befriend(a: string, b: string): Promise<void> {
    const [lo, hi] = [a, b].sort();
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, responded_at)
       VALUES ($1, $2, 'accepted', now()) ON CONFLICT (user_lo, user_hi)
       DO UPDATE SET status = 'accepted', responded_at = now()`,
      [lo, hi],
    );
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);

    await register('giver', '10.88.0.1');
    await register('taker', '10.88.0.2');
    await register('stranger', '10.88.0.3');

    await pool.query(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock)
       VALUES ($1, 'Gift Test Item', 'background', 'zer', $2, true, true, true)`,
      [SKU, PRICE],
    );
    await fund(ids.giver!, 5000);
    await befriend(ids.giver!, ids.taker!);
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM shop_items WHERE sku = $1`, [SKU]);
    await pool.end();
    await app.close();
  });

  it('charges the sender and gives the item to the recipient', async () => {
    const before = await balanceOf(ids.giver!);
    const res = await call('POST', '/shop/gift', tokens.giver!, {
      sku: SKU,
      toUserId: ids.taker!,
      idempotencyKey: `gift-1-${suffix}`,
      expectedPrice: PRICE,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ gifted: true, duplicate: false });

    // the sender paid
    expect(await balanceOf(ids.giver!)).toBe(before - PRICE);
    // the recipient owns it, and did not pay
    const owned = await pool.query(`SELECT source FROM user_entitlements WHERE user_id = $1 AND sku = $2`, [
      ids.taker!,
      SKU,
    ]);
    expect(owned.rowCount).toBe(1);
    expect(owned.rows[0]!.source).toBe('gift');
  });

  it('tells the recipient, by name, what they were sent', async () => {
    const inbox = await pool.query<{ title: string; body: string; data: Record<string, unknown> }>(
      `SELECT title, body, data FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [ids.taker!],
    );
    const note = inbox.rows[0]!;
    expect(note.title).toBe('You have a gift');
    expect(note.body).toContain(`gift_giver_${suffix}`.slice(0, 30));
    expect(note.body).toContain('Gift Test Item');
    expect(note.data).toMatchObject({ kind: 'gift', sku: SKU });
  });

  it('lists the gift for the recipient with who sent it, and counts it unopened', async () => {
    const res = await call('GET', '/me/gifts', tokens.taker!);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.unseen).toBeGreaterThanOrEqual(1);
    const gift = body.gifts.find((g: { sku: string }) => g.sku === SKU);
    expect(gift.from.username).toContain('gift_giver');
    expect(gift.seenAt).toBeNull();

    // opening them clears the badge
    expect((await call('POST', '/me/gifts/seen', tokens.taker!)).json().seen).toBeGreaterThanOrEqual(1);
    expect((await call('GET', '/me/gifts', tokens.taker!)).json().unseen).toBe(0);
  });

  it('refuses a gift to someone who is not a friend', async () => {
    // an unsolicited gift is a way to put your name in front of a stranger
    const res = await call('POST', '/shop/gift', tokens.giver!, {
      sku: SKU,
      toUserId: ids.stranger!,
      idempotencyKey: `gift-stranger-${suffix}`,
      expectedPrice: PRICE,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('NOT_FRIENDS');
  });

  it('refuses to gift something they already own', async () => {
    const res = await call('POST', '/shop/gift', tokens.giver!, {
      sku: SKU,
      toUserId: ids.taker!,
      idempotencyKey: `gift-dup-${suffix}`,
      expectedPrice: PRICE,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('ALREADY_OWNED');
  });

  it('refuses to gift to yourself', async () => {
    const res = await call('POST', '/shop/gift', tokens.giver!, {
      sku: SKU,
      toUserId: ids.giver!,
      idempotencyKey: `gift-self-${suffix}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('GIFT_TO_SELF');
  });

  it('charges once when the same gift is retried', async () => {
    const sku2 = `${SKU}_b`;
    await pool.query(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock)
       VALUES ($1, 'Gift Test Item B', 'background', 'zer', $2, true, true, true)`,
      [sku2, PRICE],
    );
    const key = `gift-retry-${suffix}`;
    const before = await balanceOf(ids.giver!);

    const first = await call('POST', '/shop/gift', tokens.giver!, { sku: sku2, toUserId: ids.taker!, idempotencyKey: key });
    const again = await call('POST', '/shop/gift', tokens.giver!, { sku: sku2, toUserId: ids.taker!, idempotencyKey: key });

    expect(first.json().duplicate).toBe(false);
    expect(again.json().duplicate).toBe(true);
    // a dropped response must not cost twice
    expect(await balanceOf(ids.giver!)).toBe(before - PRICE);
    const gifts = await pool.query(`SELECT 1 FROM gifts WHERE to_user_id = $1 AND sku = $2`, [ids.taker!, sku2]);
    expect(gifts.rowCount).toBe(1);
    await pool.query(`DELETE FROM shop_items WHERE sku = $1`, [sku2]);
  });

  it('refuses a gift the sender cannot afford, and moves nothing', async () => {
    const sku3 = `${SKU}_c`;
    await pool.query(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock)
       VALUES ($1, 'Very Expensive', 'background', 'zer', 9999999, true, true, true)`,
      [sku3],
    );
    const res = await call('POST', '/shop/gift', tokens.giver!, {
      sku: sku3,
      toUserId: ids.taker!,
      idempotencyKey: `gift-broke-${suffix}`,
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    // the whole thing rolls back: no entitlement handed out for free
    const owned = await pool.query(`SELECT 1 FROM user_entitlements WHERE user_id = $1 AND sku = $2`, [
      ids.taker!,
      sku3,
    ]);
    expect(owned.rowCount).toBe(0);
    await pool.query(`DELETE FROM shop_items WHERE sku = $1`, [sku3]);
  });

  async function balanceOf(userId: string): Promise<number> {
    return (await wallet.balances(userId)).zer;
  }
});
