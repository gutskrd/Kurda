/**
 * The valley's things, drawn in the village's pen (outlined, lit from the
 * upper left, three flat tones a form): what grows and stands round the six
 * buildings as the village fills in.
 *
 * Pines for the slopes and round-crowned trees lower down, singly or as a
 * whole stand merged into a few paths; fields in rows of wheat, chickpeas,
 * tomatoes and onions, or freshly dug; folds of post-and-rail fence with a
 * trough; the hens' mud-brick coop and its wattle yard; the water mill (aş)
 * on the stream with its flume; the threshing floor (bênder) ringed with
 * stones; the shepherds' black goat-hair tent (reşmal) with its fire; the
 * wooden dock, the boat and a plank bridge; a mud-brick dovecote; a ground
 * loom with a kilim half woven on it; lantern posts, benches, flowers, the
 * feast's bunting of kilim pennants, and the signpost whose boards are
 * pictures (the town's houses, the high pasture's tent under a peak), never
 * words. Everything is Kurdish village life, drawn new for the village.
 */
import { n, type Pt } from '../svg.js';
import { INK, Part, disc, iso, onLeft, onRight, oval, panel, poly, polyline, rim, seg, wpoly, type Palette, type Tri } from './pen.js';
import * as P from './props.js';
import type { Rand } from './props.js';

const depthOf = (x: number, y: number): number => x + y;

// ───────────────────────────────────────────────────────────── trees

/** The tiers of a pine, bottom first: where each one's foot and tip sit (shares of the tree's height) and its half-width (of the widest). */
const PINE_TIERS: readonly [foot: number, tip: number, wide: number][] = [
  [0.16, 0.6, 1],
  [0.4, 0.82, 0.78],
  [0.62, 1, 0.54],
];
/** A distant pine in a wood needs only two tiers to read as one. */
const WOOD_TIERS: readonly [foot: number, tip: number, wide: number][] = [
  [0.16, 0.68, 1],
  [0.48, 1, 0.68],
];

/** One tier of a pine as path data: a cone with a gently curved hem. */
function tier(cx: number, foot: number, tip: number, hw: number): string {
  return `M${n(cx - hw)} ${n(foot)}Q${n(cx)} ${n(foot + hw * 0.34)} ${n(cx + hw)} ${n(foot)}L${n(cx)} ${n(tip)}Z`;
}

/** The lit left of a tier, from its tip down its left edge and back up the middle. */
function tierLit(cx: number, foot: number, tip: number, hw: number): string {
  return `M${n(cx)} ${n(tip)}L${n(cx - hw)} ${n(foot)}Q${n(cx - hw * 0.45)} ${n(foot + hw * 0.24)} ${n(cx + hw * 0.08)} ${n(foot + hw * 0.16)}Z`;
}

/** A sliver of light down a tier's left edge. */
function tierGlint(cx: number, foot: number, tip: number, hw: number): string {
  return `M${n(cx - hw * 0.12)} ${n(tip + (foot - tip) * 0.18)}L${n(cx - hw * 0.72)} ${n(foot - (foot - tip) * 0.08)}L${n(cx - hw * 0.5)} ${n(foot - (foot - tip) * 0.12)}Z`;
}

/** A tree in a stand: where its foot is on the screen, how tall it is, and what kind. */
export interface StandTree {
  x: number;
  y: number;
  h: number;
  kind: 'pine' | 'round' | 'poplar';
}

/**
 * A stand of trees, all in one part: the outlines of them all, then each
 * tier of every pine and every crown in turn. Trees in one stand should
 * stand in a row, side by side, so the merging never shows. A `distant`
 * stand, deep in a wood, draws its pines in two tiers and without the glint
 * of light down each, which no one sees from across the valley.
 */
