/**
 * The outlines the streak's fire is drawn with, which `fire.ts` puts
 * together stage by stage: its flame tongues as first drawn for the
 * campfire, the logs, the hearth stones, the sun's halo, and the thin
 * ribbons smoke and heat rise in. Only shapes live here; how each stage
 * places, colours and moves them is `fire.ts`'s.
 *
 * The tongues are kept as drawn, in the campfire's own 120-wide box rooted
 * at `SHAPE_ROOT`, and every stage stretches them about that root into the
 * fire's box: one hand-drawn fire, grown, rather than eight
 * drawn apart.
 */
import { n, type Pt } from './svg.js';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the tongues below are rooted, in the box they were drawn in, and how tall the outer flame stands above that. */
export const SHAPE_ROOT: Pt = [60, 138];
export const SHAPE_HEIGHT = 134;

/**
 * The tongues as drawn for the campfire, back to front: a tall slim flame
 * behind everything whose tip shows between the others; the red-orange outer
 * flame, its tips curling outwards; the orange inside it; the gold; and the
 * pale heart low down, where a fire is hottest. A side flame, leaning out,
 * licks up beside a big fire (drawn on the left; the right is its mirror),
 * and the crown is the Newroz fire's back flame, its tips standing round its
 * top.
 */
export const TONGUE_SHAPES = {
  back: 'M70 136C54 136 46 124 47 108C48 92 58 80 66 64C72 52 78 34 82 10C90 28 96 48 95 70C94 96 88 136 70 136Z',
  outer:
    'M60 138C35 138 16 122 16 100C16 84 26 62 21 42C29 52 35 57 41 60C43 42 47 22 56 4C61 22 70 37 77 49C83 41 90 33 97 22C106 42 109 70 104 98C100 122 84 138 60 138Z',
  flame:
    'M60 138C39 138 25 125 25 106C25 92 34 80 32 64C38 72 43 76 48 77C49 60 54 42 63 24C66 40 74 52 80 64C83 58 87 52 90 44C97 62 98 86 94 106C91 126 79 138 60 138Z',
  core: 'M60 138C45 138 34 128 34 112C34 98 42 88 48 78C53 70 56 60 58 48C64 60 72 70 78 82C83 92 86 102 86 112C86 128 75 138 60 138Z',
  heart: 'M60 138C49 138 42 130 42 120C42 109 49 101 53 94C56 89 58 84 59 77C62 84 65 89 68 94C72 101 78 109 78 120C78 130 71 138 60 138Z',
  side: 'M36 138C26 138 19 130 15 118C10 104 5 96 4 82C3 72 3 62 4 50C11 60 17 68 22 80C27 92 31 100 37 110C42 118 45 128 42 134C41 136 39 138 36 138Z',
  crown:
    'M60 138C38 138 20 126 20 104C20 88 18 72 12 40C20 50 25 56 30 62C29 44 31 28 36 10C42 26 46 36 50 44C53 30 57 16 63 2C67 16 70 30 72 42C76 32 81 22 88 8C93 26 94 44 92 60C97 54 102 46 110 36C108 56 102 76 100 98C98 124 82 138 60 138Z',
} as const;

export type TongueShape = keyof typeof TONGUE_SHAPES;

/** The tip of a flame breaking off: a small sliver just under the tip of a tongue (drawn for the campfire, like the tongues). */
export const WISP_SHAPES = {
  middle: 'M56 25C54 25 53 23 53.6 20.5C54.3 17.5 55.6 15 56 10C57 15 58.4 17.5 58.6 20.5C59 23 58 25 56 25Z',
  right: 'M96 41C94 41 93 39 93.6 36.5C94.3 33.5 95.6 31 96 26C97 31 98.4 33.5 98.6 36.5C99 39 98 41 96 41Z',
  left: 'M22 57C20 57 19 55 19.6 52.5C20.3 49.5 21.6 47 22 42C23 47 24.4 49.5 24.6 52.5C25 55 24 57 22 57Z',
} as const;

export type WispShape = keyof typeof WISP_SHAPES;

/** A path of absolute moves, lines and curves with every point moved by `f`. */
export function mapPath(d: string, f: (x: number, y: number) => Pt): string {
  return d.replace(/([MLC])([^MLCZ]*)/g, (_, cmd: string, args: string) => {
    const v = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const pairs: string[] = [];
    for (let i = 0; i + 1 < v.length; i += 2) {
      const [x, y] = f(v[i] as number, v[i + 1] as number);
      pairs.push(`${n(x)} ${n(y)}`);
    }
    return cmd + pairs.join(' ');
  });
}

