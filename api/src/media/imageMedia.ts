import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { mediaKey, type MediaStorage } from './storage.js';
import { processImage } from './imageProcess.js';
import { signPicture } from './signature.js';
import { exceedsUploadSize, opLimitReached, wouldExceedStorage, type MediaLimits } from './mediaLimits.js';
import type { MediaUsageService } from './mediaUsage.js';
import type { ImageSurface } from '../moderation/image-scan.js';

export type StoreImageResult =
  | {
      ok: true;
      mediaId: string;
      url: string;
      reused: boolean;
      /** the stored picture's size, px */
      width: number;
      height: number;
      /** Whether the signature is on it: asked for, and the picture large enough to carry it. */
      signed: boolean;
    }
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
 * Options for storing a user image as a content-addressed media object, with the profile photo's guard chain: size,
 * op ceiling, real type, resize and WebP, storage ceiling (fail-closed), PUT, moderation scan, confirm. Images are
 * additive with no per-user swap, and identical bytes reuse the same object. A failure before confirming leaves an
 * unconfirmed row for the orphan job and nothing servable; an owned upload deliberately stops short of confirming.
 */
export interface StoreImageOptions {
  /** Signs the picture for this handle before storing it: only for a picture posted as the poster's own work. */
  signAs?: string;
  /**
   * The uploader of a picture a post will use. Recorded on the row and mixed into the key, so two people uploading the
   * same bytes get an object each and a post can require its author's own (media/postMedia.ts). It is left unconfirmed
   * until a post confirms it, and the orphan sweep takes one nobody posts after a day. The same picture uploaded again
   * before posting is the same upload; after, it is a new one for a new post.
   */
  ownerId?: string;
}

