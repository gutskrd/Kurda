/**
 * The land Sêvan stands on: three terraces stepping down a mountainside to
 * a lake, each held up by a dry-stone wall, with the Zagros behind them and
 * the trail coming down from the pass.
 *
 * The terraces are boxes on the world's ground, the highest at the back. The
 * land is painted lowest-last: each terrace's grass covers the foot of the
 * wall above it, which is inside the hill, and its own walls drop to the
 * water in front of it. Everything that stands on a terrace is drawn after
 * all of the land, back to front.
 */
import { n, type Pt } from '../svg.js';
import { INK, Part, disc, iso, oval, poly, polyline, wpoly, type Palette, type Tri } from './pen.js';
import type { Rand } from './props.js';

/** A terrace: its corner at the back, its size along x and y, and the height of its grass. */
export interface Terrace {
  x: number;
  y: number;
  w: number;
  d: number;
  z: number;
}

/** The lake's surface, below the lowest terrace. */
export const WATER_Z = -18;

/**
 * Three long terraces, each one step lower and a step nearer than the one
 * behind it, with two buildings side by side on each, and two little shelves
 * off their ends: a ledge by the upper terrace where the hens scratch and a
 * meadow below the middle one where the sheep graze. Listed back to front,
 * the order they are painted in; no two share any ground.
 */
export const TERRACES: readonly Terrace[] = [
  { x: 0, y: 0, w: 224, d: 112, z: 48 },
  { x: 224, y: 58, w: 64, d: 54, z: 34 },
  { x: 108, y: 112, w: 228, d: 114, z: 24 },
  { x: 148, y: 226, w: 70, d: 76, z: -4 },
  { x: 218, y: 226, w: 228, d: 114, z: 0 },
];

/** Which terrace a point on the ground belongs to, or -1 for the lake and the hills. */
export function terraceAt(x: number, y: number): number {
  for (let i = 0; i < TERRACES.length; i++) {
    const t = TERRACES[i]!;
    if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.d) return i;
  }
  return -1;
}

/** The height of the ground at a point: its terrace's, or the lake's. */
export const groundAt = (x: number, y: number): number => {
  const i = terraceAt(x, y);
  return i < 0 ? WATER_Z : TERRACES[i]!.z;
};

/** A wall of dry stone on a face: courses of stones of uneven length, each laid over the joint below it. */
function drystone(p: Part, at: (u: number, v: number) => Pt, len: number, h: number, t: Tri, rand: Rand): void {
  // big flat stones in rough courses: some drawn by their top edge and one end, some catching the light, the rest left to the eye
  let joints = '';
  let lit = '';
  for (let v = 1.5, row = 0; v < h - 3; row++) {
    const course = 5.5 + rand() * 2.5;
    const top = Math.min(h - 1.5, v + course - 0.8);
    let u = rand() * 8;
    while (u < len - 5) {
      const step = 10 + rand() * 12;
      const end = Math.min(len - 1, u + step - 1.2);
      const r = rand();
      if (r < 0.46) joints += polyline([at(u + 1, top), at(end, top + (rand() - 0.5) * 1.2), at(end, v + 0.6)]);
      else if (r < 0.62) lit += poly([at(u + 1, v + 0.8), at(end, v + 0.8), at(end, top), at(u + 1, top)]);
      u += step;
    }
    v += course;
  }
  if (lit) p.flat(lit, t.top, ' fill-opacity="0.6"');
  p.line(joints, 0.8, t.right === INK ? INK : shadeOf(t));
}

/** The joint colour for a wall: a step darker than its shade. */
function shadeOf(t: Tri): string {
  const c = t.right.replace('#', '');
  const v = (i: number): number => Math.round(parseInt(c.slice(i, i + 2), 16) * 0.72);
  return `#${[0, 2, 4].map((i) => v(i).toString(16).padStart(2, '0')).join('')}`;
}

