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
      /** whether the signature is on it (asked for, and the picture was big enough to carry it) */
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
 * Store a user-supplied image as a cost-safe, content-addressed media object and
 * return its confirmed key (KUR-290, shared by the meme/image feed). Same guard
 * chain as a profile photo (KUR-177) — size → Class-A op ceiling → real-MIME +
 * resize + WebP/compress → storage ceiling (fail-closed) → PUT → moderation scan →
 * confirm — but with no per-user swap: memes are additive, and the content hash
 * makes re-uploads idempotent (the same bytes reuse the same object, no new op).
 *
 * A failure at any step before confirm leaves an unconfirmed row the orphan job
 * reclaims and nothing publicly servable. An upload with an owner stops short
 * of confirming on purpose (see `StoreImageOptions.ownerId`).
 */
export interface StoreImageOptions {
  /**
   * Sign the picture for this handle before storing it.
   *
   * A picture somebody posts as their own work carries the mark; a picture they
   * did not make, avatars and everything else do not, which is why this is
   * asked for rather than assumed.
   */
  signAs?: string;
  /**
   * Who is uploading it, for a picture that a post will use.
   *
   * Recorded on the row, and mixed into the key: two people uploading the same
   * bytes (an unsigned meme, say) get an object each, so every upload has
   * exactly one owner and a post can insist on its author's own
   * (media/postMedia.ts). Such an upload is left unconfirmed — the post that
   * uses it confirms it, and one nobody posts is reclaimed by the orphan sweep
   * after a day instead of staying in the bucket for good. The same picture
   * uploaded again before it is posted is the same upload; after, it is a new
   * one, so it can go on a new post.
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
   * Sign before the key is derived. The key is a hash of the stored bytes, and
   * two people posting the same photo must not collide onto one object now that
   * each carries a different name — the signature is part of what is stored, so
   * it has to be part of what is hashed. (An owned upload hashes its owner in
   * too, for the picture that goes up without a name on it.)
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

  // storage ceiling against the size actually being written; fail closed on
  // unknown usage
  if (wouldExceedStorage(await usage.totalStoredBytes(), stored.length, limits.storageLimitBytes)) {
    return reject(507, 'MEDIA_STORAGE_LIMIT_REACHED', 'storage limit reached; new uploads are paused', 'storage-limit');
  }

  // the same bytes again: what the scan said about them still stands — but a
  // hold that only stands for the scanner being down (moderation/image-scan.ts
  // `onScannerError`, recorded as model 'unavailable') is no verdict on the
  // picture, so that one is scanned again
  const existing = await pool.query<{ scan_status: string; confirmed: boolean; unscanned: boolean | null }>(
    `SELECT m.scan_status, m.confirmed_at IS NOT NULL AS confirmed,
            (SELECT s.model_version = 'unavailable' FROM image_scans s
              WHERE s.media_key = m.key ORDER BY s.created_at DESC LIMIT 1) AS unscanned
       FROM media_uploads m WHERE m.key = $1`,
    [key],
  );
  const prior = existing.rows[0];
  if (prior?.scan_status === 'blocked' || (prior?.scan_status === 'gated' && prior.unscanned !== true)) {
    return reject(422, 'IMAGE_REJECTED', 'this image was rejected by moderation', 'moderation');
  }
  if (options.ownerId && prior?.confirmed) {
    // an owned upload is confirmed by the post that uses it, so this picture is
    // on a post already — up, or removed and kept for moderation. Handing back
    // its key would refuse it as in use for good, even after its post is gone
    // (deleting and posting again is how the installed apps change a caption),
    // so it becomes a new upload of its own: one upload is still one post's.
    key = keyFor(randomUUID());
  } else if (prior?.scan_status === 'cleared' && (prior.confirmed || options.ownerId)) {
    // idempotent: already stored and cleared → reuse, no new R2 write. An owned
    // upload counts once it is through the scan (rows are inserted 'pending'
    // below, so 'cleared' means scanned); one still waiting for its post gets a
    // fresh day before the sweep, since somebody is evidently about to use it.
    if (!prior.confirmed) await pool.query(`UPDATE media_uploads SET created_at = now() WHERE key = $1`, [key]);
    return ok(true);
  }

  await pool.query(
    `INSERT INTO media_uploads (key, content_type, content_length, scan_status, uploader_id, kind, width, height)
     VALUES ($1, 'image/webp', $2, 'pending', $3, $4, $5, $6)
     ON CONFLICT (key) DO UPDATE SET content_length = EXCLUDED.content_length, scan_status = 'pending',
       width = EXCLUDED.width, height = EXCLUDED.height`,
    [key, stored.length, options.ownerId ?? null, kind, proc.width, proc.height],
  );
  try {
    await storage.put(key, stored, 'image/webp');
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

  // an owned upload waits for the post that uses it (StoreImageOptions.ownerId)
  if (!options.ownerId) {
    await pool.query(`UPDATE media_uploads SET confirmed_at = now() WHERE key = $1 AND confirmed_at IS NULL`, [key]);
  }
  return ok(false);
}
