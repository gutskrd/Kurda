/**
 * File type detection by magic bytes. The declared Content-Type and filename are never trusted; the header is read,
 * and anything not a supported type returns null.
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
// "ftyp" at offset 4 starts an ISO-BMFF container, shared by HEIC photos and m4a audio; the brand at offset 8 tells them apart.
const FTYP = [0x66, 0x74, 0x79, 0x70];

/**
 * ISO-BMFF brands at offset 8 for HEIC, the format phone camera rolls use and no desktop browser decodes. sharp reads
 * them and everything is re-encoded to WebP, so nothing downstream sees the original format.
 */
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
const AVIF_BRANDS = ['avif', 'avis'];

// TIFF by byte order ("II*\0" little-endian, "MM\0*" big-endian): a real photo format browsers will not draw.
const TIFF_LE = [0x49, 0x49, 0x2a, 0x00];
const TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a];

function brandAt8(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  return String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
}

/**
 * Whether the leading ftyp box's size, its first four bytes, is one a real file has: whole brands, inside the file.
 * Without this, text such as `<!--ftypavif-->` passes the brand check, and the decoder then reads the file as SVG.
 */
function ftypFits(bytes: Uint8Array): boolean {
  const size = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  return size >= 16 && size % 4 === 0 && size <= bytes.length;
}

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, PNG)) return 'image/png';
  // WebP = RIFF container with a "WEBP" fourcc at byte 8
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  if (startsWith(bytes, TIFF_LE) || startsWith(bytes, TIFF_BE)) return 'image/tiff';
  if (startsWith(bytes, FTYP, 4) && ftypFits(bytes)) {
    const brand = brandAt8(bytes);
    if (brand && HEIC_BRANDS.includes(brand)) return 'image/heic';
    if (brand && AVIF_BRANDS.includes(brand)) return 'image/avif';
  }
  return null;
}

/** Audio types accepted for voice notes. */
export type SniffedAudioType = 'audio/mpeg' | 'audio/mp4' | 'audio/webm' | 'audio/wav';

const WAVE = [0x57, 0x41, 0x56, 0x45]; // "WAVE" at offset 8 of a RIFF file

const ID3 = [0x49, 0x44, 0x33]; // "ID3" — MP3 with an ID3v2 tag

// EBML header — the container Matroska and WebM share.
const EBML = [0x1a, 0x45, 0xdf, 0xa3];
// "webm", the DocType value that separates a WebM from a Matroska file.
const WEBM_DOCTYPE = [0x77, 0x65, 0x62, 0x6d];

/**
 * Whether an EBML stream is WebM rather than Matroska: the DocType (id 0x4282) sits in the header at the start, so a
 * fixed window is scanned instead of parsing the element tree, which keeps malformed files cheap.
 */
function isWebm(bytes: Uint8Array): boolean {
  const window = Math.min(bytes.length, 64);
  for (let i = 0; i + 6 < window; i++) {
    if (bytes[i] === 0x42 && bytes[i + 1] === 0x82 && startsWith(bytes, WEBM_DOCTYPE, i + 3)) return true;
  }
  return false;
}

/**
 * Audio type by magic bytes: MP3 (an ID3 tag or MPEG frame sync 0xFFEx), the ISO base-media container of m4a/aac
 * (`ftyp` at offset 4), and WebM, which browser recording produces. A WebM can carry video as an mp4 can; both are
 * bounded by the same upload cap.
 */
export function sniffAudioType(bytes: Uint8Array): SniffedAudioType | null {
  if (startsWith(bytes, ID3)) return 'audio/mpeg';
  // raw MPEG audio frame sync: 11 set bits → 0xFF then 0xE0..0xFF
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return 'audio/mpeg';
  // m4a / aac / mp4 audio: "ftyp" box at byte 4
  if (startsWith(bytes, FTYP, 4)) return 'audio/mp4';
  if (startsWith(bytes, EBML) && isWebm(bytes)) return 'audio/webm';
  // WAV (RIFF with "WAVE" at byte 8) is allowed only for the audio studio (alphabet/routes.ts, lessonaudio/routes.ts);
  // voice notes keep their own allow-list.
  if (startsWith(bytes, RIFF) && startsWith(bytes, WAVE, 8)) return 'audio/wav';
  return null;
}

/** What a recording may be played back as, beyond what may be uploaded. */
export type SniffedPlayableAudioType = SniffedAudioType | 'audio/ogg' | 'audio/flac';

const OGG = [0x4f, 0x67, 0x67, 0x53]; // "OggS"
const FLAC = [0x66, 0x4c, 0x61, 0x43]; // "fLaC"

/**
 * Audio type for a recording only read back, never stored: the upload types plus the Ogg and FLAC files other sites'
 * pronunciations come in. Uploads keep `sniffAudioType`, which accepts neither.
 */
export function sniffPlayableAudioType(bytes: Uint8Array): SniffedPlayableAudioType | null {
  const uploaded = sniffAudioType(bytes);
  if (uploaded) return uploaded;
  if (startsWith(bytes, OGG)) return 'audio/ogg';
  if (startsWith(bytes, FLAC)) return 'audio/flac';
  return null;
}