/** The grass lip that hangs over a wall's top edge: a wavy band along an edge between two world points. */
function lip(a: readonly [number, number, number], b: readonly [number, number, number], t: Tri, rand: Rand): string {
  const steps = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 9));
  const top: Pt[] = [];
  const drop: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const x = a[0] + (b[0] - a[0]) * f;
    const y = a[1] + (b[1] - a[1]) * f;
    top.push(iso(x, y, a[2]));
    drop.push(iso(x, y, a[2] - (i === 0 || i === steps ? 1.2 : 2.2 + rand() * 2.6)));
  }
  let d = `M${n(top[0]![0])} ${n(top[0]![1])}`;
  for (const p of top.slice(1)) d += `L${n(p[0])} ${n(p[1])}`;
  for (let i = drop.length - 1; i > 0; i--) {
    const p = drop[i]!;
    const q = drop[i - 1]!;
    d += `L${n(p[0])} ${n(p[1])}Q${n((p[0] + q[0]) / 2)} ${n((p[1] + q[1]) / 2 + 2.2)} ${n(q[0])} ${n(q[1])}`;
  }
  return `<path d="${d}Z" fill="${t.left}"/>`;
}

/** A terrace: its grass, and the walls on its two near sides down to `foot`. */
function terrace(t: Terrace, pal: Palette, rand: Rand): string {
  const { x, y, w, d, z } = t;
  const foot = WATER_Z - 2;
  const p = new Part(0);
  p.sil(wpoly([[x, y, z], [x + w, y, z], [x + w, y, foot], [x + w, y + d, foot], [x, y + d, foot], [x, y + d, z]]));
  // the walls: down-left lit, down-right in shade
  const left = (u: number, v: number): Pt => iso(x + u, y + d, foot + v);
  const right = (u: number, v: number): Pt => iso(x + w, y + u, foot + v);
  p.fill(wpoly([[x, y + d, foot], [x + w, y + d, foot], [x + w, y + d, z], [x, y + d, z]]), pal.cliff.left);
  p.fill(wpoly([[x + w, y, foot], [x + w, y + d, foot], [x + w, y + d, z], [x + w, y, z]]), pal.cliff.right);
  drystone(p, left, w, z - foot, { top: pal.cliff.top, left: pal.cliff.left, right: pal.cliff.right }, rand);
  drystone(p, right, d, z - foot, { top: pal.cliff.left, left: pal.cliff.right, right: pal.cliff.right }, rand);
  // the grass
  p.fill(wpoly([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]]), pal.grass.top);
  p.raw(lip([x, y + d, z], [x + w, y + d, z], pal.grass, rand) + lip([x + w, y + d, z], [x + w, y, z], { ...pal.grass, left: pal.grass.right }, rand));
  return p.svg();
}

/** Lighter patches of meadow on a terrace, so the grass is not one flat sheet. */
function meadow(t: Terrace, pal: Palette, rand: Rand): string {
  let d = '';
  for (let i = 0; i < 5; i++) {
    const cx = t.x + 20 + rand() * (t.w - 40);
    const cy = t.y + 20 + rand() * (t.d - 40);
    const [sx, sy] = iso(cx, cy, t.z);
    const r = 10 + rand() * 14;
    d += oval(sx, sy, r * 1.4, r * 0.6);
  }
  return `<path d="${d}" fill="${pal.meadow}" stroke="none" fill-opacity="0.7"/>`;
}

/** The lake: one flat sheet, with light lines of ripples and foam where it meets the walls. */
function lake(pal: Palette, rand: Rand, box: { x: number; y: number; w: number; h: number }): string {
  let out = `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" fill="${pal.water.left}" stroke="none"/>`;
  let ripples = '';
  for (let i = 0; i < 34; i++) {
    const x = box.x + rand() * box.w;
    const y = box.y + 20 + rand() * (box.h - 20);
    const w = 6 + rand() * 10;
    ripples += `M${n(x)} ${n(y)}q${n(w / 2)} -2.2 ${n(w)} 0`;
  }
  out += `<path d="${ripples}" fill="none" stroke="${pal.foam}" stroke-width="1.3" stroke-opacity="0.8"/>`;
  return out;
}

/** Foam along the foot of each wall where it stands in the lake. */
function foam(pal: Palette): string {
  let d = '';
  for (const t of TERRACES) {
    const a = iso(t.x, t.y + t.d, WATER_Z);
    const b = iso(t.x + t.w, t.y + t.d, WATER_Z);
    const c = iso(t.x + t.w, t.y, WATER_Z);
    d += polyline([[a[0] - 3, a[1] + 1.5], [b[0], b[1] + 2.5], [c[0] + 3, c[1] + 1.5]]);
  }
  return `<path d="${d}" fill="none" stroke="${pal.foam}" stroke-width="2.6"/>`;
}