export async function storeImageMedia(
  deps: ImageMediaDeps,
  kind: string,
  raw: Buffer,
  options: StoreImageOptions = {},
): Promise<StoreImageResult> {
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
        : proc.reason === 'codec-unavailable'
          ? [
              415,
              'HEIC_UNSUPPORTED',
              // actionable, because the photo is fine and the person can fix this
              'HEIC photos cannot be read yet. On iPhone: Settings › Camera › Formats › Most Compatible saves JPEGs instead.',
            ]
          : proc.reason === 'malformed'
            ? [422, 'MALFORMED_IMAGE', 'the image could not be decoded']
            : [422, 'IMAGE_TOO_LARGE', 'image could not be compressed to the size limit'];
    return reject(status as number, code as string, message as string, proc.reason);
  }

  /*
   * Sign before deriving the key: the key hashes the stored bytes, and the signature is part of them, so two people
   * posting the same photo do not collide. An owned upload hashes its owner in too, for an unsigned picture.
   */
  let stored = proc.webp;
  let signed = false;
  if (options.signAs) {
    const sig = await signPicture(proc.webp, options.signAs);
    if (sig.ok) {
      stored = sig.signed;
      signed = true;
    } else {
      // an unsigned picture is still a picture; losing the upload would be worse
      log.warn({ reason: sig.reason, kind }, 'could not sign image');
    }
  }

  const keyFor = (upload?: string): string => {
    const hash = createHash('sha256').update(stored);
    if (options.ownerId) hash.update(`\nowner:${options.ownerId}`);
    if (upload) hash.update(`\nupload:${upload}`);
    return mediaKey(kind, hash.digest('hex'), 'image/webp');
  };
  // what every key these bytes are stored under shares (migration 1751000166000)
  const contentHash = createHash('sha256').update(stored).digest('hex');
  let key = keyFor();
  const ok = (reused: boolean): StoreImageResult => ({
    ok: true,
    mediaId: key,
    url: storage.publicUrl(key),
    reused,
    width: proc.width,
    height: proc.height,
    signed,
  });

  // Storage ceiling against the size actually written; unknown usage fails closed.
  if (wouldExceedStorage(await usage.totalStoredBytes(), stored.length, limits.storageLimitBytes)) {
    return reject(507, 'MEDIA_STORAGE_LIMIT_REACHED', 'storage limit reached; new uploads are paused', 'storage-limit');
  }

  // The same bytes again keep their scan verdict, except a hold recorded only because the scanner was down (model
  // 'unavailable'), which is no verdict and is scanned again.
  const existing = await pool.query<{
    scan_status: string; confirmed: boolean; quarantined: boolean; unscanned: boolean | null;
  }>(
    `SELECT m.scan_status, m.confirmed_at IS NOT NULL AS confirmed, m.quarantine_state IS NOT NULL AS quarantined,
            (SELECT s.model_version = 'unavailable' FROM image_scans s
              WHERE s.media_key = m.key ORDER BY s.created_at DESC LIMIT 1) AS unscanned
       FROM media_uploads m WHERE m.key = $1`,
    [key],
  );
  const prior = existing.rows[0];
  // Bytes moderation blocked or took off the bucket are never written back under any key, since owned keys include
  // the owner and a posted picture gets a fresh key below; otherwise the same bytes could return under another key.
  const takenDown = await pool.query(
    `SELECT 1 FROM media_uploads
      WHERE content_sha256 = $1 AND (scan_status = 'blocked' OR quarantine_state IS NOT NULL) LIMIT 1`,
    [contentHash],
  );
  if ((prior && (prior.scan_status === 'blocked' || prior.quarantined)) || takenDown.rowCount) {
    return reject(422, 'IMAGE_REJECTED', 'this image was rejected by moderation', 'moderation');
  }
  if (prior?.scan_status === 'gated' && prior.unscanned !== true) {
    return reject(422, 'IMAGE_REJECTED', 'this image was rejected by moderation', 'moderation');
  }
  if (options.ownerId && prior?.confirmed) {
    // This owned upload is already on a post (live, or removed and kept for moderation). Returning its key would refuse it
    // as in use for good, even after the post is gone, so it becomes a new upload: one upload stays one post's.
    key = keyFor(randomUUID());
  } else if (prior?.scan_status === 'cleared' && (prior.confirmed || options.ownerId)) {
    // Already stored and cleared, so reuse it with no new write. An owned upload awaiting its post gets a fresh day before
    // the sweep, since someone is about to use it.
    if (!prior.confirmed) await pool.query(`UPDATE media_uploads SET created_at = now() WHERE key = $1`, [key]);
    return ok(true);
  }

  await pool.query(
    `INSERT INTO media_uploads (key, content_type, content_length, scan_status, uploader_id, kind, width, height, content_sha256)
     VALUES ($1, 'image/webp', $2, 'pending', $3, $4, $5, $6, $7)
     ON CONFLICT (key) DO UPDATE SET content_length = EXCLUDED.content_length, scan_status = 'pending',
       width = EXCLUDED.width, height = EXCLUDED.height, content_sha256 = EXCLUDED.content_sha256`,
    [key, stored.length, options.ownerId ?? null, kind, proc.width, proc.height, contentHash],
  );
  try {
    await storage.put(key, stored, 'image/webp');
    await usage.recordOps('A');
  } catch (err) {
    log.error({ err, key }, 'image post R2 put failed');
    return reject(502, 'MEDIA_UPLOAD_FAILED', 'could not store the image; please try again', 'put-failed');
  }

  // Moderation gate: only a cleared image becomes confirmed and servable; anything else stays unconfirmed and is reclaimed.
  const scan = await moderation.scan(key, 'feed');
  if (scan.scanStatus !== 'cleared') {
    return reject(422, 'IMAGE_REJECTED', 'this image was rejected by moderation', 'moderation');
  }

  // an owned upload waits for the post that uses it (StoreImageOptions.ownerId)
  if (!options.ownerId) {
    await pool.query(`UPDATE media_uploads SET confirmed_at = now() WHERE key = $1 AND confirmed_at IS NULL`, [key]);
  }
  return ok(false);
}
