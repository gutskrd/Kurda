/** Signed-upload route auth/validation (KUR-013/KUR-036). Real Postgres, no S3. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('POST /media/uploads (integration)', () => {
  // no S3 env → app.storage is undefined; we exercise auth + validation + guard
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let token: string;
  let email: string;
  const suffix = Date.now().toString(36);

  const validBody = {
    kind: 'speaking',
    contentType: 'audio/mp4',
    contentLength: 12345,
    sha256Hex: 'a'.repeat(64),
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    email = `media_${suffix}@it.kurda.app`;
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: `media_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: '10.70.0.1',
    });
    token = reg.json().tokens.accessToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    await pool.end();
    await app.close();
  });

  const post = (payload: unknown, auth = true) =>
    app.inject({
      method: 'POST',
      url: '/media/uploads',
      payload: payload as never,
      headers: auth ? { authorization: `Bearer ${token}` } : {},
      remoteAddress: '10.70.0.2',
    });

  it('requires auth', async () => {
    expect((await post(validBody, false)).statusCode).toBe(401);
  });

  it('rejects an unsupported content type and a bad hash', async () => {
    expect((await post({ ...validBody, contentType: 'application/x-msdownload' })).statusCode).toBe(400);
    expect((await post({ ...validBody, sha256Hex: 'nope' })).statusCode).toBe(400);
  });

  it('issues a signed ticket when storage is configured, else 503', async () => {
    const res = await post(validBody);
    if (res.statusCode === 200) {
      // storage configured (CI media job): a real ticket comes back
      expect(res.json().uploadUrl).toBeTruthy();
      expect(res.json().key).toContain('speaking/');
    } else {
      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe('MEDIA_UNAVAILABLE');
    }
  });
});
