/**
 * Art for the shop's backgrounds and profile icons, uploaded in the admin.
 *
 * The art the shop started with is drawn by scripts/generate-cosmetic-art.mjs
 * and ships with the website. Art added since is uploaded here: the bytes go
 * through the server, are checked and re-encoded to the shape and size the
 * apps draw — a background is a 16:9 WebP, an icon a square PNG that keeps its
 * transparency — and are stored content-addressed under `cosmetic/<kind>/`
 * (cosmetics/access.ts `isUploadedArtKey`), served from the CDN.
 *
 * An upload is held, unconfirmed, until an item is saved with it
 * (`claimArt`): one nobody uses is reclaimed by the orphan sweep after a day,
 * like a picture uploaded for a post that is never made. An item that stops
 * using its art — deleted, or given new art — lets go of it (`releaseArt`),
 * unless another item or a change waiting in Approvals still uses it, and the
 * sweep takes it a day later. That day is the grace to undo a mistake in.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import sharp, { type Metadata, type Sharp } from 'sharp';
import { artKindFor, isUploadedArtKey, uploadedArtKind, type ArtKind } from '../cosmetics/access.js';
import { sniffImageType } from '../media/mimeSniff.js';
import { exceedsUploadSize, opLimitReached, wouldExceedStorage } from '../media/mediaLimits.js';
import type { MediaStorage } from '../media/storage.js';
import type { MediaUsageService } from '../media/mediaUsage.js';

/** What a kind of art is stored as, and what an upload of it must be. */
export interface ArtSpec {
  /** width ÷ height */
  ratio: number;
  /** the shape, in words: "16:9" */
  shape: string;
  minWidth: number;
  minHeight: number;
  /** the stored sizes to try, largest first: a picture too detailed for the first falls back to the next */
  sizes: ReadonlyArray<readonly [number, number]>;
  /** the most the stored file may weigh, bytes */
  maxBytes: number;
  contentType: 'image/webp' | 'image/png';
  ext: 'webp' | 'png';
}

/**
 * The sizes match the art that ships: backgrounds are drawn at 1280×720 and
 * weigh up to about 120 KB, icons at 512×512 and up to about 70 KB. A
 * background may be stored larger (up to 1920×1080) for a sharper picture on
 * a big screen, within the same weight; the minimums are the size below which
 * the picture would look soft where the apps draw it.
 */
export const ART_SPECS: Readonly<Record<ArtKind, ArtSpec>> = {
  background: {
    ratio: 16 / 9,
    shape: '16:9',
    minWidth: 1280,
    minHeight: 720,
    sizes: [
      [1920, 1080],
      [1600, 900],
      [1280, 720],
    ],
    maxBytes: 120 * 1024,
    contentType: 'image/webp',
    ext: 'webp',
  },
  icon: {
    ratio: 1,
    shape: 'square',
    minWidth: 256,
    minHeight: 256,
    sizes: [
      [512, 512],
      [384, 384],
      [256, 256],
    ],
    maxBytes: 80 * 1024,
    contentType: 'image/png',
    ext: 'png',
  },
};

/** The formats an upload may be in, by its bytes. No SVG: it is a document that can carry script, not a picture. */
const ACCEPTED: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * How far a picture may be from its shape and still be trimmed to it, rather
 * than refused. A few pixels' sliver off the edge of a 1921×1080 export is
 * what anyone would want; a 4:3 picture cut to 16:9 loses a quarter of
 * itself, which is a decision for the person who drew it, not for the server.
 */
export const SHAPE_TOLERANCE = 0.03;

/** As imageProcess.ts: what an upload may decode to, so a tiny file cannot ask for a gigabyte of pixels. */
const MAX_INPUT_PIXELS = 50_000_000;

const WEBP_QUALITY = [82, 74, 66, 58];
/** the last size goes further down before giving up */
const WEBP_QUALITY_LAST = [...WEBP_QUALITY, 50, 42];
/** PNG palette quality, after the full-colour attempt; libimagequant keeps the alpha channel */
const PNG_QUALITY = [100, 90, 80, 70, 60];

export type ArtReject = 'invalid-type' | 'malformed' | 'too-small' | 'wrong-shape' | 'too-large-after-compression';

export type ProcessedArt =
  | { ok: true; bytes: Buffer; contentType: ArtSpec['contentType']; width: number; height: number; trimmed: boolean }
  | { ok: false; reason: ArtReject; width?: number; height?: number };

/** The picture's size as it will be shown: EXIF orientations 5–8 turn it on its side. */
function orientedSize(meta: Metadata): { width: number; height: number } {
  const turned = (meta.orientation ?? 1) >= 5;
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  return turned ? { width: height, height: width } : { width, height };
}

