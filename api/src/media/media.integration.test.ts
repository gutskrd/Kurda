/**
 * End-to-end media flow against real Postgres + MinIO (CI integration
 * job). Skipped unless both DATABASE_URL and S3_ENDPOINT are set.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import { loadConfig } from '../config/env.js';
import { MediaService } from './service.js';
import { IMMUTABLE_CACHE_CONTROL, createStorage, type MediaStorage } from './storage.js';

const ready = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);

describe.skipIf(!ready)('media pipeline (integration)', () => {
  const config = loadConfig();
  let pool: pg.Pool;
  let storage: MediaStorage;
  let service: MediaService;

  const body = Buffer.from(`kurda-media-test-${Date.now()}`);
  const sha256Hex = createHash('sha256').update(body).digest('hex');

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

  it('signed PUT uploads land in the bucket with immutable cache headers', async () => {
    const ticket = await service.requestUpload({
      kind: 'it-audio',
      contentType: 'audio/mpeg',
      contentLength: body.length,
      sha256Hex,
    });

    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: ticket.requiredHeaders,
      body,
    });
    expect(put.status).toBe(200);

    expect(await storage.exists(ticket.key)).toBe(true);
    const meta = await storage.headMetadata(ticket.key);
    expect(meta?.cacheControl).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(meta?.contentType).toBe('audio/mpeg');
  });

  it('confirmed uploads survive cleanup; orphans are removed', async () => {
    const confirmed = await service.requestUpload({
      kind: 'it-keep',
      contentType: 'image/png',
      contentLength: body.length,
      sha256Hex,
    });
    const orphan = await service.requestUpload({
      kind: 'it-orphan',
      contentType: 'image/png',
      contentLength: body.length,
      sha256Hex,
    });
    for (const t of [confirmed, orphan]) {
      const res = await fetch(t.uploadUrl, { method: 'PUT', headers: t.requiredHeaders, body });
      expect(res.status).toBe(200);
    }
    expect(await service.confirmUpload(confirmed.key)).toBe(true);

    // pretend 25h passed
    const future = new Date(Date.now() + 25 * 3_600_000);
    const cleaned = await service.cleanupOrphans(future);
    expect(cleaned).toBeGreaterThanOrEqual(1);

    expect(await storage.exists(confirmed.key)).toBe(true);
    expect(await storage.exists(orphan.key)).toBe(false);
    const row = await pool.query(`SELECT 1 FROM media_uploads WHERE key = $1`, [orphan.key]);
    expect(row.rowCount).toBe(0);
  });
});
