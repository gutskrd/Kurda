import type { Pt } from '../art/svg.js';
import { linearAt, n, prefixFor, radialAt } from '../art/svg.js';
import { NECK_BOX } from './hevalo.js';
import { alpha, clipDef, clipped, ellipse, fill, part } from './pen.js';
import type { CharacterBox } from './types.js';

/**
 * Hevalo poking his head through the screen: the page is torn open, its
 * ragged edge showing the white of the torn paper and a few flaps of it
 * curling back where he pushed through, and his head and the top of his neck
 * come out of the dark behind it, the way he greets someone at the top of the
 * first screens. Cut off at the waist and floating beside his words, he read
 * as half a deer; through a hole in the page, he is all there is of him to
 * see, and the page is all the scenery there is.
 *
 * Drawn in his own units, as the window is (window.ts), so the tear and the
 * `head` crop line up without measuring: what lies behind him (`back`: the
 * shadow of the lifted torn lip on the page, the hairline cracks the push ran
 * into it, the dark behind the page with the page's own thickness shading its
 * top, the whole torn edge, and the flaps above, which his head comes out in
 * front of), the shadow his head throws on the page (`cast`), then him, cut off at the tear's lower edge
 * (`cut`), then what is on our side of him (`front`: the lower torn edge, the
 * flaps beside and under his neck, and a few scraps flung out), and last the soft shade his chin
 * throws into the dark below it (`shadow`), which comes as he does. Each app
 * lays them in one box of the picture's shape (`PEEK_VIEW`); he comes up
 * through the tear on a spring (`PEEK_POP`).
 *
 * The tear's lower edge runs almost level under his neck, where it crosses
 * him, and is ragged everywhere else: a level cut and the torn paper's white
 * edge drawn over it are what hide where he ends. Turned round for a page
 * read from the right, the picture is mirrored whole, and so is he.
 */

/** His middle, in his own units: the tear is centred on it. */
const AXIS = 255;

/** The tear: its middle, how wide and how tall, and how square its corners are (a rounder rectangle than an ellipse, for a level foot). */
const TEAR = { cy: 428, rx: 192, ry: 104, square: 4 } as const;

/** How far the torn edge wanders in and out, at its foot under his neck and everywhere else. */
const RAGGED = { foot: 3, rest: 11 } as const;

/** Where he is cut off: the tear's foot, under the white of the torn edge drawn over it. */
const CUT = TEAR.cy + TEAR.ry - 4;

/** The picture's box, in Hevalo's units: the tear and its flaps, with room above for his antlers and round him for his ears. */
export const PEEK_VIEW: CharacterBox = { x: -40, y: -40, w: 590, h: 650 };

interface Palette {
  /** the dark behind the page: its top, against the edge, and its depth */
  deepTop: string;
  deep: string;
  /** the torn paper's edge, its fibres catching the light */
  fibre: string;
  /** a flap of the page, its face toward the light and its underside */
  flap: string;
  flapLo: string;
  shade: string;
  /** the hairline cracks running out from the tear into the page */
  crack: string;
  /** how dark the shadows on the page are: plain on a light page, deeper on a dark one to be seen at all */
  cast: number;
}

/** On a light page: the dark of a room behind it, the paper white where it tore. */
const LIGHT: Palette = {
  deepTop: '#1c1626',
  deep: '#2e2540',
  fibre: '#ffffff',
  flap: '#ffffff',
  flapLo: '#ddd5ea',
  shade: '#1c1626',
  crack: '#8a7fa3',
  cast: 0.16,
};

/** On a dark page: a deeper dark behind it, the torn edge a little lighter than the page. */
const DARK: Palette = {
  deepTop: '#050408',
  deep: '#0c0a12',
  fibre: '#4a4160',
  flap: '#332c44',
  flapLo: '#221d2e',
  shade: '#000000',
  crack: '#5a5172',
  cast: 0.42,
};

/** A repeatable wander in -1..1 for the `i`th point: the same tear every time it is drawn. */
function wander(i: number): number {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

/** How many points go round the torn edge. */
const POINTS = 56;

/**
 * The torn edge, point by point from its right end round under it and back
 * over the top: a squarish ellipse, each point pushed in or out a little, the
 * foot hardly at all.
 */
function edge(): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = TEAR.rx * Math.sign(c) * Math.abs(c) ** (2 / TEAR.square);
    const y = TEAR.ry * Math.sign(s) * Math.abs(s) ** (2 / TEAR.square);
    // under his neck the foot runs nearly level; everywhere else it is ragged, more so toward the top
    const foot = s > 0.6 && Math.abs(x) < 130;
    const reach = foot ? RAGGED.foot : RAGGED.rest * (s < 0 ? 1.15 : 0.85);
    const r = reach * wander(i);
    const len = Math.hypot(x, y) || 1;
    pts.push([AXIS + x + (x / len) * r, TEAR.cy + y + (y / len) * r]);
  }
  return pts;
}

