import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { FIRE_STAGES } from '../fire-stages.js';
import { FIRE_CYCLE_MS, FIRE_VIEW } from './fire.js';
import {
  FIRE_FLAME_REACH,
  FIRE_ROOT,
  FIRE_SPRITES,
  FIRE_SPRITE_COLS,
  FIRE_SPRITE_FRAMES,
  FIRE_SPRITE_MS,
  FIRE_SPRITE_ROWS,
  fireSpriteCell,
  type FireSprite,
} from './fire-sprites.js';

/*
 * The fire's painted flame: a sheet of frames for every stage that burns,
 * painted by scripts/generate-fire-sprites.mjs and shipped in both apps. What
 * the apps read about the sheets, and the sheets themselves: where each
 * flame stands, that its loop plays round with no seam, that no frame bleeds
 * into its neighbour, that they stay light, and that what ships is what the
 * script paints.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LIT = FIRE_STAGES.filter((s) => s !== 'cold');
const SHEETS = Object.values(FIRE_SPRITES);
const committed = (dir: string, sprite: FireSprite): Buffer => readFileSync(join(ROOT, dir, sprite.file));

/** A sheet's frames, each its alpha alone (how much flame there is at every pixel), in order. */
async function frames(sprite: FireSprite, file = join(ROOT, 'web/public/fire', sprite.file)): Promise<Uint8Array[]> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { w, h } = sprite.frame;
  return Array.from({ length: FIRE_SPRITE_FRAMES }, (_, i) => {
    const { col, row } = fireSpriteCell(i);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = data[((row * h + y) * info.width + col * w + x) * 4 + 3]!;
    return out;
  });
}