/**
 * Check and re-encode one upload. Pure with respect to I/O — buffers in,
 * buffers out — so every rule here is unit-tested (art.test.ts).
 *
 *   1. the real type, by its bytes: PNG, JPEG or WebP;
 *   2. it decodes, within the pixel limit;
 *   3. it is the kind's shape, within SHAPE_TOLERANCE, and at least its
 *      minimum size — then trimmed to the exact shape from the centre;
 *   4. scaled down (never up) and encoded, stepping quality and then size
 *      down until it fits the kind's weight. Metadata is dropped on the way.
 */
export async function processArt(raw: Buffer, kind: ArtKind): Promise<ProcessedArt> {
  const spec = ART_SPECS[kind];
  const sniffed = sniffImageType(raw);
  if (!sniffed || !ACCEPTED.has(sniffed)) return { ok: false, reason: 'invalid-type' };

  let meta: Metadata;
  try {
    meta = await sharp(raw, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const { width, height } = orientedSize(meta);
  if (!width || !height) return { ok: false, reason: 'malformed' };
  // the shape first: a phone's upright photo offered as a background is the wrong shape, not too small
  const ratio = width / height;
  if (Math.abs(ratio / spec.ratio - 1) > SHAPE_TOLERANCE) return { ok: false, reason: 'wrong-shape', width, height };
  if (width < spec.minWidth || height < spec.minHeight) return { ok: false, reason: 'too-small', width, height };

  // the largest exact-shape area the picture holds, and the sizes to try within it
  const cropWidth = ratio > spec.ratio ? Math.round(height * spec.ratio) : width;
  const trimmed = Math.abs(ratio - spec.ratio) > 1e-9;
  const candidates: Array<[number, number]> = [];
  for (const [w] of spec.sizes) {
    const outW = Math.min(w, cropWidth);
    const outH = Math.round(outW / spec.ratio);
    if (!candidates.some(([cw]) => cw === outW)) candidates.push([outW, outH]);
  }

  try {
    for (let i = 0; i < candidates.length; i++) {
      const [outW, outH] = candidates[i]!;
      const last = i === candidates.length - 1;
      // `cover` at the exact size trims the sliver off both sides evenly and scales in one pass
      const base = sharp(raw, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(outW, outH, { fit: 'cover', position: 'centre' });
      const encoded = kind === 'background' ? await encodeWebp(base, last, spec.maxBytes) : await encodePng(base, spec.maxBytes);
      if (encoded) return { ok: true, bytes: encoded, contentType: spec.contentType, width: outW, height: outH, trimmed };
    }
  } catch {
    // it read as an image and then failed part-way through: a truncated or damaged file
    return { ok: false, reason: 'malformed' };
  }
  return { ok: false, reason: 'too-large-after-compression', width, height };
}

async function encodeWebp(base: Sharp, last: boolean, maxBytes: number): Promise<Buffer | null> {
  for (const quality of last ? WEBP_QUALITY_LAST : WEBP_QUALITY) {
    const out = await base.clone().webp({ quality, effort: 5 }).toBuffer();
    if (out.length <= maxBytes) return out;
  }
  return null;
}

async function encodePng(base: Sharp, maxBytes: number): Promise<Buffer | null> {
  // RGBA throughout, so a JPEG icon is stored the same way as a transparent one
  const rgba = base.clone().ensureAlpha();
  const full = await rgba.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  if (full.length <= maxBytes) return full;
  for (const quality of PNG_QUALITY) {
    const out = await rgba.clone().png({ palette: true, quality, effort: 10, compressionLevel: 9 }).toBuffer();
    if (out.length <= maxBytes) return out;
  }
  return null;
}

/** The storage key for a kind's art: its content's hash, so the same picture is stored once. */
export function artKey(kind: ArtKind, sha256Hex: string): string {
  return `cosmetic/${kind}/${sha256Hex}.${ART_SPECS[kind].ext}`;
}

/** The `media_uploads.kind` an upload of this art is recorded under. */
export const artUploadKind = (kind: ArtKind): string => `cosmetic-${kind}`;

export interface StoredArt {
  key: string;
  url: string;
  kind: ArtKind;
  width: number;
  height: number;
  bytes: number;
  contentType: ArtSpec['contentType'];
  /** a sliver was cut off to make the exact shape */
  trimmed: boolean;
  /** the same picture was uploaded before and is stored already */
  reused: boolean;
}

export type StoreArtResult =
  | { ok: true; art: StoredArt }
  | { ok: false; status: number; code: string; message: string; details?: Record<string, unknown> };

interface Logger {
  error: (obj: unknown, msg?: string) => void;
}

export interface ArtDeps {
  pool: pg.Pool;
  storage: MediaStorage;
  usage: MediaUsageService;
  limits: { maxUploadBytes: number; storageLimitBytes: number; classALimit: number };
  log: Logger;
}

const kb = (bytes: number): string => `${Math.round(bytes / 1024)} KB`;

/** Why an upload was refused, in words an admin can act on. */
function refusal(kind: ArtKind, art: Extract<ProcessedArt, { ok: false }>): Extract<StoreArtResult, { ok: false }> {
  const spec = ART_SPECS[kind];
  const size = art.width && art.height ? { width: art.width, height: art.height } : {};
  switch (art.reason) {
    case 'invalid-type':
      return { ok: false, status: 415, code: 'INVALID_IMAGE', message: 'send a PNG, WebP or JPEG picture' };
    case 'malformed':
      return { ok: false, status: 422, code: 'MALFORMED_IMAGE', message: 'the picture could not be read; it may be damaged' };
    case 'too-small':
      return {
        ok: false,
        status: 422,
        code: 'IMAGE_TOO_SMALL',
        message: `a ${kind} must be at least ${spec.minWidth}×${spec.minHeight} pixels; this one is ${art.width}×${art.height}`,
        details: { ...size, minWidth: spec.minWidth, minHeight: spec.minHeight },
      };
    case 'wrong-shape':
      return {
        ok: false,
        status: 422,
        code: 'WRONG_SHAPE',
        message: `a ${kind} must be ${spec.shape}; this one is ${art.width}×${art.height}`,
        details: { ...size, shape: spec.shape },
      };
    case 'too-large-after-compression':
      return {
        ok: false,
        status: 422,
        code: 'IMAGE_TOO_DETAILED',
        message: `the picture could not be made small enough (${kb(spec.maxBytes)}) without spoiling it`,
        details: { maxBytes: spec.maxBytes },
      };
  }
}

/**
 * Store an uploaded background or icon and return its key.
 *
 * The same guard chain as every other upload (media/imageMedia.ts): size →
 * op ceiling → real type + re-encode → storage ceiling (fail-closed) → PUT.
 * Not the image scanner: only an admin can upload here, behind their second
 * factor, and the picture reaches anyone only through that admin's own save —
 * it is the shop's own art, not a member's picture. Bytes moderation once took
 * down are still refused, wherever they were taken down.
 */
export async function storeArt(deps: ArtDeps, kind: ArtKind, raw: Buffer): Promise<StoreArtResult> {
  const { pool, storage, usage, limits, log } = deps;
  if (raw.length === 0) return { ok: false, status: 400, code: 'EMPTY_UPLOAD', message: 'no picture was sent' };
  if (exceedsUploadSize(raw.length, limits.maxUploadBytes)) {
    return {
      ok: false,
      status: 413,
      code: 'UPLOAD_TOO_LARGE',
      message: `the file is larger than ${Math.round(limits.maxUploadBytes / 1024 / 1024)} MB`,
      details: { maxUploadBytes: limits.maxUploadBytes },
    };
  }
  if (opLimitReached(await usage.classCount('A'), limits.classALimit)) {
    return { ok: false, status: 503, code: 'MEDIA_OP_LIMIT_REACHED', message: 'media operation limit reached; try later' };
  }

  const art = await processArt(raw, kind);
  if (!art.ok) return refusal(kind, art);

  const hash = createHash('sha256').update(art.bytes).digest('hex');
  const key = artKey(kind, hash);
  const stored = (reused: boolean): StoreArtResult => ({
    ok: true,
    art: {
      key,
      url: storage.publicUrl(key),
      kind,
      width: art.width,
      height: art.height,
      bytes: art.bytes.length,
      contentType: art.contentType,
      trimmed: art.trimmed,
      reused,
    },
  });

  const known = await pool.query<{ confirmed: boolean; taken_down: boolean }>(
    `SELECT confirmed_at IS NOT NULL AS confirmed,
            (scan_status = 'blocked' OR quarantine_state IS NOT NULL) AS taken_down
       FROM media_uploads WHERE key = $1`,
    [key],
  );
  const takenDown = await pool.query(
    `SELECT 1 FROM media_uploads
      WHERE content_sha256 = $1 AND (scan_status = 'blocked' OR quarantine_state IS NOT NULL) LIMIT 1`,
    [hash],
  );
  if (known.rows[0]?.taken_down || takenDown.rowCount) {
    return { ok: false, status: 422, code: 'IMAGE_REJECTED', message: 'this picture was removed by moderation' };
  }
  // already the art of an item: stored, and staying stored
  if (known.rows[0]?.confirmed) return stored(true);

  if (wouldExceedStorage(await usage.totalStoredBytes(), art.bytes.length, limits.storageLimitBytes)) {
    return { ok: false, status: 507, code: 'MEDIA_STORAGE_LIMIT_REACHED', message: 'storage limit reached; new uploads are paused' };
  }

  // held unconfirmed until an item uses it; the same picture again restarts its day
  await pool.query(
    `INSERT INTO media_uploads (key, content_type, content_length, scan_status, kind, width, height, content_sha256)
     VALUES ($1, $2, $3, 'cleared', $4, $5, $6, $7)
     ON CONFLICT (key) DO UPDATE SET content_length = EXCLUDED.content_length, created_at = now(),
       width = EXCLUDED.width, height = EXCLUDED.height`,
    [key, art.contentType, art.bytes.length, artUploadKind(kind), art.width, art.height, hash],
  );
  try {
    await storage.put(key, art.bytes, art.contentType);
    await usage.recordOps('A');
  } catch (err) {
    log.error({ err, key }, 'shop art put failed');
    return { ok: false, status: 502, code: 'MEDIA_UPLOAD_FAILED', message: 'could not store the picture; please try again' };
  }
  return stored(Boolean(known.rows[0]));
}

export type ArtClaim = { ok: true } | { ok: false; code: 'ART_MISSING' | 'ART_WRONG_KIND'; message: string };

/**
 * Hold on to uploaded art for an item, inside the caller's transaction.
 *
 * Built-in art (a file the site ships) needs nothing. Uploaded art must have
 * been uploaded here, as this kind, and not been swept: an upload left unused
 * for a day is gone, and saving an item with it would sell a blank square.
 */
export async function claimArt(executor: Pick<pg.PoolClient, 'query'>, key: string | null, category: string): Promise<ArtClaim> {
  if (!key || !isUploadedArtKey(key)) return { ok: true };
  const kind = uploadedArtKind(key);
  // a background takes background art; everything else (an icon, a power-up, a badge's slot…) a square picture
  const wanted = artKindFor(category);
  if (kind !== wanted) {
    const a = (k: string): string => (k === 'icon' ? 'a square picture' : `a ${k}`);
    return { ok: false, code: 'ART_WRONG_KIND', message: `that picture was uploaded as ${a(kind ?? '')}, not ${a(wanted)}` };
  }
  const row = await executor.query<{ kind: string | null; usable: boolean }>(
    `SELECT kind, (scan_status = 'cleared' AND quarantine_state IS NULL) AS usable
       FROM media_uploads WHERE key = $1 FOR UPDATE`,
    [key],
  );
  const found = row.rows[0];
  if (!found || found.kind !== artUploadKind(kind) || !found.usable) {
    return { ok: false, code: 'ART_MISSING', message: 'that picture is no longer stored; upload it again' };
  }
  await executor.query(`UPDATE media_uploads SET confirmed_at = now() WHERE key = $1 AND confirmed_at IS NULL`, [key]);
  return { ok: true };
}

/**
 * Let go of uploaded art no item uses any more, inside the caller's
 * transaction (after the item has been changed or deleted): unconfirmed, so
 * the orphan sweep deletes it a day from now. Art another item, a change
 * waiting in Approvals, a replaced picture (art/overrides.ts) or the offline
 * screen (maintenance/service.ts) still names is kept. Answers whether it was let go.
 */
export async function releaseArt(executor: Pick<pg.PoolClient, 'query'>, key: string | null): Promise<boolean> {
  if (!key || !isUploadedArtKey(key)) return false;
  const used = await executor.query(
    `SELECT 1 FROM shop_items WHERE asset_key = $1
     UNION ALL
     SELECT 1 FROM admin_config_changes
      WHERE status = 'pending' AND target = 'shop_item' AND payload->>'assetKey' = $1
     UNION ALL
     SELECT 1 FROM art_overrides WHERE asset_key = $1
     UNION ALL
     SELECT 1 FROM maintenance WHERE asset_key = $1
     LIMIT 1`,
    [key],
  );
  if (used.rowCount) return false;
  const res = await executor.query(
    `UPDATE media_uploads SET confirmed_at = NULL, created_at = now() WHERE key = $1 AND confirmed_at IS NOT NULL`,
    [key],
  );
  return (res.rowCount ?? 0) > 0;
}
