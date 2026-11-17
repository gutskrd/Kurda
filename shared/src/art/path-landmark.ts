/**
 * Each chapter's landmark beside the lesson path, in the painted valley
 * (art/valley.ts), and the one small thing in it that moves.
 *
 * The twelve landmarks walk the road's year in Sêvan — the blue gate, Hamo's
 * teahouse, the spring under the walnut, market day, the bus stop, Amed's
 * black walls, the Newroz fire, the hives, the old bridge, the black tents of
 * the summer pastures, the school, and the winter hearth — and are drawn in
 * art/valley-landmarks-1.ts and -2.ts. Here they are framed as pictures: on
 * the 120-unit canvas, decorative unless named. Each draws its moving part at
 * rest; the apps lay `pathLoopSvg` over it at `PATH_LANDMARK_LOOP` and move it
 * gently (a kilim or the flag of Kurdistan over the school and Amed's tower
 * in the wind, steam or smoke rising, a ripple, the Newroz flame, a bee, the bus
 * stop's sign), and hold it still under Reduce Motion.
 */
import type { PathGround, PathLandmark } from '../path-world.js';
import { pathGroundShade } from './path-land.js';
import { CANVAS, escapeXml, n2, prefixFor, seeded } from './svg.js';
import { KURDISTAN_FLAG, VALLEY, dusk, ellipsePath, fill, kurdistanFlag, stroke, warm, type ValleyLandmark, type ValleyLoopKind } from './valley.js';
import { VALLEY_LANDMARKS_1 } from './valley-landmarks-1.js';
import { VALLEY_LANDMARKS_2 } from './valley-landmarks-2.js';

const LANDMARKS: Record<PathLandmark, ValleyLandmark> = { ...VALLEY_LANDMARKS_1, ...VALLEY_LANDMARKS_2 };