const EDGE = edge();

const path = (pts: readonly Pt[], close: boolean): string =>
  pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x)},${n(y)}`).join('') + (close ? 'z' : '');

/** The whole tear, as path data. */
const opening = (): string => path(EDGE, true);

/** The lower half of the torn edge, from its right end round under it to its left: the part in front of his neck. */
const foot = (): string => path(EDGE.slice(0, POINTS / 2 + 1), false);

/**
 * A flap of the page curling back from the edge where he pushed through: its
 * foot on the torn edge between two of its points, its tip out over the page
 * the way it was pushed, its face in the light and a fold of shade along its
 * foot.
 */
function flap(c: Palette, from: number, to: number, out: number, lean: number): string {
  const a = EDGE[from % POINTS] as Pt;
  const b = EDGE[to % POINTS] as Pt;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  // straight out from the tear's middle, then leaning along the edge
  const dx = mx - AXIS;
  const dy = (my - TEAR.cy) * (TEAR.rx / TEAR.ry);
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const tip: Pt = [mx + ux * out - uy * lean, my + uy * out * 0.62 + ux * lean];
  const bend: Pt = [(mx + tip[0]) / 2 + ux * 6, (my + tip[1]) / 2 + uy * 6];
  const face = `M${n(a[0])},${n(a[1])}Q${n(bend[0])},${n(bend[1])} ${n(tip[0])},${n(tip[1])}L${n(b[0])},${n(b[1])}z`;
  const fold = `M${n(a[0])},${n(a[1])}L${n(b[0])},${n(b[1])}L${n(b[0] + (tip[0] - b[0]) * 0.22)},${n(b[1] + (tip[1] - b[1]) * 0.22)}L${n(a[0] + (tip[0] - a[0]) * 0.22)},${n(a[1] + (tip[1] - a[1]) * 0.22)}z`;
  return (
    // the flap's own shadow on the page under it, down and to the right of it: the light is up and to the left
    fill(face, c.shade, ` transform="translate(6 10)"${alpha(c.cast * 1.3)}`) +
    fill(face, c.flap) +
    fill(fold, c.flapLo, alpha(0.9))
  );
}

/**
 * A hairline crack running out from the torn edge into the page, from the
 * `i`th point of the edge, `long` units, zigzagging a little: the page split
 * further than it tore.
 */
function crack(c: Palette, i: number, long: number): string {
  const [x, y] = EDGE[i % POINTS] as Pt;
  const dx = x - AXIS;
  const dy = (y - TEAR.cy) * (TEAR.rx / TEAR.ry);
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const step = long / 3;
  const pts: Pt[] = [[x, y]];
  for (let k = 1; k <= 3; k++) {
    const side = (k % 2 === 0 ? 1 : -1) * 7 * wander(i + k * 7);
    pts.push([x + ux * step * k - uy * side, y + uy * step * k * 0.7 + ux * side]);
  }
  const d = pts.map(([px, py], k) => `${k === 0 ? 'M' : 'L'}${n(px)},${n(py)}`).join('');
  return `<path d="${d}" fill="none" stroke="${c.crack}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.7"/>`;
}

/** A scrap of the torn page flung out as he came through: a small ragged triangle, turned, with its shadow on the page. */
function scrap(c: Palette, x: number, y: number, r: number, deg: number): string {
  const d = `M${n(x - r)},${n(y + r * 0.5)}L${n(x + r * 0.2)},${n(y - r)}L${n(x + r)},${n(y + r * 0.7)}z`;
  const turn = ` transform="rotate(${deg} ${n(x)} ${n(y)})"`;
  return (
    fill(d, c.shade, ` transform="translate(5 9) rotate(${deg} ${n(x)} ${n(y)})"${alpha(c.cast * 1.2)}`) +
    fill(d, c.flap, turn) +
    fill(`M${n(x - r)},${n(y + r * 0.5)}L${n(x + r)},${n(y + r * 0.7)}L${n(x)},${n(y + r * 0.2)}z`, c.flapLo, turn)
  );
}

/** The torn paper's white edge along `d`, a little ragged itself. */
const fibre = (c: Palette, d: string, width: number): string =>
  `<path d="${d}" fill="none" stroke="${c.fibre}" stroke-width="${n(width)}" stroke-linejoin="round" stroke-linecap="round"/>`;

/** What lies behind him: the dark behind the page, its torn edge all round, and the flaps above and to the sides, behind his head. */
function back(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [
      // darkest up under the edge, where the page throws its shade into the hole; a little lighter toward the foot
      linearAt(id('deep'), [[0, c.deepTop], [0.55, c.deep], [1, c.deep]], 0, TEAR.cy - TEAR.ry, 0, TEAR.cy + TEAR.ry),
      clipDef(id('rim'), opening()),
    ],
    [
      // the page is lifted a little round the tear where he pushed: its torn lip throws a shadow on the page, down and to the right
      fill(opening(), c.shade, ` transform="translate(7 12)"${alpha(c.cast)}`),
      // the cracks the push ran into the page
      crack(c, 31, 64),
      crack(c, 39, 48),
      crack(c, 49, 58),
      crack(c, 1, 52),
      crack(c, 24, 44),
      fill(opening(), `url(#${id('deep')})`),
      // the page's own thickness shades the dark just under its edge, all round the top
      clipped(id('rim'), fill(opening(), c.shade, ` transform="translate(0 -26)"${alpha(0.55)}`)),
      fibre(c, opening(), 9),
      flap(c, 33, 38, 72, -14),
      flap(c, 46, 51, 66, 12),
      flap(c, 26, 30, 56, 10),
      flap(c, 52, 56, 54, -10),
    ],
  );
}

