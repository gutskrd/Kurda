/**
 * The outlines the streak's fire is drawn with, which `fire.ts` puts
 * together stage by stage: the light version's flame beside a number, the
 * logs, the hearth stones, the sun's halo, and the ribbon smoke rises in.
 * Only shapes live here; how each stage places, colours and moves them is
 * `fire.ts`'s. (The whole fire's flame is painted: `fire-sprites.ts`.)
 *
 * A layer of the small flame is a few points smoothed into one soft outline,
 * so nothing in it can come to a point.
 */
import { n, type Pt } from './svg.js';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the small flame below is rooted, in the 120-wide box it was drawn in. */
export const SHAPE_ROOT: Pt = [60, 138];

/** Curves through `points` and back to the first (Catmull-Rom as cubic Béziers): a few points make one soft shape with no corner anywhere. */
function blob(points: readonly Pt[]): string {
  const at = (i: number): Pt => points[(i + points.length) % points.length] as Pt;
  const p = ([x, y]: Pt): string => `${n(x)} ${n(y)}`;
  let d = `M${p(at(0))}`;
  for (let i = 0; i < points.length; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${p([b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6])} ${p([c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6])} ${p(c)}`;
  }
  return `${d}Z`;
}

/**
 * The light version's flame, beside a number: a bold, nearly round body
 * whose top parts into two round lobes, the left one small and low, with a
 * plain round drop of gold inside it and a pale drop of a heart in that;
 * drawn to fill its box, rooted where the big fire's are.
 */
export const SMALL_SHAPES = {
  outer: blob([
    [60, 138],
    [33, 134],
    [16, 118],
    [11, 96],
    [14, 74],
    [21, 58],
    [28, 47],
    [33, 40],
    [39, 39],
    [44, 43],
    [47, 49],
    [50, 49],
    [53, 40],
    [58, 28],
    [64, 19],
    [71, 15],
    [78, 16],
    [86, 23],
    [95, 36],
    [102, 53],
    [107, 74],
    [108, 96],
    [103, 118],
    [87, 133],
  ]),
  core: blob([
    [60, 138],
    [40, 133],
    [30, 118],
    [31, 100],
    [38, 86],
    [47, 75],
    [56, 66],
    [63, 62],
    [69, 65],
    [77, 76],
    [86, 90],
    [90, 106],
    [88, 122],
    [78, 134],
  ]),
  heart: blob([
    [60, 134],
    [49, 130],
    [44, 120],
    [45, 108],
    [50, 99],
    [56, 93],
    [60, 91],
    [64, 93],
    [70, 99],
    [75, 108],
    [76, 120],
    [71, 130],
  ]),
} as const;

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

/** A ring from radius `inner` out to `outer`: a circle with a hole, the hole drawn the other way round so it stays open. */
export function ring(cx: number, cy: number, inner: number, outer: number): string {
  const back = mapPath(oval(cx, cy, inner, inner), (x, y) => [x, cy * 2 - y]);
  return oval(cx, cy, outer, outer) + back;
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
 * A chunky round log from its sawn end (x1, y1), where its rings show, to
 * (x2, y2): bark, the fire's light along its top, the cut face; burnt black
 * in two places along its top once it has burnt and gone cold (`charred`).
 */
export function log(x1: number, y1: number, x2: number, y2: number, bark: 'bark' | 'barkShade', charred: boolean): { part: LogPart; d: string }[] {
  const r = 8.5;
  const len = Math.hypot(x2 - x1, y2 - y1);
  // lifted towards the log's top, whichever way along it is drawn: the side the fire lights
  const up = x2 >= x1 ? 1 : -1;
  const along = (t: number, lift: number): [number, number] => [x1 + (x2 - x1) * t + ((y2 - y1) / len) * lift * up, y1 + (y2 - y1) * t - ((x2 - x1) / len) * lift * up];
  const edge = (from: number, to: number, lift: number, thick: number): string => capsule(...along(from, lift), ...along(to, lift), thick);
  return [
    { part: bark, d: capsule(x1, y1, x2, y2, r) },
    { part: 'barkLight', d: edge(0.12, 0.84, 5.4, 2.6) },
    ...(charred
      ? [
          { part: 'char' as const, d: edge(0.3, 0.6, 3.6, 2.8) },
          { part: 'char' as const, d: edge(0.68, 0.76, 3, 2) },
        ]
      : []),
    { part: 'cut', d: oval(x1, y1, 5.8, r) },
    { part: 'ring', d: oval(x1, y1, 2.6, 4) },
  ];
}

/**
 * The hearth's ring of stones round the logs, seen from a little above:
 * the far ones small and behind the fire, the near ones bigger and in front
 * of the logs. Each a round, plump pebble lit by the fire on the face towards
 * it, a little different from its neighbours so they read as stones, not
 * beads.
 */
export function hearthStones(cx: number, cy: number, rx: number, ry: number): Record<'back' | 'front', { part: 'stone' | 'stoneLight'; d: string }[]> {
  const count = 14;
  const stones = Array.from({ length: count }, (_, i) => {
    // half a step round, so no stone sits dead in the middle in front
    const angle = ((i + 0.5) / count) * Math.PI * 2;
    const near = Math.sin(angle);
    // a fixed wobble per stone, the same on every machine
    const wobble = ((i * 7) % 5) / 4 - 0.5;
    const a = 10.4 + 2.4 * near + wobble * 1.6;
    const top = 6.8 + 1.8 * near - wobble * 0.8;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * near;
    // the fire's light on the face towards it, on the side nearer the fire: the far stones' faces, which face us too, broadly
    // lit; the near ones' backs turned away from us, so only a rim of light along their tops
    const inward = -Math.cos(angle) * a * 0.22;
    const light = near <= 0 ? pebble(x + inward, y - top * 0.12, a * 0.78, top * 0.62, top * 0.4, wobble) : pebble(x + inward, y - top * 0.62, a * 0.7, top * 0.36, top * 0.12, wobble * 1.4);
    return {
      near,
      y,
      pieces: [
        { part: 'stone' as const, d: pebble(x, y, a, top, top * 0.6, wobble * 2) },
        { part: 'stoneLight' as const, d: light },
      ],
    };
  });
  // the farthest drawn first, so a nearer stone overlaps its neighbour
  stones.sort((s, t) => s.y - t.y);
  return { back: stones.filter((s) => s.near <= 0).flatMap((s) => s.pieces), front: stones.filter((s) => s.near > 0).flatMap((s) => s.pieces) };
}

/**
 * The sun's rays round the Newroz fire, as one outline: soft rays standing
 * out from `inner`, narrowing to a round end, long and short by turns. As
 * many as fill the ring evenly, a number with no meaning of its own.
 */
export const HALO_RAYS = 32;

export function haloRays(cx: number, cy: number, inner: number, long: number, short: number): string {
  // a point `r` out along the ray at angle `a`, moved `side` across it
  const p = (r: number, a: number, side = 0): string => `${n(cx + r * Math.sin(a) + side * Math.cos(a))} ${n(cy - r * Math.cos(a) + side * Math.sin(a))}`;
  const foot = inner * Math.tan((Math.PI / HALO_RAYS) * 0.72);
  const end = foot * 0.3;
  let d = '';
  for (let i = 0; i < HALO_RAYS; i++) {
    const a = (i / HALO_RAYS) * Math.PI * 2;
    const reach = (i % 2 === 0 ? long : short) - end;
    // up one side, round its end in one curve, down the other
    d += `M${p(inner, a, -foot)}L${p(reach, a, -end)}C${p(reach + end * 1.33, a, -end)} ${p(reach + end * 1.33, a, end)} ${p(reach, a, end)}L${p(inner, a, foot)}Z`;
  }
  return d;
}

/**
 * A thin ribbon along `line` (bottom first), `widths` thick at each of its
 * points: a curl of smoke. Smoothed through its points, so a
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
