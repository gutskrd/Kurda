import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { mediaKey, type MediaStorage } from './storage.js';
import { sniffAudioType } from './mimeSniff.js';
import { exceedsUploadSize, opLimitReached, wouldExceedStorage, type AudioLimits } from './mediaLimits.js';
import type { MediaUsageService } from './mediaUsage.js';

/** The kinds an audio upload is stored under: a voice note for a post or a comment, and a speaking-practice recording. */
export const AUDIO_KINDS = ['voice-note', 'speaking'] as const;

/**
 * How many audio files one account may upload in a day. A voice comment or a
 * narration is a handful a day for the busiest author; without a count of its
 * own the hourly rate limit alone let one account put gigabytes on the bucket
 * between two sweeps, and the shared storage ceiling then paused everybody's
 * pictures.
 */
export const AUDIO_DAILY_UPLOADS = 30;

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

/** The content types a client may POST raw audio bytes under. */
export const AUDIO_CONTENT_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav'] as const;

/**
 * Install the raw-audio body parser, once.
 *
 * Two routes take audio bytes — a voice note and a speaking-practice recording
 * — and Fastify throws if the same content type is claimed twice, so whichever
 * registers first installs it for both. The `bodyLimit` is what makes an
 * oversized upload a 413 before the server has buffered it, rather than after.
 *
 * The declared content type only decides whether the body is read at all; what
 * the file actually is comes from `sniffAudioType` further down.
 */
export function registerAudioParser(app: FastifyInstance, maxUploadBytes: number): void {
  if (app.hasContentTypeParser(AUDIO_CONTENT_TYPES[0])) return;
  app.addContentTypeParser(
    [...AUDIO_CONTENT_TYPES],
    { parseAs: 'buffer', bodyLimit: maxUploadBytes + 1024 },
    (_req, body, done) => done(null, body),
  );
}

/**
 * Store a user-supplied voice note cost-safely and return its confirmed media key
 * (KUR-282). Unlike images there's no server transcode (no ffmpeg), so cost is
 * capped by a tight upload-size limit + the shared storage/op ceilings: size →
 * Class-A op ceiling → real-MIME sniff (reject non-audio) → storage ceiling
 * (fail-closed) → PUT → confirm. Content-addressed, so re-uploads are idempotent.
 * Audio isn't image-scanned (#294 is image-only); a report flow (#292-style) is the
 * moderation path for voice content.
 *
 * The file is kept under its uploader's name, so it is counted against them
 * (`AUDIO_DAILY_UPLOADS`), goes with their account when that is deleted, and
 * can be traced when it is reported. It used to belong to nobody. One that no
 * post or comment ever points at is removed a day later (media/service.ts
 * `cleanupOrphans`), where it used to stay on the public bucket for good.
 *
 * The course's own audio (a lesson line, a letter's name), which staff
 * upload, is given no uploader (`null`): it belongs to the course, and must
 * not go when the person who recorded it closes their account.
 */
export async function storeAudioMedia(deps: AudioMediaDeps, kind: string, raw: Buffer, uploaderId: string | null): Promise<StoreAudioResult> {
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

  // a member's own recordings are counted; the course's audio, which staff upload by the hundred, is not
  if (uploaderId !== null && (AUDIO_KINDS as readonly string[]).includes(kind)) {
    const today = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM media_uploads
        WHERE uploader_id = $1 AND kind = ANY($2::text[]) AND created_at > now() - interval '24 hours'`,
      [uploaderId, [...AUDIO_KINDS]],
    );
    if ((today.rows[0]?.n ?? 0) >= AUDIO_DAILY_UPLOADS) {
      return reject(429, 'MEDIA_DAILY_LIMIT_REACHED', 'too many recordings today; try again tomorrow', 'daily-limit');
    }
  }

  const key = mediaKey(kind, createHash('sha256').update(raw).digest('hex'), sniffed);

  if (wouldExceedStorage(await usage.totalStoredBytes(), raw.length, limits.storageLimitBytes)) {
    return reject(507, 'MEDIA_STORAGE_LIMIT_REACHED', 'storage limit reached; new uploads are paused', 'storage-limit');
  }

  const existing = await pool.query<{ confirmed: boolean; taken_down: boolean }>(
    `SELECT confirmed_at IS NOT NULL AS confirmed, (scan_status = 'blocked' OR quarantine_state IS NOT NULL) AS taken_down
       FROM media_uploads WHERE key = $1`,
    [key],
  );
  // the same bytes moderation took down are not put back on the public bucket
  if (existing.rows[0]?.taken_down) {
    return reject(422, 'MEDIA_REJECTED', 'this file was removed by moderation', 'moderation');
  }
  // identical bytes already stored + confirmed → reuse, no new R2 write
  if (existing.rows[0]?.confirmed) {
    return { ok: true, mediaId: key, url: storage.publicUrl(key), contentType: sniffed, reused: true };
  }

  await pool.query(
    `INSERT INTO media_uploads (key, content_type, content_length, kind, uploader_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET content_length = EXCLUDED.content_length,
       uploader_id = COALESCE(media_uploads.uploader_id, EXCLUDED.uploader_id)`,
    [key, sniffed, raw.length, kind, uploaderId],
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
