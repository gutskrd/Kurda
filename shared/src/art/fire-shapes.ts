/**
 * The outlines the streak's fire is drawn with, which `fire.ts` puts
 * together stage by stage: its layers of flame as first drawn for the
 * campfire, the light version's flame beside a number, the logs, the hearth
 * stones, the sun's halo, and the ribbons smoke and heat rise in. Only shapes
 * live here; how each stage places, colours and moves them is `fire.ts`'s.
 *
 * A layer of flame is a few points smoothed into one soft outline, its licks
 * laid in along it, so nothing in it can come to a point. The layers are kept
 * as drawn, in the campfire's own 120-wide box rooted at `SHAPE_ROOT`, and
 * every stage stretches them about that root into the fire's box: one fire,
 * grown, rather than eight drawn apart.
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
 * One lick of a flame: from the middle of its `foot`, `width` across, it
 * rises `length`, leaning `lean` degrees from straight up (positive to the
 * right) and turning `curl` degrees further by its tip, which is round,
 * `tip` across. Its points go up its left side, round its tip and down its
 * right, to be laid into a flame's outline between the points of its body.
 */
interface Lick {
  foot: Pt;
  length: number;
  width: number;
  tip: number;
  lean: number;
  curl: number;
}

function lick({ foot, length, width, tip, lean, curl }: Lick): Pt[] {
  const steps = 20;
  const line: { at: Pt; a: number }[] = [];
  let [x, y] = foot;
  for (let i = 0; i <= steps; i++) {
    // it turns more and more as it rises, as a curling flame does
    const a = ((lean + curl * (i / steps) ** 1.6) * Math.PI) / 180;
    line.push({ at: [x, y], a });
    x += (Math.sin(a) * length) / steps;
    y -= (Math.cos(a) * length) / steps;
  }
  const r = tip / 2;
  // a point on its left side (k = 1) or its right (k = -1), `s` of the way up, as it narrows to its tip
  const off = (s: number, k: number): Pt => {
    const { at, a } = line[Math.round(s * steps)]!;
    const half = r + (width / 2 - r) * (1 - s) ** 0.8;
    return [at[0] - Math.cos(a) * half * k, at[1] - Math.sin(a) * half * k];
  };
  const { at: c, a } = line[steps]!;
  const round = (deg: number): Pt => {
    const t = a + (deg * Math.PI) / 180;
    return [c[0] + Math.sin(t) * r, c[1] - Math.cos(t) * r];
  };
  return [off(0.4, 1), off(0.7, 1), round(-76), round(-38), round(0), round(38), round(76), off(0.7, -1), off(0.4, -1)];
}

/** The round bottom of the notch between two licks, at (x, y): two points `w` apart, so the outline turns there in a U, never a V. */
const notch = (x: number, y: number, w = 6): Pt[] => [
  [x - w / 2, y],
  [x + w / 2, y],
];

/** An outline stood taller or shorter about the root, so its top (handles and all) is `height` above it. */
function standing(d: string, height: number): string {
  const top = pathBox(d).y;
  const k = height / (SHAPE_ROOT[1] - top);
  return mapPath(d, (x, y) => [x, SHAPE_ROOT[1] + (y - SHAPE_ROOT[1]) * k]);
}

/** A long lick rising from inside the body, its tip curling back over it. */
const BACK_LICK = blob([
  [70, 136],
  [57, 129],
  [53, 110],
  ...lick({ foot: [66, 80], length: 70, width: 34, tip: 13, lean: 8, curl: -58 }),
  [87, 104],
  [84, 127],
]);

/**
 * The tongues as drawn for the campfire, back to front: a long lick behind
 * everything whose curling tip shows between the others (or, `tall`, stands
 * up over the whole body of a bigger fire); the red-orange outer flame, one
 * fat round body whose top parts into three licks, each curling at its round
 * tip; the orange inside it and the gold inside that, each rounder and lower;
 * and the pale heart, a round drop low down where a fire is hottest. A side
 * lick, leaning out and curling away, rises beside a big fire (drawn on the
 * left; the right is its mirror), and the crown is the Newroz fire's back
 * flame, three tall licks standing up between the body's own. Nowhere a
 * point: every tip, every notch between two licks is round.
 */