export function stand(pal: Palette, trees: readonly StandTree[], depth: number, distant = false): Part {
  const p = new Part(depth);
  let trunks = '';
  let trunkShade = '';
  const shape = distant ? WOOD_TIERS : PINE_TIERS;
  const tiers: [string, string, string][] = shape.map(() => ['', '', '']);
  let crowns = '';
  let crownLit = '';
  let crownGlint = '';
  let sil = '';
  for (const t of trees) {
    const tw = t.h * (t.kind === 'pine' ? 0.09 : 0.11);
    const trunkTop = t.y - t.h * (t.kind === 'pine' ? 0.22 : 0.45);
    const trunk = `M${n(t.x - tw)} ${n(t.y)}L${n(t.x - tw * 0.8)} ${n(trunkTop)}H${n(t.x + tw * 0.8)}L${n(t.x + tw)} ${n(t.y)}Z`;
    sil += trunk;
    trunks += trunk;
    trunkShade += `M${n(t.x + tw * 0.15)} ${n(t.y)}L${n(t.x + tw * 0.1)} ${n(trunkTop)}H${n(t.x + tw * 0.8)}L${n(t.x + tw)} ${n(t.y)}Z`;
    if (t.kind === 'pine') {
      const w = t.h * 0.3;
      shape.forEach(([foot, tip, wide], i) => {
        const f = t.y - t.h * foot;
        const tp = t.y - t.h * tip;
        const hw = w * wide;
        sil += tier(t.x, f, tp, hw);
        tiers[i]![0] += tier(t.x, f, tp, hw);
        tiers[i]![1] += tierLit(t.x, f, tp, hw);
        if (!distant) tiers[i]![2] += tierGlint(t.x, f, tp, hw);
      });
    } else if (t.kind === 'poplar') {
      const w = t.h * 0.17;
      const y0 = t.y - t.h * 0.14;
      const y1 = t.y - t.h;
      const shape = `M${n(t.x)} ${n(y1)}C${n(t.x + w * 1.25)} ${n(y1 + t.h * 0.3)} ${n(t.x + w * 1.1)} ${n(y0 - t.h * 0.06)} ${n(t.x)} ${n(y0)}C${n(t.x - w * 1.1)} ${n(y0 - t.h * 0.06)} ${n(t.x - w * 1.25)} ${n(y1 + t.h * 0.3)} ${n(t.x)} ${n(y1)}Z`;
      sil += shape;
      crowns += shape;
      crownLit += `M${n(t.x)} ${n(y1)}C${n(t.x - w * 1.25)} ${n(y1 + t.h * 0.3)} ${n(t.x - w * 1.1)} ${n(y0 - t.h * 0.06)} ${n(t.x)} ${n(y0)}C${n(t.x - w * 0.3)} ${n(y0 - t.h * 0.3)} ${n(t.x - w * 0.2)} ${n(y1 + t.h * 0.3)} ${n(t.x)} ${n(y1)}Z`;
    } else {
      const r = t.h * 0.3;
      const cy = t.y - t.h * 0.62;
      const lobes: [number, number, number][] = distant
        ? [
            [t.x - r * 0.6, cy + r * 0.2, r * 0.7],
            [t.x + r * 0.62, cy + r * 0.18, r * 0.68],
            [t.x, cy - r * 0.25, r * 0.85],
          ]
        : [
            [t.x - r * 0.62, cy + r * 0.22, r * 0.66],
            [t.x + r * 0.64, cy + r * 0.2, r * 0.64],
            [t.x, cy - r * 0.32, r * 0.78],
            [t.x + r * 0.05, cy + r * 0.38, r * 0.7],
          ];
      for (const [lx, ly, lr] of lobes) {
        sil += disc(lx, ly, lr);
        crowns += disc(lx, ly, lr);
        crownLit += disc(lx - lr * 0.14, ly - lr * 0.17, lr * 0.82);
      }
      if (!distant) crownGlint += disc(t.x - r * 0.42, cy - r * 0.5, r * 0.3);
    }
  }
  p.sil(sil);
  if (trunks) p.fill(trunks, pal.trunk.left).flat(trunkShade, pal.trunk.right);
  for (const [outline, lit, glint] of tiers) {
    if (!outline) continue;
    p.fill(outline, pal.pine.right).flat(lit, pal.pine.left);
    if (glint) p.flat(glint, pal.pine.top);
  }
  if (crowns) {
    p.fill(crowns, pal.leafDark.right).flat(crownLit, pal.leafDark.left);
    if (crownGlint) p.flat(crownGlint, pal.leafDark.top);
  }
  return p;
}

/** One pine standing on the ground in the world. */
export function pine(pal: Palette, x: number, y: number, z: number, h: number): Part {
  const [cx, cy] = iso(x, y, z);
  const p = stand(pal, [{ x: cx, y: cy, h, kind: 'pine' }], depthOf(x, y));
  return p;
}

/** One round-crowned tree (an oak, a walnut seen from afar) standing on the ground in the world. */
export function roundTree(pal: Palette, x: number, y: number, z: number, h: number): Part {
  const [cx, cy] = iso(x, y, z);
  return stand(pal, [{ x: cx, y: cy, h, kind: 'round' }], depthOf(x, y));
}

// ───────────────────────────────────────────────────────────── fields

export type Crop = 'plot' | 'wheat' | 'chickpeas' | 'tomatoes' | 'onions';

/**
 * A field on the ground at z, `w` along x and `d` along y, its rows running
 * along x: a bed of tilled earth with a raised edge, furrows, and the crop
 * standing in its rows (or, for a plot just dug, only the furrows and a
 * spade left in it).
 */
export function field(pal: Palette, x: number, y: number, z: number, w: number, d: number, crop: Crop, rand: Rand): Part[] {
  const bed = new Part(depthOf(x, y) - 400);
  bed.sil(wpoly([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]]));
  bed.box(x, y, z, w, d, 1.4, pal.soil, { outline: false });
  const rows = Math.max(2, Math.floor((d - 4) / 7));
  const gap = (d - 4) / rows;
  let furrows = '';
  for (let i = 0; i <= rows; i++) furrows += seg(iso(x + 2, y + 2 + i * gap, z + 1.4), iso(x + w - 2, y + 2 + i * gap, z + 1.4));
  bed.line(furrows, 1, pal.soil.right);
  if (crop === 'plot') {
    let clods = '';
    for (let i = 0; i < 8; i++) {
      const [cx, cy] = iso(x + 4 + rand() * (w - 8), y + 4 + rand() * (d - 8), z + 1.4);
      clods += oval(cx, cy, 1.6, 0.8);
    }
    bed.flat(clods, pal.soil.top);
    return [bed, spade(pal, x + w - 6, y + d - 4, z + 1.4)];
  }
  const plants = new Part(depthOf(x + w / 2, y + d / 2));
  let body = '';
  let lit = '';
  let marks = '';
  let dots = '';
  for (let i = 0; i < rows; i++) {
    const ry = y + 2 + gap * (i + 0.5);
    if (crop === 'wheat') {
      // a hedge of ripe stalks along the row, its ears ticked along the top
      const h = 6;
      const a = iso(x + 2, ry - 1.6, z + 1.4);
      const b = iso(x + w - 2, ry - 1.6, z + 1.4);
      const c = iso(x + w - 2, ry + 1.6, z + 1.4);
      const e = iso(x + 2, ry + 1.6, z + 1.4);
      const strip = poly([[a[0], a[1] - h], [b[0], b[1] - h], [c[0], c[1] - h], [c[0], c[1]], [e[0], e[1]], [e[0], e[1] - h]]);
      body += strip;
      lit += poly([[a[0], a[1] - h], [b[0], b[1] - h], [c[0], c[1] - h], [e[0], e[1] - h]]);
      for (let u = 4; u < w - 3; u += 3.2) {
        const [mx, my] = iso(x + u, ry + 1.6, z + 1.4 + h);
        marks += `M${n(mx)} ${n(my)}l${n(0.6)} ${n(-1.8)}`;
      }
    } else {
      for (let u = 5; u < w - 3; u += crop === 'onions' ? 5 : 7) {
        const [px, py] = iso(x + u + (rand() - 0.5), ry, z + 1.4);
        if (crop === 'onions') {
          dots += oval(px, py - 0.6, 1.5, 1);
          marks += `M${n(px - 1)} ${n(py - 1)}l${n(-1)} ${n(-3.6)}M${n(px)} ${n(py - 1.2)}l0 ${n(-4.4)}M${n(px + 1)} ${n(py - 1)}l${n(1)} ${n(-3.6)}`;
        } else {
          const r = crop === 'tomatoes' ? 2.6 : 2.4;
          const top = crop === 'tomatoes' ? 4.2 : 2.6;
          body += disc(px, py - top, r);
          lit += disc(px - r * 0.2, py - top - r * 0.25, r * 0.7);
          if (crop === 'tomatoes') {
            marks += `M${n(px + 1.6)} ${n(py)}l0 ${n(-8.6)}`;
            dots += disc(px - 1, py - top + 0.8, 0.9) + disc(px + 1.2, py - top - 0.6, 0.9);
          } else dots += disc(px + 0.8, py - top - 0.4, 0.6) + disc(px - 1, py - top + 0.4, 0.6);
        }
      }
    }
  }
  if (crop === 'wheat') plants.sil(body).fill(body, pal.wheat.left).flat(lit, pal.wheat.top).line(marks, 0.9, pal.wheat.right);
  else if (crop === 'onions') plants.line(marks, 1.6, pal.green.right).line(marks, 0.9, pal.green.top).fill(dots, '#efe3f0', ' stroke-width="0.6"');
  else {
    if (crop === 'tomatoes') plants.line(marks, 1.4, pal.wood.left);
    plants.sil(body).flat(body, pal.leafDark.right).flat(lit, pal.leafDark.left).fill(dots, crop === 'tomatoes' ? pal.apple : pal.cream.left, ' stroke-width="0.5"');
  }
  return [bed, plants];
}

