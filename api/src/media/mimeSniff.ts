/**
 * Server-side image type detection by magic bytes (KUR-177 hardening). The
 * client-declared Content-Type and filename are never trusted — we sniff the
 * actual file header. Returns the real type, or null for anything that isn't a
 * supported image (so non-images / malformed files are rejected).
 */
export type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

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

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, PNG)) return 'image/png';
  // WebP = RIFF container with a "WEBP" fourcc at byte 8
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  return null;
}