/** What is on our side of him: the torn edge's foot in front of his neck, and the flaps beside and under it. */
function front(c: Palette): string {
  return part(
    [],
    [
      fibre(c, foot(), 10),
      flap(c, 3, 8, 68, 14),
      flap(c, 19, 24, 72, -16),
      flap(c, 12, 15, 38, 4),
      // scraps of the page flung out as he pushed through
      scrap(c, AXIS - 236, TEAR.cy + 62, 16, -24),
      scrap(c, AXIS + 238, TEAR.cy + 40, 12, 32),
      scrap(c, AXIS + 186, TEAR.cy + 128, 10, 70),
    ],
  );
}

/**
 * The shadow his head throws on the page behind him, down and to the right of
 * him, the light being up and to the left: it shows round his right cheek and
 * ear and under his chin, and comes as he does.
 */
function cast(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [radialAt(id('head'), [[0, c.shade, c.cast * 1.6], [0.7, c.shade, c.cast * 0.9], [1, c.shade, 0]], AXIS + 34, 286, 196)],
    [ellipse(AXIS + 34, 286, 196, 186, `url(#${id('head')})`)],
  );
}

/** The soft shade his chin and neck throw into the dark under them, the light being in front of the page. */
function shadow(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [radialAt(id('cast'), [[0, c.shade, 0.35], [0.6, c.shade, 0.12], [1, c.shade, 0]], AXIS, CUT - 30, 150), clipDef(id('tear'), opening())],
    [clipped(id('tear'), ellipse(AXIS, CUT - 20, 170, 44, `url(#${id('cast')})`))],
  );
}

export interface PeekArt {
  /** behind him: the dark behind the page, the torn edge and the upper flaps */
  back: string;
  /** the shadow his head throws on the page, between the page and him, drawn once he is through */
  cast: string;
  /** on our side of him: the torn edge's foot and the lower flaps */
  front: string;
  /** the shade he throws into the dark below his chin, drawn once he is through */
  shadow: string;
}

const box = (b: CharacterBox): string => `${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}`;
const svg = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(PEEK_VIEW)}" aria-hidden="true" focusable="false">${inner}</svg>`;

/**
 * The tear, as four standalone drawings in `PEEK_VIEW`: what lies behind
 * him, the shadow he throws on the page, what is on our side of him, and his
 * shade under his chin. Decorative: whatever he
 * says, the words beside him say. `dark` for a dark page; ids start with
 * `idPrefix`.
 */
export function peekArt(options: { dark?: boolean; idPrefix?: string } = {}): PeekArt {
  const dark = options.dark === true;
  const p = `${prefixFor(options.idPrefix ?? `hvpeek${dark ? 'd' : 'l'}`)}-`;
  const c = dark ? DARK : LIGHT;
  return { back: svg(back(c, p)), cast: svg(cast(c, p)), front: svg(front(c)), shadow: svg(shadow(c, p)) };
}

/**
 * Where he goes in the picture, as shares of its box: the `head` crop's box
 * (`figure`), and the line he is cut off at (`cut`, from the top). Before he
 * comes through he waits behind the page, all of him under the cut, `drop`
 * below his place.
 */
export const PEEK_PLACE: {
  figure: { left: number; top: number; width: number; height: number };
  cut: number;
  drop: number;
} = {
  figure: {
    left: (NECK_BOX.x - PEEK_VIEW.x) / PEEK_VIEW.w,
    top: (NECK_BOX.y - PEEK_VIEW.y) / PEEK_VIEW.h,
    width: NECK_BOX.w / PEEK_VIEW.w,
    height: NECK_BOX.h / PEEK_VIEW.h,
  },
  cut: (CUT - PEEK_VIEW.y) / PEEK_VIEW.h,
  drop: (CUT - NECK_BOX.y) / PEEK_VIEW.h,
};

/**
 * His coming through the page: how long after the picture appears he starts,
 * and how long the spring takes to bring him up and settle him (the phone's
 * `bouncy` spring, a little joy; the website's `--ease-spring`). Under Reduce
 * Motion he is simply there.
 */
export const PEEK_POP = { delayMs: 220, ms: 620 } as const;
