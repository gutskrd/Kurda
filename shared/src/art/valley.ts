/**
 * The painted valley: the colours and brushes the lesson path is drawn with (path-land.ts, valley-landmarks-1.ts and
 * -2.ts), so ground, road, stops and landmarks read as one painting. Flat planes with no outlines, each form one face
 * and one step of shade, light from the upper left and every shadow a flat patch of the ground's darker colour to the
 * lower right; no glows, bevels or gradients. On a dark screen the same painting is blended toward a dusk violet
 * (`dusk`), with fire and lit windows kept warm (`warm`).
 */
import { mix, n, type Pt } from './svg.js';

/** The day's colours; every drawing of the road takes its colours from here. */
export const VALLEY = {
  sky: '#f7efdf',
  far: '#cdd3df',
  farSnow: '#f6f7fa',
  mid: '#b9c9a6',
  near: '#a9c58a',
  meadow: '#d5e4a8',
  meadowShade: '#bfd291',
  wheat: '#ecd89c',
  wheatShade: '#d9c07e',
  furrowWheat: '#e0c784',
  green: '#c3dc90',
  greenShade: '#a9c777',
  earth: '#e5c99d',
  earthShade: '#cfae7e',
  furrow: '#d6b98a',
  dirt: '#efdcb2',
  dirtEdge: '#d8bf8c',
  dirtTrack: '#e6cf9f',
  path: '#ece6d2',
  pathEdge: '#d6cdb2',
  pebble: '#cbb185',
  water: '#8ec8df',
  waterLight: '#d3edf5',
  bank: '#b9cf8d',
  leaf: '#6fa452',
  leafLight: '#8fc06a',
  leafShade: '#4f8340',
  poplar: '#5d9548',
  poplarLight: '#7db35f',
  poplarShade: '#3f7136',
  trunk: '#8a5a36',
  trunkShade: '#664026',
  fruit: '#f0a346',
  apple: '#e0503f',
  blossom: '#f6c4d4',
  blossomWhite: '#fdf6f2',
  wall: '#e9c68f',
  wallSide: '#cf9f63',
  roof: '#f3dcae',
  parapet: '#d9b072',
  window: '#5a3a2a',
  gate: '#3e7fbf',
  gateDark: '#2d5f92',
  gateLight: '#4a8dcc',
  stone: '#e3dccb',
  stoneSide: '#c4b9a2',
  basalt: '#5f5e66',
  basaltLight: '#7d7c84',
  basaltSide: '#45444c',
  wool: '#fbf7ee',
  woolShade: '#e5ddcd',
  hoof: '#4a3a30',
  red: '#c8483a',
  redDark: '#9c3127',
  gold: '#e9a93b',
  goldDark: '#b8781f',
  goldLight: '#f8d690',
  indigo: '#2f416d',
  cream: '#fffaf0',
  ink: '#3d2a1f',
  snow: '#f7f9fc',
  snowShade: '#dde5ee',
  fire: '#f08a3c',
  fireCore: '#ffd36b',
  smoke: '#e7e3dc',
} as const;

/** The evening violet that `dusk` and `warm` blend toward. */
const DUSK = '#2a2448';

/** A day colour by evening: blended `amount` toward the dusk; fire and lit things use `warm` instead. */
export function dusk(hex: string, dark: boolean, amount = 0.26): string {
  return dark ? mix(hex, DUSK, amount) : hex;
}

/** A light that stays warm by evening (fire, a lit window, a finished stop's gold), only slightly dimmed. */
export function warm(hex: string, dark: boolean): string {
  return dark ? mix(hex, DUSK, 0.08) : hex;
}

// ─────────────────────────────────────────────────────────── shapes

const f = (v: number): string => n(v);

