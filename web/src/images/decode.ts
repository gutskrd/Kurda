/**
 * Turn a chosen file into something a canvas can draw.
 *
 * `createImageBitmap` is tried first because it decodes a Blob directly, with no
 * object URL anywhere. That matters: the `<img>` route needs a URL created,
 * assigned, and revoked at the right moment, and every bug in this area has come
 * from that lifecycle — a URL revoked while the image was still reading it looks
 * exactly like a file that cannot be decoded, and the app then tells you your
 * photograph is unreadable when nothing is wrong with it.
 *
 * The `<img>` route is kept as a fallback rather than deleted, because it is the
 * more forgiving of the two: SVG in particular decodes there and not always
 * through createImageBitmap.
 */

export interface DecodedPicture {
  /** drawable by canvas: an ImageBitmap, or an <img> that finished loading */
  source: CanvasImageSource;
  width: number;
  height: number;
  /** free the bitmap's memory; a no-op for the <img> route */
  release: () => void;
}

/** Decode via ImageBitmap — no URL, nothing to revoke, nothing to race. */
async function viaBitmap(file: Blob): Promise<DecodedPicture | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    // a zero-sized decode is a failure the API reported as success
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

/** Decode via an <img> and an object URL, revoked only once it has settled. */
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

/**
 * Decode a picture, or return null if this browser genuinely cannot.
 *
 * Null means "no decoder for these bytes" — a HEIC on a desktop browser, most
 * often. It does not mean the file is broken, and the caller should not say so.
 */
export async function decodePicture(file: Blob): Promise<DecodedPicture | null> {
  return (await viaBitmap(file)) ?? (await viaImageElement(file));
}

/** Formats every current browser draws. Anything here failing to decode is a fault. */
const UNIVERSAL = new Set(['png', 'jpeg', 'gif', 'webp', 'bmp']);

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0): boolean =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

/**
 * The first `n` bytes, without reading the whole file.
 *
 * Always a slice, so a 26 MB screenshot is never pulled into memory to look at
 * four bytes. `arrayBuffer()` is the modern route; FileReader is the fallback
 * for anywhere a Blob lacks it, jsdom included.
 */
async function readHead(file: Blob, n: number): Promise<Uint8Array> {
  const part = file.slice(0, n);
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer());
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    // an unreadable head is not a format we know; the caller treats null that way
    reader.onerror = () => resolve(new Uint8Array());
    reader.readAsArrayBuffer(part);
  });
}

/**
 * What the bytes actually are, ignoring the name and the type the OS declared.
 *
 * Used only to word a failure honestly. A file called .png that will not decode
 * is either not a PNG — in which case say what it is — or it is a PNG and
 * something else went wrong, in which case blaming the format is a lie.
 */
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

/** True when a format that should always have worked did not. */
export function shouldHaveDecoded(format: string | null): boolean {
  return format !== null && UNIVERSAL.has(format);
}
