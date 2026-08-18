/**
 * Profile-photo cost-safety pipeline (KUR-177 hardening) against real Postgres +
 * MinIO. Exercises the through-server upload service directly (validation,
 * resize/WebP, limits, replacement, orphaning) plus the route's rate limit.
 * Skipped unless DATABASE_URL and S3_ENDPOINT are set.
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
import { mediaLimits, type MediaLimits } from '../media/mediaLimits.js';
import { setProfilePhoto, type ProfilePhotoDeps } from '../media/profilePhoto.js';
import { ImageModerationService } from '../moderation/image-moderation-service.js';

const ready = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);

const png = (w: number, h: number, bg: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: bg } }).png().toBuffer();

describe.skipIf(!ready)('profile photo cost-safety (integration)', () => {
  const config = loadConfig();
  let app: FastifyInstance;
  let pool: pg.Pool;
  let storage: MediaStorage;
  const log = { warn: () => {}, error: () => {} };
  const userIds: string[] = [];
  const suffix = Date.now().toString(36);

  const makeUser = async (): Promise<string> => {
    const n = userIds.length;
    const r = await pool.query<{ id: string }>(`INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`, [
      `pp_${n}_${suffix}@it.kurda.app`,
      `pp_${n}_${suffix}`,
    ]);
    userIds.push(r.rows[0]!.id);
    return r.rows[0]!.id;
  };

  const deps = (over: Partial<{ limits: MediaLimits; storage: MediaStorage }> = {}): ProfilePhotoDeps => ({
    pool,
    storage: over.storage ?? storage,
    usage: new MediaUsageService(pool, null),
    moderation: new ImageModerationService(pool),
    limits: over.limits ?? mediaLimits(config),
    log,
  });

  const photoKey = async (userId: string): Promise<string | null> =>
    (await pool.query<{ k: string | null }>(`SELECT profile_photo_key AS k FROM users WHERE id = $1`, [userId])).rows[0]!.k;

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

  it('stores a valid image as a small WebP object', async () => {
    const userId = await makeUser();
    const res = await setProfilePhoto(deps(), userId, await png(1000, 800, { r: 20, g: 120, b: 90 }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const key = await photoKey(userId);
      expect(key).toMatch(/^profile-photo\/.*\.webp$/);
      expect(await storage.exists(key!)).toBe(true);
      const row = await pool.query<{ content_type: string; content_length: number; confirmed_at: Date | null }>(
        `SELECT content_type, content_length, confirmed_at FROM media_uploads WHERE key = $1`,
        [key],
      );
      expect(row.rows[0]?.content_type).toBe('image/webp');
      expect(row.rows[0]?.content_length).toBeLessThanOrEqual(mediaLimits(config).maxStoredBytes);
      expect(row.rows[0]?.confirmed_at).not.toBeNull();
    }
  });

  it('rejects non-images, oversized uploads, and un-compressible images', async () => {
    const userId = await makeUser();
    const notImage = await setProfilePhoto(deps(), userId, Buffer.from('definitely not an image'));
    expect(notImage.ok).toBe(false);
    if (!notImage.ok) expect(notImage.reason).toBe('invalid-type');

    const tinyLimit = { ...mediaLimits(config), maxUploadBytes: 500 };
    const oversize = await setProfilePhoto(deps({ limits: tinyLimit }), userId, await png(1000, 1000, { r: 1, g: 2, b: 3 }));
    expect(oversize.ok).toBe(false);
    if (!oversize.ok) expect(oversize.reason).toBe('oversize');

    const tinyStored = { ...mediaLimits(config), maxStoredBytes: 150 };
    const big = await setProfilePhoto(deps({ limits: tinyStored }), userId, await png(600, 600, { r: 9, g: 9, b: 9 }));
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.reason).toBe('too-large-after-compression');

    expect(await photoKey(userId)).toBeNull(); // nothing was set by any rejection
  });

  it('replaces the old photo and deletes it from R2', async () => {
    const userId = await makeUser();
    const first = await setProfilePhoto(deps(), userId, await png(300, 300, { r: 200, g: 0, b: 0 }));
    expect(first.ok).toBe(true);
    const firstKey = await photoKey(userId);

    const second = await setProfilePhoto(deps(), userId, await png(300, 300, { r: 0, g: 0, b: 200 }));
    expect(second.ok).toBe(true);
    const secondKey = await photoKey(userId);

    expect(secondKey).not.toBe(firstKey);
    expect(await storage.exists(secondKey!)).toBe(true);
    expect(await storage.exists(firstKey!)).toBe(false); // old deleted
    const oldRow = await pool.query<{ confirmed_at: Date | null }>(`SELECT confirmed_at FROM media_uploads WHERE key = $1`, [firstKey]);
    expect(oldRow.rows[0]?.confirmed_at).toBeNull(); // un-confirmed → out of the storage total
  });

  it('is idempotent for the same image (no duplicate work)', async () => {
    const userId = await makeUser();
    const img = await png(256, 256, { r: 5, g: 55, b: 155 });
    const a = await setProfilePhoto(deps(), userId, img);
    const b = await setProfilePhoto(deps(), userId, img);
    expect(a.ok && b.ok).toBe(true);
    if (b.ok) expect(b.reused).toBe(true);
  });

  it('a failed R2 upload leaves the existing photo intact', async () => {
    const userId = await makeUser();
    const ok = await setProfilePhoto(deps(), userId, await png(200, 200, { r: 100, g: 100, b: 0 }));
    expect(ok.ok).toBe(true);
    const goodKey = await photoKey(userId);

    const brokenStorage = { ...storage, put: async () => { throw new Error('R2 down'); } } as unknown as MediaStorage;
    const fail = await setProfilePhoto(deps({ storage: brokenStorage }), userId, await png(200, 200, { r: 0, g: 100, b: 100 }));
    expect(fail.ok).toBe(false);
    if (!fail.ok) expect(fail.reason).toBe('put-failed');
    expect(await photoKey(userId)).toBe(goodKey); // unchanged
  });

  it('fails closed / rejects at the storage limit without storing', async () => {
    const userId = await makeUser();
    const limit0 = { ...mediaLimits(config), storageLimitBytes: 1 }; // any object exceeds
    const res = await setProfilePhoto(deps({ limits: limit0 }), userId, await png(200, 200, { r: 7, g: 7, b: 7 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('storage-limit');
    expect(await photoKey(userId)).toBeNull();
  });

  it('serialises concurrent uploads to one confirmed photo (no orphan)', async () => {
    const userId = await makeUser();
    const [a, b] = await Promise.all([
      setProfilePhoto(deps(), userId, await png(128, 128, { r: 1, g: 0, b: 0 })),
      setProfilePhoto(deps(), userId, await png(128, 128, { r: 0, g: 0, b: 1 })),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const winner = await photoKey(userId);
    // exactly one confirmed profile-photo row belongs to this user's final key,
    // and the loser is not left confirmed-but-unreferenced
    const confirmedForUser = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM media_uploads m
       WHERE m.confirmed_at IS NOT NULL AND m.key LIKE 'profile-photo/%'
       AND m.key IN ($1) AND EXISTS (SELECT 1 FROM users u WHERE u.profile_photo_key = m.key)`,
      [winner],
    );
    expect(Number(confirmedForUser.rows[0]?.count)).toBe(1);
  });

  it('rate-limits repeated uploads per user (route)', async () => {
    const email = `pprl_${suffix}@it.kurda.app`;
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: `pprl_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: '10.77.0.9',
    });
    const token = reg.json().tokens.accessToken as string;
    userIds.push(reg.json().user.id);
    const img = await png(64, 64, { r: 3, g: 3, b: 3 });

    // fire more than MEDIA_UPLOAD_RATE_MAX (default 10) and expect a 429 to appear
    const codes: number[] = [];
    for (let i = 0; i < mediaLimits(config).uploadRateMax + 3; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/me/profile-picture',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
        payload: img,
        remoteAddress: '10.77.0.9',
      });
      codes.push(r.statusCode);
    }
    expect(codes).toContain(429);
  });
});