/** A smooth Catmull-Rom line through the points as cubic Béziers, open or closed. */
export function smoothPath(pts: readonly Pt[], closed = false): string {
  if (pts.length < 2) return '';
  const p = closed ? [pts[pts.length - 1]!, ...pts, pts[0]!, pts[1]!] : [pts[0]!, ...pts, pts[pts.length - 1]!];
  let d = `M${f(p[1]![0])} ${f(p[1]![1])}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [x0, y0] = p[i - 1]!;
    const [x1, y1] = p[i]!;
    const [x2, y2] = p[i + 1]!;
    const [x3, y3] = p[i + 2]!;
    d += `C${f(x1 + (x2 - x0) / 6)} ${f(y1 + (y2 - y0) / 6)} ${f(x2 - (x3 - x1) / 6)} ${f(y2 - (y3 - y1) / 6)} ${f(x2)} ${f(y2)}`;
  }
  return closed ? `${d}Z` : d;
}

/** A soft, hand-cut round: `points` points about an ellipse, each pushed in or out by up to `jitter` of the radius. */
export function blobPath(cx: number, cy: number, rx: number, ry: number, points: number, jitter: number, random: () => number, rot = 0): string {
  const pts: Pt[] = [];
  for (let i = 0; i < points; i++) {
    const a = rot + (i / points) * Math.PI * 2;
    const k = 1 + (random() - 0.5) * jitter;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smoothPath(pts, true);
}

/** An ellipse as a path, so many can share one element. */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0Z`;
}

/** A filled path. */
export const fill = (d: string, colour: string): string => (d ? `<path d="${d}" fill="${colour}"/>` : '');

/** A stroked line with round ends. */
export const stroke = (d: string, colour: string, width: number): string =>
  d ? `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>` : '';

// ─────────────────────────────────────────────────────────── brushes

/** The foliage of one tree kind, as three tones and what hangs in it. */
export interface Foliage {
  face: string;
  light: string;
  shade: string;
  /** Small round fruit or blossom dotted through the crown. */
  dots?: string;
}

/**
 * A round-crowned tree with its foot at (x, y), `s` times the size of a roadside apricot: its shadow to the lower
 * right, the trunk, the crown's shade, face and lit cap, and what hangs in it.
 */
export function roundTree(x: number, y: number, s: number, leaf: Foliage, ground: string, random: () => number): string {
  let out = fill(ellipsePath(x + 5 * s, y + 2, 15 * s, 5 * s), ground);
  out += fill(`M${f(x - 1.6 * s)} ${f(y)}L${f(x - 1.2 * s)} ${f(y - 12 * s)}L${f(x + 1.2 * s)} ${f(y - 12 * s)}L${f(x + 1.6 * s)} ${f(y)}Z`, VALLEY.trunk);
  out += fill(blobPath(x, y - 20 * s, 15 * s, 13 * s, 9, 0.22, random), leaf.shade);
  out += fill(blobPath(x - 1.5 * s, y - 22 * s, 13.5 * s, 11.5 * s, 9, 0.2, random), leaf.face);
  out += fill(blobPath(x - 5 * s, y - 26 * s, 7 * s, 5.5 * s, 7, 0.25, random), leaf.light);
  if (leaf.dots) {
    let dots = '';
    for (let k = 0; k < 5; k++) dots += ellipsePath(x - 9 * s + random() * 18 * s, y - 28 * s + random() * 14 * s, 1.7 * s, 1.7 * s);
    out += fill(dots, leaf.dots);
  }
  return out;
}

/** A poplar: lit on its left, shaded on its right, with a streak of light down its lit side. */
export function poplar(x: number, y: number, s: number, leaf: Foliage, ground: string): string {
  const top = y - 52 * s;
  const mid = y - 26 * s;
  let out = fill(ellipsePath(x + 8 * s, y + 1, 12 * s, 3.5 * s), ground);
  out += fill(`M${f(x - 1.2 * s)} ${f(y - 8 * s)}h${f(2.4 * s)}v${f(8 * s)}h${f(-2.4 * s)}Z`, VALLEY.trunk);
  out += fill(
    `M${f(x)} ${f(top)}C${f(x + 9 * s)} ${f(top + 14 * s)} ${f(x + 9 * s)} ${f(mid + 18 * s)} ${f(x)} ${f(y - 6 * s)}C${f(x - 9 * s)} ${f(mid + 18 * s)} ${f(x - 9 * s)} ${f(top + 14 * s)} ${f(x)} ${f(top)}Z`,
    leaf.shade,
  );
  out += fill(
    `M${f(x)} ${f(top)}C${f(x - 9 * s)} ${f(top + 14 * s)} ${f(x - 9 * s)} ${f(mid + 18 * s)} ${f(x)} ${f(y - 6 * s)}C${f(x - 1 * s)} ${f(mid)} ${f(x + 1 * s)} ${f(top + 16 * s)} ${f(x)} ${f(top)}Z`,
    leaf.face,
  );
  out += stroke(`M${f(x - 2 * s)} ${f(top + 8 * s)}C${f(x - 6 * s)} ${f(top + 18 * s)} ${f(x - 6 * s)} ${f(mid)} ${f(x - 3 * s)} ${f(mid + 8 * s)}`, leaf.light, 2.2 * s);
  return out;
}

