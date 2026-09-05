/** User tags & badges via HTTP (CI integration job). KUR-286. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('tags (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];
  let userTok: string, userId: string, adminTok: string, adminId: string, founderTok: string, founderId: string;

  async function register(tag: string, ip: string): Promise<{ token: string; id: string }> {
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: `tag_${tag}_${suffix}@it.kurda.app`, username: `tag_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: ip,
    });
    userIds.push(res.json().user.id);
    return { token: res.json().tokens.accessToken, id: res.json().user.id };
  }
  const call = (method: 'POST' | 'GET' | 'DELETE', url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.70.0.9' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    ({ token: userTok, id: userId } = await register('user', '10.70.0.1'));
    ({ token: adminTok, id: adminId } = await register('admin', '10.70.0.2'));
    ({ token: founderTok, id: founderId } = await register('founder', '10.70.0.3'));
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [adminId]);
    await pool.query(`UPDATE users SET roles = '{founder}' WHERE id = $1`, [founderId]);
    // /admin/tags is under /admin, so both curators must clear 2FA
    await pass2fa(app, adminTok);
    await pass2fa(app, founderTok);
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('resolves the main tag by precedence Founder > Admin > Kurdish > none', async () => {
    expect((await call('GET', `/users/${userId}/tags`)).json().main).toBeNull();
    expect((await call('GET', `/users/${adminId}/tags`)).json().main.key).toBe('admin');
    expect((await call('GET', `/users/${founderId}/tags`)).json().main.key).toBe('founder');

    // grant the Kurdish entitlement (a shop purchase) → normal user shows Kurdish
    await pool.query(`INSERT INTO user_entitlements (user_id, sku) VALUES ($1, 'tag_kurdish')`, [userId]);
    expect((await call('GET', `/users/${userId}/tags`)).json().main.key).toBe('kurdish');

    // admin who also bought Kurdish still shows Admin (precedence); Kurdish retained
    await pool.query(`INSERT INTO user_entitlements (user_id, sku) VALUES ($1, 'tag_kurdish')`, [adminId]);
    expect((await call('GET', `/users/${adminId}/tags`)).json().main.key).toBe('admin');

    // refund/clawback removes the entitlement → tag drops
    await pool.query(`DELETE FROM user_entitlements WHERE user_id = $1`, [userId]);
    expect((await call('GET', `/users/${userId}/tags`)).json().main).toBeNull();
  });

  it('auto-grants year-joined + level from account data', async () => {
    await pool.query(`UPDATE users SET xp = 500 WHERE id = $1`, [userId]);
    const claimable = (await call('GET', '/me/tags', userTok)).json().claimable as Array<{ key: string; value: string; auto: boolean }>;
    const year = claimable.find((t) => t.key === 'year_joined')!;
    const level = claimable.find((t) => t.key === 'level')!;
    expect(year.auto).toBe(true);
    expect(Number(year.value)).toBeGreaterThanOrEqual(2026);
    expect(level.value).toBe('3'); // levelForXp(500)
  });

  it('self-claims a sensitive tag only with consent; user controls display + can revoke', async () => {
    // sensitive tag needs explicit consent (#109)
    expect((await call('POST', '/me/tags/claim', userTok, { key: 'age', value: '18-24' })).statusCode).toBe(422);
    expect((await call('POST', '/me/tags/claim', userTok, { key: 'age', value: '18-24', consent: true })).statusCode).toBe(200);

    let shown = (await call('GET', '/me/tags', userTok)).json().claimable.map((t: { key: string }) => t.key);
    expect(shown).toContain('age');

    // hide it
    await call('POST', '/me/tags/display', userTok, { key: 'age', displayed: false });
    shown = (await call('GET', '/me/tags', userTok)).json().claimable.map((t: { key: string }) => t.key);
    expect(shown).not.toContain('age');

    // the owner-manage endpoint still lists it (hidden) so it can be re-enabled (#287)
    const managed = (await call('GET', '/me/tags/claimed', userTok)).json().tags as Array<{ key: string; displayed: boolean }>;
    const ageRow = managed.find((t) => t.key === 'age');
    expect(ageRow?.displayed).toBe(false);

    // revoke removes the data entirely
    expect((await call('DELETE', '/me/tags/age', userTok)).statusCode).toBe(200);
    const rows = await pool.query(`SELECT 1 FROM user_tags ut JOIN tags t ON t.id = ut.tag_id WHERE ut.user_id = $1 AND t.key = 'age'`, [userId]);
    expect(rows.rowCount).toBe(0);
  });

  it('lets admins/founder create a tag but blocks normal users', async () => {
    const poet = `poet_${suffix}`;
    const body = { key: poet, label: 'Poet', kind: 'claimable' as const, category: 'custom', acquisition: 'self_claim' as const };
    expect((await call('POST', '/admin/tags', userTok, body)).statusCode).toBe(403);

    const created = await call('POST', '/admin/tags', founderTok, body);
    expect(created.statusCode).toBe(201);
    expect(created.json().key).toBe(poet);

    // now claimable by a user
    expect((await call('POST', '/me/tags/claim', userTok, { key: poet })).statusCode).toBe(200);

    // deactivate hides it
    expect((await call('DELETE', `/admin/tags/${poet}`, adminTok)).statusCode).toBe(200);
    const catalog = (await call('GET', '/tags', userTok)).json().tags.map((t: { key: string }) => t.key);
    expect(catalog).not.toContain(poet);

    await pool.query(`DELETE FROM tags WHERE key = $1`, [poet]);
  });
});
