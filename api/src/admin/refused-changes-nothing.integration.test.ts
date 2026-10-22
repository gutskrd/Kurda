/**
 * A refused request changes nothing. The admin guards sent their 403 and
 * returned without waiting for it; the app's onSend hooks are async, so the
 * reply was not finished yet and Fastify went on to run the handler too — a
 * moderator asking to change a balance was told 403, and the balance changed.
 * Each guard is tried here by someone it refuses, and the database is read
 * after the handler would have had time to run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** Long enough for a handler that ran after the refusal to have written. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 400));

describe.skipIf(!DATABASE_URL)('a refused admin request (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  const userIds: string[] = [];
  let moderator = '';
  let support = '';
  let target = '';

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
  const post = (method: 'POST' | 'PUT', url: string, token: string, payload: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as never });
  const actions = async (): Promise<number> =>
    (await pool.query<{ n: number }>(`SELECT count(*)::int n FROM admin_actions WHERE target_user_id = $1`, [target])).rows[0]!.n;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    moderator = (await register('rcMod', '10.93.0.1', '{moderator}')).token;
    support = (await register('rcSup', '10.93.0.2', '{support}')).token;
    target = (await register('rcTarget', '10.93.0.3', '{}')).id;
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

  it('by a role guard: a moderator is told no, and no money is made', async () => {
    const res = await post('POST', `/admin/users/${target}/wallet`, moderator, { reason: 'try', currency: 'zer', amount: 777 });
    expect(res.statusCode).toBe(403);
    await settle();
    const credited = await pool.query(`SELECT 1 FROM wallet_ledger WHERE user_id = $1 AND amount = 777`, [target]);
    expect(credited.rowCount).toBe(0);
    expect(await actions()).toBe(0);
  });

  it('by a role guard: a moderator is told no, and no one is given a role', async () => {
    const res = await post('PUT', `/admin/users/${target}/content-editor`, moderator, { on: true, reason: 'try' });
    expect(res.statusCode).toBe(403);
    await settle();
    expect((await pool.query<{ roles: string[] }>(`SELECT roles FROM users WHERE id = $1`, [target])).rows[0]!.roles).toEqual([]);
    expect(await actions()).toBe(0);
  });

  it('by a capability guard: support staff are told no, and no one is warned', async () => {
    const res = await post('POST', `/admin/users/${target}/warn`, support, { reason: 'try' });
    expect(res.statusCode).toBe(403);
    await settle();
    expect(await actions()).toBe(0);
  });
});
