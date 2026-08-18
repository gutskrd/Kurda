/**
 * Through-server image/meme upload pipeline (KUR-291) against real Postgres +
 * MinIO. Exercises the cost-safe store (`storeImageMedia`) directly — validation,
 * resize/WebP, limits, idempotency, fail-closed storage — plus the route's
 * rate limit + the end-to-end upload→create flow. Skipped unless DATABASE_URL and
 * S3_ENDPOINT are set (the CI `migrations` job provides both).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { createStorage, type MediaStorage } from '../media/storage.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { imagePostLimits, type MediaLimits } from '../media/mediaLimits.js';
import { storeImageMedia, type ImageMediaDeps } from '../media/imageMedia.js';
import { ImageModerationService } from '../moderation/image-moderation-service.js';

const ready = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);
const KIND = 'image-post';
const png = (w: number, h: number, bg: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: bg } }).png().toBuffer();

describe.skipIf(!ready)('image/meme upload cost-safety (integration)', () => {
  const config = loadConfig();
  let app: FastifyInstance;
  let pool: pg.Pool;
  let storage: MediaStorage;
  const log = { warn: () => {}, error: () => {} };
  const userIds: string[] = [];
  const suffix = Date.now().toString(36);

  const deps = (over: Partial<{ limits: MediaLimits; storage: MediaStorage }> = {}): ImageMediaDeps => ({
    pool,
    storage: over.storage ?? storage,
    usage: new MediaUsageService(pool, null),
    moderation: new ImageModerationService(pool),
    limits: over.limits ?? imagePostLimits(config),
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

  it('stores a valid image as a confirmed, cleared WebP object', async () => {
    const res = await storeImageMedia(deps(), KIND, await png(1600, 1200, { r: 30, g: 90, b: 160 }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.mediaId).toMatch(/^image-post\/.*\.webp$/);
      expect(await storage.exists(res.mediaId)).toBe(true);
      const row = await pool.query<{ content_type: string; content_length: number; confirmed_at: Date | null; scan_status: string }>(
        `SELECT content_type, content_length, confirmed_at, scan_status FROM media_uploads WHERE key = $1`,
        [res.mediaId],
      );
      expect(row.rows[0]?.content_type).toBe('image/webp');
      expect(row.rows[0]?.content_length).toBeLessThanOrEqual(imagePostLimits(config).maxStoredBytes);
      expect(row.rows[0]?.confirmed_at).not.toBeNull();
      expect(row.rows[0]?.scan_status).toBe('cleared');
    }
  });

  it('rejects non-images, oversized uploads, and un-compressible images', async () => {
    const notImage = await storeImageMedia(deps(), KIND, Buffer.from('not an image at all'));
    expect(notImage.ok).toBe(false);
    if (!notImage.ok) expect(notImage.reason).toBe('invalid-type');

    const tinyUpload = { ...imagePostLimits(config), maxUploadBytes: 500 };
    const oversize = await storeImageMedia(deps({ limits: tinyUpload }), KIND, await png(1000, 1000, { r: 1, g: 2, b: 3 }));
    expect(oversize.ok).toBe(false);
    if (!oversize.ok) expect(oversize.reason).toBe('oversize');

    const tinyStored = { ...imagePostLimits(config), maxStoredBytes: 120 };
    const big = await storeImageMedia(deps({ limits: tinyStored }), KIND, await png(900, 900, { r: 9, g: 9, b: 9 }));
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.reason).toBe('too-large-after-compression');
  });

  it('is idempotent for identical bytes (content-addressed, no duplicate op)', async () => {
    const img = await png(400, 400, { r: 12, g: 120, b: 200 });
    const a = await storeImageMedia(deps(), KIND, img);
    const b = await storeImageMedia(deps(), KIND, img);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.mediaId).toBe(a.mediaId);
      expect(b.reused).toBe(true);
    }
  });

  it('fails closed / rejects at the storage limit without storing', async () => {
    const limit0 = { ...imagePostLimits(config), storageLimitBytes: 1 };
    const res = await storeImageMedia(deps({ limits: limit0 }), KIND, await png(300, 300, { r: 7, g: 7, b: 7 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('storage-limit');
  });

  it('a failed R2 put stores nothing servable', async () => {
    const brokenStorage = { ...storage, put: async () => { throw new Error('R2 down'); } } as unknown as MediaStorage;
    const res = await storeImageMedia(deps({ storage: brokenStorage }), KIND, await png(300, 300, { r: 0, g: 100, b: 100 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('put-failed');
  });

  it('uploads through the route then creates a post that references it', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `imgup_${suffix}@it.kurda.app`, username: `imgup_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: '10.61.0.9',
    });
    const token = reg.json().tokens.accessToken as string;
    userIds.push(reg.json().user.id);

    const up = await app.inject({
      method: 'POST',
      url: '/images/upload',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
      payload: await png(800, 600, { r: 200, g: 40, b: 40 }),
      remoteAddress: '10.61.0.9',
    });
    expect(up.statusCode).toBe(201);
    const mediaId = up.json().imageMediaId as string;
    expect(mediaId).toMatch(/^image-post\/.*\.webp$/);

    const post = await app.inject({
      method: 'POST',
      url: '/images',
      headers: { authorization: `Bearer ${token}` },
      payload: { imageMediaId: mediaId, caption: 'through-server meme' },
      remoteAddress: '10.61.0.9',
    });
    expect(post.statusCode).toBe(201);
    expect(post.json().imageMediaId).toBe(mediaId);
  });

  it('rate-limits repeated uploads per user (route)', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `imgrl_${suffix}@it.kurda.app`, username: `imgrl_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: '10.61.0.7',
    });
    const token = reg.json().tokens.accessToken as string;
    userIds.push(reg.json().user.id);

    const codes: number[] = [];
    for (let i = 0; i < imagePostLimits(config).uploadRateMax + 3; i++) {
      // vary a pixel so each is a distinct object (not the idempotent short-circuit)
      const r = await app.inject({
        method: 'POST',
        url: '/images/upload',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
        payload: await png(64, 64, { r: i, g: 3, b: 3 }),
        remoteAddress: '10.61.0.7',
      });
      codes.push(r.statusCode);
    }
    expect(codes).toContain(429);
  });
});
