/**
 * The checks and re-encoding an uploaded background or icon goes through
 * (shop/art.ts `processArt`), on pictures made here: no bucket, no database.
 */
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ART_SPECS, artKey, processArt } from './art.js';

/** A flat picture with a shape on it, so it is a picture and not a single colour. */
async function picture(width: number, height: number, format: 'png' | 'jpeg' | 'webp' = 'png', alpha = false): Promise<Buffer> {
  const channels = alpha ? 4 : 3;
  const background = alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 40, g: 90, b: 150 };
  const r = Math.round(Math.min(width, height) / 3);
  const circle = Buffer.from(
    `<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${r}" fill="#e8b84a"/></svg>`,
  );
  const img = sharp({ create: { width, height, channels, background } }).composite([{ input: circle }]);
  return format === 'png' ? img.png().toBuffer() : format === 'jpeg' ? img.jpeg().toBuffer() : img.webp().toBuffer();
}

/** Pixels that do not compress: every one a different colour. */
async function noise(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 7;
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = seed >> 16;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe('a background upload', () => {
  it('is stored as a 16:9 WebP within the weight the shipped art has', async () => {
    const art = await processArt(await picture(1920, 1080, 'jpeg'), 'background');
    expect(art.ok).toBe(true);
    if (!art.ok) return;
    expect(art).toMatchObject({ contentType: 'image/webp', width: 1920, height: 1080, trimmed: false });
    expect(art.bytes.length).toBeLessThanOrEqual(ART_SPECS.background.maxBytes);
    const meta = await sharp(art.bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1920, 1080]);
  });

  it('is scaled down to 1920×1080, never up', async () => {
    const big = await processArt(await picture(3840, 2160, 'png'), 'background');
    expect(big.ok && [big.width, big.height]).toEqual([1920, 1080]);
    const small = await processArt(await picture(1280, 720, 'webp'), 'background');
    expect(small.ok && [small.width, small.height]).toEqual([1280, 720]);
  });

  it('has a sliver trimmed from the centre when it is a few pixels off 16:9', async () => {
    const art = await processArt(await picture(1940, 1080), 'background');
    expect(art.ok).toBe(true);
    if (!art.ok) return;
    expect(art).toMatchObject({ width: 1920, height: 1080, trimmed: true });
  });

  it('is refused when it is another shape, rather than losing a quarter of itself', async () => {
    expect(await processArt(await picture(1600, 1200), 'background')).toEqual({ ok: false, reason: 'wrong-shape', width: 1600, height: 1200 });
    expect(await processArt(await picture(1080, 1920), 'background')).toMatchObject({ ok: false, reason: 'wrong-shape' });
  });

  it('is refused when it is too small to look sharp', async () => {
    expect(await processArt(await picture(960, 540), 'background')).toEqual({ ok: false, reason: 'too-small', width: 960, height: 540 });
  });

  it('is refused when it is too detailed to fit the weight', async () => {
    expect(await processArt(await noise(1280, 720), 'background')).toMatchObject({ ok: false, reason: 'too-large-after-compression' });
  });
});

describe('an icon upload', () => {
  it('is stored as a square PNG that keeps its transparency', async () => {
    const art = await processArt(await picture(1024, 1024, 'png', true), 'icon');
    expect(art.ok).toBe(true);
    if (!art.ok) return;
    expect(art).toMatchObject({ contentType: 'image/png', width: 512, height: 512 });
    expect(art.bytes.length).toBeLessThanOrEqual(ART_SPECS.icon.maxBytes);
    const meta = await sharp(art.bytes).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['png', 512, 512, true]);
    // the corner is still see-through, the middle still painted
    const { data, info } = await sharp(art.bytes).raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number): number => data[(y * info.width + x) * info.channels + 3]!;
    expect(alphaAt(2, 2)).toBe(0);
    expect(alphaAt(256, 256)).toBe(255);
  });

  it('takes a JPEG too, and keeps a smaller one at its own size', async () => {
    const art = await processArt(await picture(300, 300, 'jpeg'), 'icon');
    expect(art.ok && [art.contentType, art.width, art.height]).toEqual(['image/png', 300, 300]);
  });

  it('is refused when it is not square, or too small', async () => {
    expect(await processArt(await picture(600, 400, 'png', true), 'icon')).toMatchObject({ ok: false, reason: 'wrong-shape' });
    expect(await processArt(await picture(128, 128, 'png', true), 'icon')).toMatchObject({ ok: false, reason: 'too-small' });
  });
});

describe('what is not a picture it takes', () => {
  it('refuses SVG, GIF and anything else by its bytes, whatever it is called', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><script>alert(1)</script></svg>');
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64)]);
    const script = Buffer.from('<script>alert(document.domain)</script>');
    for (const bytes of [svg, gif, script]) {
      expect(await processArt(bytes, 'icon')).toEqual({ ok: false, reason: 'invalid-type' });
    }
  });

  it('refuses a picture that is damaged part-way through', async () => {
    const whole = await picture(1920, 1080, 'png');
    expect(await processArt(whole.subarray(0, 400), 'background')).toMatchObject({ ok: false, reason: 'malformed' });
  });
});

describe('art keys', () => {
  it('name the kind and the content, with the stored format', () => {
    const sha = 'a'.repeat(64);
    expect(artKey('background', sha)).toBe(`cosmetic/background/${sha}.webp`);
    expect(artKey('icon', sha)).toBe(`cosmetic/icon/${sha}.png`);
  });
});