/** A low bush. */
export function bush(x: number, y: number, s: number, leaf: Foliage, ground: string, random: () => number): string {
  let out = fill(ellipsePath(x + 3 * s, y, 10 * s, 3.5 * s), ground);
  out += fill(blobPath(x, y - 6 * s, 10 * s, 7 * s, 8, 0.25, random), leaf.shade);
  out += fill(blobPath(x - 1.5 * s, y - 7.5 * s, 7.5 * s, 5 * s, 7, 0.25, random), leaf.face);
  return out;
}

// ─────────────────────────────────────────────────────────── trees that grow

/** One lobe of a tree's crown: its centre and its reach across and up. */
export interface CrownLobe {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** A limb: where it leaves the trunk, a point it bends through, where it ends in the crown, and its starting thickness. */
export interface TreeLimb {
  from: Pt;
  bend: Pt;
  to: Pt;
  width: number;
}

/**
 * A tree as it grows: a trunk from its foot to the fork, limbs up into the crown, and the crown as a few lobes. Lobes
 * are drawn over the limbs, so every limb must end well inside one or it would stop short of its leaves.
 */
export interface TreeShape {
  foot: Pt;
  /** The trunk's thickness at its foot. */
  base: number;
  /** Where the trunk divides into limbs. */
  fork: Pt;
  limbs: readonly TreeLimb[];
  lobes: readonly CrownLobe[];
  /** How far the crown's edge strays from a smooth round, as a share of its size (a blossoming crown is ragged). */
  rough?: number;
  /** The size of what hangs in the crown: fruit, or blossom. */
  dot?: number;
  /** Whether it casts its own shadow; not when the picture lays one broad shade under everything. */
  shadow?: boolean;
}

/** A lobe's lit face: a little smaller than its shade and shifted toward the light at the upper left. */
const faceOf = (l: CrownLobe): CrownLobe => ({ x: l.x - l.rx * 0.06, y: l.y - l.ry * 0.08, rx: l.rx * 0.9, ry: l.ry * 0.88 });

/** Whether a point lies inside a lobe's face, `margin` of the way in from its edge, so a hand-cut edge never uncovers it. */
function withinFace(p: Pt, lobe: CrownLobe, margin: number): boolean {
  const f = faceOf(lobe);
  const k = 1 - margin;
  return ((p[0] - f.x) / (f.rx * k)) ** 2 + ((p[1] - f.y) / (f.ry * k)) ** 2 <= 1;
}

/** Whether every limb ends inside a lobe's face (a quarter of the way in), and a limbless trunk forks inside the crown. */
export function limbsReachCrown(t: TreeShape): boolean {
  const inCrown = (p: Pt): boolean => t.lobes.some((l) => withinFace(p, l, 0.25));
  if (t.lobes.length === 0) return false;
  if (t.limbs.length === 0) return inCrown(t.fork);
  return t.limbs.every((limb) => inCrown(limb.to));
}

/** A closed polygon through the points. */
export const polygon = (pts: readonly Pt[]): string => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

/** A limb as a filled shape thinning from `width` to a third of that, along a curve through its bend. */
function limbPath(limb: TreeLimb): string {
  const at = (t: number): Pt => {
    const u = 1 - t;
    return [u * u * limb.from[0] + 2 * u * t * limb.bend[0] + t * t * limb.to[0], u * u * limb.from[1] + 2 * u * t * limb.bend[1] + t * t * limb.to[1]];
  };
  const left: Pt[] = [];
  const right: Pt[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = at(t);
    const [ax, ay] = at(Math.max(0, t - 0.05));
    const [bx, by] = at(Math.min(1, t + 0.05));
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const half = (limb.width * (1 - t * 0.66)) / 2;
    left.push([x - ((by - ay) / len) * half, y + ((bx - ax) / len) * half]);
    right.push([x + ((by - ay) / len) * half, y - ((bx - ax) / len) * half]);
  }
  return polygon([...left, ...right.reverse()]);
}

/**
 * A tree drawn from its shape: shadow, trunk with its right side darker, the crown's shade, limbs up into it, the lit
 * face over their ends, one patch of light at the upper left, and hand-placed fruit or blossom. A tree whose limbs stop
 * short of its crown throws, so no drawing shows a branch hanging in the air.
 */
export function grownTree(t: TreeShape, leaf: Foliage, bark: { face: string; shade: string }, ground: string, random: () => number): string {
  if (!limbsReachCrown(t)) throw new RangeError('art: a tree whose limbs stop short of its crown');
  const [fx, fy] = t.foot;
  const [kx, ky] = t.fork;
  const left = Math.min(...t.lobes.map((l) => l.x - l.rx));
  const right = Math.max(...t.lobes.map((l) => l.x + l.rx));
  const spread = right - left;
  let out = t.shadow === false ? '' : fill(ellipsePath(fx + spread * 0.16, fy + 0.8, spread * 0.4, Math.max(1.8, spread * 0.08)), ground);
  // The trunk flares a little at its foot and narrows to the fork; its right side is in shade.
  const b = t.base / 2;
  const k = (t.base * 0.62) / 2;
  out += fill(polygon([[fx - b * 1.25, fy], [fx - b * 0.8, fy - b], [kx - k, ky], [kx + k, ky], [fx + b * 0.8, fy - b], [fx + b * 1.2, fy]]), bark.face);
  out += fill(polygon([[fx + b * 0.15, fy], [kx + k * 0.25, ky], [kx + k, ky], [fx + b * 0.8, fy - b], [fx + b * 1.2, fy]]), bark.shade);
  const rough = t.rough ?? 0.14;
  out += fill(t.lobes.map((l) => blobPath(l.x + 1.1, l.y + 1.5, l.rx, l.ry, 9, rough, random)).join(''), leaf.shade);
  out += fill(t.limbs.map(limbPath).join(''), bark.face);
  out += fill(t.lobes.map((l) => {
    const face = faceOf(l);
    return blobPath(face.x, face.y, face.rx, face.ry, 9, rough, random);
  }).join(''), leaf.face);
  // The patch of light sits on the lobe that reaches highest toward the upper left.
  const lit = [...t.lobes].sort((a, c) => a.x - a.rx * 0.5 + (a.y - a.ry) - (c.x - c.rx * 0.5 + (c.y - c.ry)))[0]!;
  out += fill(blobPath(lit.x - lit.rx * 0.32, lit.y - lit.ry * 0.38, lit.rx * 0.46, lit.ry * 0.34, 7, 0.2, random), leaf.light);
  if (leaf.dots) {
    // Fruit or flowers placed one by one, never on top of another.
    let dots = '';
    const placed: Array<[number, number, number]> = [];
    const size = t.dot ?? Math.max(0.9, spread / 26);
    const count = Math.round(Math.min(18, 3 + (spread / 5) * Math.min(2, 1.3 / size)));
    for (let tries = 0; placed.length < count && tries < count * 10; tries++) {
      const lobe = t.lobes[Math.floor(random() * t.lobes.length)]!;
      const p: Pt = [lobe.x + (random() * 2 - 1) * lobe.rx, lobe.y + (random() * 2 - 1) * lobe.ry];
      const r = (0.75 + random() * 0.6) * size;
      if (!withinFace(p, lobe, 0.18) || placed.some(([x, y, q]) => Math.hypot(x - p[0], y - p[1]) < (r + q) * 1.5)) continue;
      placed.push([p[0], p[1], r]);
      dots += ellipsePath(p[0], p[1], r, r * (0.85 + random() * 0.2));
    }
    out += fill(dots, leaf.dots);
  }
  return out;
}

/**
 * A small orchard tree at (x, y), `s` times a roadside apricot: a short trunk forking into three limbs, each ending in a
 * crown lobe, with a fourth lobe filling in below. `lean` shifts the crown sideways, and `random` sizes the lobes so no
 * two trees match.
 */
export function orchardTree(x: number, y: number, s: number, lean: number, random: () => number): TreeShape {
  const v = (): number => 0.9 + random() * 0.2;
  const fork: Pt = [x + lean * 0.5 * s, y - 10 * s];
  const at = (dx: number, dy: number): Pt => [x + (dx + lean) * s, y - dy * s];
  const ends = [at(-7, 21), at(1.4, 25.6), at(8.2, 20.4)] as const;
  return {
    foot: [x, y],
    base: 2.8 * s,
    fork,
    limbs: [
      { from: fork, bend: at(-3.6, 15), to: ends[0], width: 1.6 * s },
      { from: fork, bend: at(0.6, 17), to: ends[1], width: 1.8 * s },
      { from: fork, bend: at(4.6, 15.4), to: ends[2], width: 1.4 * s },
    ],
    lobes: [
      { x: ends[0][0], y: ends[0][1], rx: 8 * s * v(), ry: 6.6 * s * v() },
      { x: ends[1][0], y: ends[1][1], rx: 9 * s * v(), ry: 7.4 * s * v() },
      { x: ends[2][0], y: ends[2][1], rx: 7 * s * v(), ry: 6 * s * v() },
      { x: x + (1 + lean) * s, y: y - 18.4 * s, rx: 7.4 * s, ry: 4.8 * s },
    ],
  };
}

/** The fruit trees' bark by day or evening: its face and its shaded side. */
export function bark(dark: boolean): { face: string; shade: string } {
  return { face: dusk(VALLEY.trunk, dark), shade: dusk(VALLEY.trunkShade, dark) };
}

/** A sheep grazing, facing right (`flip` -1 faces left). */
export function sheep(x: number, y: number, flip: 1 | -1, ground: string, dark: boolean): string {
  const wool = dusk(VALLEY.wool, dark, 0.2);
  const shade = dusk(VALLEY.woolShade, dark, 0.2);
  const hoof = dusk(VALLEY.hoof, dark, 0.15);
  return (
    fill(ellipsePath(x + 2, y + 7, 9, 2.5), ground) +
    `<g transform="translate(${f(x)} ${f(y)}) scale(${flip} 1)">` +
    fill('M-5 2h1.8v6h-1.8zM3 2h1.8v6h-1.8z', hoof) +
    fill('M-9 0C-10 -6 -4 -9 0 -7C4 -10 10 -6 9 0C10 5 4 6 0 5C-4 7 -10 5 -9 0Z', wool) +
    stroke('M-6 4C-2 6 4 6 8 3', shade, 2) +
    fill(ellipsePath(10, -1, 3.6, 3), hoof) +
    '</g>'
  );
}

/** Three or four small flowers in a patch. */
export function flowers(x: number, y: number, colour: string): string {
  return fill([[0, 0], [5, 2], [2, 5], [-4, 3]].map(([dx, dy]) => ellipsePath(x + dx!, y + dy!, 1.6, 1.6)).join(''), colour);
}

/**
 * A flat-roofed earth house seen a little from above and to the right: its front `w` × `h` with its left foot at
 * (x, y), its side `d` deep in shade, the lit roof with a low parapet, a window, and an optional door.
 */
export function earthHouse(
  x: number,
  y: number,
  w: number,
  h: number,
  d: number,
  opts: { dark: boolean; ground: string; door?: string; roofLine?: string },
): string {
  const c = (hex: string): string => dusk(hex, opts.dark);
  let out = fill(`M${f(x + w)} ${f(y)}l${f(d)} ${f(-d * 0.5)}l10 6l${f(-d)} ${f(d * 0.5)}Z`, opts.ground);
  out += fill(`M${f(x + w)} ${f(y)}l${f(d)} ${f(-d * 0.5)}v${f(-h)}l${f(-d)} ${f(d * 0.5)}Z`, c(VALLEY.wallSide));
  out += fill(`M${f(x)} ${f(y - h)}h${f(w)}v${f(h)}h${f(-w)}Z`, c(VALLEY.wall));
  out += fill(`M${f(x)} ${f(y - h)}l${f(d)} ${f(-d * 0.5)}h${f(w)}l${f(-d)} ${f(d * 0.5)}Z`, c(VALLEY.roof));
  out += stroke(`M${f(x)} ${f(y - h)}h${f(w)}l${f(d)} ${f(-d * 0.5)}`, c(VALLEY.parapet), 2);
  out += fill(`M${f(x + w * 0.62)} ${f(y - h * 0.62)}h${f(w * 0.16)}v${f(h * 0.22)}h${f(-w * 0.16)}Z`, opts.dark ? warm('#f2c35c', true) : VALLEY.window);
  if (opts.door) out += fill(`M${f(x + w * 0.16)} ${f(y)}v${f(-h * 0.5)}a${f(w * 0.11)} ${f(w * 0.11)} 0 0 1 ${f(w * 0.22)} 0v${f(h * 0.5)}Z`, c(opts.door));
  // Apricots drying on the roof, a warm row of dots.
  if (opts.roofLine) out += `<path d="M${f(x + d * 0.3 + 6)} ${f(y - h - d * 0.2)}h${f(w - 12)}" stroke="${c(opts.roofLine)}" stroke-width="2.4" stroke-dasharray="2.4 2.2" stroke-linecap="round"/>`;
  return out;
}

/** The valley trees' leaves by day or evening, with an orchard's fruit. */
export function foliage(dark: boolean, dots?: string): Foliage {
  return {
    face: dusk(VALLEY.leaf, dark),
    light: dusk(VALLEY.leafLight, dark),
    shade: dusk(VALLEY.leafShade, dark),
    ...(dots ? { dots: dusk(dots, dark, 0.2) } : {}),
  };
}

/** A poplar's leaves by day or evening. */
export function poplarLeaves(dark: boolean): Foliage {
  return { face: dusk(VALLEY.poplar, dark), light: dusk(VALLEY.poplarLight, dark), shade: dusk(VALLEY.poplarShade, dark) };
}

// ─────────────────────────────────────────────────────────── landmarks

/**
 * A landmark's one moving part, which the apps lay over it and animate (`pathLoopSvg`): the flag of Kurdistan
 * (`colours`), steam or smoke, rippling water, the Newroz flame, a bee, or the bus stop's sign.
 */
export type ValleyLoopKind = 'steam' | 'water' | 'colours' | 'flame' | 'smoke' | 'bee' | 'sign';

/**
 * A chapter's landmark on the 120-unit canvas: its drawing (foot near y 114, spanning about x 4 to x 116, shadow
 * included), and the box where its moving part sits at rest, which the apps lay the moving sprite into.
 */
export interface ValleyLandmark {
  /** `page` is set when drawn on a page of its own colour (a chapter opener, a stamp), which leaves out the land behind it. */
  draw: (dark: boolean, random: () => number, page?: boolean) => string;
  loop: { kind: ValleyLoopKind; x: number; y: number; w: number; h: number };
}

// ─────────────────────────────────────────────────────────── the flag of Kurdistan

/**
 * The flag's colours, softened to sit in the painting but true enough that it cannot be mistaken for another flag, with
 * each band a step darker where the cloth folds away from the light.
 */
const FLAG = {
  red: '#dc3a32',
  redShade: '#b42d27',
  white: '#fbf9f3',
  whiteShade: '#dcd7cb',
  green: '#2f9247',
  greenShade: '#237238',
  sun: '#f6b821',
} as const;

type Cubic = readonly [Pt, Pt, Pt, Pt];

/**
 * The flag of Kurdistan as the school flies it, on a 20 × 16 canvas with the pole along the left edge: equal bands of
 * red, white and green with the golden sun of twenty-one rays (one straight up) in the white. The cloth is 2:3. `top`
 * is its upper edge from pole to free end, one easy wave; every band follows it.
 */
export const KURDISTAN_FLAG = {
  w: 20,
  h: 16,
  depth: 12.2,
  rays: 21,
  top: [[0.5, 1], [6.6, -0.1], [12.4, 2.5], [18.8, 1.4]] as Cubic,
} as const;

/** The point `t` of the way along a cubic Bézier. */
function cubicAt([a, b, c, d]: Cubic, t: number): Pt {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
  return [w[0] * a[0] + w[1] * b[0] + w[2] * c[0] + w[3] * d[0], w[0] * a[1] + w[1] * b[1] + w[2] * c[1] + w[3] * d[1]];
}

/** The part of a cubic Bézier between `t0` and `t1` as a cubic of its own (de Casteljau subdivision, twice). */
function cubicPart(q: Cubic, t0: number, t1: number): Cubic {
  const split = ([a, b, c, d]: Cubic, t: number): [Cubic, Cubic] => {
    const l = (p: Pt, r: Pt): Pt => [p[0] + (r[0] - p[0]) * t, p[1] + (r[1] - p[1]) * t];
    const [ab, bc, cd] = [l(a, b), l(b, c), l(c, d)];
    const [abc, bcd] = [l(ab, bc), l(bc, cd)];
    const m = l(abc, bcd);
    return [[a, ab, abc, m], [m, bcd, cd, d]];
  };
  return split(split(q, t1)[0], t0 / t1)[1];
}

/** The cloth under a stretch of the top edge, from `from` to `to` below it: along the edge, down, back along the lowered edge, and up. */
function cloth(edge: Cubic, from: number, to: number): string {
  const at = ([x, y]: Pt, dy: number): string => `${f(x)} ${f(y + dy)}`;
  const [a, b, c, d] = edge;
  return `M${at(a, from)}C${at(b, from)} ${at(c, from)} ${at(d, from)}L${at(d, to)}C${at(c, to)} ${at(b, to)} ${at(a, to)}Z`;
}

/** The sun's centre and size: in the middle of the white, halfway along the cloth, its rays almost reaching the red and green. */
export function kurdistanSun(): { x: number; y: number; r: number; disc: number } {
  const { top, depth } = KURDISTAN_FLAG;
  const middle = (top[0][0] + top[3][0]) / 2;
  // The edge moves steadily away from the pole, so bisection finds the point above the cloth's middle.
  let [lo, hi] = [0, 1];
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2;
    if (cubicAt(top, t)[0] < middle) lo = t;
    else hi = t;
  }
  const r = (depth / 3) * 0.47;
  return { x: middle, y: cubicAt(top, lo)[1] + depth / 2, r, disc: r * 0.56 };
}

