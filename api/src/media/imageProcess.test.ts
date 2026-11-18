import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { DECODED_FORMAT, processImage } from './imageProcess.js';
import { sniffImageType } from './mimeSniff.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const opts = (over: Partial<{ maxDimension: number; maxStoredBytes: number; allowedTypes: Set<string> }> = {}) => ({
  maxDimension: 512,
  maxStoredBytes: 250 * 1024,
  allowedTypes: ALLOWED,
  ...over,
});

const png = (w: number, h: number, bg = { r: 200, g: 30, b: 30 }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: bg } }).png().toBuffer();

/** A one-bit black PNG of any size, written by hand: a few kilobytes that decode to `w` × `h` pixels. */
function bitPng(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 1; // bit depth; colour type 0 (grey), the rest defaults
  const rows = Buffer.alloc((1 + Math.ceil(w / 8)) * h);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const HTML = Buffer.from('<html><script>alert(document.domain)</script></html>');

describe('processImage', () => {
  it('resizes to <= maxDimension and outputs WebP under the size cap', async () => {
    const res = await processImage(await png(1000, 800), opts());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.contentType).toBe('image/webp');
      expect(Math.max(res.width, res.height)).toBeLessThanOrEqual(512);
      expect(res.width).toBe(512); // 1000x800 fit-inside 512 -> 512x410
      expect(res.bytes).toBeLessThanOrEqual(250 * 1024);
    }
  });

  it('does not enlarge a small image', async () => {
    const res = await processImage(await png(100, 100), opts());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.width).toBe(100);
  });

  it('converts a photo format no browser can draw', async () => {
    /* AVIF stands in for HEIC: the same container and decoder, and sharp can write it, so no binary fixture is needed. */
    const avif = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 20, g: 90, b: 160 } } })
      .avif({ quality: 50 })
      .toBuffer();

    const res = await processImage(avif, opts({ allowedTypes: new Set([...ALLOWED, 'image/avif']) }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      // whatever went in, WebP comes out — nothing downstream sees the original
      expect(res.contentType).toBe('image/webp');
      expect(res.width).toBe(512);
    }
  });

  it('blames the missing codec, not the file, when a HEIC will not decode', async () => {
    /*
     * A real HEIC cannot be built here, so this is a well-formed `ftypheic` container with no picture: it sniffs as HEIC
     * and fails to decode, as a genuine photo does on a build without the HEVC decoder, and must not be called corrupt.
     */
    const heicHeader = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypheic'),
      Buffer.from('mif1heic'),
      Buffer.alloc(128),
    ]);

    const res = await processImage(heicHeader, opts({ allowedTypes: new Set([...ALLOWED, 'image/heic']) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('codec-unavailable');
  });

  it('does not blame a codec for a format it can decode', async () => {
    // a truncated PNG is genuinely broken, and should still say so
    const truncated = (await png(64, 64)).subarray(0, 40);
    const res = await processImage(truncated, opts());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('malformed');
  });

  it('rejects a non-image (magic bytes fail)', async () => {
    const res = await processImage(Buffer.from('this is definitely not an image file'), opts());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid-type');
  });

  it('rejects a real-but-disallowed type', async () => {
    const res = await processImage(await png(64, 64), opts({ allowedTypes: new Set(['image/jpeg']) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid-type');
  });

  it('rejects a malformed image (valid header, corrupt body)', async () => {
    const good = await png(64, 64);
    const corrupt = Buffer.concat([good.subarray(0, 40), Buffer.alloc(200, 0x7a)]);
    const res = await processImage(corrupt, opts());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('malformed');
  });

  it('rejects when it cannot compress below the stored-size cap', async () => {
    // an impossibly small cap forces every quality step to overflow
    const res = await processImage(await png(600, 600), opts({ maxStoredBytes: 150 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('too-large-after-compression');
  });

  it('keeps nothing that rode along with the picture: appended files, EXIF with a location, comments', async () => {
    const photo = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 120, b: 60 } } })
      .withExif({ IFD0: { ImageDescription: '<script>alert(1)</script>' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' } })
      .jpeg()
      .toBuffer();
    for (const input of [Buffer.concat([photo, HTML]), Buffer.concat([await png(300, 200), Buffer.from('PK\x03\x04'), HTML]), photo]) {
      const res = await processImage(input, opts());
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const meta = await sharp(res.webp).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      const text = res.webp.toString('latin1');
      for (const mark of ['<script', '<html', 'PK\x03\x04', 'GPS', 'Exif']) expect(text).not.toContain(mark);
    }
  });

  it('keeps one still frame of an animated picture', async () => {
    const frames = await Promise.all([0, 1, 2, 3].map((i) => png(64, 64, { r: i * 60, g: 20, b: 20 })));
    const animated = await sharp(frames, { join: { animated: true } }).webp().toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(4);
    const res = await processImage(animated, opts());
    expect(res.ok).toBe(true);
    if (res.ok) expect((await sharp(res.webp).metadata()).pages ?? 1).toBe(1);
  });

  it('refuses a picture of more pixels than the limit before decoding it, however small the file', async () => {
    const bomb = bitPng(8000, 8000); // 64 MP in a few kilobytes
    expect(bomb.length).toBeLessThan(64 * 1024);
    const refused = await processImage(bomb, opts());
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe('malformed');
    // the same construction under the limit decodes, so the refusal is the limit's
    expect((await processImage(bitPng(6000, 6000), opts())).ok).toBe(true);
  });

  it('refuses an SVG dressed as a HEIF photo', async () => {
    const disguised = Buffer.from('<!--ftypavif--><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script></svg>');
    // sharp itself would draw this as an SVG
    expect((await sharp(disguised).metadata()).format).toBe('svg');
    const res = await processImage(disguised, opts({ allowedTypes: new Set([...ALLOWED, 'image/avif', 'image/heic']) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid-type');
  });

  it('agrees with the decoder about every format it takes', async () => {
    const base = sharp({ create: { width: 80, height: 60, channels: 3, background: { r: 1, g: 2, b: 3 } } });
    const samples = await Promise.all([base.clone().jpeg(), base.clone().png(), base.clone().webp(), base.clone().tiff(), base.clone().avif()].map((s) => s.toBuffer()));
    const all = new Set(Object.keys(DECODED_FORMAT));
    for (const sample of samples) {
      const sniffed = sniffImageType(sample)!;
      expect((await sharp(sample).metadata()).format).toBe(DECODED_FORMAT[sniffed]);
      expect((await processImage(sample, opts({ allowedTypes: all }))).ok).toBe(true);
    }
  });
});
