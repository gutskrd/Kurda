/** Shop + event config with dual-admin approval via HTTP (CI job). KUR-103. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';

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
      payload: { email: `cfg_${tag}_${suffix}@it.kurda.app`, username: `cfg_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: ip,
    });
    const id = r.json().user.id;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [id]);
    return r.json().tokens.accessToken;
  }
  const call = (method: 'POST' | 'GET', url: string, token: string, payload?: Record<string, unknown>) =>
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
      payload: { sku, name: 'Premium Bundle', currency: 'gems', price: 5000 },
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

  it('lists pending changes and can reject one', async () => {
    const sku = `cfg_reject_${suffix}`; skus.push(sku);
    const p = await call('POST', '/admin/config/changes', adminTok, {
      target: 'shop_item', payload: { sku, name: 'Nope', currency: 'gems', price: 9999 },
    });
    const id = p.json().id;
    const pending = (await call('GET', '/admin/config/changes', admin2Tok)).json().pending as Array<{ id: string }>;
    expect(pending.some((c) => c.id === id)).toBe(true);

    const rej = await call('POST', `/admin/config/changes/${id}/reject`, admin2Tok, { reason: 'too pricey' });
    expect(rej.json().status).toBe('rejected');
    expect((await pool.query(`SELECT 1 FROM shop_items WHERE sku = $1`, [sku])).rowCount).toBe(0); // never applied
  });
});