/** What moves in a landmark. */
export type PathLoopKind = ValleyLoopKind;
/** Where it moves, on the landmark's 120-unit canvas: the box its sprite fills. */
export interface PathLoop {
  kind: PathLoopKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What moves in each landmark, where, on its 120-unit canvas: the box its sprite (`pathLoopSvg`) fills. */
export const PATH_LANDMARK_LOOP: Record<PathLandmark, PathLoop> = Object.fromEntries(
  (Object.keys(LANDMARKS) as PathLandmark[]).map((k) => [k, { ...LANDMARKS[k].loop }]),
) as Record<PathLandmark, PathLoop>;

export interface PathLandmarkOptions {
  landmark: PathLandmark;
  dark?: boolean;
  size?: number;
  /** its name for a screen reader; without one the drawing is decorative and hidden */
  title?: string;
  /** the land it stands on, whose own shade it casts; the meadow's by default */
  ground?: PathGround;
  /** the colour of the shade it casts where it stands on a page of its own colour rather than on the path's land (a book's chapter opener, a stamp) */
  shade?: string;
  idPrefix?: string;
}

/** A chapter's landmark on the 120-unit canvas, standing on its own shade near the bottom middle, its moving part at rest. */
export function pathLandmarkSvg(opts: PathLandmarkOptions): string {
  const { landmark, dark = false } = opts;
  const art = LANDMARKS[landmark];
  if (!art) throw new RangeError(`art: no landmark ${String(landmark)}`);
  const size = opts.size ?? CANVAS;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  if (opts.shade !== undefined && !/^#[0-9a-f]{6}$/.test(opts.shade)) throw new RangeError(`art: a landmark's shade is a six-digit colour, not ${String(opts.shade)}`);
  const prefix = prefixFor(opts.idPrefix, 'landmark', landmark, dark);
  // drawn standing in the meadow's shade, then given the shade of the land it stands on, so a market's shadow is not grass
  const meadow = dusk(VALLEY.meadowShade, dark);
  const shade = opts.shade ?? (opts.ground ? pathGroundShade(opts.ground, dark) : meadow);
  const body = art
    .draw(dark, seeded(`valley-landmark|${landmark}`), opts.shade !== undefined)
    .split(`fill="${meadow}"`)
    .join(`fill="${shade}"`)
    // a pole's shadow is a line of the meadow's shade, and on a page of its own colour it is that page's shade too, never a green stick
    .split(`stroke="${meadow}"`)
    .join(`stroke="${shade}"`);
  const label = opts.title
    ? ` role="img" aria-labelledby="${prefix}t"><title id="${prefix}t">${escapeXml(opts.title)}</title>`
    : ' aria-hidden="true" focusable="false">';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${CANVAS} ${CANVAS}"${label}${body}</svg>`;
}

export interface PathLoopOptions {
  kind: PathLoopKind;
  dark?: boolean;
  /** how wide it is shown; its height follows its own canvas */
  size?: number;
  idPrefix?: string;
}

/** The sprite's own canvas for each kind: the sprite fills it, and the apps move it about its anchor. */
const LOOP_VIEW: Record<PathLoopKind, { w: number; h: number }> = {
  kilim: { w: 18, h: 22 },
  steam: { w: 16, h: 24 },
  water: { w: 30, h: 12 },
  colours: { w: KURDISTAN_FLAG.w, h: KURDISTAN_FLAG.h },
  flame: { w: 26, h: 40 },
  smoke: { w: 16, h: 30 },
  bee: { w: 34, h: 34 },
  sign: { w: 18, h: 26 },
};

/**
 * The one small moving thing of a landmark, as a picture of its own, painted
 * as the valley is: flat, no outline. Decorative.
 */
export function pathLoopSvg(opts: PathLoopOptions): string {
  const { kind, dark = false } = opts;
  const view = LOOP_VIEW[kind];
  if (!view) throw new RangeError(`art: no loop ${String(kind)}`);
  const size = opts.size ?? view.w;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const c = (hex: string, amount?: number): string => dusk(hex, dark, amount);
  let body = '';
  switch (kind) {
    case 'kilim': {
      // a kilim's madder field, a band of cream, an indigo lozenge, the free end a little ragged
      const w = view.w;
      const h = 20;
      body += fill(`M1 1H${w - 1}V${h - 2}L${w - 4} ${h}L${w - 7} ${h - 2}L${w - 10} ${h}L${w - 13} ${h - 2}H1Z`, c(VALLEY.red, 0.2));
      body += fill(`M1 ${h * 0.3}H${w - 1}V${h * 0.4}H1Z`, c('#f6e3b0', 0.2));
      body += fill(`M${w / 2} ${h * 0.48}l3.6 ${h * 0.17}l-3.6 ${h * 0.17}l-3.6 ${-h * 0.17}Z`, c(VALLEY.indigo, 0.2));
      body += fill(`M1 ${h * 0.84}H${w - 1}V${h * 0.9}H1Z`, warm(VALLEY.gold, dark));
      break;
    }
    case 'steam':
    case 'smoke': {
      const puff = kind === 'steam' ? (dark ? '#c9cfdc' : '#ffffff') : c(VALLEY.smoke, 0.3);
      body += `<path d="${ellipsePath(8, view.h - 5, 4, 3.6)}${ellipsePath(6, view.h - 13, 5, 4.4)}${ellipsePath(9, view.h - 22, 4.5, 4)}" fill="${puff}" fill-opacity="${kind === 'steam' ? 0.85 : 0.9}"/>`;
      break;
    }
    case 'water':
      body += stroke(ellipsePath(15, 6, 11, 3.6), dark ? '#9fd2e6' : '#ffffff', 1.6);
      body += stroke(ellipsePath(15, 6, 5, 1.8), dark ? '#9fd2e6' : '#ffffff', 1.2);
      break;
    case 'colours':
      // the school's flag of Kurdistan, the very cloth the school draws at rest, so the moving one lies exactly over it
      body += kurdistanFlag(dark);
      break;
    case 'flame':
      body += fill('M13 2C19 12 24 20 21 30C19 37 7 37 5 30C2 22 9 16 9 9C11 13 12 12 13 2Z', warm(VALLEY.fire, dark));
      body += fill('M13 16C16 21 18 25 16 30C14 34 10 34 9 30C8 26 11 22 13 16Z', warm(VALLEY.fireCore, dark));
      break;
    case 'bee':
      // on the rim of its circle; the apps turn the circle
      body += fill(ellipsePath(17, 4, 3.4, 2.4), '#2a2018');
      body += fill('M15.6 2.2h1.2v3.6h-1.2zM18 2.2h1.1v3.6h-1.1z', '#f6c836');
      body += `<path d="${ellipsePath(16, 1.2, 2.2, 1.4)}" fill="#ffffff" fill-opacity="0.85"/>`;
      break;
    case 'sign':
      body += stroke('M9 1v4', c('#8f8571'), 1.6);
      body += fill(ellipsePath(9, 14, 8, 8), c(VALLEY.gate, 0.2));
      body += fill('M4 12.4h10v3.2h-10z', '#ffffff');
      break;
  }
  const prefix = prefixFor(opts.idPrefix, 'loop', kind, dark);
  const height = (size * view.h) / view.w;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(height)}" viewBox="0 0 ${view.w} ${view.h}" aria-hidden="true" focusable="false" id="${prefix}">${body}</svg>`;
}
