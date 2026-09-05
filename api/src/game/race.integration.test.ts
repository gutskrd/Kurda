/** Typing race against real Postgres: admin curation, and server-side scoring. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('typing race (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let adminToken = '';
  let playerToken = '';
  let playerId = '';
  const TEXT = 'Ez ji welatê xwe hez dikim û her roj hînî tiştekî nû dibim.';

  async function register(name: string, ip: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
      remoteAddress: '10.77.5.5',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const admin = await register('raceAdmin', '10.77.0.1');
    adminToken = admin.token;
    const player = await register('racePlayer', '10.77.0.2');
    playerToken = player.token;
    playerId = player.id;
    await pool.query(`UPDATE users SET roles = '{admin,superadmin}' WHERE id = $1`, [admin.id]);
    // every /admin route is behind 2FA now
    await pass2fa(app, adminToken);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM race_texts WHERE title LIKE $1`, [`it_${suffix}%`]);
    // deleting a user cascades into xp_ledger, which a trigger keeps append-only;
    // the ledger_admin flag is the sanctioned way through it
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('says so plainly when an admin has not added any texts', async () => {
    // whatever else exists, a difficulty nobody has curated is empty
    await pool.query(`UPDATE race_texts SET active = false WHERE difficulty = 3`);
    const res = await call('POST', '/race', playerToken, { difficulty: 3 });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('EMPTY_RACE_POOL');
  });

  it('an admin adds a text and a racer gets it', async () => {
    const created = await call('POST', '/admin/race/texts', adminToken, {
      title: `it_${suffix} welat`,
      body: TEXT,
      difficulty: 3,
    });
    expect(created.statusCode).toBe(201);

    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    expect(race.statusCode).toBe(200);
    expect(race.json().text.body).toBe(TEXT);
    expect(race.json().id).toBeTruthy();
  });

  it('scores from the server clock, so a racer cannot claim their own time', async () => {
    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    const id = race.json().id as string;

    // a perfect run, submitted immediately: the elapsed time is whatever the
    // server measured, and nothing in the request could change it
    const done = await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT });
    expect(done.statusCode).toBe(200);
    const result = done.json();
    expect(result.accuracy).toBe(1);
    expect(result.perfect).toBe(true);
    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(Number.isFinite(result.wpm)).toBe(true);
    expect(result.xpAwarded).toBeGreaterThan(0);
  });

  it('refuses to finish the same race twice', async () => {
    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    const id = race.json().id as string;
    expect((await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT })).statusCode).toBe(200);

    // otherwise a racer could keep submitting until they liked the number, and
    // keep being paid for it
    const again = await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('ALREADY_FINISHED');
  });

  it('will not let one racer finish another racer race', async () => {
    const other = await register('raceThief', '10.77.0.3');
    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    const id = race.json().id as string;
    const res = await call('POST', `/race/${id}/finish`, other.token, { typed: TEXT });
    expect(res.statusCode).toBe(404);
  });

  it('pays XP once, however many times a finish is retried', async () => {
    const before = await pool.query<{ n: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text n FROM xp_ledger WHERE user_id = $1 AND source = 'race'`,
      [playerId],
    );
    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    const id = race.json().id as string;
    await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT });
    await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT }); // rejected
    const after = await pool.query<{ n: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text n FROM xp_ledger WHERE user_id = $1 AND source = 'race'`,
      [playerId],
    );
    const paid = Number(after.rows[0]!.n) - Number(before.rows[0]!.n);
    expect(paid).toBeGreaterThan(0);
    // one race, one payment — (source, ref_id) is unique
    const rows = await pool.query(`SELECT 1 FROM xp_ledger WHERE source = 'race' AND ref_id = $1`, [id]);
    expect(rows.rowCount).toBe(1);
  });

  it('lists a racer best runs', async () => {
    const res = await call('GET', '/race/best', playerToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().races.length).toBeGreaterThan(0);
    expect(res.json().races[0]).toHaveProperty('wpm');
  });

  it('refuses a text too short to be a race', async () => {
    const res = await call('POST', '/admin/race/texts', adminToken, {
      title: `it_${suffix} tiny`,
      body: 'kurt',
      difficulty: 1,
    });
    expect(res.statusCode).toBe(400);
  });

  it('keeps race curation to admins', async () => {
    const res = await call('GET', '/admin/race/texts', playerToken);
    expect(res.statusCode).toBe(403);
  });
});
