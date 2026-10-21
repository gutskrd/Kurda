/**
 * The shop's art, the stickers, the filter's flag and the admin's backdrop are
 * drawn by scripts/generate-cosmetic-art.mjs — and this is what holds that to
 * be true of the files that ship.
 *
 * It runs the generator into a temporary folder and compares what comes out
 * with what is committed. The same script makes the same SVG on every machine
 * (checked first), and sharp and the compositor's arithmetic turn the
 * same SVG into the same pixels; the comparison is byte-for-byte where it can
 * be and pixel-for-pixel within a hair where an encoder build differs, so a
 * picture that was edited or swapped by hand fails here while a different
 * libwebp does not.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Named {
  ku: string;
  en: string;
}
interface Generator {
  BACKGROUNDS: (Named & { key: string })[];
  ICONS: (Named & { key: string })[];
  STICKERS: (Named & { file: string })[];
  BG: { width: number; height: number; maxBytes: number };
  ICON: { size: number; maxBytes: number };
  STICKER: { size: number; maxBytes: number };
  OVERLAY: { size: number; maxBytes: number };
  OVERLAY_FILE: string;
  ADMIN_FILE: string;
  backgroundSvg(piece: unknown): string;
  iconSvg(piece: unknown): string;
  stickerSvg(piece: unknown): string;
  backgroundFile(piece: unknown, i: number): string;
  iconFile(piece: unknown, i: number): string;
  stickerFile(piece: unknown): string;
  renderAll(out: string): Promise<string[]>;
}

const load = async (): Promise<Generator> =>
  (await import(pathToFileURL(join(ROOT, 'scripts', 'generate-cosmetic-art.mjs')).href)) as Generator;

describe('the cosmetic art generator', () => {
  let gen: Generator;
  let out = '';
  let written: string[] = [];

  beforeAll(async () => {
    gen = await load();
    out = mkdtempSync(join(tmpdir(), 'hevalo-art-'));
    written = await gen.renderAll(out);
  }, 240_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it('draws at least 24 backgrounds and 12 icons, each with a Kurdish and an English name', () => {
    expect(gen.BACKGROUNDS.length).toBeGreaterThanOrEqual(24);
    expect(gen.ICONS.length).toBeGreaterThanOrEqual(12);
    for (const piece of [...gen.BACKGROUNDS, ...gen.ICONS, ...gen.STICKERS]) {
      expect(piece.ku.trim().length).toBeGreaterThan(0);
      expect(piece.en.trim().length).toBeGreaterThan(0);
    }
    const keys = [...gen.BACKGROUNDS, ...gen.ICONS].map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // (every scene laid up twice over, grass blade by blade and blossom by blossom: seconds, not milliseconds)
  it('writes the same SVG every time it is asked', () => {
    for (const piece of gen.BACKGROUNDS) expect(gen.backgroundSvg(piece)).toBe(gen.backgroundSvg(piece));
    for (const piece of gen.ICONS) expect(gen.iconSvg(piece)).toBe(gen.iconSvg(piece));
    for (const piece of gen.STICKERS) expect(gen.stickerSvg(piece)).toBe(gen.stickerSvg(piece));
  }, 120_000);

  it('writes every file it promises, and nothing else', () => {
    const expected = [
      ...gen.BACKGROUNDS.map((p, i) => gen.backgroundFile(p, i)),
      ...gen.ICONS.map((p, i) => gen.iconFile(p, i)),
      ...gen.STICKERS.map((p) => gen.stickerFile(p)),
      gen.OVERLAY_FILE,
      gen.ADMIN_FILE,
    ];
    expect([...written].sort()).toEqual([...expected].sort());
  });

  it('keeps every file to its size and format', async () => {
    for (const [i, piece] of gen.BACKGROUNDS.entries()) {
      const file = join(out, gen.backgroundFile(piece, i));
      const meta = await sharp(file).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['webp', gen.BG.width, gen.BG.height]);
      expect(readFileSync(file).length).toBeLessThanOrEqual(gen.BG.maxBytes);
    }
    for (const [i, piece] of gen.ICONS.entries()) {
      const file = join(out, gen.iconFile(piece, i));
      const meta = await sharp(file).metadata();
      expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['png', gen.ICON.size, gen.ICON.size, true]);
      expect(readFileSync(file).length).toBeLessThanOrEqual(gen.ICON.maxBytes);
    }
    for (const piece of gen.STICKERS) {
      const file = join(out, gen.stickerFile(piece));
      const meta = await sharp(file).metadata();
      expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['webp', gen.STICKER.size, gen.STICKER.size, true]);
      expect(readFileSync(file).length).toBeLessThanOrEqual(gen.STICKER.maxBytes);
    }
    const overlay = await sharp(join(out, gen.OVERLAY_FILE)).metadata();
    expect([overlay.format, overlay.width, overlay.height, overlay.hasAlpha]).toEqual(['webp', gen.OVERLAY.size, gen.OVERLAY.size, true]);
    expect((await sharp(join(out, gen.ADMIN_FILE)).metadata()).format).toBe('jpeg');
  });

  /**
   * What is committed is what the generator draws.
   *
   * Equal bytes settle it. Otherwise both are decoded and must agree to within
   * a level and a half per channel on average — what re-encoding the same
   * pixels at a different WebP quality comes to, and far below what a
   * substituted picture would — with hardly a pixel far off, so a patch
   * painted over one corner is caught as well.
   */
  it('matches every committed file', async () => {
    const drift: string[] = [];
    for (const rel of written) {
      const fresh = readFileSync(join(out, rel));
      const committed = readFileSync(join(ROOT, rel));
      if (fresh.equals(committed)) continue;
      const a = await sharp(fresh).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const b = await sharp(committed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
        drift.push(`${rel}: ${b.info.width}×${b.info.height}, generator draws ${a.info.width}×${a.info.height}`);
        continue;
      }
      let sum = 0;
      let far = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        let worst = 0;
        for (let c = 0; c < 4; c++) {
          const d = Math.abs(a.data[i + c]! - b.data[i + c]!);
          sum += d;
          if (d > worst) worst = d;
        }
        if (worst > 48) far += 1;
      }
      const mean = sum / a.data.length;
      const pixels = a.info.width * a.info.height;
      if (mean > 1.5) drift.push(`${rel}: differs by ${mean.toFixed(2)} levels on average`);
      else if (far > pixels / 1000) drift.push(`${rel}: ${far} pixels differ sharply`);
    }
    // run `node scripts/generate-cosmetic-art.mjs` and commit what it writes
    expect(drift).toEqual([]);
  }, 120_000);
});
