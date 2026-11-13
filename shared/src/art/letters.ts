/**
 * The pictures of letters by bird (shared/src/letters.ts): your window, the
 * birds that come and go from it, and a letter in its envelope.
 *
 * The window is traced from the owner's reference: a square window thrown
 * open, its two casements swung out toward you on either side, drawn in one
 * warm brown line that wavers a little as a hand's does; through it a soft
 * sky with two clouds, a line of bushes on the far hills, a meadow in two
 * greens with flowers in it, the breeze in two pale strokes, and a peach sill
 * along the bottom where a bird lands. There is nothing round it: it stands
 * on the page itself, in either theme. The sky is the hour's (dawn, day,
 * dusk or night), with everything else the same.
 *
 * A bird is drawn on its own (`letterBirdSvg`, the bird of songbird.ts), so an
 * app can bring one in to the sill and send one away with transforms only,
 * without drawing the window again; `LETTER_SILL` says where on the window's
 * square a bird stands, and how big.
 */
import { LETTER_BIRDS } from '../letters.js';
import { form, ring, rr, type Tones } from './cutout.js';
import { songbird, type SongbirdPose } from './songbird.js';
import { Drawing, checkSize, n, prefixFor, seeded, tint } from './svg.js';
import type { TreeSky } from './tree-scene.js';

/** The brown the window is drawn in, and how thick its line is. */
const FRAME = '#a8895a';
const FRAME_WIDTH = 2.7;
const SILL = '#f3c47c';
const SILL_EDGE = '#e2a95e';

/** What changes with the hour: the sky and its clouds, the hills and the meadow, the flowers, and the breeze. */
interface View {
  sky: string;
  cloud: string;
  bush: string;
  far: string;
  near: string;
  grass: string;
  flowers: readonly [string, string, string];
  heart: string;
  breeze: string;
  /** the moon and stars at night */
  night?: true;
}

const VIEWS: Record<TreeSky, View> = {
  day: { sky: '#def0fa', cloud: '#ffffff', bush: '#79b947', far: '#e3eb72', near: '#bcdc59', grass: '#72ad45', flowers: ['#f9df4b', '#f2708f', '#a6d8f4'], heart: '#f06d8c', breeze: '#fbf3c4' },
  dawn: { sky: '#fbe3cc', cloud: '#fff6ee', bush: '#7fb24f', far: '#e9e67e', near: '#c0d862', grass: '#79a74c', flowers: ['#f9df4b', '#f2708f', '#a6d8f4'], heart: '#f06d8c', breeze: '#fff6dc' },
  dusk: { sky: '#f6c6b6', cloud: '#fde6dc', bush: '#6f9c48', far: '#d8d27a', near: '#a9c45a', grass: '#668f42', flowers: ['#f6d25a', '#ee6f8e', '#b5c8f0'], heart: '#e9627f', breeze: '#fde9cf' },
  night: { sky: '#2f3a6e', cloud: '#46528a', bush: '#3e6440', far: '#5e7a46', near: '#4f6d3c', grass: '#3d5a32', flowers: ['#d9c35a', '#c9667f', '#8fb0d6'], heart: '#c25a74', breeze: '#5d6aa0', night: true },
};

/** The inside of the frame: the view is kept to it. */
const OPENING = { x: 10, y: 14, w: 100, h: 86 } as const;

/**
 * Where a bird stands on the sill, on the window's 120-unit square: under its
 * feet, and how wide its own square (`letterBirdSvg`) is drawn there, as a
 * share of the window's width, so it sits on the sill at a bird's size.
 */
export const LETTER_SILL = { x: 46, y: 95, birdShare: 0.36 } as const;

/** Where a bird's feet are on its own square, and how much bigger than its own drawing it is drawn there. */
export const LETTER_BIRD_FEET = { x: 60, y: 100, scale: 1.6 } as const;

/**
 * A line through `points` as a hand draws it: each stretch broken into short
 * pieces, each nudged a little off the straight, by an amount seeded from
 * `seed` so the same window is the same drawing every time.
 */
