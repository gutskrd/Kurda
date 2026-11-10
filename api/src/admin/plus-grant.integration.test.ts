/**
 * Giving Hevalo+ from a person's page (POST /admin/users/:id/plus), against
 * real Postgres and through the console's own gate: a superadmin's alone, with
 * a reason, written to the person's history, once per request key — and what
 * the member then has (the service's own rules are in user-admin.integration).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('giving Hevalo+ from the console (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  const userIds: string[] = [];
  let owner = '';
  let moderator = '';
  let member = '';
  let memberId = '';

  async function register(name: string, ip: string, roles: string): Promise<{ token: string; id: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `${name}_${s}@it.kurda.app`, username: `${name}_${s}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token);
    return { token, id };
  }

  const give = (payload: Record<string, unknown>, token = owner, id = memberId) =>
    app.inject({ method: 'POST', url: `/admin/users/${id}/plus`, headers: { authorization: `Bearer ${token}` }, payload });
  const until = async (id = memberId): Promise<Date | null> =>
    (await pool.query<{ premium_until: Date | null }>(`SELECT premium_until FROM users WHERE id = $1`, [id])).rows[0]!.premium_until;
  const grants = async (id = memberId) =>
    (
      await pool.query<{ reason: string; meta: { days: number } }>(
        `SELECT reason, meta FROM admin_actions WHERE target_user_id = $1 AND action = 'plus_grant' ORDER BY created_at`,
        [id],
      )
    ).rows;
  const me = async () => (await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${member}` } })).json().user;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    owner = (await register('pgOwner', '10.96.0.1', '{superadmin}')).token;
    moderator = (await register('pgMod', '10.96.0.2', '{moderator}')).token;
    ({ token: member, id: memberId } = await register('pgMember', '10.96.0.3', '{}'));
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('is no one’s to give but a superadmin’s, and to anyone else the route is not there', async () => {
    const asModerator = await give({ days: 30, reason: 'for a friend' }, moderator);
    expect(asModerator.statusCode, asModerator.body).not.toBe(200);
    const asThemselves = await give({ days: 30, reason: 'for me' }, member);
    expect(asThemselves.statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/admin/users/${memberId}/plus`, payload: { days: 30, reason: 'x' } })).statusCode).toBe(401);
    expect(await until()).toBeNull();
    expect(await grants()).toEqual([]);
  });

  it('asks for a reason and for 1 to 366 whole days', async () => {
    expect((await give({ days: 30, reason: '   ' })).json()).toMatchObject({ code: 'REASON_REQUIRED' });
    for (const days of [0, -1, 2.5, 367]) expect((await give({ days, reason: 'typo' })).statusCode).toBe(400);
    expect((await give({ reason: 'no days' })).statusCode).toBe(400);
    expect(await until()).toBeNull();
  });

  it('gives it, says until when, keeps the reason in the person’s history, and makes them a member at once', async () => {
    expect(await me()).toMatchObject({ premium: false, streak: { maxFreezes: 1 } });
    const before = Date.now();
    const res = await give({ days: 30, reason: 'Reviewer for the store listing', idempotencyKey: `grant-one-${s}` });
    expect(res.statusCode, res.body).toBe(200);
    const end = new Date(res.json().premiumUntil as string).getTime();
    expect(end).toBeGreaterThanOrEqual(before + 30 * 86_400_000);
    expect(end).toBeLessThanOrEqual(Date.now() + 30 * 86_400_000);
    expect((await until())!.getTime()).toBe(end);
    expect(await grants()).toEqual([{ reason: 'Reviewer for the store listing', meta: expect.objectContaining({ days: 30, before: null }) }]);
    expect(await me()).toMatchObject({ premium: true, streak: { maxFreezes: 2 } });

    // the same request again (a double click, a retry): the days are added once
    const again = await give({ days: 30, reason: 'Reviewer for the store listing', idempotencyKey: `grant-one-${s}` });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ duplicate: true, premiumUntil: res.json().premiumUntil });
    expect((await until())!.getTime()).toBe(end);
    expect(await grants()).toHaveLength(1);

    // a new grant adds to the end they have
    const more = await give({ days: 7, reason: 'One more week', idempotencyKey: `grant-two-${s}` });
    expect(new Date(more.json().premiumUntil as string).getTime()).toBe(end + 7 * 86_400_000);
    expect(await grants()).toHaveLength(2);
  });

  it('answers 404 for a person who is not there', async () => {
    const res = await give({ days: 30, reason: 'nobody' }, owner, '00000000-0000-0000-0000-000000000000');
    expect(res.statusCode).toBe(404);
  });
});
