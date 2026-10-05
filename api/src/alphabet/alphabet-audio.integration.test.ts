/**
 * Alphabet recordings from the admin API, against real Postgres and S3.
 * Skipped unless DATABASE_URL and S3_ENDPOINT are set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const ready = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);

/** A PCM WAV: `seconds` of a quiet tone, varied by `seed` so each is a new file. */
function wav(seconds: number, seed = 1): Buffer {
  const rate = 22050;
  const frames = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + frames * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(Math.sin((i * seed) / 10) * 3000), 44 + i * 2);
  return b;
}

describe.skipIf(!ready)('alphabet recordings (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];
  let editor = '';
  let reader = '';

  async function register(name: string, ip: string, roles: string): Promise<string> {
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
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token);
    return token;
  }

  const put = (key: string, body: Buffer, token = editor, type = 'audio/wav') =>
    app.inject({
      method: 'PUT',
      url: `/admin/alphabet/audio?key=${encodeURIComponent(key)}`,
      headers: { authorization: `Bearer ${token}`, 'content-type': type },
      payload: body,
      remoteAddress: '10.98.0.9',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: config.DATABASE_URL });
    const s3 = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID!, secretAccessKey: config.S3_SECRET_ACCESS_KEY! },
    });
    await s3.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET })).catch(() => undefined);
    await pool.query(`DELETE FROM alphabet_audio WHERE key IN ('kmr:sound:ç', 'ckb:word:be')`);
    editor = await register('abEditor', '10.98.0.1', '{content_editor}');
    reader = await register('abReader', '10.98.0.2', '{}');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM alphabet_audio WHERE key IN ('kmr:sound:ç', 'ckb:word:be')`);
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('stores a recording, lists it publicly, replaces it, and removes it', async () => {
    const first = await put('kmr:sound:ç', wav(1));
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({ key: 'kmr:sound:ç', durationMs: 1000 });
    expect(first.json().url).toMatch(/alphabet-audio\/[0-9a-f]{64}\.wav$/);

    const pub = await app.inject({ method: 'GET', url: '/alphabet/audio' });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().clips['kmr:sound:ç']).toBe(first.json().url);

    const second = await put('kmr:sound:ç', wav(1.2, 2));
    expect(second.statusCode).toBe(201);
    expect(second.json().url).not.toBe(first.json().url);
    const after = await app.inject({ method: 'GET', url: '/alphabet/audio' });
    expect(after.json().clips['kmr:sound:ç']).toBe(second.json().url);

    const audit = await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = 'kmr:sound:ç' ORDER BY created_at`);
    expect(audit.rows.map((r) => r.action)).toEqual(['alphabet.audio.set', 'alphabet.audio.set']);

    const del = await app.inject({
      method: 'DELETE',
      url: `/admin/alphabet/audio?key=${encodeURIComponent('kmr:sound:ç')}`,
      headers: { authorization: `Bearer ${editor}` },
    });
    expect(del.statusCode).toBe(200);
    const gone = await app.inject({ method: 'GET', url: '/alphabet/audio' });
    expect(gone.json().clips['kmr:sound:ç']).toBeUndefined();
  });

  it('accepts only the sounds the page has', async () => {
    const res = await put('kmr:sound:zz', wav(1));
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('UNKNOWN_SOUND');
  });

  it('refuses what is not a short WAV', async () => {
    expect((await put('ckb:word:be', wav(6))).json().code).toBe('TOO_LONG');
    expect((await put('ckb:word:be', wav(0.05))).json().code).toBe('TOO_SHORT');
    const mp3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0]), Buffer.alloc(4096, 0x11)]);
    expect((await put('ckb:word:be', mp3, editor, 'audio/mpeg')).statusCode).toBe(415);
  });

  it('is only for content editors', async () => {
    expect((await put('ckb:word:be', wav(1), reader)).statusCode).toBe(403);
    const anon = await app.inject({ method: 'GET', url: '/admin/alphabet/audio' });
    expect(anon.statusCode).toBe(401);
  });
});
