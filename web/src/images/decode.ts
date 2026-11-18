/**
 * Decodes a chosen file for a canvas. `createImageBitmap` comes first because it needs no object URL, whose revoke
 * timing caused every bug here; the `<img>` route stays as a fallback, since SVG decodes there more reliably.
 */

export interface DecodedPicture {
  /** Drawable by canvas: an ImageBitmap, or a loaded <img>. */
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Frees the bitmap's memory; a no-op for the <img> route. */
  release: () => void;
}

/** Decodes via ImageBitmap, with no URL to revoke. */
async function viaBitmap(file: Blob): Promise<DecodedPicture | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    // A zero-sized decode is a failure reported as success.
    if (bitmap.width === 0 || bitmap.height === 0) {
      bitmap.close();
      return null;
    }
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    return null;
  }
}

/** Decodes via an <img> and an object URL, revoked only once it has settled. */
function viaImageElement(file: Blob): Promise<DecodedPicture | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      resolve(width && height ? { source: img, width, height, release: () => undefined } : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Decodes a picture, or null when this browser has no decoder for it (often HEIC on desktop), which is not a broken file. */
export async function decodePicture(file: Blob): Promise<DecodedPicture | null> {
  return (await viaBitmap(file)) ?? (await viaImageElement(file));
}

/** Formats every current browser draws; failing to decode one of these is a fault. */
const UNIVERSAL = new Set(['png', 'jpeg', 'gif', 'webp', 'bmp']);

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0): boolean =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

/** The first `n` bytes, sliced so a large file is never read whole; FileReader where `arrayBuffer()` is missing (jsdom). */
async function readHead(file: Blob, n: number): Promise<Uint8Array> {
  const part = file.slice(0, n);
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer());
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    // An unreadable head is treated as an unknown format.
    reader.onerror = () => resolve(new Uint8Array());
    reader.readAsArrayBuffer(part);
  });
}

/** What the bytes are, whatever the name and declared type say; used only to word a failure honestly. */
export async function sniffPictureFormat(file: Blob): Promise<string | null> {
  const head = await readHead(file, 16);
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (startsWith(head, [0x42, 0x4d])) return 'bmp';
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(head[8]!, head[9]!, head[10]!, head[11]!);
    if (brand.startsWith('avi')) return 'avif';
    return 'heic';
  }
  return null;
}

/** True when a format that should always decode did not. */
export function shouldHaveDecoded(format: string | null): boolean {
  return format !== null && UNIVERSAL.has(format);
}