/** How far apart two frames are: the mean change of their alpha, 0 to 255. */
function change(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

describe('the painted flame', () => {
  it('has a sheet for every stage that burns, named for it, and none for cold logs', () => {
    expect(Object.keys(FIRE_SPRITES)).toEqual(LIT);
    for (const s of LIT) expect(FIRE_SPRITES[s].file, s).toBe(`${s}.webp`);
    expect('cold' in FIRE_SPRITES).toBe(false);
  });

  it('lays its frames out in a grid, each side of a sheet within what a phone loads, as sharp as the flame is mostly shown and more', () => {
    expect(FIRE_SPRITE_COLS * FIRE_SPRITE_ROWS).toBe(FIRE_SPRITE_FRAMES);
    for (const sprite of SHEETS) {
      const tag = sprite.stage;
      expect(sprite.sheet, tag).toEqual({ w: sprite.frame.w * FIRE_SPRITE_COLS, h: sprite.frame.h * FIRE_SPRITE_ROWS });
      expect(Math.max(sprite.sheet.w, sprite.sheet.h), tag).toBeLessThanOrEqual(4096);
      // a frame is its box, at one sharpness both ways: about twice a fire drawn 190 high
      expect(sprite.frame.w / sprite.box.w, tag).toBeCloseTo(sprite.frame.h / sprite.box.h, 1);
      expect(sprite.frame.h / sprite.box.h, tag).toBeGreaterThanOrEqual(1.25);
    }
  });

  it('plays at about 25 frames a second, its loop a whole number of times round the fire clock', () => {
    const fps = FIRE_SPRITE_FRAMES / (FIRE_SPRITE_MS / 1000);
    expect(fps).toBeGreaterThanOrEqual(20);
    expect(fps).toBeLessThanOrEqual(30);
    expect(FIRE_CYCLE_MS % FIRE_SPRITE_MS).toBe(0);
  });

  it('holds each stage flame at its fullest inside the fire box, astride its root, its foot behind the logs', () => {
    for (const [i, sprite] of SHEETS.entries()) {
      const { box, stage } = sprite;
      const { to } = FIRE_FLAME_REACH[stage];
      expect(box.x, stage).toBeGreaterThanOrEqual(FIRE_VIEW.x);
      expect(box.y, stage).toBeGreaterThanOrEqual(FIRE_VIEW.y);
      expect(box.x + box.w, stage).toBeLessThanOrEqual(FIRE_VIEW.x + FIRE_VIEW.w);
      expect(box.y + box.h, stage).toBeLessThanOrEqual(FIRE_VIEW.y + FIRE_VIEW.h);
      expect(box.x + box.w / 2, stage).toBe(FIRE_ROOT[0]);
      expect(box.y, stage).toBeLessThanOrEqual(FIRE_ROOT[1] - to.h);
      expect(box.w, stage).toBeGreaterThan(to.w);
      expect(box.y + box.h, stage).toBeGreaterThan(FIRE_ROOT[1]);
      // each a step up from the one before: wider, and taller as far as the box goes
      if (i > 0) expect([box.w > SHEETS[i - 1]!.box.w, box.y <= SHEETS[i - 1]!.box.y], stage).toEqual([true, true]);
    }
    // the heights every screen was laid out round, from the day a stage is reached to the day before the next
    expect(LIT.map((s) => [FIRE_FLAME_REACH[s].from.h, FIRE_FLAME_REACH[s].to.h])).toEqual([
      [46, 51],
      [80, 90],
      [118, 130],
      [147, 162],
      [169, 182],
      [185, 200],
      [204, 220],
    ]);
  });

  it('finds each frame in turn, along a row and on to the next, round and round', () => {
    expect(fireSpriteCell(0)).toEqual({ col: 0, row: 0 });
    expect(fireSpriteCell(FIRE_SPRITE_COLS - 1)).toEqual({ col: FIRE_SPRITE_COLS - 1, row: 0 });
    expect(fireSpriteCell(FIRE_SPRITE_COLS)).toEqual({ col: 0, row: 1 });
    expect(fireSpriteCell(FIRE_SPRITE_FRAMES - 1)).toEqual({ col: FIRE_SPRITE_COLS - 1, row: FIRE_SPRITE_ROWS - 1 });
    expect(fireSpriteCell(FIRE_SPRITE_FRAMES)).toEqual({ col: 0, row: 0 });
    expect(fireSpriteCell(-1)).toEqual(fireSpriteCell(FIRE_SPRITE_FRAMES - 1));
  });
});

describe('the sheets that ship', () => {
  it('are the same in both apps, each as big as it says, see-through round its flame, and light to load', async () => {
    let total = 0;
    for (const sprite of SHEETS) {
      const web = committed('web/public/fire', sprite);
      expect(committed('mobile/assets/fire', sprite).equals(web), sprite.stage).toBe(true);
      const meta = await sharp(web).metadata();
      expect([meta.format, meta.width, meta.height, meta.hasAlpha], sprite.stage).toEqual(['webp', sprite.sheet.w, sprite.sheet.h, true]);
      expect(web.length, sprite.stage).toBeLessThanOrEqual(160 * 1024);
      total += web.length;
    }
    expect(total).toBeLessThanOrEqual(1024 * 1024);
  });

  it('keeps every frame clear at its edges, so none bleeds into its neighbour on the sheet and nothing of the flame is cut off', async () => {
    for (const sprite of SHEETS) {
      const { w, h } = sprite.frame;
      for (const [i, frame] of (await frames(sprite)).entries()) {
        let edge = 0;
        for (let x = 0; x < w; x++) edge = Math.max(edge, frame[x]!, frame[(h - 1) * w + x]!);
        for (let y = 0; y < h; y++) edge = Math.max(edge, frame[y * w]!, frame[y * w + w - 1]!);
        expect(edge, `${sprite.stage} frame ${i}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('moves all the time, and flows from its last frame into its first with no seam', async () => {
    for (const sprite of SHEETS) {
      const all = await frames(sprite);
      const steps = all.slice(1).map((f, i) => change(all[i]!, f));
      const seam = change(all.at(-1)!, all[0]!);
      // never two frames alike, and the step round the loop no bigger than the steps along it
      expect(Math.min(...steps), sprite.stage).toBeGreaterThan(0.5);
      expect(seam, sprite.stage).toBeGreaterThan(0.5);
      expect(seam, sprite.stage).toBeLessThanOrEqual(Math.max(...steps) * 1.1);
    }
  });

  it('is what the script paints: painted again, the same flame', async () => {
    const out = mkdtempSync(join(tmpdir(), 'hevalo-fire-'));
    try {
      execFileSync(process.execPath, [join(ROOT, 'scripts/generate-fire-sprites.mjs'), '--out', out, '--stage', 'spark'], { cwd: ROOT, stdio: 'pipe' });
      const sprite = FIRE_SPRITES.spark;
      const [again, shipped] = await Promise.all([sharp(join(out, sprite.file)).raw().toBuffer(), sharp(committed('web/public/fire', sprite)).raw().toBuffer()]);
      let worst = 0;
      for (let i = 0; i < again.length; i++) worst = Math.max(worst, Math.abs(again[i]! - shipped[i]!));
      // byte for byte with the same encoder; a hair apart with another build of it
      expect(worst).toBeLessThanOrEqual(2);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