export const TONGUE_SHAPES = {
  back: standing(BACK_LICK, 128),
  tall: standing(BACK_LICK, SHAPE_HEIGHT),
  outer: standing(
    blob([
      [60, 138],
      [32, 134],
      [14, 121],
      [9, 104],
      [12, 88],
      [19, 76],
      ...lick({ foot: [33, 64], length: 26, width: 32, tip: 14, lean: -16, curl: -44 }),
      ...notch(45, 55, 9),
      ...lick({ foot: [59, 50], length: 46, width: 40, tip: 16, lean: 0, curl: -52 }),
      ...notch(74, 55, 9),
      ...lick({ foot: [87, 62], length: 30, width: 32, tip: 14, lean: 14, curl: 46 }),
      [101, 76],
      [108, 89],
      [111, 106],
      [105, 123],
      [88, 135],
    ]),
    SHAPE_HEIGHT,
  ),
  flame: blob([
    [60, 138],
    [37, 134],
    [23, 122],
    [19, 106],
    [23, 92],
    [30, 84],
    ...lick({ foot: [40, 76], length: 16, width: 26, tip: 13, lean: -12, curl: -34 }),
    ...notch(52, 70, 8),
    ...lick({ foot: [67, 64], length: 30, width: 34, tip: 15, lean: 6, curl: 44 }),
    [88, 82],
    [96, 96],
    [100, 110],
    [96, 124],
    [84, 134],
  ]),
  core: standing(
    blob([
      [60, 138],
      [42, 134],
      [31, 123],
      [28, 109],
      [32, 98],
      [38, 92],
      ...lick({ foot: [47, 86], length: 12, width: 20, tip: 11, lean: -10, curl: -28 }),
      ...notch(57, 83, 6),
      ...lick({ foot: [69, 80], length: 20, width: 26, tip: 13, lean: 8, curl: 34 }),
      [84, 96],
      [90, 108],
      [88, 123],
      [77, 134],
    ]),
    90,
  ),
  heart: blob([
    [60, 138],
    [47, 135],
    [42, 125],
    [43, 113],
    [48, 104],
    [52, 96],
    [56, 91.5],
    [60, 90],
    [64, 91.5],
    [68, 96],
    [72, 104],
    [77, 113],
    [78, 125],
    [73, 135],
  ]),
  side: blob([
    [36, 138],
    [27, 135],
    [19, 124],
    [16, 108],
    ...lick({ foot: [21, 94], length: 34, width: 26, tip: 12, lean: -6, curl: -40 }),
    [31, 98],
    [38, 113],
    [43, 126],
    [42, 135],
  ]),
  crown: standing(
    blob([
      [60, 138],
      [38, 134],
      [25, 120],
      [22, 100],
      [26, 82],
      ...lick({ foot: [40, 62], length: 40, width: 32, tip: 14, lean: -12, curl: -50 }),
      ...notch(52, 55, 7),
      ...lick({ foot: [63, 50], length: 50, width: 34, tip: 15, lean: 2, curl: 56 }),
      ...notch(75, 57, 7),
      ...lick({ foot: [85, 64], length: 38, width: 30, tip: 14, lean: 14, curl: 48 }),
      [95, 84],
      [98, 102],
      [95, 120],
      [83, 134],
    ]),
    136,
  ),
} as const;

export type TongueShape = keyof typeof TONGUE_SHAPES;

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

/** A piece of flame breaking off a tip: a small round drop hidden just under the tip of a lick (drawn for the campfire, like the tongues). */
export const WISP_SHAPES = {
  middle: oval(45, 14, 4, 4.4),
  right: oval(102, 39, 3.6, 4),
  left: oval(17, 43, 3.6, 4),
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
  const along = (t: number, lift: number): [number, number] => [x1 + (x2 - x1) * t + ((y2 - y1) / len) * lift, y1 + (y2 - y1) * t - ((x2 - x1) / len) * lift];
  const edge = (from: number, to: number, lift: number, thick: number): string => capsule(...along(from, lift), ...along(to, lift), thick);
  return [
    { part: bark, d: capsule(x1, y1, x2, y2, r) },
    { part: 'barkLight', d: edge(0.14, 0.8, 4.6, 2) },
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
 * of the logs. Each a round, plump pebble with the fire's light on its top,
 * a little different from its neighbours so they read as stones, not beads.
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
    return {
      near,
      y,
      pieces: [
        { part: 'stone' as const, d: pebble(x, y, a, top, top * 0.6, wobble * 2) },
        { part: 'stoneLight' as const, d: pebble(x + wobble, y - top * 0.4, a * 0.66, top * 0.5, top * 0.2, wobble * 1.4) },
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
