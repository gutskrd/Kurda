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

/** A picture through every guard and onto the bucket, not yet anybody's: its key, or why not. */
export type StoredPhoto = { ok: true; key: string; reused: boolean } | Extract<SetPhotoResult, { ok: false }>;

/**
 * Steps 1–7 of putting up a picture that stands for somebody or something —
 * a profile photo or a group's picture — cost-safely (KUR-177): size → op
 * ceiling → real MIME + resize/WebP/compress → storage ceiling (fail-closed)
 * → refuse what moderation already refused → PUT → scan. `current` is the key
 * the owner holds now: the same bytes again are a no-op. The upload is left
 * unconfirmed; the caller's own swap confirms it, so a failure anywhere before
 * leaves the old picture in place and the new object for the orphan job.
 */
export async function storeScannedPhoto(
  deps: ProfilePhotoDeps,
  raw: Buffer,
  kind: string,
  current: string | null,
): Promise<StoredPhoto> {
  const { pool, storage, usage, moderation, limits, log } = deps;

  // 1) raw size — cheap, before any work
  if (raw.length === 0) return reject(400, 'EMPTY_UPLOAD', 'no image data', 'empty') as StoredPhoto;
  if (exceedsUploadSize(raw.length, limits.maxUploadBytes)) {
    return reject(413, 'UPLOAD_TOO_LARGE', `image exceeds ${limits.maxUploadBytes} bytes`, 'oversize') as StoredPhoto;
  }

  // 2) op ceiling — we're about to do R2 writes (Class A)
  if (opLimitReached(await usage.classCount('A'), limits.classALimit)) {
    return reject(503, 'MEDIA_OP_LIMIT_REACHED', 'media operation limit reached; try later', 'op-limit') as StoredPhoto;
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
    return reject(status as number, code as string, message as string, proc.reason) as StoredPhoto;
  }

  const key = mediaKey(kind, createHash('sha256').update(proc.webp).digest('hex'), 'image/webp');

  // 4) storage ceiling — with the KNOWN processed size; fail closed on unknown usage
  const total = await usage.totalStoredBytes();
  if (wouldExceedStorage(total, proc.bytes, limits.storageLimitBytes)) {
    return reject(507, 'MEDIA_STORAGE_LIMIT_REACHED', 'storage limit reached; new uploads are paused', 'storage-limit') as StoredPhoto;
  }

  // 5) already this exact picture → idempotent no-op (retry-safe, no R2 write)
  if (current === key) return { ok: true, key, reused: true };

  // the same picture moderation blocked or took off the bucket (keys are
  // content hashes, so anyone uploading the same bytes lands on it) is never
  // written back to the public CDN
  const known = await pool.query(
    `SELECT 1 FROM media_uploads WHERE key = $1 AND (scan_status = 'blocked' OR quarantine_state IS NOT NULL)`,
    [key],
  );
  if (known.rowCount) {
    return reject(422, 'PHOTO_REJECTED', 'this image was rejected by moderation', 'moderation') as StoredPhoto;
  }

  // 6) register + upload (idempotent by content-addressed key). If the PUT fails,
  //    the row stays unconfirmed (orphan-cleaned) and the old picture is untouched.
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
    log.error({ err, key }, 'photo R2 put failed');
    return reject(502, 'MEDIA_UPLOAD_FAILED', 'could not store the image; please try again', 'put-failed') as StoredPhoto;
  }

  // 7) moderation gate (#181): a non-cleared image is left unconfirmed → orphaned.
  //    A picture that stands for somebody or a group is held to the profile bar.
  const scan = await moderation.scan(key, 'profile');
  if (scan.scanStatus !== 'cleared') {
    return reject(422, 'PHOTO_REJECTED', 'this image was rejected by moderation', 'moderation') as StoredPhoto;
  }
  return { ok: true, key, reused: false };
}

/**
 * Validate, normalise and store a user's profile photo, cost-safely (KUR-177):
 * every guard in `storeScannedPhoto`, then a per-user-serialised swap that sets
 * the new key and un-confirms the old (which the orphan job reclaims). A
 * failure before the swap leaves the old photo intact.
 */
export async function setProfilePhoto(deps: ProfilePhotoDeps, userId: string, raw: Buffer): Promise<SetPhotoResult> {
  const { pool, storage, usage, log } = deps;
  const existing = await pool.query<{ profile_photo_key: string | null }>(`SELECT profile_photo_key FROM users WHERE id = $1`, [userId]);
  const stored = await storeScannedPhoto(deps, raw, PROFILE_KIND, existing.rows[0]?.profile_photo_key ?? null);
  if (!stored.ok) return stored;
  const { key } = stored;
  if (stored.reused) return { ok: true, profilePhotoUrl: storage.publicUrl(key), reused: true };

  // 8) swap, serialised per user (locks the user row) so concurrent uploads can't
  //    leave a confirmed-but-unreferenced object. Confirm new, set it, un-confirm old.
  const oldKey = await withUserLock(pool, userId, key);

  // 9) delete the replaced object now; on failure the orphan job retries (it's
  //    already un-confirmed) — never breaks the user's new photo. Content-hashed
  //    keys are shared when two users have identical photos, so only delete when
  //    no OTHER user still references the replaced key (the current user's row now
  //    holds the new key). Otherwise leave it — deleting would 404 their photo.
  if (oldKey && oldKey !== key) {
    // ...and never one a report's evidence is holding on to
    const stillUsed = await pool.query(
      `SELECT 1 FROM users WHERE profile_photo_key = $1
       UNION ALL SELECT 1 FROM media_uploads WHERE key = $1 AND preserve_evidence
       LIMIT 1`,
      [oldKey],
    );
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
