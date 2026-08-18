import sharp, { type Sharp } from 'sharp';
import { sniffImageType } from './mimeSniff.js';

export type ProcessReject = 'invalid-type' | 'malformed' | 'too-large-after-compression';

export type ProcessResult =
  | { ok: true; webp: Buffer; contentType: 'image/webp'; width: number; height: number; bytes: number }
  | { ok: false; reason: ProcessReject };

export interface ProcessOptions {
  /** Longest edge of the output, px. */
  maxDimension: number;
  /** Hard cap for the encoded output, bytes. */
  maxStoredBytes: number;
  /** Accepted source types (sniffed, not declared). */
  allowedTypes: ReadonlySet<string>;
}

// Descending WebP qualities tried until the output fits under the size cap.
const QUALITY_LADDER = [82, 72, 62, 52, 42, 32];

/**
 * Validate + normalise a profile image for storage (KUR-177 hardening):
 *   1. sniff the real type (magic bytes) and reject anything not allowed,
 *   2. decode with sharp (rejects malformed images),
 *   3. auto-orient, strip metadata, resize to fit `maxDimension` (never enlarge),
 *   4. encode WebP, stepping quality down until it fits `maxStoredBytes`; if even
 *      the lowest quality is too big, reject rather than store an oversized file.
 * Pure w.r.t. I/O — takes and returns buffers, so it is fully unit-testable.
 */
export async function processProfileImage(input: Buffer, opts: ProcessOptions): Promise<ProcessResult> {
  const sniffed = sniffImageType(input);
  if (!sniffed || !opts.allowedTypes.has(sniffed)) return { ok: false, reason: 'invalid-type' };

  let base: Sharp;
  try {
    base = sharp(input, { failOn: 'error' })
      .rotate() // apply EXIF orientation, then drop it
      .resize(opts.maxDimension, opts.maxDimension, { fit: 'inside', withoutEnlargement: true });
    // force a decode now so a malformed image is caught here, not later
    await base.clone().metadata();
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  for (const quality of QUALITY_LADDER) {
    let webp: Buffer;
    try {
      webp = await base.clone().webp({ quality, effort: 4 }).toBuffer();
    } catch {
      return { ok: false, reason: 'malformed' };
    }
    if (webp.length <= opts.maxStoredBytes) {
      const meta = await sharp(webp).metadata();
      return {
        ok: true,
        webp,
        contentType: 'image/webp',
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        bytes: webp.length,
      };
    }
  }
  return { ok: false, reason: 'too-large-after-compression' };
}
