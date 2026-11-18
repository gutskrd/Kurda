/**
 * The game ranks routes older phone builds still call, over HTTP: each answers its empty shape, and the staff routes of
 * ranks and seasons are gone.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { deleteUsers } from '../test/ranks.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('game ranks routes for older builds (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let user: { id: string; token: string };

  const call = (method: 'GET' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${user.token}` }, remoteAddress: '10.72.200.1' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rk_${suffix}@it.kurda.app`,
        username: `rk_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.72.1.1',
    });
    await activate(app, pool, res);
    user = { id: res.json().user.id, token: res.json().tokens.accessToken };
  });

  afterAll(async () => {
    await deleteUsers(pool, [user.id]);
    await pool.end();
    await app.close();
  });

  it('answers no ranks, the calendar season, and friendly preferences', async () => {
    const me = await call('GET', '/ranks/me');
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ ranks: [], cooldownUntil: null, season: { id: expect.stringMatching(/^\d{4}-Q[1-4]$/) } });
    expect(me.json().season.daysLeft).toBeGreaterThanOrEqual(0);

    const prefs = (await call('GET', '/ranks/preferences')).json() as { preferences: Record<string, boolean> };
    expect(prefs.preferences['wordle-battle']).toBe(false);
    expect(Object.values(prefs.preferences).every((rated) => rated === false)).toBe(true);
  });

  it('says a finished game did not count, and the season has no rewards or emblems', async () => {
    const ref = (await pool.query<{ id: string }>(`SELECT gen_random_uuid() AS id`)).rows[0]!.id;
    expect((await call('GET', `/ranks/results/rhyme-match/${ref}`)).json()).toEqual({
      game: 'rhyme-match',
      gameRef: ref,
      counted: false,
      friendlyReason: 'chosen',
    });
    expect((await call('GET', '/ranks/seasons/current')).json()).toMatchObject({ rewards: [], minGames: 10, lastSeason: null });
    expect((await call('GET', '/ranks/seasons/me')).json()).toEqual({ emblems: [] });
  });

  it('needs an account, and has no ranks or seasons tools left for staff', async () => {
    expect((await app.inject({ method: 'GET', url: '/ranks/me', remoteAddress: '10.72.200.2' })).statusCode).toBe(401);
    expect((await call('GET', '/admin/seasons')).statusCode).toBe(404);
    expect((await call('GET', '/ranks/boards/stories')).statusCode).toBe(404);
  });
});
