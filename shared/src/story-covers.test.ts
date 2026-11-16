import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { STORY_CATEGORY_SLUG_PATTERN, STORY_COVER_MAX } from './stories.js';
import { STORY_COVERS, STORY_COVER_DIR, STORY_RUGS, isStoryCover, storyCover, storyCoverFor, storyCoverPath, storyRugFor } from './story-covers.js';

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

  it('keep the seven kilims as the rugs, each with a plain colour that is its picture’s own', async () => {
    expect(STORY_RUGS.map((r) => r.key)).toEqual(['kilima-sor', 'kilima-mor', 'kilima-zer', 'kilima-kesk', 'kilima-sin', 'kilima-gulan', 'kilima-seve']);
    // the same seven the admin offers as covers, in the same order
    expect(STORY_COVERS.filter((c) => c.kind === 'kilim')).toEqual(STORY_RUGS);
    expect(new Set(STORY_RUGS.map((r) => r.ground)).size).toBe(STORY_RUGS.length);
    for (const r of STORY_RUGS) {
      expect(r.ground, r.key).toMatch(/^#[0-9a-f]{6}$/);
      // a rug painted again in other colours needs its ground measured again: each channel stays near the picture's mean
      const { channels } = await sharp(onDisk(r.file)).removeAlpha().stats();
      const ground = [1, 3, 5].map((at) => parseInt(r.ground.slice(at, at + 2), 16));
      channels.slice(0, 3).forEach((ch, i) => expect(Math.abs(ch.mean - ground[i]!), `${r.key} channel ${i}`).toBeLessThanOrEqual(16));
    }
  });

  it('give a story without a cover one of the rugs by its slug: always the same one, and a shelf of them varied', () => {
    expect(storyRugFor('kmr-qelema-sin')).toBe(storyRugFor('kmr-qelema-sin'));
    // held to the rugs these stories lie on now: a change to the hash would move every story in the library to another rug
    expect(['kmr-qelema-sin', 'ckb-warm-bread', 'road-01-mevan-cay-u-sev', 'kmr-rovi-u-hirc'].map((slug) => storyRugFor(slug).key)).toEqual([
      'kilima-kesk',
      'kilima-gulan',
      'kilima-seve',
      'kilima-zer',
    ]);
    const counts = new Map<string, number>();
    for (let i = 0; i < 140; i++) {
      const key = storyRugFor(`kmr-cirok-${i}`).key;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // every rug is used, and none by more than twice its share
    expect([...counts.keys()].sort()).toEqual(STORY_RUGS.map((r) => r.key).sort());
    for (const [key, n] of counts) expect(n, key).toBeLessThanOrEqual(40);
    // a slug of any shape still gets one
    for (const odd of ['', 'a', 'ڕێگای-گوند']) expect(STORY_RUGS).toContain(storyRugFor(odd));
  });

  it('say what to draw for a story: its own picture when its key is known, otherwise its rug, and a plain ground under either', () => {
    const rug = storyRugFor('kmr-reya-gund');
    // a painted scene of its own, over the colour of the rug it would otherwise have had
    expect(storyCoverFor({ slug: 'kmr-reya-gund', cover: 'gola-sin' })).toEqual({
      cover: storyCover('gola-sin'),
      path: '/cosmetics/backgrounds/made-06-gola-sin.webp',
      ground: rug.ground,
    });
    expect(storyCoverFor({ slug: 'kmr-mem-u-zin', cover: 'mem-u-zin' }).path).toBe('/cosmetics/backgrounds/story-mem-u-zin.webp');
    // a kilim an editor chose is drawn on its own colour, whatever the slug would have given
    const chosen = STORY_RUGS.find((r) => r.key !== rug.key)!;
    expect(storyCoverFor({ slug: 'kmr-reya-gund', cover: chosen.key })).toEqual({ cover: chosen, path: `/cosmetics/backgrounds/${chosen.file}`, ground: chosen.ground });
    // none chosen, or a key from before a picture was taken out: the story’s rug
    for (const none of [null, undefined, '', 'hamo', 'made-06-gola-sin']) {
      expect(storyCoverFor({ slug: 'kmr-reya-gund', cover: none })).toEqual({ cover: rug, path: `/cosmetics/backgrounds/${rug.file}`, ground: rug.ground });
    }
    expect(storyCoverFor({ slug: 'kmr-reya-gund' }).cover).toBe(rug);
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
