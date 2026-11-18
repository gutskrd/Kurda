import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { mediaKey, type MediaStorage } from './storage.js';
import { checkAudio, type AudioReject } from './audioCheck.js';
import { exceedsUploadSize, opLimitReached, wouldExceedStorage, type AudioLimits } from './mediaLimits.js';
import type { MediaUsageService } from './mediaUsage.js';

/** The kinds an audio upload is stored under: a voice note for a post or a comment, and a speaking-practice recording. */
export const AUDIO_KINDS = ['voice-note', 'speaking'] as const;

/**
 * Audio files one account may upload a day. Without a count of its own, the hourly rate limit let one account put
 * gigabytes on the bucket between sweeps, and the shared storage ceiling then paused everyone's pictures.
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

/** What the uploader is told when the container check refuses a file. */
function refusal(reason: AudioReject, maxSeconds: number): StoreAudioResult {
  switch (reason) {
    case 'invalid-type':
      return reject(415, 'INVALID_AUDIO', 'unsupported or non-audio file', reason);
    case 'not-sound':
      return reject(415, 'INVALID_AUDIO', 'only a sound recording can be uploaded; this file holds something else', reason);
    case 'malformed':
      return reject(422, 'MALFORMED_AUDIO', 'the recording could not be read; it may be damaged or cut short', reason);
    case 'too-long':
      return reject(422, 'AUDIO_TOO_LONG', `a recording can be up to ${maxSeconds} seconds long`, reason);
  }
}

/** The content types a client may POST raw audio bytes under. */
export const AUDIO_CONTENT_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav'] as const;

/**
 * Installs the raw-audio body parser once: two routes take audio, and fastify throws if a content type is claimed
 * twice. `bodyLimit` makes an oversized upload a 413 before it is buffered. The declared type only decides whether
 * the body is read; `sniffAudioType` decides what the file is.
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
 * Stores a voice note cost-safely and returns its confirmed key. Audio is not transcoded, so cost is capped by a tight
 * size limit and the shared ceilings: size, op ceiling, container check (media/audioCheck.ts: real type, sound only,
 * length, anything riding along emptied), storage ceiling (fail-closed), PUT of the checked bytes, confirm. Keys are
 * hashes of the checked bytes, so re-uploads are idempotent. Audio is not image-scanned; reports are its moderation path.
 *
 * The file is kept under its uploader, so it counts against them (`AUDIO_DAILY_UPLOADS`), goes with their account and
 * can be traced when reported; one no post or comment uses is removed a day later (media/service.ts
 * `cleanupOrphans`). The course's own audio, uploaded by staff, has no uploader (`null`), so it stays when its
 * recorder closes their account.
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

  const audio = checkAudio(raw, limits);
  if (!audio.ok) return refusal(audio.reason, limits.maxSeconds);
  const { type, bytes } = audio;

  // A member's own recordings are counted; staff upload course audio by the hundred and are not.
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

  // A member's recording is keyed to them as well as to its bytes, so the same file from two people is an upload each and
  // only its uploader can attach it (moderation/restrictions.ts `voiceAttachable`). The course's audio is keyed by its
  // bytes alone. `content_sha256` is what the copies share, so a takedown reaches every one.
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const ownHash = uploaderId === null ? contentHash : createHash('sha256').update(bytes).update(`\nowner:${uploaderId}`).digest('hex');
  const key = mediaKey(kind, ownHash, type);

  if (wouldExceedStorage(await usage.totalStoredBytes(), bytes.length, limits.storageLimitBytes)) {
    return reject(507, 'MEDIA_STORAGE_LIMIT_REACHED', 'storage limit reached; new uploads are paused', 'storage-limit');
  }

  const existing = await pool.query<{ confirmed: boolean; taken_down: boolean }>(
    `SELECT confirmed_at IS NOT NULL AS confirmed, (scan_status = 'blocked' OR quarantine_state IS NOT NULL) AS taken_down
       FROM media_uploads WHERE key = $1`,
    [key],
  );
  // Bytes moderation took down are not put back on the public bucket under any key; a recording stored before keys
  // carried their owner has the plain hash of its bytes as its key.
  const takenDown = await pool.query(
    `SELECT 1 FROM media_uploads
      WHERE (content_sha256 = $1 OR key = $2) AND (scan_status = 'blocked' OR quarantine_state IS NOT NULL) LIMIT 1`,
    [contentHash, mediaKey(kind, contentHash, type)],
  );
  if (existing.rows[0]?.taken_down || takenDown.rowCount) {
    return reject(422, 'MEDIA_REJECTED', 'this file was removed by moderation', 'moderation');
  }
  // identical bytes already stored + confirmed → reuse, no new R2 write
  if (existing.rows[0]?.confirmed) {
    return { ok: true, mediaId: key, url: storage.publicUrl(key), contentType: type, reused: true };
  }

  await pool.query(
    `INSERT INTO media_uploads (key, content_type, content_length, kind, uploader_id, content_sha256)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key) DO UPDATE SET content_length = EXCLUDED.content_length, content_sha256 = EXCLUDED.content_sha256,
       uploader_id = COALESCE(media_uploads.uploader_id, EXCLUDED.uploader_id)`,
    [key, type, bytes.length, kind, uploaderId, contentHash],
  );
  try {
    await storage.put(key, bytes, type);
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
  return { ok: true, mediaId: key, url: storage.publicUrl(key), contentType: type, reused: false };
}