function handLine(points: ReadonlyArray<readonly [number, number]>, seed: string, wobble = 0.45): string {
  const rand = seeded(seed);
  let d = `M${n(points[0]![0])} ${n(points[0]![1])}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(2, Math.round(len / 9));
    const [nx, ny] = [-(y1 - y0) / len, (x1 - x0) / len];
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const off = k === steps ? 0 : (rand() - 0.5) * 2 * wobble;
      const [mx, my] = [x0 + (x1 - x0) * (t - 0.5 / steps) + nx * off * 1.4, y0 + (y1 - y0) * (t - 0.5 / steps) + ny * off * 1.4];
      d += `Q${n(mx)} ${n(my)} ${n(x0 + (x1 - x0) * t + nx * off)} ${n(y0 + (y1 - y0) * t + ny * off)}`;
    }
  }
  return d;
}

/** A puffy cloud of a few round lobes on a flat foot. */
function cloud(dr: Drawing, x: number, y: number, s: number, hex: string): void {
  const lobes: ReadonlyArray<readonly [number, number, number]> = [
    [-9, 1, 5.2],
    [-3, -3, 6.6],
    [4, -4.6, 7.4],
    [10.4, 0, 5.4],
  ];
  // each puff its own round, so where two overlap there is no seam
  for (const [cx, cy, r] of lobes) dr.add(`<circle cx="${n(x + cx * s)}" cy="${n(y + cy * s)}" r="${n(r * s)}" fill="${hex}"/>`);
  dr.add(`<path d="${rr(x - 13 * s, y - 1 * s, 28.4 * s, 6.6 * s, 3.3 * s)}" fill="${hex}"/>`);
}

/** A flower in the grass: five round petals and a heart. */
function flower(dr: Drawing, x: number, y: number, r: number, petal: string, heart: string): void {
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5 - Math.PI / 2;
    dr.add(`<circle cx="${n(x + Math.cos(a) * r)}" cy="${n(y + Math.sin(a) * r)}" r="${n(r * 0.78)}" fill="${petal}"/>`);
  }
  dr.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.55)}" fill="${heart}"/>`);
}

/** The far country, kept inside the frame: sky, clouds, the bushes on the hills, the meadow, its flowers and grass, and the breeze. */
function view(dr: Drawing, v: View): void {
  const { x, y, w, h } = OPENING;
  dr.add(`<path d="M${x} ${y}H${x + w}V${y + h}H${x}Z" fill="${v.sky}"/>`);
  if (v.night) {
    dr.add(`<circle cx="60" cy="27" r="5" fill="#f6f1d6"/>`);
    for (const [sx, sy] of [[34, 24], [46, 33], [76, 22], [88, 31], [22, 37]] as const) dr.add(`<circle cx="${sx}" cy="${sy}" r="0.8" fill="#f6f1d6"/>`);
  }
  cloud(dr, 39, 34, 0.62, v.cloud);
  cloud(dr, 76, 41, 1, v.cloud);
  // the bushes along the far hills, left and right
  const bushes = (cx: number, count: number, rand: () => number): string =>
    Array.from({ length: count }, (_, k) => `<circle cx="${n(cx + k * 4.6)}" cy="${n(57 - rand() * 2.4)}" r="${n(3.2 + rand() * 1.4)}" fill="${v.bush}"/>`).join('');
  dr.add(bushes(13, 6, seeded('bushes-left')) + bushes(66, 10, seeded('bushes-right')));
  dr.add(`<path d="M${x} 58C24 56 40 57.4 60 59.4C78 58 94 56.2 ${x + w} 57.6V${y + h}H${x}Z" fill="${v.far}"/>`);
  dr.add(`<path d="M${x} 66C30 64.2 50 62.6 66 61C82 59.8 98 59.4 ${x + w} 60V${y + h}H${x}Z" fill="${v.near}"/>`);
  // tufts of grass, two short strokes each
  const tufts: ReadonlyArray<readonly [number, number]> = [
    [24, 76], [30, 69], [44, 79], [55, 72], [62, 84], [70, 67], [86, 76], [94, 87], [20, 88], [40, 90], [77, 90],
  ];
  const grass = tufts.map(([gx, gy]) => `M${gx} ${gy}L${n(gx - 0.5)} ${n(gy - 2.2)}M${n(gx + 1.6)} ${gy}L${n(gx + 1.3)} ${n(gy - 1.8)}`).join('');
  dr.add(`<path d="${grass}" fill="none" stroke="${v.grass}" stroke-width="1" stroke-linecap="round"/>`);
  const [yellow, pink, blue] = v.flowers;
  flower(dr, 38, 77, 1.5, yellow, v.heart);
  flower(dr, 81, 86, 2.2, yellow, v.heart);
  flower(dr, 68, 82, 1.4, yellow, v.heart);
  flower(dr, 85, 70, 1.15, yellow, v.heart);
  flower(dr, 64, 73, 1.1, pink, tint(pink, 0.3));
  flower(dr, 27, 90, 1, pink, tint(pink, 0.3));
  flower(dr, 50, 80, 1.15, blue, tint(blue, 0.35));
  flower(dr, 70, 63.5, 0.95, blue, tint(blue, 0.35));
  // the breeze coming in
  dr.add(`<path d="M66 70.6C72 70.4 79 68 83.6 64.6M71 75.2C74.6 74.6 78.6 72.6 81.6 70.4" fill="none" stroke="${v.breeze}" stroke-width="1.6" stroke-linecap="round"/>`);
}

export interface LetterWindowOptions {
  /** the hour's sky through the window; the day's by default */
  sky?: TreeSky;
  size?: number;
  /** its text label; the apps usually say what is happening beside it and hide the picture from screen readers */
  title?: string;
  idPrefix?: string;
}