/** A spade left standing in dug earth. */
function spade(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x, y));
  const [cx, cy] = iso(x, y, z);
  p.line(`M${n(cx)} ${n(cy - 2)}l0 ${n(-11)}M${n(cx - 1.6)} ${n(cy - 13)}h3.2`, 2.4).line(`M${n(cx)} ${n(cy - 2)}l0 ${n(-11)}M${n(cx - 1.6)} ${n(cy - 13)}h3.2`, 1, pal.wood.left);
  const blade = `M${n(cx - 1.8)} ${n(cy - 3)}h3.6v3.4l-1.8 1.2l-1.8 -1.2Z`;
  p.sil(blade).fill(blade, pal.stoneGrey.left);
  return p;
}

// ───────────────────────────────────────────────────────────── folds and the coop

/**
 * A fold of post-and-rail fence round a patch of trampled ground, `w` along
 * x and `d` along y, with its gate gap in the near fence along x and a trough
 * inside. Two parts of fence, the far and the near, so the ground and the
 * trough sit between them.
 */
export function fold(pal: Palette, x: number, y: number, z: number, w: number, d: number, rand: Rand, trough = true): Part[] {
  const ground = new Part(depthOf(x, y) - 300);
  let patch = '';
  for (let i = 0; i < 4; i++) {
    const [cx, cy] = iso(x + w * (0.2 + rand() * 0.6), y + d * (0.25 + rand() * 0.5), z);
    patch += oval(cx, cy, w * 0.32, w * 0.13);
  }
  ground.flat(patch, pal.earth.top, ' fill-opacity="0.55"');
  const far = [...P.fence(pal, x, y, z, w, 'x'), ...P.fence(pal, x, y, z, d, 'y')];
  for (const f of far) f.depth = depthOf(x, y) - 200;
  const gate = w * 0.32;
  const near = [...P.fence(pal, x, y + d, z, w - gate, 'x'), ...P.fence(pal, x + w, y, z, d, 'y')];
  for (const f of near) f.depth = depthOf(x + w, y + d) + 4;
  const out = [ground, ...far, ...near];
  if (trough) {
    const t = new Part(depthOf(x + 8, y + 8));
    t.box(x + 5, y + 6, z, 16, 5, 4, pal.woodDark).fill(wpoly([[x + 6, y + 7, z + 4], [x + 20, y + 7, z + 4], [x + 20, y + 10, z + 4], [x + 6, y + 10, z + 4]]), pal.water.left, ' stroke-width="0.6"');
    out.push(t);
  }
  return out;
}

/** The hens' coop: a little mud-brick house on stones, a flat roof of poles, a ramp up to its door, and a wattle yard in front. */
export function coop(pal: Palette, x: number, y: number, z: number, rand: Rand): Part[] {
  const house = new Part(depthOf(x + 10, y + 8));
  house.box(x, y, z, 20, 15, 3, pal.stoneGrey).box(x + 1, y + 1, z + 3, 18, 13, 10, pal.stoneWarm, { top: false });
  const face = onLeft(x + 1, y + 14, z + 3);
  house.fill(panel(face, 11, 0, 4.4, 5.4), '#4a3226');
  house.box(x - 1, y - 1, z + 13, 22, 17, 2, pal.roof);
  let ends = '';
  for (let u = 2; u < 21; u += 3.4) {
    const [bx, by] = iso(x + u, y + 16, z + 12.6);
    ends += disc(bx, by, 0.8);
  }
  house.fill(ends, pal.beam, ' stroke-width="0.6"');
  const ramp = new Part(depthOf(x + 14, y + 24));
  const a = iso(x + 13, y + 22, z);
  const b = iso(x + 13, y + 15, z + 3.6);
  ramp.line(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, 4.2).line(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, 2.6, pal.wood.left);
  const straw = new Part(depthOf(x, y + 16) - 200);
  let tufts = '';
  for (let i = 0; i < 10; i++) {
    const [sx, sy] = iso(x + 2 + rand() * 40, y + 20 + rand() * 22, z);
    tufts += `M${n(sx - 2)} ${n(sy)}l4 -0.8`;
  }
  straw.line(tufts, 1.1, pal.straw.right);
  const yard = [P.wattle(pal, x - 2, y + 17, z, 46, 'y'), P.wattle(pal, x - 2, y + 44, z, 22, 'x'), P.wattle(pal, x + 44, y + 17, z, 27, 'y')];
  yard[0]!.depth = depthOf(x, y) - 100;
  return [straw, yard[0]!, house, ramp, yard[1]!, yard[2]!];
}

