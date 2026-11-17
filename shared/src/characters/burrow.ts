import type { Pt } from '../art/svg.js';
import { linearAt, n, prefixFor, radialAt } from '../art/svg.js';
import { NECK_BOX } from './hevalo.js';
import { alpha, clipDef, clipped, ellipse, fill, part, taper } from './pen.js';
import type { CharacterBox } from './types.js';

/**
 * Hevalo looking out of a hole in the ground: his head and neck come up out
 * of a round burrow dug in a patch of meadow, the dug earth round it and a
 * tuft or two of grass at its edge, the way he greets someone at the top of the first screens. Cut off
 * at the waist and floating beside his words, he read as half a deer; out of
 * a hole, he is all there is of him to see.
 *
 * Drawn in his own units, as the window is (window.ts), so the hole and the
 * `head` crop line up without measuring: what lies behind him (`back`: the
 * meadow, the earth round the hole, its far rim in the light and the dark of
 * the hole), then him, cut
 * off where the near rim crosses his neck (`cut`), then what is on our side
 * of him (`front`: the near rim, its grass and a pebble), and last the soft
 * shade his chin throws on the near rim (`shadow`), which comes as he does.
 * Each app lays them in one box of the picture's shape (`BURROW_VIEW`); he
 * comes up out of the hole on a spring (`BURROW_POP`).
 *
 * The picture is the same on both sides of his middle but for its grass and
 * pebble; turned round for a page read from the right, it is mirrored whole,
 * and so is he.
 */

/** His middle, in his own units: the hole is centred on it. */
const AXIS = 255;

/** The opening of the hole, seen from a little above: its middle, how wide and how deep it looks. */
const HOLE = { cy: 478, rx: 178, ry: 42 } as const;

/** The low mound of earth round it, a little lower than the hole and wider. */
const MOUND = { cy: 492, rx: 246, ry: 76 } as const;

/** The patch of meadow the hole is dug in: wider and lower again, so the dug earth lies on grass, not on nothing. */
const LAWN = { cy: 512, rx: 292, ry: 84 } as const;

/**
 * Where he is cut off: the near rim's top at its nearest, his middle, a
 * little under his chin where his neck is at its narrowest, so only his head
 * and the top of his neck come up out of the hole. Toward its sides the rim
 * rises, and covers his neck a little more.
 */
const CUT = HOLE.cy + HOLE.ry;

/** The picture's box, in Hevalo's units: the mound, with room above for his antlers and round him for his ears. */
export const BURROW_VIEW: CharacterBox = { x: -50, y: -40, w: 610, h: 650 };

interface Palette {
  earthHi: string;
  earth: string;
  earthLo: string;
  /** the far wall inside the hole, where a little light reaches it */
  wall: string;
  hole: string;
  shade: string;
  grassHi: string;
  grass: string;
  grassLo: string;
  pebbleHi: string;
  pebble: string;
}

/** By day: warm soil in the sun, fresh grass. */
const DAY: Palette = {
  earthHi: '#c99a6b',
  earth: '#a87a51',
  earthLo: '#86603f',
  wall: '#6a4a33',
  hole: '#2c1f17',
  shade: '#2c1f17',
  grassHi: '#9cc46a',
  grass: '#79a54f',
  grassLo: '#5b863b',
  pebbleHi: '#ddd2c4',
  pebble: '#b8aa98',
};

/** On a dark screen: the same soil at dusk, a little cooler and lower. */
const DUSK: Palette = {
  earthHi: '#9c7656',
  earth: '#7e5c41',
  earthLo: '#5f4431',
  wall: '#4a3527',
  hole: '#1b1410',
  shade: '#120d0a',
  grassHi: '#7aa35a',
  grass: '#5d8645',
  grassLo: '#456834',
  pebbleHi: '#a99d90',
  pebble: '#857a6e',
};

/** The near half of an ellipse, from its left end round under it to its right end, as path data starting with a move. */
function nearHalf(rx: number, ry: number, cy: number): string {
  return `M${n(AXIS - rx)},${n(cy)}A${n(rx)},${n(ry)} 0 0 0 ${n(AXIS + rx)},${n(cy)}`;
}

