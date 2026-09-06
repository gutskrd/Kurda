import { createHash } from 'node:crypto';
import type pg from 'pg';
import { mediaKey, type MediaStorage } from './storage.js';
import { processImage } from './imageProcess.js';
import { exceedsUploadSize, opLimitReached, wouldExceedStorage, type MediaLimits } from './mediaLimits.js';
import type { MediaUsageService } from './mediaUsage.js';

const PROFILE_KIND = 'profile-photo';

export type SetPhotoResult =
  | { ok: true; profilePhotoUrl: string; reused: boolean }
  | { ok: false; status: number; code: string; message: string; reason: string };

interface Logger {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface ProfilePhotoDeps {
  pool: pg.Pool;
  storage: MediaStorage;
  usage: MediaUsageService;
  moderation: { scan(key: string, surface: 'profile'): Promise<{ scanStatus: string }> };
  limits: MediaLimits;
  log: Logger;
}

const reject = (status: number, code: string, message: string, reason: string): SetPhotoResult => ({
  ok: false,
  status,
  code,
  message,
  reason,
});

/**
 * Validate, normalise and store a user's profile photo, cost-safely (KUR-177).
 * The bytes flow through here so every guard is server-side: size → op ceiling →
 * real MIME + resize/WebP/compress → storage ceiling (fail-closed) → PUT → scan →
 * a per-user-serialised swap that sets the new key and un-confirms the old (which
 * the orphan job reclaims). A failure before the swap leaves the old photo intact.
 */
export async function setProfilePhoto(deps: ProfilePhotoDeps, userId: string, raw: Buffer): Promise<SetPhotoResult> {
  const { pool, storage, usage, moderation, limits, log } = deps;

  // 1) raw size — cheap, before any work
  if (raw.length === 0) return reject(400, 'EMPTY_UPLOAD', 'no image data', 'empty');
  if (exceedsUploadSize(raw.length, limits.maxUploadBytes)) {
    return reject(413, 'UPLOAD_TOO_LARGE', `image exceeds ${limits.maxUploadBytes} bytes`, 'oversize');
  }

  // 2) op ceiling — we're about to do R2 writes (Class A)
  if (opLimitReached(await usage.classCount('A'), limits.classALimit)) {
    return reject(503, 'MEDIA_OP_LIMIT_REACHED', 'media operation limit reached; try later', 'op-limit');
  }

  // 3) process: real type + resize + WebP + compress-to-cap (or reject)
  const proc = await processImage(raw, {
    maxDimension: limits.maxDimension,
    maxStoredBytes: limits.maxStoredBytes,
    allowedTypes: limits.allowedTypes,
  });
  if (!proc.ok) {
    const [status, code, message] =
      proc.reason === 'invalid-type'
        ? [415, 'INVALID_IMAGE', 'unsupported or non-image file']
        : proc.reason === 'codec-unavailable'
          ? [
              415,
              'HEIC_UNSUPPORTED',
              'HEIC photos cannot be read yet. On iPhone: Settings › Camera › Formats › Most Compatible saves JPEGs instead.',
            ]
          : proc.reason === 'malformed'
            ? [422, 'MALFORMED_IMAGE', 'the image could not be decoded']
            : [422, 'IMAGE_TOO_LARGE', 'image could not be compressed to the size limit'];
    return reject(status as number, code as string, message as string, proc.reason);
  }

  const key = mediaKey(PROFILE_KIND, createHash('sha256').update(proc.webp).digest('hex'), 'image/webp');

  // 4) storage ceiling — with the KNOWN processed size; fail closed on unknown usage
  const current = await usage.totalStoredBytes();
  if (wouldExceedStorage(current, proc.bytes, limits.storageLimitBytes)) {
    return reject(507, 'MEDIA_STORAGE_LIMIT_REACHED', 'storage limit reached; new uploads are paused', 'storage-limit');
  }

  // 5) already this user's exact photo → idempotent no-op (retry-safe, no R2 write)
  const existing = await pool.query<{ profile_photo_key: string | null }>(
    `SELECT profile_photo_key FROM users WHERE id = $1`,
    [userId],
  );
  if (existing.rows[0]?.profile_photo_key === key) {
    return { ok: true, profilePhotoUrl: storage.publicUrl(key), reused: true };
  }

  // 6) register + upload (idempotent by content-addressed key). If the PUT fails,
  //    the row stays unconfirmed (orphan-cleaned) and the old photo is untouched.
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
    log.error({ err, key }, 'profile photo R2 put failed');
    return reject(502, 'MEDIA_UPLOAD_FAILED', 'could not store the image; please try again', 'put-failed');
  }

  // 7) moderation gate (#181): a non-cleared image is left unconfirmed → orphaned
  const scan = await moderation.scan(key, 'profile');
  if (scan.scanStatus !== 'cleared') {
    return reject(422, 'PHOTO_REJECTED', 'this image was rejected by moderation', 'moderation');
  }

  // 8) swap, serialised per user (locks the user row) so concurrent uploads can't
  //    leave a confirmed-but-unreferenced object. Confirm new, set it, un-confirm old.
  const oldKey = await withUserLock(pool, userId, key);

  // 9) delete the replaced object now; on failure the orphan job retries (it's
  //    already un-confirmed) — never breaks the user's new photo. Content-hashed
  //    keys are shared when two users have identical photos, so only delete when
  //    no OTHER user still references the replaced key (the current user's row now
  //    holds the new key). Otherwise leave it — deleting would 404 their photo.
  if (oldKey && oldKey !== key) {
    const stillUsed = await pool.query(`SELECT 1 FROM users WHERE profile_photo_key = $1 LIMIT 1`, [oldKey]);
    if ((stillUsed.rowCount ?? 0) === 0) {
      try {
        await storage.delete(oldKey);
        await usage.recordOps('A');
      } catch (err) {
        log.warn({ err, key: oldKey }, 'failed to delete replaced profile photo; orphan job will retry');
      }
    }
  }

  return { ok: true, profilePhotoUrl: storage.publicUrl(key), reused: false };
}

/** Confirm `newKey`, set it on the user, and un-confirm the replaced key — all in
 *  one transaction with the user row locked. Returns the replaced key (or null). */
async function withUserLock(pool: pg.Pool, userId: string, newKey: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prev = await client.query<{ profile_photo_key: string | null }>(
      `SELECT profile_photo_key FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const oldKey = prev.rows[0]?.profile_photo_key ?? null;
    await client.query(`UPDATE media_uploads SET confirmed_at = now() WHERE key = $1 AND confirmed_at IS NULL`, [newKey]);
    await client.query(`UPDATE users SET profile_photo_key = $2 WHERE id = $1`, [userId, newKey]);
    // un-confirm the old key so it drops from the storage total + is orphan-reclaimed,
    // unless another user still references it (content-hashed keys are shared)
    if (oldKey && oldKey !== newKey) {
      const stillUsed = await client.query(`SELECT 1 FROM users WHERE profile_photo_key = $1 LIMIT 1`, [oldKey]);
      if ((stillUsed.rowCount ?? 0) === 0) {
        await client.query(`UPDATE media_uploads SET confirmed_at = NULL, created_at = now() WHERE key = $1`, [oldKey]);
      }
    }
    await client.query('COMMIT');
    return oldKey;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
