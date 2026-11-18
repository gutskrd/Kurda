/**
 * Through-server voice-note upload against real Postgres and a real bucket: `storeAudioMedia` and the route, covering
 * valid audio, non-audio and oversize rejection, idempotency, fail-closed storage and the rate limit. Skipped unless
 * DATABASE_URL and S3_ENDPOINT are set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { createStorage, type MediaStorage } from './storage.js';
import { MediaUsageService } from './mediaUsage.js';
import { audioLimits, type AudioLimits } from './mediaLimits.js';
import { storeAudioMedia, type AudioMediaDeps } from './audioMedia.js';
import { activate } from '../test/activate.js';
import { m4a, mp3 } from '../test/audio-files.js';

const ready = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);
const KIND = 'voice-note';

describe.skipIf(!ready)('voice-note upload cost-safety (integration)', () => {
  const config = loadConfig();
  let app: FastifyInstance;
  let pool: pg.Pool;
  let storage: MediaStorage;
  const log = { warn: () => {}, error: () => {} };
  const userIds: string[] = [];
  const suffix = Date.now().toString(36);

  const deps = (over: Partial<{ limits: AudioLimits; storage: MediaStorage }> = {}): AudioMediaDeps => ({
    pool,
    storage: over.storage ?? storage,
    usage: new MediaUsageService(pool, null),
    limits: over.limits ?? audioLimits(config),
    log,
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
    storage = createStorage(config) as MediaStorage;
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('stores valid audio as a confirmed object (mp3 + m4a)', async () => {
    const a = await storeAudioMedia(deps(), KIND, mp3(40, 5000), null);
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.mediaId).toMatch(/^voice-note\/.*\.mp3$/);
      expect(a.contentType).toBe('audio/mpeg');
      expect(await storage.exists(a.mediaId)).toBe(true);
      const row = await pool.query<{ confirmed_at: Date | null; content_type: string }>(
        `SELECT confirmed_at, content_type FROM media_uploads WHERE key = $1`,
        [a.mediaId],
      );
      expect(row.rows[0]?.confirmed_at).not.toBeNull();
      expect(row.rows[0]?.content_type).toBe('audio/mpeg');
    }
    const b = await storeAudioMedia(deps(), KIND, m4a({ seed: 5000 }), null);
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.mediaId).toMatch(/^voice-note\/.*\.m4a$/);
  });

  it('stores the checked bytes, without what rode along', async () => {
    // a cover-art tag holding a page: the file is kept, the tag blanked before it reaches the bucket
    const page = Buffer.from('<html><script>alert(1)</script></html>');
    const tagged = m4a({ seed: 7, moovExtra: [Buffer.concat([Buffer.from([0, 0, 0, 8 + page.length]), Buffer.from('udta'), page])] });
    const res = await storeAudioMedia(deps(), KIND, tagged, null);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const stored = await storage.read(res.mediaId);
    const chunks: Buffer[] = [];
    for await (const chunk of stored!.body) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBe(tagged.length);
    expect(bytes.includes('<script')).toBe(false);
    expect(stored!.contentType).toBe('audio/mp4');
  });

  it('refuses a recording past the length limit, and one hiding a page', async () => {
    const long = await storeAudioMedia(deps({ limits: { ...audioLimits(config), maxSeconds: 5 } }), KIND, m4a({ seconds: 20, seed: 8 }), null);
    expect(long.ok).toBe(false);
    if (!long.ok) expect([long.status, long.code]).toEqual([422, 'AUDIO_TOO_LONG']);
    const appended = await storeAudioMedia(deps(), KIND, Buffer.concat([m4a({ seed: 9 }), Buffer.from('<html><script>alert(1)</script></html>')]), null);
    expect(appended.ok).toBe(false);
    if (!appended.ok) expect([appended.status, appended.code]).toEqual([422, 'MALFORMED_AUDIO']);
  });

  it('rejects non-audio and oversized uploads', async () => {
    const notAudio = await storeAudioMedia(deps(), KIND, Buffer.from('this is not audio at all'), null);
    expect(notAudio.ok).toBe(false);
    if (!notAudio.ok) expect(notAudio.reason).toBe('invalid-type');

    const tiny = { ...audioLimits(config), maxUploadBytes: 100 };
    const oversize = await storeAudioMedia(deps({ limits: tiny }), KIND, mp3(20), null);
    expect(oversize.ok).toBe(false);
    if (!oversize.ok) expect(oversize.reason).toBe('oversize');
  });

  it('is idempotent for identical bytes', async () => {
    const buf = mp3(10, 5001);
    const a = await storeAudioMedia(deps(), KIND, buf, null);
    const b = await storeAudioMedia(deps(), KIND, buf, null);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.mediaId).toBe(a.mediaId);
      expect(b.reused).toBe(true);
    }
  });

  it('fails closed at the storage limit', async () => {
    const res = await storeAudioMedia(deps({ limits: { ...audioLimits(config), storageLimitBytes: 1 } }), KIND, mp3(40, 5000), null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('storage-limit');
  });

  it('uploads through the route and rate-limits per user', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `voice_${suffix}@it.kurda.app`, username: `voice_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: '10.64.0.9',
    });
    await activate(app, pool, reg);
    const token = reg.json().tokens.accessToken as string;
    userIds.push(reg.json().user.id);

    const up = await app.inject({
      method: 'POST',
      url: '/media/voice',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/mpeg' },
      payload: mp3(10, 5002),
      remoteAddress: '10.64.0.9',
    });
    expect(up.statusCode).toBe(201);
    expect(up.json().audioMediaId).toMatch(/^voice-note\//);

    const codes: number[] = [];
    for (let i = 0; i < audioLimits(config).uploadRateMax + 3; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/media/voice',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/mpeg' },
        payload: mp3(10, 5003 + i), // distinct bytes → distinct object
        remoteAddress: '10.64.0.9',
      });
      codes.push(r.statusCode);
    }
    expect(codes).toContain(429);
  });
});