/** The near rim: the mound in front of the hole, between the hole's near edge and the mound's. */
function nearRim(): string {
  return `${nearHalf(MOUND.rx, MOUND.ry, MOUND.cy)}L${n(AXIS + HOLE.rx)},${n(HOLE.cy)}A${n(HOLE.rx)},${n(HOLE.ry)} 0 0 1 ${n(AXIS - HOLE.rx)},${n(HOLE.cy)}z`;
}

/** The whole opening, as path data. */
function opening(): string {
  return `M${n(AXIS - HOLE.rx)},${n(HOLE.cy)}a${n(HOLE.rx)},${n(HOLE.ry)} 0 1 0 ${n(2 * HOLE.rx)},0a${n(HOLE.rx)},${n(HOLE.ry)} 0 1 0 ${n(-2 * HOLE.rx)},0z`;
}

/** One blade of grass: from its foot, leaning `lean` across as it rises `tall`, broad at the foot and to a point. */
function blade(x: number, y: number, tall: number, lean: number, wide: number): string {
  const spine: Pt[] = [
    [x, y],
    [x + lean * 0.25, y - tall * 0.45],
    [x + lean * 0.65, y - tall * 0.8],
    [x + lean, y - tall],
  ];
  return taper(spine, [wide, wide * 0.8, wide * 0.45, 0]);
}

/** A tuft: a few blades from one foot, the back ones in shade and the front ones in the light. */
function tuft(c: Palette, x: number, y: number, s: number, flip = 1): string {
  return (
    fill(blade(x - 6 * s, y, 40 * s, -16 * s * flip, 9 * s) + blade(x + 8 * s, y, 34 * s, 18 * s * flip, 8 * s), c.grassLo) +
    fill(blade(x, y + 2, 52 * s, 6 * s * flip, 10 * s) + blade(x - 12 * s, y + 3, 30 * s, -24 * s * flip, 8 * s), c.grass) +
    fill(blade(x + 3 * s, y + 3, 38 * s, 12 * s * flip, 6 * s), c.grassHi)
  );
}

/** What lies behind him: the mound, the far rim in the light, and the hole going down into the dark. */
function back(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const top = MOUND.cy - MOUND.ry;
  return part(
    [
      linearAt(id('lawn'), [[0, c.grassHi], [0.5, c.grass], [1, c.grassLo]], 0, LAWN.cy - LAWN.ry, 0, LAWN.cy + LAWN.ry),
      linearAt(id('mound'), [[0, c.earthHi], [0.45, c.earth], [1, c.earthLo]], 0, top, 0, MOUND.cy + MOUND.ry),
      // the far wall of the hole catches a little light at its lip, and is dark below it
      linearAt(id('hole'), [[0, c.wall], [0.34, c.hole], [1, c.hole]], 0, HOLE.cy - HOLE.ry, 0, HOLE.cy + HOLE.ry),
    ],
    [
      // the meadow's soft shadow on whatever it stands on, then the meadow, its far edge in the light
      ellipse(AXIS, LAWN.cy + LAWN.ry - 8, LAWN.rx * 0.9, 18, c.shade, alpha(0.14)),
      ellipse(AXIS, LAWN.cy, LAWN.rx, LAWN.ry, `url(#${id('lawn')})`),
      // the dug earth on it, round the hole
      ellipse(AXIS, MOUND.cy, MOUND.rx, MOUND.ry, `url(#${id('mound')})`),
      // the far rim's edge in the sun, just over the hole
      fill(`M${n(AXIS - HOLE.rx * 0.82)},${n(HOLE.cy - HOLE.ry * 0.62)}Q${n(AXIS)},${n(HOLE.cy - HOLE.ry * 1.42)} ${n(AXIS + HOLE.rx * 0.82)},${n(HOLE.cy - HOLE.ry * 0.62)}Q${n(AXIS)},${n(HOLE.cy - HOLE.ry * 1.16)} ${n(AXIS - HOLE.rx * 0.82)},${n(HOLE.cy - HOLE.ry * 0.62)}z`, c.earthHi, alpha(0.7)),
      fill(opening(), `url(#${id('hole')})`),
      // grass on the far side of the hole, small with the distance
      tuft(c, AXIS - 236, LAWN.cy - 30, 0.8),
      tuft(c, AXIS + 250, LAWN.cy - 22, 0.7, -1),
    ],
  );
}

