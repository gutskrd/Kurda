/** Private rooms against real Postgres (CI job). KUR-056. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('private rooms (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const emails: string[] = [];
  const suffix = Date.now().toString(36);

  async function makeUser(tag: string): Promise<{ id: string; token: string }> {
    const email = `room_${suffix}_${tag}@it.kurda.app`;
    emails.push(email);
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: `room_${suffix}_${tag}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: `10.23.0.${(emails.length % 250) + 1}`,
    });
    return { id: reg.json().user.id, token: reg.json().tokens.accessToken };
  }

  const as = (token: string, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.23.9.1' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    if (emails.length) await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
    await pool.end();
    await app.close();
  });

  it('host creates a room and gets a 6-char code; a player joins by it', async () => {
    const host = await makeUser('host');
    const guest = await makeUser('guest');

    const created = await as(host.token, 'POST', '/rooms', { mode: 'ffa', category: 'vocabulary', level: 1 });
    expect(created.statusCode).toBe(200);
    const code = created.json().code as string;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(created.json().players).toHaveLength(1); // host

    const joined = await as(guest.token, 'POST', `/rooms/${code}/join`);
    expect(joined.statusCode).toBe(200);
    expect(joined.json().players.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([host.id, guest.id]));

    // joining again is idempotent
    expect((await as(guest.token, 'POST', `/rooms/${code}/join`)).json().players).toHaveLength(2);
  });

  it('only the host can start; starting launches the game', async () => {
    const host = await makeUser('h2');
    const guest = await makeUser('g2');
    const code = (await as(host.token, 'POST', '/rooms', {})).json().code as string;
    await as(guest.token, 'POST', `/rooms/${code}/join`);

    const byGuest = await as(guest.token, 'POST', `/rooms/${code}/start`);
    expect(byGuest.statusCode).toBe(403);

    const started = await as(host.token, 'POST', `/rooms/${code}/start`);
    expect(started.statusCode).toBe(200);
    expect(started.json().roomId).toMatch(/^match:/);

    // once started, joining is refused and the room reports started
    expect((await as(guest.token, 'POST', `/rooms/${code}/join`)).statusCode).toBe(409);
    expect((await as(host.token, 'GET', `/rooms/${code}`)).json().started).toBe(true);
  });

  it('rejects an unknown or malformed code', async () => {
    const u = await makeUser('u3');
    expect((await as(u.token, 'GET', '/rooms/ZZZZZZ')).statusCode).toBe(404);
    expect((await as(u.token, 'GET', '/rooms/bad!')).statusCode).toBe(400);
  });
});
