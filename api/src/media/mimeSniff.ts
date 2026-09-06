/**
 * Server-side image type detection by magic bytes (KUR-177 hardening). The
 * client-declared Content-Type and filename are never trusted — we sniff the
 * actual file header. Returns the real type, or null for anything that isn't a
 * supported image (so non-images / malformed files are rejected).
 */
export type SniffedImageType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'image/avif'
  | 'image/tiff';

function startsWith(bytes: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8
// "ftyp" at offset 4 — an ISO-BMFF container. Shared: the same box starts a HEIC
// photo and an m4a voice note, and only the brand at offset 8 tells them apart.
const FTYP = [0x66, 0x74, 0x79, 0x70];

/**
 * ISO-BMFF brands, read at offset 8.
 *
 * This is the container iPhones write photos in, which is why it matters: a
 * phone's camera roll is HEIC, no desktop browser decodes it, and refusing it
 * here means the most common source of photographs cannot be posted at all.
 * `sharp` reads both of these and the pipeline re-encodes everything to WebP,
 * so nothing downstream ever sees the original format.
 */
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
const AVIF_BRANDS = ['avif', 'avis'];

// TIFF, by byte order: "II*\0" little-endian, "MM\0*" big-endian. Same reasoning
// as HEIC — a real photo format that no browser will draw.
const TIFF_LE = [0x49, 0x49, 0x2a, 0x00];
const TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a];

function brandAt8(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  return String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
}

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, PNG)) return 'image/png';
  // WebP = RIFF container with a "WEBP" fourcc at byte 8
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  if (startsWith(bytes, TIFF_LE) || startsWith(bytes, TIFF_BE)) return 'image/tiff';
  if (startsWith(bytes, FTYP, 4)) {
    const brand = brandAt8(bytes);
    if (brand && HEIC_BRANDS.includes(brand)) return 'image/heic';
    if (brand && AVIF_BRANDS.includes(brand)) return 'image/avif';
  }
  return null;
}

/** Audio types accepted for voice notes (KUR-282). */
export type SniffedAudioType = 'audio/mpeg' | 'audio/mp4';

const ID3 = [0x49, 0x44, 0x33]; // "ID3" — MP3 with an ID3v2 tag

/**
 * Audio type by magic bytes (KUR-282). Recognises MP3 (ID3 tag or a raw MPEG
 * frame-sync 0xFFEx) and the ISO base-media container used by m4a/aac (`ftyp` box
 * at offset 4). The client's declared type is never trusted — we sniff the header.
 */
export function sniffAudioType(bytes: Uint8Array): SniffedAudioType | null {
  if (startsWith(bytes, ID3)) return 'audio/mpeg';
  // raw MPEG audio frame sync: 11 set bits → 0xFF then 0xE0..0xFF
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return 'audio/mpeg';
  // m4a / aac / mp4 audio: "ftyp" box at byte 4
  if (startsWith(bytes, FTYP, 4)) return 'audio/mp4';
  return null;
}
