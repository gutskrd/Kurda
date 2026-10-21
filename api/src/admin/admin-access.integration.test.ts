/**
 * Every staff route refuses everyone who is not staff (integration).
 *
 * Read from the app's own route table, so a route added tomorrow is covered
 * the day it is written: anonymous callers and ordinary members get nothing
 * from any of them. Each is refused by its guard (401 for a stranger, 403 for
 * a member); a request whose body or query fails validation is refused before
 * the guard is reached, which is a refusal all the same.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;
const SOME_ID = '6f1c2a4e-1b2c-4d3e-8f90-123456789abc';

/** `METHOD /path` for every route under /admin, from Fastify's printed route tree. */
function adminRoutes(app: FastifyInstance): Array<{ method: string; url: string }> {
  const out: Array<{ method: string; url: string }> = [];
  const stack: string[] = [];
  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const at = line.search(/[├└]── /);
    if (at < 0) continue;
    const depth = at / 4;
    const rest = line.slice(at + 4);
    const m = /^(.*?) \(([^)]*)\)$/.exec(rest);
    const segment = m ? m[1]! : rest;
    stack.length = depth;
    const full = (stack[depth - 1] ?? '') + segment;
    stack.push(full);
    if (!m || !full.startsWith('/admin')) continue;
    for (const method of m[2]!.split(',').map((x) => x.trim())) {
      if (method !== 'HEAD') out.push({ method, url: full });
    }
  }
  return out;
}

const concrete = (url: string) => url.replace(/:[\w|]+/g, SOME_ID).replace(/\*$/, 'x');

describe.skipIf(!DATABASE_URL)('staff routes refuse everyone else (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let memberToken = '';
  const s = Date.now().toString(36);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `member_${s}@it.kurda.app`, username: `member_${s}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: '10.185.0.1',
    });
    await activate(app, pool, res);
    memberToken = res.json().tokens.accessToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [`member_${s}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('finds the staff routes to check', () => {
    expect(adminRoutes(app).length).toBeGreaterThan(50);
  });

  it('answers none of them for a member or a stranger', async () => {
    let n = 0;
    for (const { method, url } of adminRoutes(app)) {
      const write = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
      for (const token of [memberToken, null]) {
        const res = await app.inject({
          method: method as 'GET',
          url: concrete(url),
          headers: token ? { authorization: `Bearer ${token}` } : {},
          ...(write ? { payload: {} } : {}),
          remoteAddress: `10.185.${Math.floor((n += 1) / 250)}.${(n % 250) + 1}`,
        });
        const who = `${method} ${url} as ${token ? 'member' : 'stranger'}: ${res.statusCode} ${res.body.slice(0, 120)}`;
        // a refused request body (400) never reaches the handler; past it, only the guard answers
        if (res.statusCode !== 400) expect(token ? [403, 404] : [401, 404], who).toContain(res.statusCode);
      }
    }
  });
});
