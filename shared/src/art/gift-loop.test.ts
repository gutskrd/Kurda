/**
 * The gifts' living rounds (gift-loop.ts, gift-loops.ts) and the files drawn from them: every layer a round names is
 * painted, in order, by the gift's drawing; every round ends where it began; nothing it moves leaves the frame; and the
 * committed files are the parts the rounds name.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import * as shared from '../index.js';
import { GiftCanvas } from './gift-canvas.js';
import { GIFT_ART_IDS, giftArtKey, giftArtSvg, giftLoopParts, type GiftArtId } from './gift-art.js';
import { GIFT_LOOP_REST, GIFT_LOOP_SCALE, giftLoop, giftLoopMatrix, giftLoopPoseAt, type GiftLoopLayer } from './gift-loop.js';
import { GIFT_LOOPS, giftLoopKey, giftLoopOf, giftLoopPicture } from './gift-loops.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LOOP_DIR = 'web/public/cosmetics/gift-loops';
const LOOPING = Object.keys(GIFT_LOOPS) as GiftArtId[];

/** The convex hull of points, as a chain round them. */
function hull(points: Array<[number, number]>): Array<[number, number]> {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Array<[number, number]>): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(pts), ...half(pts.slice().reverse())];
}

/** Where a layer's paint lies, as a hull in frame units, and whether any of it touches the edge of its box. */
async function paintOf(layer: GiftLoopLayer, svg: string, scale: number): Promise<{ hull: Array<[number, number]>; touches: boolean }> {
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [bx, by] = layer.box;
  const points: Array<[number, number]> = [];
  let touches = false;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3]! === 0) continue;
      if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) touches = true;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) points.push([bx + (x + dx) / scale, by + (y + dy) / scale]);
    }
  }
  return { hull: points.length > 0 ? hull(points) : [], touches };
}