// ───────────────────────────────────────────────────────────── water and the mill

/**
 * The water mill (aş) beside the stream: a stone house with a flat roof,
 * a wooden flume on stilts bringing the water to its wheel on the house's
 * near right side, a spare millstone leaning on the wall and sacks of flour
 * at the door. The wheel itself turns, so an app that moves it draws it
 * over the scene (`wheel` false); `millWheel` is where.
 */
export function mill(pal: Palette, x: number, y: number, z: number, rand: Rand, wheel = true): Part[] {
  const house = new Part(depthOf(x + 14, y + 12));
  house.box(x, y, z, 28, 24, 20, pal.stoneGrey, { top: false });
  const left = onLeft(x, y + 24, z);
  const right = onRight(x + 28, y, z);
  let joints = '';
  for (let v = 4; v < 19; v += 4.6) for (let u = (v % 9) + 2; u < 26; u += 7) joints += polyline([left(u, v), left(u + 5, v)]);
  for (let v = 4; v < 19; v += 4.6) for (let u = (v % 7) + 2; u < 22; u += 7) joints += polyline([right(u, v), right(u + 5, v)]);
  house.line(joints, 0.6, pal.stoneGrey.right);
  house.fill(panel(left, 6, 0, 7, 12), pal.door.left).fill(panel(left, 18, 9, 4.6, 4.6), pal.glass);
  house.box(x - 1.8, y - 1.8, z + 20, 31.6, 27.6, 3, pal.roof);
  let ends = '';
  for (let u = 3; u < 28; u += 4.4) {
    const [bx, by] = left(u, 19);
    ends += disc(bx, by, 1);
  }
  house.fill(ends, pal.beam, ' stroke-width="0.6"');
  // the millstone leaning on the wall, and the sacks by the door
  const stone = new Part(depthOf(x + 3, y + 30));
  const [mx, my] = iso(x + 24, y + 26, z + 6);
  stone.sil(oval(mx, my, 4.4, 6.2)).fill(oval(mx, my, 4.4, 6.2), pal.stoneGrey.left).fill(oval(mx, my, 1.2, 1.6), pal.stoneGrey.right);
  const out = [house, stone, P.sack(pal, x + 4, y + 29, z, pal.cream.top), P.sack(pal, x + 9, y + 31, z, pal.cream.top)];
  // the flume on its stilts, from upstream to the top of the wheel
  const flume = new Part(depthOf(x + 40, y + 2));
  const fx = x + 34;
  flume.box(fx, y - 30, z + 22, 5, 30, 3, pal.wood);
  for (const sy2 of [y - 26, y - 12]) flume.box(fx + 1.6, sy2, z, 1.8, 1.8, 22, pal.woodDark);
  flume.fill(wpoly([[fx + 1, y - 30, z + 25], [fx + 4, y - 30, z + 25], [fx + 4, y, z + 25], [fx + 1, y, z + 25]]), pal.water.top, ' stroke-width="0.6"');
  out.push(flume);
  if (wheel) out.push(millWheelPart(pal, x, y, z));
  void rand;
  return out;
}

/** Where the mill's wheel turns, on the canvas's own world units: its hub, and its radius. */
export function millWheel(x: number, y: number, z: number): { at: readonly [number, number, number]; r: number } {
  return { at: [x + 36.5, y + 10, z + 12], r: 11 };
}

/** The wheel drawn still: a rim, its paddles and spokes, seen edge-on to the stream. */
function millWheelPart(pal: Palette, x: number, y: number, z: number): Part {
  const { at, r } = millWheel(x, y, z);
  const p = new Part(depthOf(at[0], at[1]) + 2);
  p.raw(wheelMarkup(pal, iso(...at), r));
  return p;
}

/** A mill wheel on the plane x = const (facing down-right), its hub at a screen point: rim, spokes and paddles. */
export function wheelMarkup(pal: Palette, [cx, cy]: Pt, r: number): string {
  // the plane's own axes on the screen: along y is (-1, 0.5), up is (0, -1)
  const at = (a: number, k: number): Pt => [cx - Math.cos(a) * r * k, cy + Math.cos(a) * r * k * 0.5 - Math.sin(a) * r * k];
  let rim = '';
  let spokes = '';
  let paddles = '';
  for (let i = 0; i <= 24; i++) {
    const [px, py] = at((i / 24) * Math.PI * 2, 1);
    rim += `${i ? 'L' : 'M'}${n(px)} ${n(py)}`;
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    spokes += seg([cx, cy], at(a, 1));
    const [p1, p2] = [at(a, 0.9), at(a, 1.22)];
    paddles += seg(p1, p2);
  }
  return (
    `<path d="${rim}Z" fill="none" stroke-width="4.4"/><path d="${rim}Z" fill="none" stroke="${pal.wood.left}" stroke-width="2.4"/>` +
    `<path d="${spokes}" fill="none" stroke-width="1.4"/><path d="${paddles}" fill="none" stroke-width="4.6"/><path d="${paddles}" fill="none" stroke="${pal.wood.top}" stroke-width="2.6"/>` +
    `<path d="${disc(cx, cy, 2.4)}" fill="${pal.woodDark.left}"/>`
  );
}