/**
 * The mountains: a far range across the whole sky, pale, and the nearer
 * Zagros behind the village, each peak a lit face and a face in shade with
 * snow down its gullies, and green foothills where they meet the lake, the
 * trail coming down over them from the pass.
 */
function mountains(pal: Palette, left: number, right: number, base: number, rand: Rand): string {
  let out = '';
  // the far range: one long ridge, ragged
  const far: Pt[] = [[left, base]];
  for (let x = left, i = 0; x <= right; x += 46 + rand() * 40, i++) far.push([x, base - 118 - (i % 2 ? 26 : 0) - rand() * 34]);
  far.push([right, base - 110], [right, base]);
  out += `<path d="${poly(far)}" fill="${pal.far.left}" stroke="${pal.far.right}" stroke-width="1.2"/>`;
  // the near peaks, each a lit face and a face in shade, with snow on its top
  const peaks: [number, number, number][] = [
    [-430, 120, 110],
    [-300, 150, 120],
    [-150, 178, 118],
    [-20, 214, 132],
    [128, 170, 120],
    [262, 196, 128],
    [400, 140, 118],
  ];
  for (const [px, ph, hw] of peaks) {
    const top: Pt = [px, base - ph];
    const l: Pt = [px - hw, base];
    const r: Pt = [px + hw * 1.08, base];
    const kink: Pt = [px - hw * 0.45, base - ph * 0.48];
    const ridge: Pt = [px + hw * 0.16, base - ph * 0.4];
    const p = new Part(0);
    p.sil(poly([l, kink, top, [px + hw * 0.5, base - ph * 0.55], r]));
    p.fill(poly([l, kink, top, ridge, [px + hw * 0.22, base]]), pal.far.top);
    p.fill(poly([top, [px + hw * 0.5, base - ph * 0.55], r, [px + hw * 0.22, base], ridge]), pal.far.right);
    // snow: a cap with tongues down the gullies, lit on the left, in shade on the right
    const s = ph * 0.34;
    const capL: Pt[] = [top, [px - s * 0.5, top[1] + s * 0.58], [px - s * 0.3, top[1] + s * 0.5], [px - s * 0.24, top[1] + s * 0.9], [px - s * 0.04, top[1] + s * 0.56], [px + s * 0.07, top[1] + s * 0.74]];
    const capR: Pt[] = [top, [px + s * 0.07, top[1] + s * 0.74], [px + s * 0.24, top[1] + s * 0.5], [px + s * 0.36, top[1] + s * 0.82], [px + s * 0.52, top[1] + s * 0.5]];
    p.fill(poly(capL), pal.snow.top).fill(poly(capR), pal.snow.right);
    out += p.svg();
  }
  // the foothills where the range meets the lake: soft green humps, in front of them the trail
  const humps: [number, number, number][] = [[-470, 44, 130], [-330, 62, 120], [-190, 76, 120], [-60, 92, 130], [90, 104, 150], [250, 80, 130], [400, 56, 140]];
  let hills = '';
  let shade = '';
  for (const [hx, hh, hw] of humps) {
    hills += `M${n(hx - hw)} ${n(base + 2)}Q${n(hx - hw * 0.5)} ${n(base - hh)} ${n(hx)} ${n(base - hh)}Q${n(hx + hw * 0.5)} ${n(base - hh)} ${n(hx + hw)} ${n(base + 2)}Z`;
    shade += `M${n(hx + hw * 0.15)} ${n(base - hh + 1)}Q${n(hx + hw * 0.6)} ${n(base - hh)} ${n(hx + hw * 0.98)} ${n(base + 1)}L${n(hx + hw * 0.3)} ${n(base + 1)}Q${n(hx + hw * 0.4)} ${n(base - hh * 0.5)} ${n(hx + hw * 0.15)} ${n(base - hh + 1)}Z`;
  }
  out += `<path d="${hills}" fill="${pal.near.left}" stroke="${INK}" stroke-width="1.8"/><path d="${shade}" fill="${pal.near.right}" stroke="none"/>`;
  // the trail over the hill from the pass, winding down to the top of the village's path
  const trail = `M${n(150)} ${n(base - 92)}Q${n(118)} ${n(base - 70)} ${n(150)} ${n(base - 52)}Q${n(178)} ${n(base - 36)} ${n(130)} ${n(base - 16)}Q${n(112)} ${n(base - 6)} ${n(118)} ${n(base + 10)}`;
  out += `<path d="${trail}" fill="none" stroke="${pal.path.right}" stroke-width="9"/><path d="${trail}" fill="none" stroke="${pal.path.left}" stroke-width="6.4"/>`;
  return out;
}