/**
 * Your window, at the hour's sky: the view, the sill a bird lands on, the
 * frame, and its two casements swung open toward you, each with its glazing
 * bars, all in the one hand-drawn line.
 */
export function letterWindowSvg(opts: LetterWindowOptions = {}): string {
  const size = checkSize(opts.size, 120);
  const skyName = opts.sky ?? 'day';
  const v = VIEWS[skyName];
  if (!v) throw new RangeError(`art: no sky called ${String(skyName)}`);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-window', skyName));
  const { x, y, w, h } = OPENING;
  dr.add(`<g clip-path="url(#${dr.clip(`M${x} ${y}H${x + w}V${y + h}H${x}Z`)})">`);
  view(dr, v);
  dr.add('</g>');
  // the sill, inside the foot of the frame
  dr.add(`<path d="${rr(16, 93.4, 88.4, 6.2, 3.1)}" fill="${SILL_EDGE}"/>`);
  dr.add(`<path d="${rr(16, 92.6, 88.4, 5.4, 2.7)}" fill="${SILL}"/>`);
  const line = (points: ReadonlyArray<readonly [number, number]>, seed: string): string => handLine(points, seed);
  const frame = [
    // the frame itself
    line([[x, y + h], [x, y], [x + w, y], [x + w, y + h], [x, y + h]], 'frame'),
    // the left casement, swung out: its free edge, its top and foot, its middle bar and its cross bar
    line([[x, y], [31.2, 22.2], [31.2, 86], [x, y + h - 1]], 'left-sash'),
    line([[21.4, 18.2], [21.4, 91.6]], 'left-bar'),
    line([[x, 54.8], [31.2, 54.8]], 'left-cross'),
    // the right casement, the same the other way, its cross bar running just past the frame as a hand's does
    line([[x + w, y], [89, 22.2], [89, 86.6], [x + w, y + h - 1]], 'right-sash'),
    line([[98.8, 18.2], [98.8, 92]], 'right-bar'),
    line([[89, 54.8], [112.6, 54.8]], 'right-cross'),
  ].join('');
  dr.add(`<path d="${frame}" fill="none" stroke="${FRAME}" stroke-width="${FRAME_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`);
  return dr.svg(size, opts.title ?? 'A window');
}

export interface LetterBirdOptions {
  /** the bird's number (`letterBirdOf`): its colour */
  bird: number;
  pose?: SongbirdPose;
  /** facing left rather than right */
  facingLeft?: boolean;
  size?: number;
  title?: string;
  idPrefix?: string;
}

/** A member's bird, on its own transparent square: perched, flying, or flying with a letter in its beak. */
export function letterBirdSvg(opts: LetterBirdOptions): string {
  const size = checkSize(opts.size, 120);
  const hex = LETTER_BIRDS[opts.bird];
  if (!hex) throw new RangeError(`art: no bird ${String(opts.bird)}`);
  const pose = opts.pose ?? 'perched';
  const flip = opts.facingLeft ? -1 : 1;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-bird', opts.bird, pose, flip));
  const { x, y, scale } = LETTER_BIRD_FEET;
  // a bird facing left stands on the same feet, mirrored about them: its square fits it either way round
  dr.add(`<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale * flip)} ${n(scale)})">`);
  songbird(dr, hex, flip, pose);
  dr.add('</g>');
  return dr.svg(size, opts.title ?? 'A bird');
}

export interface LetterEnvelopeOptions {
  size?: number;
  title?: string;
  idPrefix?: string;
}

const PAPER: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const SEAL = '#d8493b';

/** A letter in its envelope, sealed with red wax: what is written, or arrives. */
export function letterEnvelopeSvg(opts: LetterEnvelopeOptions = {}): string {
  const size = checkSize(opts.size, 120);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-envelope'));
  form(dr, rr(14, 30, 92, 62, 8), PAPER, 4, 2);
  // the flaps: the bottom two meeting under the top one
  dr.add(`<path d="M16 88L52 60M104 88L68 60" fill="none" stroke="${PAPER.shade}" stroke-width="1.6" stroke-linecap="round"/>`);
  form(dr, 'M16 34C16 31.8 17.6 30.6 19.6 31.6L60 63L100.4 31.6C102.4 30.6 104 31.8 104 34L66 66C62.6 68.8 57.4 68.8 54 66Z', PAPER, 1.6, 1);
  form(dr, ring(60, 64, 9), { light: tint(SEAL, 0.32), base: SEAL, shade: tint(SEAL, -0.32) }, 2, 1.4);
  dr.add(`<circle cx="60" cy="64" r="4.6" fill="none" stroke="${tint(SEAL, -0.2)}" stroke-width="1.2"/>`);
  return dr.svg(size, opts.title ?? 'A letter');
}