/** A tongue mirrored left to right about the root it was drawn on. */
export const mirrored = (d: string): string => mapPath(d, (x, y) => [SHAPE_ROOT[0] * 2 - x, y]);

/** The box round a path of moves, lines and curves (a curve's handles included, so it never comes out smaller). */
export function pathBox(d: string): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  mapPath(d, (x, y) => {
    xs.push(x);
    ys.push(y);
    return [x, y];
  });
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** An ellipse as a closed path of four curves. */
export function oval(cx: number, cy: number, rx: number, ry: number): string {
  return pebble(cx, cy, rx, ry, ry, 0);
}

/**
 * A rounded lump `a` either side of (cx, cy), `top` above it and `bottom`
 * below, its crown pushed `lean` along: a stone, or an ellipse with no lean
 * and top and bottom alike.
 */
export function pebble(cx: number, cy: number, a: number, top: number, bottom: number, lean: number): string {
  const k = 0.5523;
  const p = (x: number, y: number): string => `${n(x)} ${n(y)}`;
  const tx = cx + lean;
  return (
    `M${p(cx - a, cy)}` +
    `C${p(cx - a, cy - top * k)} ${p(tx - a * k, cy - top)} ${p(tx, cy - top)}` +
    `C${p(tx + a * k, cy - top)} ${p(cx + a, cy - top * k)} ${p(cx + a, cy)}` +
    `C${p(cx + a, cy + bottom * k)} ${p(cx + a * k, cy + bottom)} ${p(cx, cy + bottom)}` +
    `C${p(cx - a * k, cy + bottom)} ${p(cx - a, cy + bottom * k)} ${p(cx - a, cy)}Z`
  );
}

/** A log seen from the side: a capsule `r` thick either side of the line from (x1, y1) to (x2, y2). */
function capsule(x1: number, y1: number, x2: number, y2: number, r: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1);
  // across the log, towards its upper edge
  const nx = (y2 - y1) / len;
  const ny = -(x2 - x1) / len;
  const p = (x: number, y: number, side: number): string => `${n(x + nx * r * side)} ${n(y + ny * r * side)}`;
  // each end a half circle, as two quarter curves
  const end = (x: number, y: number, from: number): string => {
    const k = 0.5523 * r;
    const [ax, ay] = [x + nx * r * from, y + ny * r * from];
    const [bx, by] = [x - nx * r * from, y - ny * r * from];
    // outwards along the log from this end
    const [ox, oy] = from === 1 ? [(x2 - x1) / len, (y2 - y1) / len] : [-(x2 - x1) / len, -(y2 - y1) / len];
    const [tx, ty] = [x + ox * r, y + oy * r];
    const q = (u: number, v: number): string => `${n(u)} ${n(v)}`;
    return (
      `C${q(ax + ox * k, ay + oy * k)} ${q(tx + nx * k * from, ty + ny * k * from)} ${q(tx, ty)}` +
      `C${q(tx - nx * k * from, ty - ny * k * from)} ${q(bx + ox * k, by + oy * k)} ${q(bx, by)}`
    );
  };
  return `M${p(x1, y1, 1)}L${p(x2, y2, 1)}${end(x2, y2, 1)}L${p(x1, y1, -1)}${end(x1, y1, -1)}Z`;
}

export type LogPart = 'bark' | 'barkShade' | 'barkLight' | 'cut' | 'ring' | 'char';

/**
 * A log from its sawn end (x1, y1), where its rings show, to (x2, y2): bark,
 * a lit edge along its top, the cut face; burnt black in two places along
 * its top once it has burnt and gone cold (`charred`).
 */
export function log(x1: number, y1: number, x2: number, y2: number, bark: 'bark' | 'barkShade', charred: boolean): { part: LogPart; d: string }[] {
  const r = 6.5;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const along = (t: number, lift: number): [number, number] => [x1 + (x2 - x1) * t + ((y2 - y1) / len) * lift, y1 + (y2 - y1) * t - ((x2 - x1) / len) * lift];
  const edge = (from: number, to: number, lift: number, thick: number): string => capsule(...along(from, lift), ...along(to, lift), thick);
  return [
    { part: bark, d: capsule(x1, y1, x2, y2, r) },
    { part: 'barkLight', d: edge(0.16, 0.74, 3.6, 1.2) },
    ...(charred
      ? [
          { part: 'char' as const, d: edge(0.3, 0.62, 2.6, 2.2) },
          { part: 'char' as const, d: edge(0.68, 0.76, 2, 1.5) },
        ]
      : []),
    { part: 'cut', d: oval(x1, y1, 4.4, r) },
    { part: 'ring', d: oval(x1, y1, 2, 3) },
  ];
}