/**
 * The flag of Kurdistan (`KURDISTAN_FLAG`) painted flat on its own canvas: the three bands, one shaded fold toward the
 * free end, and the sun clear of the fold. The school draws it at rest and the apps lay the same cloth over it to move
 * in the wind (`pathLoopSvg`), so the two always match.
 */
export function kurdistanFlag(dark: boolean): string {
  const c = (hex: string): string => dusk(hex, dark);
  const { top, depth, rays } = KURDISTAN_FLAG;
  const third = depth / 3;
  // Each band runs a hair under the next, which overlaps it, so no seam opens between them.
  const bands = (edge: Cubic, red: string, white: string, green: string): string =>
    fill(cloth(edge, 0, third + 0.2), c(red)) + fill(cloth(edge, third, 2 * third + 0.2), c(white)) + fill(cloth(edge, 2 * third, depth), c(green));
  let out = bands(top, FLAG.red, FLAG.white, FLAG.green);
  out += bands(cubicPart(top, 0.66, 0.86), FLAG.redShade, FLAG.whiteShade, FLAG.greenShade);
  // The sun: rays round its disc, drawn at ten times the size and scaled down so the fine points keep their places.
  const sun = kurdistanSun();
  const pts: Pt[] = [];
  for (let k = 0; k < rays; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / rays;
    pts.push([Math.cos(a) * sun.r * 10, Math.sin(a) * sun.r * 10]);
    pts.push([Math.cos(a + Math.PI / rays) * sun.disc * 10, Math.sin(a + Math.PI / rays) * sun.disc * 10]);
  }
  out += `<g transform="translate(${f(sun.x)} ${f(sun.y)}) scale(0.1)">${fill(polygon(pts), c(FLAG.sun))}</g>`;
  return out;
}

/** The flag at rest in a landmark's loop box, flying from the box's left edge: the same cloth the apps animate over it. */
export function kurdistanFlagAt(box: { x: number; y: number; w: number }, dark: boolean): string {
  return `<g transform="translate(${f(box.x)} ${f(box.y)}) scale(${n(box.w / KURDISTAN_FLAG.w)})">${kurdistanFlag(dark)}</g>`;
}