/** A wooden dock running out over the water along +y from its foot on the shore, its posts standing in the lake. */
export function dock(pal: Palette, x: number, y: number, z: number, len: number, water: number): Part[] {
  const posts = new Part(depthOf(x, y) - 1);
  for (let k = 0; k <= len; k += 14) for (const dx of [0, 12]) posts.box(x + dx - 1, y + k - 1, water - 2, 2.4, 2.4, z - water + 2, pal.woodDark);
  const deck = new Part(depthOf(x + 6, y + len));
  deck.box(x - 1, y, z, 15, len, 2, pal.wood);
  let joints = '';
  for (let k = 3; k < len; k += 3.6) joints += seg(iso(x - 1, y + k, z + 2), iso(x + 14, y + k, z + 2));
  deck.line(joints, 0.6, pal.wood.right);
  const bollard = new Part(depthOf(x, y + len) + 1);
  bollard.cylinder(x + 12, y + len - 3, z + 2, 1.6, 4, pal.woodDark);
  return [posts, deck, bollard];
}

/** A rowing boat, its hull curved, its oars shipped, drawn about its middle on the water (for the scene, or a sprite at the origin). */
export function boat(pal: Palette, cx: number, cy: number): string {
  const p = new Part(0);
  const hull = `M${n(cx - 15)} ${n(cy - 7)}Q${n(cx - 3)} ${n(cy + 5)} ${n(cx + 15)} ${n(cy + 1)}L${n(cx + 16)} ${n(cy - 4)}Q${n(cx)} ${n(cy - 2.6)} ${n(cx - 15)} ${n(cy - 7)}Z`;
  const inside = `M${n(cx - 12.5)} ${n(cy - 6.6)}Q${n(cx)} ${n(cy - 3)} ${n(cx + 14.4)} ${n(cy - 3.2)}Q${n(cx + 2)} ${n(cy - 8.4)} ${n(cx - 12.5)} ${n(cy - 6.6)}Z`;
  p.sil(hull).fill(hull, pal.red.left).flat(`M${n(cx - 15)} ${n(cy - 7)}Q${n(cx - 3)} ${n(cy + 5)} ${n(cx + 15)} ${n(cy + 1)}L${n(cx + 15.3)} ${n(cy - 0.6)}Q${n(cx - 2)} ${n(cy + 2.2)} ${n(cx - 14)} ${n(cy - 5.6)}Z`, pal.red.right);
  p.fill(inside, pal.wood.right).line(`M${n(cx - 3)} ${n(cy - 5.6)}l3 2.2M${n(cx + 5)} ${n(cy - 5.2)}l3 2`, 1.6);
  p.line(`M${n(cx - 8)} ${n(cy - 6)}l14 -3`, 2.2).line(`M${n(cx - 8)} ${n(cy - 6)}l14 -3`, 1, pal.wood.top);
  return p.svg();
}

/** A plank bridge over the stream, its deck along x, rails either side. */
export function bridge(pal: Palette, x: number, y: number, z: number, len: number): Part[] {
  const deck = new Part(depthOf(x + len / 2, y + 6));
  deck.box(x, y, z + 2, len, 14, 2.4, pal.wood);
  let joints = '';
  for (let u = 3; u < len; u += 3.4) joints += seg(iso(x + u, y, z + 4.4), iso(x + u, y + 14, z + 4.4));
  deck.line(joints, 0.6, pal.wood.right);
  const far = P.fence(pal, x, y, z + 4.4, len, 'x');
  const near = P.fence(pal, x, y + 14, z + 4.4, len, 'x');
  for (const f of far) f.depth = depthOf(x + len / 2, y) + 1;
  for (const f of near) f.depth = depthOf(x + len / 2, y + 14) + 8;
  return [...far, deck, ...near];
}

// ───────────────────────────────────────────────────────────── the threshing floor, the tent

/** The threshing floor (bênder): a round of beaten earth ringed with flat stones, a heap of threshed straw, and the threshing board. */
export function threshingFloor(pal: Palette, x: number, y: number, z: number, r: number, rand: Rand): Part[] {
  const ground = new Part(depthOf(x, y) - 300);
  const [cx, cy] = iso(x, y, z);
  const [rx, ry] = rim(r);
  ground.fill(oval(cx, cy, rx, ry), pal.earth.top);
  let stones = '';
  let tops = '';
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const sx = cx + Math.cos(a) * rx;
    const sy = cy + Math.sin(a) * ry;
    stones += oval(sx, sy + 0.6, 3.4, 1.8);
    tops += oval(sx - 0.3, sy, 2.4, 1.1);
  }
  ground.fill(stones, pal.stoneGrey.right, ' stroke-width="0.7"').flat(tops, pal.stoneGrey.top);
  let chaff = '';
  for (let i = 0; i < 14; i++) chaff += `M${n(cx + (rand() - 0.5) * rx * 1.4)} ${n(cy + (rand() - 0.5) * ry * 1.2)}l3 -0.6`;
  ground.line(chaff, 1, pal.straw.right);
  const sledge = new Part(depthOf(x + r * 0.3, y + r * 0.3));
  sledge.box(x + r * 0.15, y + r * 0.1, z, 16, 9, 1.6, pal.wood);
  let flints = '';
  for (let i = 0; i < 6; i++) {
    const [fx, fy] = iso(x + r * 0.15 + 2 + i * 2.4, y + r * 0.1 + 2 + (i % 2) * 4, z + 1.6);
    flints += disc(fx, fy, 0.5);
  }
  sledge.flat(flints, pal.stoneGrey.right);
  return [ground, P.haystack(pal, x - r * 0.25, y - r * 0.2, z, r * 0.42), sledge];
}

/**
 * The shepherds' black tent (reşmal), long and low: goat-hair felt pitched on
 * a row of poles so its roof rises to a peak over each, its front side
 * rolled up to show a kilim and cushions inside, its guy ropes pegged out.
 */