/**
 * The hearth's ring of stones round the logs, seen from a little above:
 * the far ones small and behind the fire, the near ones bigger and in front
 * of the logs. Each a rounded lump with the fire's light on its top, a
 * little different from its neighbours so they read as stones, not beads.
 */
export function hearthStones(cx: number, cy: number, rx: number, ry: number): Record<'back' | 'front', { part: 'stone' | 'stoneLight'; d: string }[]> {
  const count = 18;
  const stones = Array.from({ length: count }, (_, i) => {
    // half a step round, so no stone sits dead in the middle in front
    const angle = ((i + 0.5) / count) * Math.PI * 2;
    const near = Math.sin(angle);
    // a fixed wobble per stone, the same on every machine
    const wobble = ((i * 7) % 5) / 4 - 0.5;
    const a = 8.6 + 2.2 * near + wobble * 1.6;
    const top = 5.6 + 1.6 * near - wobble * 0.8;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * near;
    return {
      near,
      y,
      pieces: [
        { part: 'stone' as const, d: pebble(x, y, a, top, top * 0.62, wobble * 2) },
        { part: 'stoneLight' as const, d: pebble(x + wobble, y - top * 0.42, a * 0.58, top * 0.42, top * 0.16, wobble * 1.4) },
      ],
    };
  });
  // the farthest drawn first, so a nearer stone overlaps its neighbour
  stones.sort((s, t) => s.y - t.y);
  return { back: stones.filter((s) => s.near <= 0).flatMap((s) => s.pieces), front: stones.filter((s) => s.near > 0).flatMap((s) => s.pieces) };
}

/**
 * The sun's rays round the Newroz fire, as one outline: thin pointed rays
 * standing out from `inner`, long and short by turns. As many as fill the
 * ring evenly, a number with no meaning of its own.
 */
export const HALO_RAYS = 32;

export function haloRays(cx: number, cy: number, inner: number, long: number, short: number): string {
  const p = (r: number, a: number): string => `${n(cx + r * Math.sin(a))} ${n(cy - r * Math.cos(a))}`;
  const half = (Math.PI / HALO_RAYS) * 0.72;
  let d = '';
  for (let i = 0; i < HALO_RAYS; i++) {
    const a = (i / HALO_RAYS) * Math.PI * 2;
    const reach = i % 2 === 0 ? long : short;
    d += `M${p(inner, a - half)}L${p(reach, a)}L${p(inner, a + half)}Z`;
  }
  return d;
}

/**
 * A thin ribbon along `line` (bottom first), `widths` thick at each of its
 * points: a curl of smoke, a wave of heat. Smoothed through its points, so a
 * few of them make a soft curve.
 */
export function ribbon(line: readonly Pt[], widths: readonly number[]): string {
  const side = (s: number): Pt[] =>
    line.map(([x, y], i) => {
      const [px, py] = line[Math.max(0, i - 1)] as Pt;
      const [qx, qy] = line[Math.min(line.length - 1, i + 1)] as Pt;
      const len = Math.hypot(qx - px, qy - py) || 1;
      const w = ((widths[i] ?? 1) / 2) * s;
      return [x + ((qy - py) / len) * w, y - ((qx - px) / len) * w];
    });
  const left = side(1);
  const right = side(-1).reverse();
  const p = ([x, y]: Pt): string => `${n(x)} ${n(y)}`;
  return `M${p(left[0] as Pt)}${smooth(left)}L${p(right[0] as Pt)}${smooth(right)}Z`;
}

/** Curves through `points` (Catmull-Rom as cubic Béziers), from the first, which is already reached. */
function smooth(points: readonly Pt[]): string {
  const at = (i: number): Pt => points[Math.max(0, Math.min(points.length - 1, i))] as Pt;
  const p = ([x, y]: Pt): string => `${n(x)} ${n(y)}`;
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const h1: Pt = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const h2: Pt = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += `C${p(h1)} ${p(h2)} ${p(c)}`;
  }
  return d;
}
