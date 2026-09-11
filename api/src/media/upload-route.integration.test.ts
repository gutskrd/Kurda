/**
 * POST /media/uploads — the speaking-practice recording endpoint.
 *
 * It used to hand out a signed URL, so the bytes went from the client straight
 * to the bucket and the server only ever saw three numbers the client made up:
 * a content type, a length, and a SHA-256 nothing checked. These tests are the
 * other half of that change — they check that what lands in storage is a file
 * the server has looked at.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;
/**
 * Storage has to be real for these to mean anything.
 *
 * Without it the handler answers 503 before it ever looks at the body, so a
 * "rejects a script" assertion would pass without the sniff having run — green
 * for the wrong reason, which is worse than skipped. CI runs MinIO.
 */
const ready = Boolean(DATABASE_URL && process.env.S3_ENDPOINT);

/** A believable little MP3: an ID3v2 header and some padding. */
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(512, 0x11)]);
/** An EBML header whose DocType says "webm" — what a browser records. */
const WEBM = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.from([0x42, 0x82, 0x84]),
  Buffer.from('webm'),
  Buffer.alloc(512, 0x22),
]);
/** The thing the old endpoint would happily have stored. */
const SCRIPT = Buffer.from('<script>alert(document.domain)</script>');

describe.skipIf(!ready)('POST /media/uploads (integration)', () => {
  // loadConfig REPLACES the environment rather than merging into it, so the S3
  // settings have to be carried across or the app boots with no storage and
  // every upload answers 503 before it reads a byte
  const config = loadConfig({ ...process.env, DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let token = '';
  const suffix = Date.now().toString(36);

  const upload = (body: Buffer, contentType: string) =>
    app.inject({
      method: 'POST',
      url: '/media/uploads',
      headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
      payload: body,
      remoteAddress: '10.77.0.9',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `upload_${suffix}@it.kurda.app`,
        username: `upload_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.77.0.1',
    });
    token = res.json().tokens.accessToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email = $1`, [`upload_${suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('refuses an upload from a stranger', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/media/uploads',
      headers: { 'content-type': 'audio/mpeg' },
      payload: MP3,
      remoteAddress: '10.77.0.2',
    });
    expect(res.statusCode).toBe(401);
  });

  it('refuses a file that is not audio, however it is labelled', async () => {
    // The label is the part an attacker controls, so it is the part that must
    // not decide anything. This is the upload the old endpoint could not refuse:
    // it never saw these bytes at all.
    const res = await upload(SCRIPT, 'audio/mpeg');
    expect(res.statusCode).toBe(415);
    expect(res.json().code).toBe('INVALID_AUDIO');
  });

  it('refuses a content type it does not take bodies for', async () => {
    const res = await upload(SCRIPT, 'text/html');
    expect(res.statusCode).toBe(415);
  });

  it('refuses an empty body', async () => {
    const res = await upload(Buffer.alloc(0), 'audio/mpeg');
    expect([400, 415]).toContain(res.statusCode);
  });

  it('takes what a browser actually records', async () => {
    // MediaRecorder produces WebM on Chrome and Firefox. The client used to
    // relabel it as m4a and the server believed the label; now the server reads
    // the container and agrees with it.
    const res = await upload(WEBM, 'audio/webm');
    expect(res.statusCode).toBe(201);
    expect(res.json().contentType).toBe('audio/webm');
    expect(res.json().key).toMatch(/^speaking\/[a-f0-9]{64}\.webm$/);
  });

  it('never lets the client choose where in the bucket its file lands', async () => {
    // the old ticket took a `kind` straight from the request body, so any prefix
    // was writable — including the one GDPR exports use
    const res = await upload(MP3, 'audio/mpeg');
    expect(res.statusCode).toBe(201);
    expect(res.json().key.startsWith('speaking/')).toBe(true);
  });
});