export function tent(pal: Palette, x: number, y: number, z: number, w: number, d: number): Part[] {
  const back = new Part(depthOf(x, y));
  const h = 14;
  const peak = 6;
  // the back wall and the inside, in shade
  back.fill(wpoly([[x, y, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h]]), pal.felt.right);
  back.fill(wpoly([[x, y, z], [x, y + d, z], [x, y + d, z + h - 3], [x, y, z + h]]), pal.felt.right);
  const inside = new Part(depthOf(x + w / 2, y + d / 2) - 2);
  P.kilim(inside, (u, v) => iso(x + 3 + u, y + 3 + v, z + 0.3), w - 8, d - 6, pal, false);
  inside.box(x + 2, y + 2, z, w - 6, 3, 3, pal.indigo);
  const roof = new Part(depthOf(x + w, y + d) + 1);
  const poles = 3;
  // the roof: a strip over each pole's peak, sagging between them, lit on its left slope
  const ridge: [number, number, number][] = [];
  for (let i = 0; i <= poles * 2; i++) {
    const u = x + (i / (poles * 2)) * w;
    ridge.push([u, y + d / 2, z + h + (i % 2 ? peak : 1)]);
  }
  const frontEdge: [number, number, number][] = ridge.map(([u]) => [u, y + d, z + h - 3]);
  const backEdge: [number, number, number][] = ridge.map(([u]) => [u, y, z + h]);
  const near = poly([...ridge.map((q) => iso(...q)), ...frontEdge.reverse().map((q) => iso(...q))]);
  const far = poly([...backEdge.map((q) => iso(...q)), ...[...ridge].reverse().map((q) => iso(...q))]);
  roof.sil(near + far).fill(far, pal.felt.top).fill(near, pal.felt.left);
  // the felt's woven strips, and the poles holding it up at the front
  let strips = '';
  for (let i = 1; i < 6; i++) strips += seg(iso(x + (i * w) / 6, y + d / 2, z + h + 2), iso(x + (i * w) / 6, y + d, z + h - 3));
  roof.line(strips, 0.6, pal.felt.right);
  const poleSet = new Part(depthOf(x + w, y + d) + 2);
  P.sticks(poleSet, [[x + 2, y + d, z], [x + w / 2, y + d, z], [x + w - 2, y + d, z]], h - 3, { ...pal, wood: pal.woodDark }, 1.4);
  // the guy ropes to their pegs
  let ropes = '';
  for (const u of [x + 4, x + w / 2, x + w - 4]) ropes += seg(iso(u, y + d, z + h - 3), iso(u, y + d + 10, z));
  poleSet.line(ropes, 0.6);
  return [back, inside, roof, poleSet];
}

/** The camp's fire: a ring of stones, sticks and a blackened pot on three stones (its flame and smoke move, drawn by the app). */
export function campfire(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x, y));
  const [cx, cy] = iso(x, y, z);
  let ring = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ring += oval(cx + Math.cos(a) * 6, cy + Math.sin(a) * 3, 2, 1.2);
  }
  p.fill(oval(cx, cy, 5, 2.4), '#3a2318').fill(ring, pal.stoneGrey.left, ' stroke-width="0.7"');
  p.line(`M${n(cx - 4)} ${n(cy + 1)}l7 -3M${n(cx - 3)} ${n(cy - 2)}l6 2.6`, 2.4).line(`M${n(cx - 4)} ${n(cy + 1)}l7 -3M${n(cx - 3)} ${n(cy - 2)}l6 2.6`, 1, pal.trunk.left);
  const pot = `M${n(cx + 6)} ${n(cy - 1)}q0 4 4 4q4 0 4 -4q0 -2.4 -4 -2.4q-4 0 -4 2.4Z`;
  p.sil(pot).fill(pot, '#3c3533');
  return p;
}

/** The flame of a fire, for the scene drawn still (an app flickers its own). */
export function flame(pal: Palette, cx: number, cy: number, k = 1): string {
  const outer = `M${n(cx - 3.6 * k)} ${n(cy)}Q${n(cx - 4.4 * k)} ${n(cy - 5 * k)} ${n(cx - 0.6 * k)} ${n(cy - 10 * k)}Q${n(cx + 0.4 * k)} ${n(cy - 6 * k)} ${n(cx + 2 * k)} ${n(cy - 7.4 * k)}Q${n(cx + 4.6 * k)} ${n(cy - 3.6 * k)} ${n(cx + 3.6 * k)} ${n(cy)}Z`;
  const inner = `M${n(cx - 1.8 * k)} ${n(cy)}Q${n(cx - 2.2 * k)} ${n(cy - 3 * k)} ${n(cx)} ${n(cy - 5.6 * k)}Q${n(cx + 2.2 * k)} ${n(cy - 2.6 * k)} ${n(cx + 1.8 * k)} ${n(cy)}Z`;
  return `<path d="${outer}" fill="${pal.saffron.left}" stroke-width="0.9"/><path d="${inner}" fill="${pal.saffron.top}" stroke="none"/>`;
}

// ───────────────────────────────────────────────────────────── the village's furniture

