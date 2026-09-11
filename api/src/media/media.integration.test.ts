/**
 * End-to-end media flow against real Postgres + MinIO (CI integration
 * job). Skipped unless both DATABASE_URL and S3_ENDPOINT are set.
 *
 * This used to drive the signed-URL flow — ask the service for a ticket, PUT
 * the bytes straight to the bucket. That flow is gone: it let a client store
 * bytes the server never saw. What is left is the part that still matters,
 * which is what happens to an object nothing ends up referencing.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import { loadConfig } from '../config/env.js';
import { MediaService } from './service.js';
import { IMMUTABLE_CACHE_CONTROL, createStorage, mediaKey, type MediaStorage } from './storage.js';

const ready = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);

describe.skipIf(!ready)('media pipeline (integration)', () => {
  const config = loadConfig();
  let pool: pg.Pool;
  let storage: MediaStorage;
  let service: MediaService;

  const body = Buffer.from(`kurda-media-test-${Date.now()}`);
  const sha256Hex = createHash('sha256').update(body).digest('hex');

  /**
   * Store an object the way every real upload path does: write the row, write
   * the bytes, and confirm only once it is safe to serve.
   */
  async function store(kind: string, contentType: string, confirm: boolean): Promise<string> {
    const key = mediaKey(kind, sha256Hex, contentType);
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET content_length = EXCLUDED.content_length`,
      [key, contentType, body.length],
    );
    await storage.put(key, body, contentType);
    if (confirm) {
      await pool.query(`UPDATE media_uploads SET confirmed_at = now() WHERE key = $1`, [key]);
    }
    return key;
  }

  beforeAll(async () => {
    const s3 = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID as string,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY as string,
      },
    });
    await s3.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET })).catch(() => undefined);
    pool = new pg.Pool({ connectionString: config.DATABASE_URL });
    storage = createStorage(config) as MediaStorage;
    service = new MediaService(pool, storage);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM media_uploads WHERE key LIKE 'it-%'`);
    await pool.end();
  });

  it('stored objects land in the bucket with immutable cache headers', async () => {
    const key = await store('it-audio', 'audio/mpeg', true);

    expect(await storage.exists(key)).toBe(true);
    const meta = await storage.headMetadata(key);
    expect(meta?.cacheControl).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(meta?.contentType).toBe('audio/mpeg');
  });

  it('confirmed uploads survive cleanup; orphans are removed', async () => {
    const confirmed = await store('it-keep', 'image/png', true);
    const orphan = await store('it-orphan', 'image/png', false);

    // pretend 25h passed
    const future = new Date(Date.now() + 25 * 3_600_000);
    const cleaned = await service.cleanupOrphans(future);
    expect(cleaned).toBeGreaterThanOrEqual(1);

    expect(await storage.exists(confirmed)).toBe(true);
    expect(await storage.exists(orphan)).toBe(false);
    const row = await pool.query(`SELECT 1 FROM media_uploads WHERE key = $1`, [orphan]);
    expect(row.rowCount).toBe(0);
  });
});