describe('the gifts’ living rounds', () => {
  it('belongs only to gifts that are drawn, each layer painted by the gift’s drawing in the round’s order', () => {
    expect(LOOPING.length).toBeGreaterThan(0);
    for (const id of LOOPING) {
      expect(GIFT_ART_IDS, id).toContain(id);
      const loop = giftLoopOf(id)!;
      const parts = giftLoopParts(id);
      expect(parts.painted, id).toEqual(loop.layers.map((l) => l.name));
      expect(new Set(parts.painted).size, id).toBe(parts.painted.length);
      for (const { name, svg } of parts.layers) expect(svg, `${id} ${name}`).toMatch(/<path /);
      expect(parts.hasBase, id).toBe(loop.base !== 'none');
      expect(loop.layers.map((l) => l.name).every((n) => /^[a-z][a-zA-Z0-9]*$/.test(n) && n !== 'base'), id).toBe(true);
    }
  });

  it('reuses the still as the base only when every layer starts unseen, so the still is always the round’s first frame', () => {
    for (const id of LOOPING) {
      const loop = giftLoopOf(id)!;
      const hidden = loop.layers.every((l) => l.keys[0]!.o === 0);
      if (loop.base === 'still') expect(hidden, id).toBe(true);
      if (hidden) expect(loop.base, id).not.toBe('own');
      // A layer seen as the round starts is in the still; one unseen is not.
      const still = giftArtSvg({ id });
      for (const { name, svg } of giftLoopParts(id).layers) {
        const first = loop.layers.find((l) => l.name === name)!.keys[0]!;
        const markup = svg.replace(/^<svg[^>]*>(?:<defs>.*?<\/defs>)?/, '').replace(/<\/svg>$/, '');
        expect(still.includes(markup), `${id} ${name}`).toBe(first.o > 0);
      }
    }
  });

  it('loops seamlessly: every layer ends its round as it began, its keys in order and in range', () => {
    for (const id of LOOPING) {
      for (const layer of giftLoopOf(id)!.layers) {
        const what = `${id} ${layer.name}`;
        const first = layer.keys[0]!;
        const last = layer.keys[layer.keys.length - 1]!;
        expect([first.at, last.at], what).toEqual([0, 1]);
        for (let i = 1; i < layer.keys.length; i++) expect(layer.keys[i]!.at, what).toBeGreaterThan(layer.keys[i - 1]!.at);
        for (const name of ['x', 'y', 'sx', 'sy', 'o'] as const) expect(last[name], `${what} ${name}`).toBeCloseTo(first[name], 3);
        expect((((last.rot - first.rot) % 360) + 360) % 360, `${what} rot`).toBeCloseTo(0, 3);
        for (const k of layer.keys) {
          expect(k.o, what).toBeGreaterThanOrEqual(0);
          expect(k.o, what).toBeLessThanOrEqual(1);
          expect(Math.min(k.sx, k.sy), what).toBeGreaterThan(0);
          for (const v of Object.values(k)) expect(Number.isFinite(v), what).toBe(true);
        }
      }
    }
  });

  it('moves calmly: each gift’s round lasts 2.5 to 6 seconds, and no layer turns over quicker than a second', () => {
    for (const id of LOOPING) {
      const loop = giftLoopOf(id)!;
      expect(loop.ms, id).toBeGreaterThanOrEqual(2500);
      expect(loop.ms, id).toBeLessThanOrEqual(6000);
      for (const layer of loop.layers) expect(layer.ms, `${id} ${layer.name}`).toBeGreaterThanOrEqual(1000);
    }
  });

  it('keeps every layer whole in its box, and everything seen inside the frame all through its round', async () => {
    const scale = 2;
    for (const id of LOOPING) {
      const parts = giftLoopParts(id, scale);
      for (const layer of giftLoopOf(id)!.layers) {
        const what = `${id} ${layer.name}`;
        const [x, y, w, h] = layer.box;
        expect([x, y, x + w, y + h].every((v) => Number.isInteger(v) && v >= 0 && v <= 120), what).toBe(true);
        const paint = await paintOf(layer, parts.layers.find((p) => p.name === layer.name)!.svg, scale);
        expect(paint.touches, `${what} is cut by its box`).toBe(false);
        const shares = [...layer.keys.map((k) => k.at), ...Array.from({ length: 97 }, (_, i) => i / 96)];
        for (const at of shares) {
          const k = giftLoopPoseAt(layer.keys, at);
          // Paint too faint to see may brush the edge on its way out.
          if (k.o < 0.05) continue;
          const [a, b, c, d, e, f] = giftLoopMatrix(layer, k);
          for (const [px, py] of paint.hull) {
            const [qx, qy] = [a * px + c * py + e, b * px + d * py + f];
            expect(qx >= -0.25 && qx <= 120.25 && qy >= -0.25 && qy <= 120.25, `${what} at ${at}: (${qx.toFixed(2)}, ${qy.toFixed(2)})`).toBe(true);
          }
        }
      }
    }
  }, 60_000);

  it('turns about a layer’s origin, within its tipped plane when it has one', () => {
    const flat = { origin: [60, 60] as const };
    const turned = giftLoopMatrix(flat, { ...GIFT_LOOP_REST, rot: 90 });
    expect([turned[0] * 70 + turned[2] * 60 + turned[4], turned[1] * 70 + turned[3] * 60 + turned[5]].map((v) => Math.round(v * 1000) / 1000 || 0)).toEqual([60, 70]);
    // A disc squashed to half its height and turned in its own plane by a half turn comes back on itself.
    const disc = { origin: [60, 60] as const, plane: { tilt: -20, squash: 0.5 } };
    const half = giftLoopMatrix(disc, { ...GIFT_LOOP_REST, rot: 180 });
    const r = (v: number): number => Math.round(v * 1000) / 1000 || 0;
    expect(half.map(r)).toEqual([-1, 0, 0, -1, 120, 120]);
    expect(giftLoopMatrix(disc, GIFT_LOOP_REST).map(r)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('joins its beats with eased steps, holds the last to the end, and takes a wisp’s rebirth in one unseen step', () => {
    const loop = giftLoop(4000, {
      glow: { box: [0, 0, 10, 10], beats: [[1000, { o: 0.5 }], [2000, { o: 1 }, 'linear']] },
      wisp: { box: [0, 0, 10, 10], wrap: 0.5, motion: (t) => ({ y: -((t + 0.5) % 1), o: Math.sin(Math.PI * ((t + 0.5) % 1)) }) },
    });
    const [glow, wisp] = loop.layers as [GiftLoopLayer, GiftLoopLayer];
    expect(giftLoopPoseAt(glow.keys, 0.125).o).toBeCloseTo(0.75, 2);
    expect(giftLoopPoseAt(glow.keys, 0.375).o).toBeCloseTo(0.75, 2);
    expect(giftLoopPoseAt(glow.keys, 0.9).o).toBe(1);
    const at = wisp.keys.findIndex((k) => k.at === 0.5);
    expect(wisp.keys[at - 1]!.at).toBe(0.498);
    expect(wisp.keys[at]!.o).toBe(0);
    expect(wisp.keys[at - 1]!.o).toBeLessThan(0.01);
    expect(loop.base).toBe('own');
    expect(() => giftLoop(1000, { late: { box: [0, 0, 1, 1], beats: [[2000, { o: 0 }]] } })).toThrow(RangeError);
  });

  it('refuses paint under a layer, a layer the round does not name, and layers out of their order', () => {
    const loop = giftLoop(3000, { a: { box: [0, 0, 10, 10] }, b: { box: [0, 0, 10, 10] } });
    const canvas = (): GiftCanvas => new GiftCanvas('t', loop);
    const one = canvas();
    one.layer('a', () => one.add('<path d="M0 0"/>'));
    expect(() => one.add('<path d="M1 1"/>')).toThrow();
    expect(() => canvas().layer('c', () => {})).toThrow(RangeError);
    const two = canvas();
    two.layer('b', () => {});
    expect(() => two.layer('a', () => {})).toThrow();
  });
});

describe('where the apps find a gift’s parts', () => {
  it('puts them beside the still picture, under a folder named for the gift and the shape of its round', () => {
    const id = LOOPING[0]!;
    const still = `/cosmetics/${giftArtKey(id)}`;
    const picture = giftLoopPicture(still)!;
    expect(picture.id).toBe(id);
    expect(picture.layers.map((l) => l.src)).toEqual(giftLoopOf(id)!.layers.map((l) => `/cosmetics/${giftLoopKey(id, l.name)}`));
    expect(giftLoopPicture(`https://example.org${still}?v=2`)!.layers[0]!.src).toBe(`https://example.org/cosmetics/${giftLoopKey(id, picture.layers[0]!.layer.name)}`);
    expect(giftLoopKey(id, 'base')).toMatch(new RegExp(`^gift-loops/${id}-[0-9a-z]+/base\\.png$`));
    for (const none of [null, undefined, '', '/cosmetics/icons/made-01-hinar.png', '/cosmetics/gifts/made-99-stran.png', `/cosmetics/${giftArtKey(id)}x`]) {
      expect(giftLoopPicture(none), String(none)).toBeNull();
    }
  });

  it('uses the still itself as the base where the round allows, a base of its own otherwise, and none for a gift drawn wholly in layers', () => {
    for (const id of LOOPING) {
      const still = `/cosmetics/${giftArtKey(id)}`;
      const { base } = giftLoopPicture(still)!;
      const kind = giftLoopOf(id)!.base;
      expect(base, id).toBe(kind === 'still' ? still : kind === 'own' ? `/cosmetics/${giftLoopKey(id, 'base')}` : null);
    }
  });

  it('is what the shared package hands the apps', () => {
    expect(shared.GIFT_LOOPS).toBe(GIFT_LOOPS);
    expect(shared.giftLoopPicture).toBe(giftLoopPicture);
  });
});

describe('the moving gifts’ files', () => {
  it('holds every part each round names at the files’ scale, within its budget, and nothing else', async () => {
    const expected = new Set<string>();
    for (const id of LOOPING) {
      const loop = giftLoopOf(id)!;
      const parts = [...(loop.base === 'own' ? [['base', [0, 0, 120, 120]] as const] : []), ...loop.layers.map((l) => [l.name, l.box] as const)];
      for (const [name, [, , w, h]] of parts) {
        const key = giftLoopKey(id, name);
        expected.add(key.replace('gift-loops/', ''));
        const file = join(ROOT, 'web/public/cosmetics', key);
        const meta = await sharp(file).metadata();
        expect([meta.format, meta.width, meta.height, meta.hasAlpha], key).toEqual(['png', w * GIFT_LOOP_SCALE, h * GIFT_LOOP_SCALE, true]);
        expect(statSync(file).size, key).toBeLessThanOrEqual((name === 'base' ? 80 : 32) * 1024);
      }
    }
    const shipped = readdirSync(join(ROOT, LOOP_DIR), { recursive: true }).map(String).filter((f) => f.endsWith('.png'));
    expect(new Set(shipped)).toEqual(expected);
    expect(readFileSync(join(ROOT, LOOP_DIR, [...expected][0]!)).length).toBeGreaterThan(0);
  });
});