/** A mud-brick dovecote: a round tower with rows of nesting holes and a domed cap. */
export function dovecote(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x, y));
  p.cylinder(x, y, z, 7, 26, pal.plaster, { taper: 0.86 });
  const [cx, cy] = iso(x, y, z);
  let holes = '';
  for (let row = 0; row < 3; row++) for (let i = -2; i <= 1; i++) holes += oval(cx + i * 3.4 + 1.4, cy - 10 - row * 5, 0.9, 1.2);
  p.fill(holes, '#4a3226', ' stroke="none"');
  p.line(`M${n(cx - 9.5)} ${n(cy - 8)}q9.5 4 19 0M${n(cx - 9)} ${n(cy - 18)}q9 3.8 18 0`, 0.7, pal.plaster.right);
  const r = 6.4;
  const top = cy - 26;
  const dome = `M${n(cx - r * 1.3)} ${n(top)}Q${n(cx - r * 1.2)} ${n(top - r * 1.3)} ${n(cx)} ${n(top - r * 1.3)}Q${n(cx + r * 1.2)} ${n(top - r * 1.3)} ${n(cx + r * 1.3)} ${n(top)}Q${n(cx)} ${n(top + 3)} ${n(cx - r * 1.3)} ${n(top)}Z`;
  p.sil(dome).fill(dome, pal.plaster.left).flat(`M${n(cx + 1)} ${n(top - r * 1.28)}Q${n(cx + r * 1.2)} ${n(top - r * 1.3)} ${n(cx + r * 1.3)} ${n(top)}Q${n(cx + r * 0.7)} ${n(top + 2)} ${n(cx + 2.4)} ${n(top + 2.4)}Q${n(cx + 3)} ${n(top - r * 0.6)} ${n(cx + 1)} ${n(top - r * 1.28)}Z`, pal.plaster.right);
  return p;
}

/** A ground loom pegged out on the grass: two beams, the warp between them, and a kilim half woven up from the near beam. */
export function loom(pal: Palette, x: number, y: number, z: number, w: number, d: number): Part[] {
  const ground = new Part(depthOf(x, y) - 1);
  let warp = '';
  for (let u = 1.5; u < w; u += 2) warp += seg(iso(x + u, y, z + 1.6), iso(x + u, y + d * 0.55, z + 1.6));
  ground.line(warp, 0.5, pal.cream.right);
  P.kilim(ground, (u, v) => iso(x + u, y + d - v, z + 1.2), w, d * 0.45, pal, false);
  const beams = new Part(depthOf(x + w / 2, y + d) + 1);
  beams.box(x - 3, y - 1.2, z, w + 6, 2.4, 2.4, pal.wood).box(x - 3, y + d - 1.2, z, w + 6, 2.4, 2.4, pal.wood);
  const [bx, by] = iso(x + w * 0.4, y + d * 0.5, z + 2);
  beams.line(`M${n(bx - 7)} ${n(by - 3)}l14 7`, 3).line(`M${n(bx - 7)} ${n(by - 3)}l14 7`, 1.4, pal.woodDark.left);
  return [ground, beams];
}

/** A post with an iron arm and a lantern hung from it; it glows at dusk. */
export function lanternPost(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x, y));
  p.box(x - 1, y - 1, z, 2, 2, 20, pal.woodDark);
  const [ax, ay] = iso(x, y, z + 19);
  p.line(`M${n(ax)} ${n(ay)}l6 3`, 1.6).raw(P.lantern(pal, ax + 6, ay + 3));
  return p;
}

/** A plain wooden bench, along x or along y. */
export function bench(pal: Palette, x: number, y: number, z: number, len = 16, along: 'x' | 'y' = 'x'): Part {
  const p = new Part(depthOf(x + (along === 'x' ? len / 2 : 0), y + (along === 'y' ? len / 2 : 0)));
  if (along === 'x') p.box(x + 1, y, z, 1.6, 4, 3, pal.woodDark).box(x + len - 2.6, y, z, 1.6, 4, 3, pal.woodDark).box(x, y - 0.5, z + 3, len, 5, 1.4, pal.wood);
  else p.box(x, y + 1, z, 4, 1.6, 3, pal.woodDark).box(x, y + len - 2.6, z, 4, 1.6, 3, pal.woodDark).box(x - 0.5, y, z + 3, 5, len, 1.4, pal.wood);
  return p;
}

/** A patch of wild flowers in the grass: red poppies, mountain tulips, a few white and violet. */
export function flowers(pal: Palette, x: number, y: number, z: number, count: number, rand: Rand, spread = 10): Part {
  const p = new Part(depthOf(x, y) + 1);
  let stems = '';
  const heads: string[] = pal.flower.map(() => '');
  for (let i = 0; i < count; i++) {
    const [fx, fy] = iso(x + (rand() - 0.5) * spread * 2, y + (rand() - 0.5) * spread * 2, z);
    const h = 3 + rand() * 2.6;
    stems += `M${n(fx)} ${n(fy)}l${n((rand() - 0.5) * 1.2)} ${n(-h)}`;
    const c = rand() < 0.5 ? 0 : Math.floor(rand() * pal.flower.length);
    heads[c] += disc(fx, fy - h, 1.3 + rand() * 0.5);
  }
  p.line(stems, 1.6).line(stems, 0.8, pal.leafDark.left);
  heads.forEach((d, i) => {
    if (d) p.fill(d, pal.flower[i]!, ' stroke-width="0.6"');
  });
  return p;
}

/** The feast's bunting: a cord between two points (already high in the air) hung with little pennants in the kilims' colours. */
export function bunting(pal: Palette, a: readonly [number, number, number], b: readonly [number, number, number], count = 9): Part {
  const p = new Part(depthOf(Math.max(a[0], b[0]), Math.max(a[1], b[1])) + 6);
  const [ax, ay] = iso(...a);
  const [bx, by] = iso(...b);
  const sag = 8;
  const at = (f: number): Pt => [ax + (bx - ax) * f, ay + (by - ay) * f + sag * 4 * f * (1 - f)];
  p.line(`M${n(ax)} ${n(ay)}Q${n((ax + bx) / 2)} ${n((ay + by) / 2 + sag * 2)} ${n(bx)} ${n(by)}`, 0.8);
  const tones = [pal.red.left, pal.saffron.left, pal.indigo.left, pal.green.left, pal.cream.left];
  for (let i = 0; i < count; i++) {
    const [px, py] = at((i + 0.5) / count);
    const flag = `M${n(px - 2.4)} ${n(py - 0.4)}L${n(px + 2.4)} ${n(py + 0.4)}L${n(px)} ${n(py + 6)}Z`;
    p.fill(flag, tones[i % tones.length]!, ' stroke-width="0.7"');
  }
  return p;
}