/** What is on our side of him: the near rim of the mound, a tuft of grass at each side and a pebble. */
function front(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [linearAt(id('rim'), [[0, c.earth], [1, c.earthLo]], 0, HOLE.cy, 0, MOUND.cy + MOUND.ry)],
    [
      fill(nearRim(), `url(#${id('rim')})`),
      // the near rim's lip, where it turns down into the hole, in the light
      `<path d="${nearHalf(HOLE.rx - 2, HOLE.ry - 1, HOLE.cy)}" fill="none" stroke="${c.earthHi}" stroke-width="9" stroke-linecap="round"/>`,
      // crumbs of earth on the near slope
      ellipse(AXIS - 86, MOUND.cy + 50, 8, 4.5, c.earthLo, alpha(0.7)),
      ellipse(AXIS + 52, MOUND.cy + 58, 7, 4, c.earthLo, alpha(0.7)),
      ellipse(AXIS - 20, MOUND.cy + 62, 5, 3, c.earthLo, alpha(0.6)),
      // a pebble on the near slope, lit from above
      ellipse(AXIS + 150, MOUND.cy + 44, 24, 15, c.pebble),
      ellipse(AXIS + 144, MOUND.cy + 39, 14, 7.5, c.pebbleHi, alpha(0.85)),
      tuft(c, AXIS - 214, LAWN.cy + 40, 1.3),
      tuft(c, AXIS + 226, LAWN.cy + 30, 1.05, -1),
      tuft(c, AXIS - 60, LAWN.cy + 78, 0.7),
    ],
  );
}

/** The soft shade his chin and neck throw on the near rim, the light being above and behind him. */
function shadow(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [radialAt(id('cast'), [[0, c.shade, 0.4], [0.6, c.shade, 0.16], [1, c.shade, 0]], AXIS, CUT, 150), clipDef(id('rimclip'), nearRim())],
    [clipped(id('rimclip'), ellipse(AXIS, CUT + 4, 150, 30, `url(#${id('cast')})`))],
  );
}

export interface BurrowArt {
  /** behind him: the mound, its far rim and the dark of the hole */
  back: string;
  /** on our side of him: the near rim, its grass and a pebble */
  front: string;
  /** the shade he throws on the near rim, drawn over it once he is up */
  shadow: string;
}

const box = (b: CharacterBox): string => `${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}`;
const svg = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(BURROW_VIEW)}" aria-hidden="true" focusable="false">${inner}</svg>`;

/**
 * The hole, as three standalone drawings in `BURROW_VIEW`: what lies behind
 * him, what is on our side of him, and his shade. Decorative: whatever he
 * says, the words beside him say. `dark` for a dark screen; ids start with
 * `idPrefix`.
 */
export function burrowArt(options: { dark?: boolean; idPrefix?: string } = {}): BurrowArt {
  const dark = options.dark === true;
  const p = `${prefixFor(options.idPrefix ?? `hvburrow${dark ? 'd' : 'l'}`)}-`;
  const c = dark ? DUSK : DAY;
  return { back: svg(back(c, p)), front: svg(front(c, p)), shadow: svg(shadow(c, p)) };
}

/**
 * Where he goes in the picture, as shares of its box: the `head` crop's box
 * (`figure`), and the line he is cut off at (`cut`, from the top). Before he
 * comes up he waits in the hole, all of him under the cut, `drop` below his
 * place.
 */
export const BURROW_PLACE: {
  figure: { left: number; top: number; width: number; height: number };
  cut: number;
  drop: number;
} = {
  figure: {
    left: (NECK_BOX.x - BURROW_VIEW.x) / BURROW_VIEW.w,
    top: (NECK_BOX.y - BURROW_VIEW.y) / BURROW_VIEW.h,
    width: NECK_BOX.w / BURROW_VIEW.w,
    height: NECK_BOX.h / BURROW_VIEW.h,
  },
  cut: (CUT - BURROW_VIEW.y) / BURROW_VIEW.h,
  drop: (CUT - NECK_BOX.y) / BURROW_VIEW.h,
};

/**
 * His coming up out of the hole: how long after the picture appears he
 * starts, and how long the spring takes to bring him up and settle him (the
 * phone's `bouncy` spring, a little joy; the website's `--ease-spring`).
 * Under Reduce Motion he is simply there.
 */
export const BURROW_POP = { delayMs: 220, ms: 620 } as const;
