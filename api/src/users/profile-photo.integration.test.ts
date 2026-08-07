/**
 * Profile photo lifecycle over HTTP (KUR-177): request an upload URL → confirm
 * & set the key → resolve it on /me → clear it. Needs Postgres + S3 config (for
 * app.storage); URL signing and the key lifecycle are DB/crypto only, so no live
 * object upload is required. Skipped unless both DATABASE_URL and S3_ENDPOINT set.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const ready = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);

describe.skipIf(!ready)('profile photo (integration)', () => {
  const config = loadConfig();
  let app: FastifyInstance;
  let pool: pg.Pool;
  let token: string;
  const suffix = Date.now().toString(36);
  const email = `pp_${suffix}@it.kurda.app`;
  const auth = (t: string): Record<string, string> => ({ authorization: `Bearer ${t}` });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: config.DATABASE_URL });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: `pp_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: '10.77.0.1',
    });
    token = reg.json().tokens.accessToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    await pool.end();
    await app.close();
  });

  const me = async (): Promise<{ profilePhotoUrl: string | null }> =>
    (await app.inject({ method: 'GET', url: '/me', headers: auth(token) })).json().user;

  it('has no photo by default', async () => {
    expect((await me()).profilePhotoUrl).toBeNull();
  });

  it('rejects a non-image content type on the upload URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile-picture/upload-url',
      headers: auth(token),
      payload: { contentType: 'audio/mpeg', contentLength: 1000, sha256Hex: 'a'.repeat(64) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('runs the full upload → set → resolve → clear lifecycle', async () => {
    const bytes = Buffer.from(`kurda-pp-${suffix}`);
    const sha256Hex = createHash('sha256').update(bytes).digest('hex');

    const ticket = await app.inject({
      method: 'POST',
      url: '/me/profile-picture/upload-url',
      headers: auth(token),
      payload: { contentType: 'image/png', contentLength: bytes.length, sha256Hex },
    });
    expect(ticket.statusCode).toBe(200);
    const key = ticket.json().key as string;
    expect(key.startsWith('profile-photo/')).toBe(true);

    const set = await app.inject({ method: 'POST', url: '/me/profile-picture', headers: auth(token), payload: { key } });
    expect(set.statusCode).toBe(200);
    expect(set.json().profilePhotoUrl).toContain(key);
    expect((await me()).profilePhotoUrl).toContain(key);

    const del = await app.inject({ method: 'DELETE', url: '/me/profile-picture', headers: auth(token) });
    expect(del.statusCode).toBe(200);
    expect((await me()).profilePhotoUrl).toBeNull();
  });

  it('rejects a key that is not a profile-photo key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile-picture',
      headers: auth(token),
      payload: { key: 'speaking/x.mp3' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BAD_KEY');
  });

  it('rejects a profile-photo key that was never requested', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile-picture',
      headers: auth(token),
      payload: { key: `profile-photo/${'b'.repeat(64)}.png` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('UNKNOWN_KEY');
  });
});
