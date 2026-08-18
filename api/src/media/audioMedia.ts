import { createHash } from 'node:crypto';
import type pg from 'pg';
import { mediaKey, type MediaStorage } from './storage.js';
import { sniffAudioType } from './mimeSniff.js';
import { exceedsUploadSize, opLimitReached, wouldExceedStorage, type AudioLimits } from './mediaLimits.js';
import type { MediaUsageService } from './mediaUsage.js';

export type StoreAudioResult =
  | { ok: true; mediaId: string; url: string; contentType: string; reused: boolean }
  | { ok: false; status: number; code: string; message: string; reason: string };

interface Logger {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface AudioMediaDeps {
  pool: pg.Pool;
  storage: MediaStorage;
  usage: MediaUsageService;
  limits: AudioLimits;
  log: Logger;
}

const reject = (status: number, code: string, message: string, reason: string): StoreAudioResult => ({
  ok: false,
  status,
  code,
  message,
  reason,
});

/**
 * Store a user-supplied voice note cost-safely and return its confirmed media key
 * (KUR-282). Unlike images there's no server transcode (no ffmpeg), so cost is
 * capped by a tight upload-size limit + the shared storage/op ceilings: size →
 * Class-A op ceiling → real-MIME sniff (reject non-audio) → storage ceiling
 * (fail-closed) → PUT → confirm. Content-addressed, so re-uploads are idempotent.
 * Audio isn't image-scanned (#294 is image-only); a report flow (#292-style) is the
 * moderation path for voice content.
 */
export async function storeAudioMedia(deps: AudioMediaDeps, kind: string, raw: Buffer): Promise<StoreAudioResult> {
  const { pool, storage, usage, limits, log } = deps;

  if (raw.length === 0) return reject(400, 'EMPTY_UPLOAD', 'no audio data', 'empty');
  if (exceedsUploadSize(raw.length, limits.maxUploadBytes)) {
    return reject(413, 'UPLOAD_TOO_LARGE', `audio exceeds ${limits.maxUploadBytes} bytes`, 'oversize');
  }

  if (opLimitReached(await usage.classCount('A'), limits.classALimit)) {
    return reject(503, 'MEDIA_OP_LIMIT_REACHED', 'media operation limit reached; try later', 'op-limit');
  }

  const sniffed = sniffAudioType(raw);
  if (!sniffed || !limits.allowedTypes.has(sniffed)) {
    return reject(415, 'INVALID_AUDIO', 'unsupported or non-audio file', 'invalid-type');
  }

  const key = mediaKey(kind, createHash('sha256').update(raw).digest('hex'), sniffed);

  if (wouldExceedStorage(await usage.totalStoredBytes(), raw.length, limits.storageLimitBytes)) {
    return reject(507, 'MEDIA_STORAGE_LIMIT_REACHED', 'storage limit reached; new uploads are paused', 'storage-limit');
  }

  // identical bytes already stored + confirmed → reuse, no new R2 write
  const existing = await pool.query(`SELECT 1 FROM media_uploads WHERE key = $1 AND confirmed_at IS NOT NULL`, [key]);
  if ((existing.rowCount ?? 0) > 0) {
    return { ok: true, mediaId: key, url: storage.publicUrl(key), contentType: sniffed, reused: true };
  }

  await pool.query(
    `INSERT INTO media_uploads (key, content_type, content_length)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET content_length = EXCLUDED.content_length`,
    [key, sniffed, raw.length],
  );
  try {
    await storage.put(key, raw, sniffed);
    await usage.recordOps('A');
  } catch (err) {
    log.error({ err, key }, 'voice note R2 put failed');
    return reject(502, 'MEDIA_UPLOAD_FAILED', 'could not store the audio; please try again', 'put-failed');
  }

  // audio isn't image-scanned; mark cleared + confirmed so it's servable
  await pool.query(
    `UPDATE media_uploads SET confirmed_at = now(), scan_status = 'cleared' WHERE key = $1 AND confirmed_at IS NULL`,
    [key],
  );
  return { ok: true, mediaId: key, url: storage.publicUrl(key), contentType: sniffed, reused: false };
}
