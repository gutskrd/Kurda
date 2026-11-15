/**
 * The painted valley: the colours and brushes the lesson path is drawn with
 * (art/path-land.ts and art/valley-landmarks.ts), so the ground, the road,
 * the stops and every chapter's landmark read as one painting.
 *
 * The owner chose this look for the Kurmanji Road: Hamo's country seen from a
 * little above in the late afternoon — terraced fields, poplars and orchards,
 * earth houses with flat roofs, the far Zagros — painted in flat planes with
 * no outlines, each form one face and one step of shade, the light from the
 * upper left and every shadow a flat patch of the ground's own darker colour
 * to the lower right. Nothing glows, nothing is bevelled, no gradients.
 *
 * By evening (a dark screen) the same painting is taken toward the dusk's
 * violet (`dusk`), as the village is, keeping fire and lit windows warm.
 */
import { mix, n, type Pt } from './svg.js';

/** The day's colours. Every drawing of the road takes its colours from here, so a change here repaints the whole valley. */
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

/** The evening's violet, as the village's dusk (art/kingdom/pen.ts). */
const DUSK = '#2a2448';

/** A day colour as the evening shows it: taken `amount` toward the dusk; fire and lit things are passed through `warm`. */
export function dusk(hex: string, dark: boolean, amount = 0.26): string {
  return dark ? mix(hex, DUSK, amount) : hex;
}

/** A light that stays warm by evening (fire, a lit window, the gold of a finished stop), only a little dimmed. */
export function warm(hex: string, dark: boolean): string {
  return dark ? mix(hex, DUSK, 0.08) : hex;
}

// ─────────────────────────────────────────────────────────── shapes

const f = (v: number): string => n(v);

/** A smooth line through the points (Catmull-Rom, as cubic Béziers), open or closed. */
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

/** A soft, hand-cut round: `n` points about an ellipse, each pushed in or out by up to `jitter` of the radius. */
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
  /** small round fruit or blossom dotted through the crown */
  dots?: string;
}

/**
 * A round-crowned tree standing at (x, y) — its foot — `s` times the size of
 * a road-side apricot: its shadow on the ground to the lower right, the trunk,
 * the crown in shade, its face, one lit cap, and what hangs in it.
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

/** A poplar, the valley's tall one: lit on its left, in shade on its right, and a streak of light down its lit side. */
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
 * An earth house with a flat roof, seen a little from above and to the right:
 * its front `w` × `h` from (x, y) its foot on the left, its side `d` deep in
 * shade, the lit roof with its low parapet, a window, and a door when asked.
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
  // apricots drying on the roof, a warm row of dots
  if (opts.roofLine) out += `<path d="M${f(x + d * 0.3 + 6)} ${f(y - h - d * 0.2)}h${f(w - 12)}" stroke="${c(opts.roofLine)}" stroke-width="2.4" stroke-dasharray="2.4 2.2" stroke-linecap="round"/>`;
  return out;
}

/** The leaves of the valley's trees by day or by evening, and an orchard's fruit. */
export function foliage(dark: boolean, dots?: string): Foliage {
  return {
    face: dusk(VALLEY.leaf, dark),
    light: dusk(VALLEY.leafLight, dark),
    shade: dusk(VALLEY.leafShade, dark),
    ...(dots ? { dots: dusk(dots, dark, 0.2) } : {}),
  };
}

/** A poplar's leaves by day or by evening. */
export function poplarLeaves(dark: boolean): Foliage {
  return { face: dusk(VALLEY.poplar, dark), light: dusk(VALLEY.poplarLight, dark), shade: dusk(VALLEY.poplarShade, dark) };
}

// ─────────────────────────────────────────────────────────── landmarks

/** The one small moving thing of a landmark, which the apps lay over it and move gently (`pathLoopSvg`). */
export type ValleyLoopKind = 'kilim' | 'steam' | 'water' | 'flag' | 'flame' | 'smoke' | 'bee' | 'sign';

/**
 * A chapter's landmark in the painted valley, on the 120-unit canvas: its
 * drawing (foot near y 114, from about x 4 to x 116, its shadow on the
 * ground included), and where on the canvas its moving part sits at rest —
 * the box the apps lay the moving sprite into.
 */
export interface ValleyLandmark {
  draw: (dark: boolean, random: () => number) => string;
  loop: { kind: ValleyLoopKind; x: number; y: number; w: number; h: number };
}
