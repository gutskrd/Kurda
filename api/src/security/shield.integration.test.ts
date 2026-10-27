/**
 * The scanner shield against real Postgres and Redis: a probe for a PHP script
 * or a secrets file is "not found" at once and logged; a network that keeps
 * probing is shut out while signed out, and someone signed in on it is not.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { networkHashOf } from '../net/network-key.js';
import { SHIELD } from './shield.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('the scanner shield (integration)', { timeout: 30_000 }, () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  const s = Date.now().toString(36);
  let app: FastifyInstance;
  let pool: pg.Pool;
  let token = '';
  // a network of its own for each run, so an earlier run's block does not carry over
  const scanner = `10.209.${Number(BigInt(Date.now()) % 200n) + 1}.7`;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `shield_${s}@it.kurda.app`, username: `shield_${s}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: '10.209.250.1',
    });
    await activate(app, pool, res);
    token = res.json().tokens.accessToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [`shield_${s}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('answers a PHP probe "not found" at once, as any missing address, and logs it', async () => {
    const res = await app.inject({ method: 'GET', url: '/wp-login.php', remoteAddress: '10.209.251.9' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
    // the log is written after the answer goes out
    await vi.waitFor(async () => {
      const logged = await pool.query<{ details: { path: string } }>(
        `SELECT details FROM security_events WHERE kind = 'request.probe' AND network_hash = $1`,
        [networkHashOf('10.209.251.9')],
      );
      expect(logged.rows[0]?.details.path).toBe('/wp-login.php');
    });
    // and the CGI argument trick on an ordinary address
    const cgi = await app.inject({ method: 'GET', url: '/?-d+allow_url_include%3d1+-d+auto_prepend_file%3dphp://input', remoteAddress: '10.209.251.9' });
    expect(cgi.statusCode).toBe(404);
  });

  it('shuts a network that keeps probing out while signed out, and not someone signed in on it', async () => {
    const probe = (path: string) => app.inject({ method: 'GET', url: path, remoteAddress: scanner });
    expect((await app.inject({ method: 'GET', url: '/version', remoteAddress: scanner })).statusCode).toBe(200);
    for (let i = 0; i < SHIELD.probes; i++) await probe(i % 2 ? `/.env` : `/vendor/phpunit/x${i}.php`);
    const signedOut = await app.inject({ method: 'GET', url: '/version', remoteAddress: scanner });
    expect(signedOut.statusCode).toBe(403);
    expect(signedOut.json().code).toBe('NETWORK_BLOCKED');
    expect(Number(signedOut.headers['retry-after'])).toBeGreaterThan(0);
    const signedIn = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` }, remoteAddress: scanner });
    expect(signedIn.statusCode).toBe(200);
    // the health check is never blocked
    expect((await app.inject({ method: 'GET', url: '/health', remoteAddress: scanner })).statusCode).not.toBe(403);
    await vi.waitFor(async () => {
      const blocked = await pool.query(`SELECT severity FROM security_events WHERE kind = 'network.scanner_blocked' AND network_hash = $1`, [networkHashOf(scanner)]);
      expect(blocked.rows).toEqual([{ severity: 'warning' }]);
    });
  });

  it('leaves Hevalo’s own addresses alone', async () => {
    const from = '10.209.252.3';
    expect((await app.inject({ method: 'GET', url: '/version', remoteAddress: from })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/art/overrides', remoteAddress: from })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/no-such-route', remoteAddress: from })).statusCode).toBe(404);
    const probes = await pool.query(`SELECT 1 FROM security_events WHERE kind = 'request.probe' AND network_hash = $1`, [networkHashOf(from)]);
    expect(probes.rowCount).toBe(0);
  });
});
