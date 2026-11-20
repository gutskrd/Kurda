import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { PendingPicture, PictureRejectReason, PictureReviewState } from '@kurda/shared';
import { mediaKey, type MediaStorage } from './storage.js';
import { processImage } from './imageProcess.js';
import { exceedsUploadSize, opLimitReached, wouldExceedStorage, type MediaLimits } from './mediaLimits.js';
import type { MediaUsageService } from './mediaUsage.js';
import { REFUSAL_MESSAGES, type PictureReviewService } from '../moderation/pictures-service.js';

const PROFILE_KIND = 'profile-photo';

type Refused = {
  ok: false;
  status: number;
  code: string;
  message: string;
  reason: string;
  /** a refusal by the picture check: why, and what its owner may ask a person about */
  refusal?: { reason: PictureRejectReason; reviewId: string | null };
};

export type SetPhotoResult =
  | {
      ok: true;
      /** what everyone sees now: the new photo when clear, the previous one (or none) while the new one is checked */
      profilePhotoUrl: string | null;
      reused: boolean;
      review: PictureReviewState;
      /** the new photo, for its owner only, while a person checks it */
      profilePhotoPending?: PendingPicture;
    }
  | Refused;

interface Logger {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface ProfilePhotoDeps {
  pool: pg.Pool;
  storage: MediaStorage;
  usage: MediaUsageService;
  pictures: Pick<PictureReviewService, 'intake' | 'refusedBefore' | 'ownerLink'>;
  limits: MediaLimits;
  log: Logger;
}

const reject = (status: number, code: string, message: string, reason: string): Refused => ({
  ok: false,
  status,
  code,
  message,
  reason,
});

/** A picture through every guard and checked, not yet anybody's: its key and whether others may see it, or why not. */
export type StoredPhoto = { ok: true; key: string; reused: boolean; review: PictureReviewState } | Refused;

/**
 * Steps 1–6 of putting up a picture that stands for someone or something (a profile photo or group picture): size, op
 * ceiling, real type and WebP, storage ceiling (fail-closed), refusing bytes moderation refused or removed before, then
 * the picture check in memory, with only a clear picture written to the public bucket (moderation/pictures-service.ts
 * `intake`). `current` is the key the owner shows now, so identical bytes are a no-op. The upload stays unconfirmed
 * for the caller's swap, so an earlier failure leaves the old picture and the new object for the orphan job.
 */
export async function storeScannedPhoto(
  deps: ProfilePhotoDeps,
  raw: Buffer,
  kind: string,
  current: string | null,
  uploaderId: string,
  context?: { groupName?: string | null; groupId?: string | null },
): Promise<StoredPhoto> {
  const { pool, storage, usage, pictures, limits } = deps;

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

  const contentHash = createHash('sha256').update(proc.webp).digest('hex');
  const key = mediaKey(kind, contentHash, 'image/webp');

  // 4) storage ceiling — with the KNOWN processed size; fail closed on unknown usage
  const total = await usage.totalStoredBytes();
  if (wouldExceedStorage(total, proc.bytes, limits.storageLimitBytes)) {
    return reject(507, 'MEDIA_STORAGE_LIMIT_REACHED', 'storage limit reached; new uploads are paused', 'storage-limit');
  }

  // 5) Bytes moderation refused or took down are never written back, whoever uploads them and as whatever kind.
  const before = await pictures.refusedBefore(contentHash, key);
  if (before) return photoRefusal(before, null);

  // already this exact picture → idempotent no-op (retry-safe, no R2 write)
  if (current === key) return { ok: true, key, reused: true, review: 'clear' };

  // The same bytes are stored already (keys are content hashes): checked once, whoever uploads them again.
  const known = await pool.query<{ scan_status: string }>(`SELECT scan_status FROM media_uploads WHERE key = $1`, [key]);
  const status = known.rows[0]?.scan_status;
  if (status === 'cleared') return { ok: true, key, reused: false, review: 'clear' };
  if (status === 'held') return { ok: true, key, reused: false, review: 'held' };

  // 6) Checked in memory, then written where the check says; a failed write leaves the old picture untouched.
  const intake = await pictures.intake(storage, usage, {
    key,
    bytes: proc.webp,
    contentType: 'image/webp',
    contentHash,
    kind,
    uploaderId,
    width: proc.width,
    height: proc.height,
    context,
  });
  switch (intake.state) {
    case 'failed':
      return reject(502, 'MEDIA_UPLOAD_FAILED', 'could not store the image; please try again', 'put-failed');
    case 'refused':
      return photoRefusal(intake.reason, intake.reviewId);
    case 'held':
      return { ok: true, key, reused: false, review: 'held' };
    case 'clear':
      return { ok: true, key, reused: false, review: 'clear' };
  }
}

/** A photo the check refused, as the 422 the apps read (`PictureRejection`). */
function photoRefusal(reason: PictureRejectReason, reviewId: string | null): Refused {
  return { ok: false, status: 422, code: 'PHOTO_REJECTED', message: REFUSAL_MESSAGES[reason], reason: 'moderation', refusal: { reason, reviewId } };
}

/**
 * Validates, normalises and stores a profile photo: every guard in `storeScannedPhoto`, then, when it is clear, a
 * per-user swap that sets the new key and unconfirms the old for the orphan job. A photo a person must check first
 * waits beside the live one (`users.pending_profile_photo_key`): others keep seeing the old photo, its owner sees the
 * new one through a private link, and approving it swaps it in (moderation/picture-release.ts).
 */
export async function setProfilePhoto(deps: ProfilePhotoDeps, userId: string, raw: Buffer): Promise<SetPhotoResult> {
  const { pool, storage, usage, log, pictures } = deps;
  const existing = await pool.query<{ profile_photo_key: string | null }>(`SELECT profile_photo_key FROM users WHERE id = $1`, [userId]);
  const live = existing.rows[0]?.profile_photo_key ?? null;
  const stored = await storeScannedPhoto(deps, raw, PROFILE_KIND, live, userId);
  if (!stored.ok) return stored;
  const { key } = stored;
  if (stored.reused) return { ok: true, profilePhotoUrl: storage.publicUrl(key), reused: true, review: 'clear' };

  if (stored.review === 'held') {
    const replaced = await pool.query<{ old: string | null }>(
      `UPDATE users u SET pending_profile_photo_key = $2 FROM (SELECT pending_profile_photo_key FROM users WHERE id = $1 FOR UPDATE) o
        WHERE u.id = $1 RETURNING o.pending_profile_photo_key AS old`,
      [userId, key],
    );
    const old = replaced.rows[0]?.old;
    if (old && old !== key) await unconfirmIfNobodyShows(pool, old);
    const pending = await pictures.ownerLink(key);
    return {
      ok: true,
      profilePhotoUrl: live ? storage.publicUrl(live) : null,
      reused: false,
      review: 'held',
      ...(pending ? { profilePhotoPending: pending } : {}),
    };
  }

  // 7) Swap under the user's row lock, so concurrent uploads cannot leave a confirmed but unreferenced object.
  const oldKey = await withUserLock(pool, userId, key);

  // 8) Delete the replaced object now (the orphan job retries a failure), but only when no other user references it:
  // identical photos share a content-hashed key.
  if (oldKey && oldKey !== key) {
    // ...and never one a report's evidence is holding on to
    const stillUsed = await pool.query(
      `SELECT 1 FROM users WHERE profile_photo_key = $1 OR pending_profile_photo_key = $1
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

  return { ok: true, profilePhotoUrl: storage.publicUrl(key), reused: false, review: 'clear' };
}

/** A waiting photo that was replaced by a newer one is left to the orphan sweep, unless someone still shows or awaits it. */
async function unconfirmIfNobodyShows(executor: Pick<pg.Pool, 'query'>, key: string): Promise<void> {
  await executor.query(
    `UPDATE media_uploads m SET confirmed_at = NULL, created_at = now()
      WHERE m.key = $1 AND m.scan_status = 'cleared'
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.profile_photo_key = m.key OR u.pending_profile_photo_key = m.key)`,
    [key],
  );
}

/** Confirms `newKey`, sets it on the user and unconfirms the replaced key in one transaction under the user lock; returns the replaced key. */
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
    // a newer photo replaces one still waiting for a person too: approving that one later must not undo this
    await client.query(`UPDATE users SET profile_photo_key = $2, pending_profile_photo_key = NULL WHERE id = $1`, [userId, newKey]);
    // Unconfirm the old key so it leaves the storage total and is reclaimed, unless another user still references it.
    if (oldKey && oldKey !== newKey) {
      const stillUsed = await client.query(
        `SELECT 1 FROM users WHERE profile_photo_key = $1 OR pending_profile_photo_key = $1 LIMIT 1`,
        [oldKey],
      );
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
