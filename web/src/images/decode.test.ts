import { describe, it, expect, vi, afterEach } from 'vitest';
import { decodePicture, shouldHaveDecoded, sniffPictureFormat } from './decode';

afterEach(() => vi.unstubAllGlobals());

const bytes = (...b: number[]) => new Blob([new Uint8Array([...b, ...Array(16).fill(0)])]);

describe('sniffPictureFormat', () => {
  it('reads the bytes, not the name or the declared type', async () => {
    // named .png, declared image/png, and actually a JPEG — the name and the
    // type both come from whatever handed the file over, and both can be wrong
    const lying = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])], 'photo.png', { type: 'image/png' });
    expect(await sniffPictureFormat(lying)).toBe('jpeg');
  });

  it('knows the formats a browser always draws', async () => {
    expect(await sniffPictureFormat(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('png');
    expect(await sniffPictureFormat(bytes(0xff, 0xd8, 0xff))).toBe('jpeg');
    expect(await sniffPictureFormat(bytes(0x47, 0x49, 0x46, 0x38))).toBe('gif');
    expect(await sniffPictureFormat(bytes(0x42, 0x4d))).toBe('bmp');
    expect(
      await sniffPictureFormat(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)),
    ).toBe('webp');
  });

  it('knows the ones it may not', async () => {
    const bmff = (brand: string) =>
      bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((c) => c.charCodeAt(0)));
    expect(await sniffPictureFormat(bmff('heic'))).toBe('heic');
    expect(await sniffPictureFormat(bmff('avif'))).toBe('avif');
    expect(await sniffPictureFormat(bytes(0x49, 0x49, 0x2a, 0x00))).toBe('tiff');
    expect(await sniffPictureFormat(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
  });
});

describe('shouldHaveDecoded', () => {
  it('separates "your browser cannot" from "this should have worked"', () => {
    // the screenshot case: a PNG that failed is not a format problem, and the
    // app must not tell someone to convert a file that is already fine
    expect(shouldHaveDecoded('png')).toBe(true);
    expect(shouldHaveDecoded('jpeg')).toBe(true);
    expect(shouldHaveDecoded('heic')).toBe(false);
    expect(shouldHaveDecoded('tiff')).toBe(false);
    expect(shouldHaveDecoded(null)).toBe(false);
  });
});

describe('decodePicture', () => {
  it('prefers the bitmap route, which needs no object URL at all', async () => {
    const bitmap = { width: 800, height: 600, close: vi.fn() };
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const createObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL });

    const decoded = await decodePicture(new Blob([new Uint8Array([1, 2, 3])]));

    expect(decoded).toMatchObject({ width: 800, height: 600 });
    expect(createImageBitmap).toHaveBeenCalledOnce();
    // the whole point: no URL is created, so none can be revoked mid-read
    expect(createObjectURL).not.toHaveBeenCalled();
    decoded!.release();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('falls back to an <img> when the bitmap route cannot', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('no decoder'); }));
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    class Img {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 640;
      naturalHeight = 480;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', Img);

    const decoded = await decodePicture(new Blob([new Uint8Array([1, 2, 3])]));
    expect(decoded).toMatchObject({ width: 640, height: 480 });
  });

  it('returns null only when neither route can read it', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('no decoder'); }));
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    class Img {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', Img);

    expect(await decodePicture(new Blob([new Uint8Array([1, 2, 3])]))).toBeNull();
  });

  it('treats a zero-sized bitmap as a failure, not a picture', async () => {
    // createImageBitmap can resolve with nothing usable; drawing that is a blank
    const bitmap = { width: 0, height: 0, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    class Img {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 320;
      naturalHeight = 240;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', Img);

    // it does not stop there — the <img> route still gets its turn
    expect(await decodePicture(new Blob([new Uint8Array([1])]))).toMatchObject({ width: 320 });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
