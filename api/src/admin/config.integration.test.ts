/** Shop and event config with dual-admin approval, over HTTP. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('admin config approval (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];
  const skus: string[] = [];
  let adminTok: string, admin2Tok: string;

  async function admin(tag: string, ip: string): Promise<string> {
    const r = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: `cfg_${tag}_${suffix}@it.kurda.app`, username: `cfg_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip,
    });
    await activate(app, pool, r);
    const id = r.json().user.id;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [id]);
    return r.json().tokens.accessToken;
  }
  const call = (method: 'POST' | 'GET' | 'PUT', url: string, token: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.80.0.9' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    adminTok = await admin('a1', '10.80.0.1');
    admin2Tok = await admin('a2', '10.80.0.2');
    // /admin is gated on 2FA, so a role alone no longer reaches it
    await pass2fa(app, adminTok);
    await pass2fa(app, admin2Tok);
  });
  afterAll(async () => {
    if (skus.length) await pool.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [skus]);
    await pool.query(`DELETE FROM events WHERE key LIKE $1`, [`cfg_${suffix}%`]);
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('applies a low-impact shop change immediately', async () => {
    const sku = `cfg_cheap_${suffix}`; skus.push(sku);
    const res = await call('POST', '/admin/config/changes', adminTok, {
      target: 'shop_item',
      payload: { sku, name: 'Cheap Sticker', currency: 'zer', price: 50 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('applied');
    const row = await pool.query(`SELECT price FROM shop_items WHERE sku = $1`, [sku]);
    expect(row.rows[0]!.price).toBe(50);
  });

  it('queues a large-price change for a second admin; self-approve is blocked', async () => {
    const sku = `cfg_pricey_${suffix}`; skus.push(sku);
    const proposed = await call('POST', '/admin/config/changes', adminTok, {
      target: 'shop_item',
      payload: { sku, name: 'Premium Bundle', currency: 'zer', price: 5000 },
    });
    expect(proposed.statusCode).toBe(202);
    expect(proposed.json().status).toBe('pending');
    const id = proposed.json().id;

    // not applied yet
    expect((await pool.query(`SELECT 1 FROM shop_items WHERE sku = $1`, [sku])).rowCount).toBe(0);
    // the proposer cannot approve their own change
    expect((await call('POST', `/admin/config/changes/${id}/approve`, adminTok)).statusCode).toBe(403);

    // a different admin approves → applied
    const approved = await call('POST', `/admin/config/changes/${id}/approve`, admin2Tok);
    expect(approved.statusCode).toBe(200);
    expect((await pool.query(`SELECT price FROM shop_items WHERE sku = $1`, [sku])).rows[0]!.price).toBe(5000);
    // re-approving is a no-op
    expect((await call('POST', `/admin/config/changes/${id}/approve`, admin2Tok)).statusCode).toBe(409);
  });

  it('rejects an event scheduled in the past; queues a rewarding event for approval', async () => {
    const past = await call('POST', '/admin/config/changes', adminTok, {
      target: 'event',
      payload: { key: `cfg_${suffix}_past`, name: 'Old', type: 'seasonal', startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-02T00:00:00Z' },
    });
    expect(past.statusCode).toBe(422);
    expect(past.json().code).toBe('PAST_SCHEDULE');

    // a future event that grants rewards is sensitive → pending
    const start = new Date(Date.now() + 86_400_000).toISOString();
    const end = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const ev = await call('POST', '/admin/config/changes', adminTok, {
      target: 'event',
      payload: { key: `cfg_${suffix}_newroz`, name: 'Newroz', type: 'seasonal', startsAt: start, endsAt: end, rewards: { zer: 100 } },
    });
    expect(ev.statusCode).toBe(202);
    const id = ev.json().id;
    expect((await call('POST', `/admin/config/changes/${id}/approve`, admin2Tok)).statusCode).toBe(200);
    expect((await pool.query(`SELECT 1 FROM events WHERE key = $1`, [`cfg_${suffix}_newroz`])).rowCount).toBe(1);
  });

  it('changes only what a shop proposal names, keeping the rest of the item', async () => {
    const sku = `cfg_keep_${suffix}`; skus.push(sku);
    await pool.query(
      `INSERT INTO shop_items (sku, name, description, category, currency, price, asset_key, premium_only, display_order,
                               available_from, available_to)
       VALUES ($1, 'Kept', 'A picture', 'background', 'zer', 300, 'cosmetics/bg/keep.webp', true, 7,
               '2030-01-01T00:00:00Z', '2030-02-01T00:00:00Z')`,
      [sku],
    );
    const res = await call('POST', '/admin/config/changes', adminTok, {
      target: 'shop_item',
      payload: { sku, name: 'Kept', currency: 'zer', price: 250 },
    });
    expect(res.json().status).toBe('applied');
    const row = (await pool.query(`SELECT * FROM shop_items WHERE sku = $1`, [sku])).rows[0]!;
    expect(row).toMatchObject({
      price: 250,
      description: 'A picture',
      category: 'background',
      asset_key: 'cosmetics/bg/keep.webp',
      premium_only: true,
      display_order: 7,
    });
    expect((row.available_from as Date).toISOString()).toBe('2030-01-01T00:00:00.000Z');
    expect((row.available_to as Date).toISOString()).toBe('2030-02-01T00:00:00.000Z');

    // a field the proposal does name is changed, cleared windows included
    await call('POST', '/admin/config/changes', adminTok, {
      target: 'shop_item',
      payload: { sku, name: 'Kept', currency: 'zer', price: 250, premiumOnly: false, availableTo: null },
    });
    const after = (await pool.query(`SELECT premium_only, available_to, asset_key FROM shop_items WHERE sku = $1`, [sku])).rows[0]!;
    expect(after).toMatchObject({ premium_only: false, available_to: null, asset_key: 'cosmetics/bg/keep.webp' });
  });

  it('saves the Kurdish tag, a shop item of the tag category, through the catalogue route', async () => {
    const sku = `cfg_tag_${suffix}`; skus.push(sku);
    const res = await app.inject({
      method: 'POST',
      url: '/shop/items',
      headers: { authorization: `Bearer ${adminTok}` },
      payload: { sku, name: 'A tag', category: 'tag', currency: 'zer', price: 250 },
      remoteAddress: '10.80.0.9',
    });
    expect(res.statusCode).toBe(200);
    expect((await pool.query(`SELECT category FROM shop_items WHERE sku = $1`, [sku])).rows[0]!.category).toBe('tag');
  });

  it('will not set a price that needs a second admin through the catalogue route', async () => {
    const sku = `cfg_door_${suffix}`; skus.push(sku);
    const post = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/shop/items', headers: { authorization: `Bearer ${adminTok}` }, payload, remoteAddress: '10.80.0.9' });

    // a new item at 500 or more, and a cheap item raised to it, are both refused
    const fresh = await post({ sku, name: 'Dear', currency: 'zer', price: 500 });
    expect(fresh.statusCode).toBe(409);
    expect(fresh.json().code).toBe('PRICE_NEEDS_APPROVAL');
    expect((await pool.query(`SELECT 1 FROM shop_items WHERE sku = $1`, [sku])).rowCount).toBe(0);
    expect((await post({ sku, name: 'Dear', currency: 'zer', price: 499 })).statusCode).toBe(200);
    expect((await post({ sku, name: 'Dear', currency: 'zer', price: 750 })).statusCode).toBe(409);
    expect((await pool.query(`SELECT price FROM shop_items WHERE sku = $1`, [sku])).rows[0]!.price).toBe(499);

    // once a second admin has approved the price, the rest of the item is still edited here
    const proposed = await call('POST', '/admin/config/changes', adminTok, { target: 'shop_item', payload: { sku, name: 'Dear', currency: 'zer', price: 750 } });
    expect((await call('POST', `/admin/config/changes/${proposed.json().id}/approve`, admin2Tok)).statusCode).toBe(200);
    const renamed = await post({ sku, name: 'Dearer', currency: 'zer', price: 750 });
    expect(renamed.statusCode).toBe(200);
    // a price is only ever in Zêr
    expect((await post({ sku, name: 'Dearer', currency: 'gems', price: 750 })).statusCode).toBe(400);
    expect((await pool.query(`SELECT name, price, currency FROM shop_items WHERE sku = $1`, [sku])).rows[0]).toEqual({ name: 'Dearer', price: 750, currency: 'zer' });
  });

  describe('earn rules', () => {
    const key = `cfg_rule_${suffix}`;
    const rule = async () =>
      (await pool.query<{ amount: number; daily_cap: number | null; cooldown_seconds: number; active: boolean }>(`SELECT amount, daily_cap, cooldown_seconds, active FROM earn_rules WHERE key = $1`, [key]))
        .rows[0];
    const put = (token: string, body: Record<string, unknown>) => call('PUT', `/admin/earn-rules/${key}`, token, body);
    afterAll(async () => {
      await pool.query(`DELETE FROM earn_rules WHERE key = $1`, [key]);
    });

    it('send anything that pays more to Approvals, where a second admin signs off, and change at once what pays less', async () => {
      await pool.query(`INSERT INTO earn_rules (key, amount, daily_cap, cooldown_seconds, active) VALUES ($1, 25, 50, 60, true)`, [key]);
      // more each time, a higher cap or none, a shorter wait, or switching it on: each waits for a second admin
      for (const raise of [
        { amount: 40, dailyCap: 50, cooldownSeconds: 60, active: true },
        { amount: 25, dailyCap: 80, cooldownSeconds: 60, active: true },
        { amount: 25, dailyCap: null, cooldownSeconds: 60, active: true },
        { amount: 25, dailyCap: 50, cooldownSeconds: 0, active: true },
      ]) {
        const res = await put(adminTok, raise);
        expect(res.statusCode, JSON.stringify(raise)).toBe(202);
        expect(res.json()).toMatchObject({ status: 'pending' });
        expect(await rule()).toEqual({ amount: 25, daily_cap: 50, cooldown_seconds: 60, active: true });
      }
      const pending = (await call('GET', '/admin/config/changes', admin2Tok)).json().pending as Array<{ id: string; target: string; payload: { key: string; amount: number } }>;
      const raised = pending.find((c) => c.target === 'earn_rule' && c.payload.key === key && c.payload.amount === 40)!;
      expect(raised).toBeTruthy();
      expect((await call('POST', `/admin/config/changes/${raised.id}/approve`, adminTok)).statusCode).toBe(403);
      expect((await call('POST', `/admin/config/changes/${raised.id}/approve`, admin2Tok)).statusCode).toBe(200);
      expect(await rule()).toEqual({ amount: 40, daily_cap: 50, cooldown_seconds: 60, active: true });

      // less each time, a lower cap, a longer wait or switching it off apply at once, and are on the audit trail
      expect((await put(adminTok, { amount: 30, dailyCap: 40, cooldownSeconds: 120, active: true })).json()).toMatchObject({ ok: true });
      expect(await rule()).toEqual({ amount: 30, daily_cap: 40, cooldown_seconds: 120, active: true });
      expect((await put(adminTok, { amount: 30, dailyCap: 40, cooldownSeconds: 120, active: false })).statusCode).toBe(200);
      expect(await rule()).toMatchObject({ active: false });
      // switched off, switching it on again pays more than nothing, so it waits too
      expect((await put(adminTok, { amount: 30, dailyCap: 40, cooldownSeconds: 120, active: true })).statusCode).toBe(202);
      expect(await rule()).toMatchObject({ active: false });
      const audited = await pool.query(`SELECT 1 FROM admin_audit_log WHERE action LIKE 'PUT /admin/earn-rules%' AND target_id = $1`, [key]);
      expect(audited.rowCount).toBeGreaterThanOrEqual(2);
    });

    it('sends a new rule that pays to Approvals as well', async () => {
      const fresh = `cfg_rule_new_${suffix}`;
      const res = await call('PUT', `/admin/earn-rules/${fresh}`, adminTok, { amount: 10, dailyCap: null, cooldownSeconds: 0, active: true });
      expect(res.statusCode).toBe(202);
      expect((await pool.query(`SELECT 1 FROM earn_rules WHERE key = $1`, [fresh])).rowCount).toBe(0);
    });
  });

  it('lists pending changes and can reject one', async () => {
    const sku = `cfg_reject_${suffix}`; skus.push(sku);
    const p = await call('POST', '/admin/config/changes', adminTok, {
      target: 'shop_item', payload: { sku, name: 'Nope', currency: 'zer', price: 9999 },
    });
    const id = p.json().id;
    const pending = (await call('GET', '/admin/config/changes', admin2Tok)).json().pending as Array<{ id: string }>;
    expect(pending.some((c) => c.id === id)).toBe(true);

    const rej = await call('POST', `/admin/config/changes/${id}/reject`, admin2Tok, { reason: 'too pricey' });
    expect(rej.json().status).toBe('rejected');
    expect((await pool.query(`SELECT 1 FROM shop_items WHERE sku = $1`, [sku])).rowCount).toBe(0); // never applied
  });
});
