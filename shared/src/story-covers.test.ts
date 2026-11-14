import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { STORY_CATEGORY_SLUG_PATTERN, STORY_COVER_MAX } from './stories.js';
import { STORY_COVERS, STORY_COVER_DIR, isStoryCover, storyCover, storyCoverPath } from './story-covers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const onDisk = (file: string): string => join(ROOT, 'web/public', STORY_COVER_DIR, file);
const LEGENDS = ['kawa', 'sahmaran', 'mem-u-zin', 'siyabend', 'dimdim'];

describe('the story covers', () => {
  it('are the legends’ own covers and the shop’s backgrounds, each once, keyed the way a story stores a cover', () => {
    expect(STORY_COVERS).toHaveLength(32);
    expect(new Set(STORY_COVERS.map((c) => c.key)).size).toBe(STORY_COVERS.length);
    for (const c of STORY_COVERS) {
      expect(c.key).toMatch(STORY_CATEGORY_SLUG_PATTERN);
      expect(c.key.length).toBeLessThanOrEqual(STORY_COVER_MAX);
      expect(c.file).toMatch(new RegExp(`^(made-\\d{2}|story)-${c.key}\\.webp$`));
      expect(c.ku.trim()).not.toBe('');
      expect(c.en.trim()).not.toBe('');
    }
    // the shop’s are numbered in its order, with no gap
    const shop = STORY_COVERS.filter((c) => c.file.startsWith('made-'));
    expect(shop).toHaveLength(27);
    expect(shop.map((c) => Number(c.file.slice(5, 7)))).toEqual(shop.map((_, i) => i + 1));
    expect(STORY_COVERS.filter((c) => c.kind === 'kilim').map((c) => c.key)).toEqual(
      ['kilima-sor', 'kilima-mor', 'kilima-zer', 'kilima-kesk', 'kilima-sin', 'kilima-gulan', 'kilima-seve'],
    );
    // the legends’ own come first, painted scenes named for the legend rather than numbered
    const legends = STORY_COVERS.filter((c) => c.file.startsWith('story-'));
    expect(legends.map((c) => c.key)).toEqual(LEGENDS);
    expect(STORY_COVERS.slice(0, LEGENDS.length)).toEqual(legends);
    for (const c of legends) expect(c).toMatchObject({ file: `story-${c.key}.webp`, kind: 'scene' });
  });

  it('find a cover by its key and say where its picture is', () => {
    expect(storyCover('gola-sin')).toMatchObject({ en: 'Blue lake', kind: 'scene' });
    expect(storyCoverPath('gola-sin')).toBe('/cosmetics/backgrounds/made-06-gola-sin.webp');
    expect(storyCover('mem-u-zin')).toMatchObject({ ku: 'Mem û Zîn', kind: 'scene' });
    expect(storyCoverPath('kawa')).toBe('/cosmetics/backgrounds/story-kawa.webp');
    expect(isStoryCover('kilima-sor')).toBe(true);
    expect(isStoryCover('dimdim')).toBe(true);
    for (const missing of [null, undefined, '', 'made-06-gola-sin', 'story-kawa', 'nowhere']) {
      expect(storyCover(missing)).toBeNull();
      expect(storyCoverPath(missing)).toBeNull();
      expect(isStoryCover(missing)).toBe(false);
    }
  });

  it('each have a picture on the website, the shop’s size and no heavier', async () => {
    for (const c of STORY_COVERS) {
      const file = onDisk(c.file);
      const meta = await sharp(file).metadata();
      expect([c.key, meta.format, meta.width, meta.height]).toEqual([c.key, 'webp', 1280, 720]);
      expect(statSync(file).size, c.key).toBeLessThanOrEqual(120 * 1024);
    }
  });

  // (one is painted again — seconds, not milliseconds — and compared with what ships)
  it('is what the script paints: painted again, the same picture', async () => {
    const out = mkdtempSync(join(tmpdir(), 'hevalo-story-cover-'));
    try {
      execFileSync(process.execPath, [join(ROOT, 'scripts/cosmetic-art/story-covers.mjs'), '--out', out, '--only', 'kawa'], { cwd: ROOT, stdio: 'pipe' });
      const fresh = readFileSync(join(out, 'web/public/cosmetics/backgrounds/story-kawa.webp'));
      const shipped = readFileSync(onDisk('story-kawa.webp'));
      if (fresh.equals(shipped)) return;
      // a different build of the encoder may differ by a hair; a picture drawn differently differs by far more
      const [a, b] = await Promise.all([sharp(fresh).raw().toBuffer(), sharp(shipped).raw().toBuffer()]);
      expect(a.length).toBe(b.length);
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
      expect(sum / a.length).toBeLessThanOrEqual(1.5);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 90_000);
});
