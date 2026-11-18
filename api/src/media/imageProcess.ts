import sharp, { type Sharp } from 'sharp';
import { sniffImageType, type SniffedImageType } from './mimeSniff.js';

export type ProcessReject =
  | 'invalid-type'
  | 'malformed'
  | 'codec-unavailable'
  | 'too-large-after-compression';

/**
 * Formats whose container is recognised but whose data needs a codec the build may lack. Prebuilt sharp decodes AVIF
 * but not HEVC, which HEIC photos contain, so a HEIC sniffs correctly and then fails to decode; it must not be
 * reported as corrupt. Where libvips has the decoder, decoding simply succeeds.
 */
const CODEC_DEPENDENT: ReadonlySet<string> = new Set(['image/heic']);

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

/**
 * The most pixels an upload may decode to. The byte limit does not bound this: a few kilobytes of PNG can describe a
 * huge canvas at four bytes a pixel, and sharp's own 268 MP default is about a gigabyte for one request on a small
 * instance. 50 MP (about 8000×6000) exceeds any phone or camera photo, and output is resized to 1280 px anyway.
 */
export const MAX_INPUT_PIXELS = 50_000_000;

/** The longest one decode and encode may take, so a picture built to be slow cannot hold a worker. */
export const IMAGE_TIMEOUT_SECONDS = 10;

/**
 * The format sharp reports for each sniffed type. sharp chooses its decoder from the bytes by itself, so a file whose
 * first bytes pass for one format and whose body reads as another (an SVG behind a HEIF header) is caught by comparing.
 */
export const DECODED_FORMAT: Readonly<Record<SniffedImageType, string>> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heif',
  'image/avif': 'heif',
  'image/tiff': 'tiff',
};

// Descending WebP qualities tried until the output fits under the size cap.
const QUALITY_LADDER = [82, 72, 62, 52, 42, 32];

/**
 * Validates and normalises an image for storage, for profile photos and image posts: sniff the real type and reject
 * what is not allowed or decodes as another format; decode the first frame only, within the pixel and time limits;
 * auto-orient, strip metadata and resize to fit `maxDimension` without enlarging; encode WebP, lowering quality until
 * it fits `maxStoredBytes`, rejecting it if even the lowest does not. Pure buffers in and out; the caller supplies the
 * limits.
 */
export async function processImage(input: Buffer, opts: ProcessOptions): Promise<ProcessResult> {
  const sniffed = sniffImageType(input);
  if (!sniffed || !opts.allowedTypes.has(sniffed)) return { ok: false, reason: 'invalid-type' };

  let base: Sharp;
  let format: string | undefined;
  try {
    base = sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // apply EXIF orientation, then drop it
      .resize(opts.maxDimension, opts.maxDimension, { fit: 'inside', withoutEnlargement: true })
      .timeout({ seconds: IMAGE_TIMEOUT_SECONDS });
    // Read the header now, so a malformed image is caught here.
    format = (await base.clone().metadata()).format;
  } catch {
    // a format we admit but cannot decode is a missing codec, not a bad file
    return { ok: false, reason: CODEC_DEPENDENT.has(sniffed) ? 'codec-unavailable' : 'malformed' };
  }
  if (format !== DECODED_FORMAT[sniffed]) return { ok: false, reason: 'invalid-type' };

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
