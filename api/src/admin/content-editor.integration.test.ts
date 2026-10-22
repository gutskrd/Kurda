/**
 * Giving someone the content editor role from their page, against real
 * Postgres: a superadmin's alone, with a reason, written to the person's
 * history; only to an account that confirmed its address; and opening the
 * lessons' audio studio to them at once, and closing it at once when taken
 * away.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('the content editor role (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  const userIds: string[] = [];
  let owner = '';
  let moderator = '';
  let voice = '';
  let voiceId = '';
  let unverifiedId = '';

  async function register(name: string, ip: string, roles: string, verify = true): Promise<{ token: string; id: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `${name}_${s}@it.kurda.app`, username: `${name}_${s}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip,
    });
    if (verify) await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token);
    return { token, id };
  }

  const set = (id: string, on: boolean, token = owner, reason = 'Records Azad’s part') =>
    app.inject({ method: 'PUT', url: `/admin/users/${id}/content-editor`, headers: { authorization: `Bearer ${token}` }, payload: { on, reason } });
  const studio = (token: string) => app.inject({ method: 'GET', url: '/admin/lesson-audio', headers: { authorization: `Bearer ${token}` } });
  const rolesOf = async (id: string): Promise<string[]> => (await pool.query<{ roles: string[] }>(`SELECT roles FROM users WHERE id = $1`, [id])).rows[0]!.roles;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    owner = (await register('ceOwner', '10.95.0.1', '{superadmin}')).token;
    moderator = (await register('ceMod', '10.95.0.2', '{moderator}')).token;
    ({ token: voice, id: voiceId } = await register('ceVoice', '10.95.0.3', '{}'));
    unverifiedId = (await register('ceNew', '10.95.0.4', '{}', false)).id;
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

  it('is given by a superadmin, with a reason kept in the person’s history, and opens the studio to them', async () => {
    expect((await studio(voice)).statusCode).toBe(404);
    const res = await set(voiceId, true);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().roles).toContain('content_editor');
    expect(await rolesOf(voiceId)).toEqual(['content_editor']);
    const history = await pool.query<{ action: string; reason: string; meta: { role: string } }>(
      `SELECT action, reason, meta FROM admin_actions WHERE target_user_id = $1 ORDER BY created_at`,
      [voiceId],
    );
    expect(history.rows).toEqual([{ action: 'role_grant', reason: 'Records Azad’s part', meta: expect.objectContaining({ role: 'content_editor' }) }]);
    // staff now: their own sign-in code first, then the studio
    await pass2fa(app, voice);
    expect((await studio(voice)).statusCode).toBe(200);
    // asked again, nothing changes and nothing more is written
    expect((await set(voiceId, true)).statusCode).toBe(200);
    expect((await pool.query(`SELECT 1 FROM admin_actions WHERE target_user_id = $1`, [voiceId])).rowCount).toBe(1);
  });

  it('is taken away at once', async () => {
    const res = await set(voiceId, false, owner, 'Finished the recordings');
    expect(res.statusCode, res.body).toBe(200);
    expect(await rolesOf(voiceId)).toEqual([]);
    expect((await studio(voice)).statusCode).toBe(404);
  });

  it('is given only to an account that confirmed its address, and asks why', async () => {
    const res = await set(unverifiedId, true);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('EMAIL_UNVERIFIED');
    expect(await rolesOf(unverifiedId)).toEqual([]);
    expect((await set(voiceId, true, owner, '   ')).statusCode).toBe(400);
  });

  it('is no one’s to give but a superadmin’s', async () => {
    const asModerator = await set(voiceId, true, moderator);
    expect(asModerator.statusCode, asModerator.body).not.toBe(200);
    expect(await rolesOf(voiceId)).toEqual([]);
    const asThemselves = await set(voiceId, true, voice);
    expect(asThemselves.statusCode, asThemselves.body).not.toBe(200);
    expect(await rolesOf(voiceId)).toEqual([]);
  });
});