/** Soft flat clouds parked in the sky (the drifting ones are laid over the scene by each app). */
export function cloudShape(cx: number, cy: number, s: number): string {
  return disc(cx - 12 * s, cy, 8 * s) + disc(cx, cy - 6 * s, 11 * s) + disc(cx + 13 * s, cy - 1 * s, 8.5 * s) + oval(cx, cy + 3 * s, 22 * s, 6 * s);
}

/** Where the lake's far shore meets the hills, on the screen. */
export const HORIZON = -30;

/** The sky, the mountains, the lake and the terraces, before anything stands on them. */
export function land(pal: Palette, rand: Rand, view: { x: number; y: number; w: number; h: number }): string {
  const horizon = HORIZON;
  const sky =
    `<rect x="${n(view.x)}" y="${n(view.y)}" width="${n(view.w)}" height="${n(horizon - view.y + 4)}" fill="${pal.sky}" stroke="none"/>` +
    `<rect x="${n(view.x)}" y="${n(horizon - 130)}" width="${n(view.w)}" height="134" fill="${pal.skyLow}" stroke="none" fill-opacity="0.7"/>`;
  const water = lake(pal, rand, { x: view.x, y: horizon, w: view.w, h: view.y + view.h - horizon });
  const hills = mountains(pal, view.x, view.x + view.w, horizon, rand);
  let ground = '';
  for (const t of TERRACES) ground += terrace(t, pal, rand) + meadow(t, pal, rand);
  return sky + hills + water + foam(pal) + ground;
}

/** How near the viewer a thing on the ground stands, for sorting: its terrace first (back to front), then x + y. */
export function depthAt(x: number, y: number): number {
  return (terraceAt(x, y) + 1) * 10000 + x + y;
}

/** The path of beaten earth, zig-zagging down: flat strips on the terraces, and stone steps down each wall. */
export function paths(pal: Palette, rand: Rand): Part[] {
  const out: Part[] = [];
  const strip = (pts: readonly (readonly [number, number])[], z: number, w: number): void => {
    const p = new Part(depthAt(pts[0]![0], pts[0]![1]) - 9000);
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[i + 1]!;
      const along = Math.hypot(bx - ax, by - ay);
      const nx = (-(by - ay) / along) * (w / 2);
      const ny = ((bx - ax) / along) * (w / 2);
      d += wpoly([[ax + nx, ay + ny, z], [bx + nx, by + ny, z], [bx - nx, by - ny, z], [ax - nx, ay - ny, z]]);
      d += oval(...iso(bx, by, z), w * 0.72, w * 0.36);
    }
    p.flat(d, pal.path.left);
    // pebbles along it, and its worn edge
    let peb = '';
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < 5; k++) {
        const f = rand();
        const x = pts[i]![0] + (pts[i + 1]![0] - pts[i]![0]) * f + (rand() - 0.5) * w * 0.7;
        const y = pts[i]![1] + (pts[i + 1]![1] - pts[i]![1]) * f + (rand() - 0.5) * w * 0.7;
        const [sx, sy] = iso(x, y, z);
        peb += oval(sx, sy, 1.4 + rand(), 0.8);
      }
    }
    p.flat(peb, pal.path.right);
    out.push(p);
  };
  // down from the pass, between the houses and the school
  strip([[114, -2], [114, 112]], 48, 15);
  // along under the upper terrace's wall, past the apple, and down beside the market
  strip([[114, 124], [230, 124], [230, 226]], 24, 15);
  // along under the middle wall, and down between the spring and the orchard to the gate
  strip([[230, 238], [314, 238], [314, 342]], 0, 15);
  out.push(steps(pal, 107, 112, 48, 14, 24));
  out.push(steps(pal, 223, 226, 24, 14, 24));
  return out;
}

/** Stone steps cut down a wall along +y: each a block, lit on top. */
function steps(pal: Palette, x: number, y: number, z: number, wide: number, drop: number): Part {
  const p = new Part(depthAt(x, y + drop + 1) - 8000);
  const count = 6;
  const rise = drop / count;
  for (let i = 0; i < count; i++) p.box(x, y + i * rise, z - drop - 2, wide, rise, drop + 2 - i * rise, pal.stoneGrey);
  return p;
}
