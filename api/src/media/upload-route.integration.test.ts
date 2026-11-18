/** POST /media/uploads, the speaking-practice recording endpoint: what lands in storage is a file the server has checked. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { mp3, webm } from '../test/audio-files.js';

const DATABASE_URL = process.env.DATABASE_URL;
/**
 * Storage must be real here: without it the handler answers 503 before reading the body, so a "rejects a script"
 * assertion would pass without the sniff running.
 */
const ready = Boolean(DATABASE_URL && process.env.S3_ENDPOINT);

const MP3 = mp3(20);
/** What a browser records: WebM whose segment and clusters have unknown sizes. */
const WEBM = webm({ streamed: true });
/** Script bytes labelled as audio. */
const SCRIPT = Buffer.from('<script>alert(document.domain)</script>');

describe.skipIf(!ready)('POST /media/uploads (integration)', () => {
  // loadConfig replaces the environment rather than merging, so the S3 settings are carried across or every upload is 503.
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
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.77.0.1',
    });
    await activate(app, pool, res);
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
    // The declared label is attacker-controlled, so it must decide nothing.
    const res = await upload(SCRIPT, 'audio/mpeg');
    expect(res.statusCode).toBe(415);
    expect(res.json().code).toBe('INVALID_AUDIO');
  });

  it('refuses a file that only starts like audio', async () => {
    // the bytes after an audio header must be audio all the way through
    const res = await upload(Buffer.concat([Buffer.from('ID3'), SCRIPT]), 'audio/mpeg');
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('MALFORMED_AUDIO');
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
    // Browser recording produces WebM; the server reads the container and agrees with it.
    const res = await upload(WEBM, 'audio/webm');
    expect(res.statusCode).toBe(201);
    expect(res.json().contentType).toBe('audio/webm');
    expect(res.json().key).toMatch(/^speaking\/[a-f0-9]{64}\.webm$/);
  });

  it('never lets the client choose where in the bucket its file lands', async () => {
    // The server fixes the prefix; nothing in the request chooses where the file goes.
    const res = await upload(MP3, 'audio/mpeg');
    expect(res.statusCode).toBe(201);
    expect(res.json().key.startsWith('speaking/')).toBe(true);
  });
});
