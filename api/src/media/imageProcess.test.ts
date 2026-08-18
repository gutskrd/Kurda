import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { processProfileImage } from './imageProcess.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const opts = (over: Partial<{ maxDimension: number; maxStoredBytes: number; allowedTypes: Set<string> }> = {}) => ({
  maxDimension: 512,
  maxStoredBytes: 250 * 1024,
  allowedTypes: ALLOWED,
  ...over,
});

const png = (w: number, h: number, bg = { r: 200, g: 30, b: 30 }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: bg } }).png().toBuffer();

describe('processProfileImage', () => {
  it('resizes to <= maxDimension and outputs WebP under the size cap', async () => {
    const res = await processProfileImage(await png(1000, 800), opts());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.contentType).toBe('image/webp');
      expect(Math.max(res.width, res.height)).toBeLessThanOrEqual(512);
      expect(res.width).toBe(512); // 1000x800 fit-inside 512 -> 512x410
      expect(res.bytes).toBeLessThanOrEqual(250 * 1024);
    }
  });

  it('does not enlarge a small image', async () => {
    const res = await processProfileImage(await png(100, 100), opts());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.width).toBe(100);
  });

  it('rejects a non-image (magic bytes fail)', async () => {
    const res = await processProfileImage(Buffer.from('this is definitely not an image file'), opts());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid-type');
  });

  it('rejects a real-but-disallowed type', async () => {
    const res = await processProfileImage(await png(64, 64), opts({ allowedTypes: new Set(['image/jpeg']) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid-type');
  });

  it('rejects a malformed image (valid header, corrupt body)', async () => {
    const good = await png(64, 64);
    const corrupt = Buffer.concat([good.subarray(0, 40), Buffer.alloc(200, 0x7a)]);
    const res = await processProfileImage(corrupt, opts());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('malformed');
  });

  it('rejects when it cannot compress below the stored-size cap', async () => {
    // an impossibly small cap forces every quality step to overflow
    const res = await processProfileImage(await png(600, 600), opts({ maxStoredBytes: 150 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('too-large-after-compression');
  });
});
