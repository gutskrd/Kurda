import { createHash } from 'node:crypto';
import type pg from 'pg';
import { mediaKey, type MediaStorage } from './storage.js';
import { processImage } from './imageProcess.js';
import { exceedsUploadSize, opLimitReached, wouldExceedStorage, type MediaLimits } from './mediaLimits.js';
import type { MediaUsageService } from './mediaUsage.js';
import type { ImageSurface } from '../moderation/image-scan.js';

export type StoreImageResult =
  | { ok: true; mediaId: string; url: string; reused: boolean }
  | { ok: false; status: number; code: string; message: string; reason: string };

interface Logger {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface ImageMediaDeps {
  pool: pg.Pool;
  storage: MediaStorage;
  usage: MediaUsageService;
  moderation: { scan(key: string, surface: ImageSurface): Promise<{ scanStatus: string }> };
  limits: MediaLimits;
  log: Logger;
}

const reject = (status: number, code: string, message: string, reason: string): StoreImageResult => ({
  ok: false,
  status,
  code,
  message,
  reason,
});

/**
 * Store a user-supplied image as a cost-safe, content-addressed media object and
 * return its confirmed key (KUR-290, shared by the meme/image feed). Same guard
 * chain as a profile photo (KUR-177) — size → Class-A op ceiling → real-MIME +
 * resize + WebP/compress → storage ceiling (fail-closed) → PUT → moderation scan →
 * confirm — but with no per-user swap: memes are additive, and the content hash
 * makes re-uploads idempotent (the same bytes reuse the same object, no new op).
 *
 * A failure at any step before confirm leaves an unconfirmed row the orphan job
 * reclaims and nothing publicly servable.
 */
export async function storeImageMedia(deps: ImageMediaDeps, kind: string, raw: Buffer): Promise<StoreImageResult> {
  const { pool, storage, usage, moderation, limits, log } = deps;

  if (raw.length === 0) return reject(400, 'EMPTY_UPLOAD', 'no image data', 'empty');
  if (exceedsUploadSize(raw.length, limits.maxUploadBytes)) {
    return reject(413, 'UPLOAD_TOO_LARGE', `image exceeds ${limits.maxUploadBytes} bytes`, 'oversize');
  }

  if (opLimitReached(await usage.classCount('A'), limits.classALimit)) {
    return reject(503, 'MEDIA_OP_LIMIT_REACHED', 'media operation limit reached; try later', 'op-limit');
  }

  const proc = await processImage(raw, {
    maxDimension: limits.maxDimension,
    maxStoredBytes: limits.maxStoredBytes,
    allowedTypes: limits.allowedTypes,
  });
  if (!proc.ok) {
    const [status, code, message] =
      proc.reason === 'invalid-type'
        ? [415, 'INVALID_IMAGE', 'unsupported or non-image file']
        : proc.reason === 'malformed'
          ? [422, 'MALFORMED_IMAGE', 'the image could not be decoded']
          : [422, 'IMAGE_TOO_LARGE', 'image could not be compressed to the size limit'];
    return reject(status as number, code as string, message as string, proc.reason);
  }

  const key = mediaKey(kind, createHash('sha256').update(proc.webp).digest('hex'), 'image/webp');

  // storage ceiling with the KNOWN processed size; fail closed on unknown usage
  if (wouldExceedStorage(await usage.totalStoredBytes(), proc.bytes, limits.storageLimitBytes)) {
    return reject(507, 'MEDIA_STORAGE_LIMIT_REACHED', 'storage limit reached; new uploads are paused', 'storage-limit');
  }

  // idempotent: identical bytes already stored + confirmed → reuse, no new R2 write
  const existing = await pool.query<{ scan_status: string }>(
    `SELECT scan_status FROM media_uploads WHERE key = $1 AND confirmed_at IS NOT NULL`,
    [key],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].scan_status === 'blocked') {
      return reject(422, 'IMAGE_REJECTED', 'this image was rejected by moderation', 'moderation');
    }
    return { ok: true, mediaId: key, url: storage.publicUrl(key), reused: true };
  }

  await pool.query(
    `INSERT INTO media_uploads (key, content_type, content_length)
     VALUES ($1, 'image/webp', $2)
     ON CONFLICT (key) DO UPDATE SET content_length = EXCLUDED.content_length`,
    [key, proc.bytes],
  );
  try {
    await storage.put(key, proc.webp, 'image/webp');
    await usage.recordOps('A');
  } catch (err) {
    log.error({ err, key }, 'image post R2 put failed');
    return reject(502, 'MEDIA_UPLOAD_FAILED', 'could not store the image; please try again', 'put-failed');
  }

  // moderation gate (#294): only a cleared image becomes servable/confirmed; a
  // gated/blocked one stays unconfirmed → orphan-reclaimed, never publicly served.
  const scan = await moderation.scan(key, 'feed');
  if (scan.scanStatus !== 'cleared') {
    return reject(422, 'IMAGE_REJECTED', 'this image was rejected by moderation', 'moderation');
  }

  await pool.query(`UPDATE media_uploads SET confirmed_at = now() WHERE key = $1 AND confirmed_at IS NULL`, [key]);
  return { ok: true, mediaId: key, url: storage.publicUrl(key), reused: false };
}