/**
 * The signpost where the road forks: a post with two boards cut as arrows,
 * each painted with a picture of where it leads — the town, a cluster of
 * flat-roofed houses; the high pasture, a tent under a snowy peak — so it
 * says where without a word. `town` and `pasture` are the boards' faces.
 */
export function signpost(pal: Palette, x: number, y: number, z: number, town: 'left' | 'right', pasture: 'left' | 'right'): Part {
  const p = new Part(depthOf(x, y));
  p.box(x - 1, y - 1, z, 2, 2, 24, pal.woodDark);
  const board = (side: 'left' | 'right', v: number, picture: 'town' | 'pasture'): void => {
    const at = side === 'left' ? onLeft(x - 2, y + 1.2, z + v) : onRight(x + 1.2, y - 2, z + v);
    const arrow = poly([at(0, 0), at(15, 0), at(18, 3.5), at(15, 7), at(0, 7)]);
    p.sil(arrow).fill(arrow, side === 'left' ? pal.wood.left : pal.wood.right).fill(poly([at(1, 1), at(14.4, 1), at(16.6, 3.5), at(14.4, 6), at(1, 6)]), pal.cream.left, ' stroke-width="0.5"');
    const m = (u: number, w: number): string => {
      const [a, b] = at(u, w);
      return `${n(a)} ${n(b)}`;
    };
    if (picture === 'town') {
      // three flat-roofed houses stepping up
      p.fill(`M${m(2.5, 1.6)}L${m(6, 1.6)}L${m(6, 3.6)}L${m(2.5, 3.6)}ZM${m(6, 1.6)}L${m(9.5, 1.6)}L${m(9.5, 5)}L${m(6, 5)}ZM${m(9.5, 1.6)}L${m(13, 1.6)}L${m(13, 4)}L${m(9.5, 4)}Z`, pal.roof.left, ' stroke-width="0.5"');
    } else {
      // a peak with snow, and a black tent at its foot
      p.fill(`M${m(2.5, 1.6)}L${m(8, 5.6)}L${m(13.6, 1.6)}Z`, pal.far.left, ' stroke-width="0.5"').fill(`M${m(6.6, 4.6)}L${m(8, 5.6)}L${m(9.4, 4.6)}Z`, '#ffffff', ' stroke-width="0.4"');
      p.fill(`M${m(3.4, 1.4)}L${m(4.6, 2.8)}L${m(6.4, 1.4)}Z`, pal.felt.left, ' stroke-width="0.4"');
    }
  };
  board(town, 16, 'town');
  board(pasture, 8, 'pasture');
  return p;
}

/** A line of washing between two posts, the posts and the line only (the cloths move, drawn by the app), or with the cloths for a still picture. */
export function laundry(pal: Palette, x: number, y: number, z: number, len: number, cloths: boolean): Part {
  const p = new Part(depthOf(x + len / 2, y));
  p.box(x - 0.8, y - 0.8, z, 1.6, 1.6, 16, pal.woodDark).box(x + len - 0.8, y - 0.8, z, 1.6, 1.6, 16, pal.woodDark);
  const [ax, ay] = iso(x, y, z + 15);
  const [bx, by] = iso(x + len, y, z + 15);
  p.line(`M${n(ax)} ${n(ay)}Q${n((ax + bx) / 2)} ${n((ay + by) / 2 + 5)} ${n(bx)} ${n(by)}`, 0.7);
  if (cloths) for (const c of laundryCloths(pal, x, y, z, len)) p.raw(c.svg);
  return p;
}

/** The cloths on a washing line, each where it hangs (its peg on the line), so an app can move each one alone. */
export function laundryCloths(pal: Palette, x: number, y: number, z: number, len: number): { at: Pt; svg: string; tone: Tri }[] {
  const [ax, ay] = iso(x, y, z + 15);
  const [bx, by] = iso(x + len, y, z + 15);
  const tones = [pal.indigo, pal.red, pal.cream, pal.saffron, pal.green];
  const out: { at: Pt; svg: string; tone: Tri }[] = [];
  [0.18, 0.38, 0.6, 0.82].forEach((f, i) => {
    const hx = ax + (bx - ax) * f;
    const hy = ay + (by - ay) * f + 5 * 4 * f * (1 - f) * 0.5;
    const tone = tones[i % tones.length]!;
    out.push({ at: [hx, hy], svg: clothMarkup(tone, hx, hy, i), tone });
  });
  return out;
}

/** One cloth hung from its peg at a screen point: a shirt, a headscarf with its fringe, a long dress. */
export function clothMarkup(tone: Tri, hx: number, hy: number, kind: number): string {
  const w = kind % 2 ? 5.6 : 6.6;
  const h = kind === 2 ? 9 : 6.4;
  const piece = `M${n(hx - w / 2)} ${n(hy - w * 0.25)}L${n(hx + w / 2)} ${n(hy + w * 0.25)}L${n(hx + w / 2 - 0.3)} ${n(hy + w * 0.25 + h)}L${n(hx - w / 2 + 0.3)} ${n(hy - w * 0.25 + h)}Z`;
  const shade = `M${n(hx + w * 0.1)} ${n(hy + w * 0.05)}L${n(hx + w / 2)} ${n(hy + w * 0.25)}L${n(hx + w / 2 - 0.3)} ${n(hy + w * 0.25 + h)}L${n(hx + w * 0.1)} ${n(hy + w * 0.05 + h)}Z`;
  return `<path d="${piece}" fill="${INK}" stroke-width="2.2"/><path d="${piece}" fill="${tone.left}"/><path d="${shade}" fill="${tone.right}" stroke="none"/>`;
}
