import type { Pt } from '../art/svg.js';
import { linearAt, n, prefixFor, radialAt, radialBox } from '../art/svg.js';
import { NECK_BOX, NECK_SILL } from './hevalo.js';
import { alpha, clipDef, clipped, curve, ellipse, fill, part, taper, type Knot } from './pen.js';
import type { CharacterBox } from './types.js';

/**
 * Hevalo leaning out of a window: his head and neck (the `head` crop) out of
 * a round-arched window in a sun-washed clay wall of a Kurdish village house,
 * its wooden frame painted the blue-green village windows are, the warm dark
 * of the room behind him, a kilim curtain drawn back to one side and a pot of
 * geraniums on the sill. His neck goes down behind the sill, so he reads as
 * leaning out, never as a head cut off.
 *
 * Drawn in his own units, so the picture and the crop line up without
 * measuring: the window behind him (`back`), then him, cut off at the sill
 * (`sill`), then what stands in front of him (`front`): the sill and the
 * pot. Light and dark: by day the room is dim behind him; at dusk the wall
 * cools and a lamp lights the room. Each app lays the three in one box of the
 * picture's shape (`WINDOW_VIEW`), and his head rises into the window from
 * under the sill on a spring as it appears (`WINDOW_POP`).
 *
 * The picture is the same on both sides of his middle, but for the curtain
 * and the pot; turned round for a page read from the right, it is mirrored
 * whole, and so is he.
 */

/** His middle, in his own units: the window is centred on it. */
const AXIS = 255;

/** The picture's box, in Hevalo's units: the wall, with room round it for his ears and antlers. */
export const WINDOW_VIEW: CharacterBox = { x: -130, y: -100, w: 770, h: 880 };

/** The opening: its sides, the line its arch springs from, and its foot (the sill's back edge, where he is cut off). */
const OPENING = { left: 25, right: 485, spring: 280 } as const;
const RADIUS = (OPENING.right - OPENING.left) / 2;
/** How wide the painted frame round the opening is. */
const FRAME = 30;
/** The wall: a plastered panel, its top arched over the window as the window's is, its foot square with soft corners. */
const WALL = { x: -110, w: 730, top: -80, foot: 760, r: 64 } as const;

/** Where he is cut off: the sill's back edge. */
const SILL = NECK_SILL;

interface Palette {
  wallHi: string;
  wall: string;
  wallLo: string;
  plaster: string;
  glow: string;
  room: string;
  roomDeep: string;
  frameHi: string;
  frame: string;
  frameLo: string;
  chip: string;
  sillTop: string;
  sillFront: string;
  sillLo: string;
  shade: string;
  curtain: string;
  curtainLo: string;
  kilimLight: string;
  kilimDark: string;
  kilimGold: string;
  pot: string;
  potLo: string;
  potRim: string;
  leaf: string;
  leafLo: string;
  bloom: string;
  bloomHi: string;
}

/** By day: a sunny clay wall, the room dim behind him. */
const DAY: Palette = {
  wallHi: '#f7e6c9',
  wall: '#eed3a9',
  wallLo: '#dcb688',
  plaster: '#f4dfbd',
  glow: '#7d4d31',
  room: '#4b2c1d',
  roomDeep: '#2a170e',
  frameHi: '#79c2ba',
  frame: '#3f918c',
  frameLo: '#2c6c69',
  chip: '#b0855b',
  sillTop: '#86cbc2',
  sillFront: '#3a8781',
  sillLo: '#28625e',
  shade: '#5a3417',
  curtain: '#bd4630',
  curtainLo: '#8f2f20',
  kilimLight: '#f4dfb0',
  kilimDark: '#4c1a14',
  kilimGold: '#e6a93c',
  pot: '#cd6f43',
  potLo: '#a5502e',
  potRim: '#df8a5c',
  leaf: '#5f9d4a',
  leafLo: '#3e7534',
  bloom: '#e4473a',
  bloomHi: '#f6806a',
};

/** At dusk: the wall in the violet of the evening, a lamp lit in the room. */
const DUSK: Palette = {
  wallHi: '#93849e',
  wall: '#766886',
  wallLo: '#5c506e',
  plaster: '#a093ae',
  glow: '#b8743a',
  room: '#6a3f21',
  roomDeep: '#2e1a0f',
  frameHi: '#5fa39c',
  frame: '#2f7672',
  frameLo: '#215451',
  chip: '#8a6545',
  sillTop: '#6aaea5',
  sillFront: '#2b6e69',
  sillLo: '#1d4c49',
  shade: '#21130a',
  curtain: '#a63d2b',
  curtainLo: '#7a2a1d',
  kilimLight: '#e8cf9c',
  kilimDark: '#3d1410',
  kilimGold: '#d69a33',
  pot: '#b5603a',
  potLo: '#8c4427',
  potRim: '#c87a50',
  leaf: '#4f8a3e',
  leafLo: '#33622b',
  bloom: '#d63f33',
  bloomHi: '#ec705c',
};

/** A rectangle with round corners, as a path. */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${n(x + r)},${n(y)}H${n(x + w - r)}A${n(r)},${n(r)} 0 0 1 ${n(x + w)},${n(y + r)}V${n(y + h - r)}` +
    `A${n(r)},${n(r)} 0 0 1 ${n(x + w - r)},${n(y + h)}H${n(x + r)}A${n(r)},${n(r)} 0 0 1 ${n(x)},${n(y + h - r)}V${n(y + r)}` +
    `A${n(r)},${n(r)} 0 0 1 ${n(x + r)},${n(y)}z`
  );
}

/** The wall's outline. */
function wallPath(): string {
  const r = WALL.w / 2;
  const spring = WALL.top + r;
  const right = WALL.x + WALL.w;
  return (
    `M${n(WALL.x)},${n(spring)}A${n(r)},${n(r)} 0 0 1 ${n(right)},${n(spring)}V${n(WALL.foot - WALL.r)}` +
    `A${n(WALL.r)},${n(WALL.r)} 0 0 1 ${n(right - WALL.r)},${n(WALL.foot)}H${n(WALL.x + WALL.r)}A${n(WALL.r)},${n(WALL.r)} 0 0 1 ${n(WALL.x)},${n(WALL.foot - WALL.r)}z`
  );
}

/** An arched opening `grow` wider all round than the window's own, down to `foot`. */
function arch(grow: number, foot: number): string {
  const r = RADIUS + grow;
  return `M${n(OPENING.left - grow)},${n(foot)}V${n(OPENING.spring)}A${n(r)},${n(r)} 0 0 1 ${n(OPENING.right + grow)},${n(OPENING.spring)}V${n(foot)}z`;
}

/** Where the plaster was smoothed by hand and catches the sun a little more: soft patches, each its middle, its size and its lean. */
const TROWEL: readonly (readonly [number, number, number, number, number])[] = [
  [-40, 400, 46, 120, 8],
  [560, 500, 40, 130, -6],
  [80, 700, 120, 34, -4],
];

/** The kilim curtain, drawn back to the left of the opening and tied there: its leading edge, from the arch down to the sill. */
const CURTAIN_EDGE: readonly Pt[] = [
  [158, 68],
  [150, 190],
  [128, 310],
  [102, 424],
  [120, 512],
  [158, 606],
];
const CURTAIN: Knot[] = [[-10, 40, 0], ...CURTAIN_EDGE.map(([x, y]) => [x, y] as const), [158, 640, 0], [-10, 640, 0]];
/** Where it is tied back. */
const TIE: Pt = [100, 428];
/** Its folds: from the rail, gathered at the tie, and falling open again under it. */
const FOLDS: readonly (readonly Pt[])[] = [
  [[60, 60], [68, 250], [84, 420], [70, 520], [52, 620]],
  [[112, 64], [110, 240], [94, 422], [98, 520], [104, 620]],
];

/** What hangs behind him: the wall, the room with its curtain, and the frame round the opening. */
function back(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const trowel = TROWEL.map(([x, y, rx, ry, deg]) => ellipse(x, y, rx, ry, `url(#${id('patch')})`, ` transform="rotate(${deg} ${x} ${y})"`)).join('');
  // diamonds down the curtain's kilim band, light and gold in turn
  const diamonds = CURTAIN_EDGE.slice(0, -1)
    .flatMap(([x0, y0], i) => {
      const [x1, y1] = CURTAIN_EDGE[i + 1] as Pt;
      return [0.3, 0.8].map((t, k) => {
        const x = x0 + (x1 - x0) * t - 13;
        const y = y0 + (y1 - y0) * t;
        return fill(`M${n(x)},${n(y - 14)}l8,14l-8,14l-8,-14z`, (i * 2 + k) % 2 === 0 ? c.kilimLight : c.kilimGold);
      });
    })
    .join('');
  const band = taper(
    CURTAIN_EDGE.map(([x, y]) => [x - 13, y] as Pt),
    CURTAIN_EDGE.map(() => 26),
  );
  const folds = FOLDS.map((f) => taper(f, f.map((_, i) => (i === 0 || i === f.length - 1 ? 2 : 9)))).join('');
  return part(
    [
      linearAt(id('wall'), [[0, c.wallHi], [0.5, c.wall], [1, c.wallLo]], WALL.x, WALL.top, WALL.x + WALL.w * 0.7, WALL.foot),
      radialAt(id('room'), [[0, c.glow], [0.5, c.room], [1, c.roomDeep]], AXIS, 250, 330),
      linearAt(id('frame'), [[0, c.frameHi], [0.45, c.frame], [1, c.frameLo]], OPENING.left - FRAME, 0, OPENING.right + FRAME, SILL),
      linearAt(id('curtain'), [[0, c.curtainLo], [0.35, c.curtain], [1, c.curtain]], 0, 0, 160, 0),
      clipDef(id('opening'), arch(0, SILL + 4)),
      radialBox(id('patch'), [[0, c.plaster, 0.32], [1, c.plaster, 0]]),
      clipDef(id('wallclip'), wallPath()),
    ],
    [
      fill(wallPath(), `url(#${id('wall')})`),
      clipped(id('wallclip'), trowel),
      // the room, the curtain drawn back in it, and the shade the wall's thickness throws inside the opening
      fill(arch(0, SILL + 4), `url(#${id('room')})`),
      clipped(
        id('opening'),
        fill(curve(CURTAIN), `url(#${id('curtain')})`) +
          fill(folds, c.curtainLo, alpha(0.55)) +
          fill(band, c.kilimDark) +
          diamonds +
          ellipse(TIE[0], TIE[1], 22, 10, c.kilimGold) +
          ellipse(TIE[0] - 4, TIE[1] - 3, 12, 4, c.kilimLight, alpha(0.6)) +
          `<path d="${arch(0, SILL + 4)}" fill="none" stroke="${c.roomDeep}" stroke-opacity="0.5" stroke-width="44"/>`,
      ),
      // the painted frame, its paint worn through to the wood here and there
      fill(arch(FRAME, SILL) + arch(0, SILL + 1), `url(#${id('frame')})`, ' fill-rule="evenodd"'),
      ellipse(OPENING.left - FRAME * 0.5, 380, 5, 16, c.chip, alpha(0.7)),
      ellipse(OPENING.right + FRAME * 0.55, 210, 4, 12, c.chip, alpha(0.7)),
      ellipse(AXIS + 70, OPENING.spring - RADIUS - FRAME * 0.5, 12, 4, c.chip, alpha(0.6)),
      // the sill's shadow on the wall under it
      fill(roundRect(OPENING.left - FRAME - 20, SILL + 44, RADIUS * 2 + 2 * FRAME + 40, 30, 15), c.shade, alpha(0.22)),
    ],
  );
}

/** A head of geranium flowers: small round blooms in a ball, lit from the upper left. */
function geranium(c: Palette, x: number, y: number, r: number): string {
  const petals = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    return ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.5, r * 0.46, r * 0.42, i < 3 ? c.bloom : c.bloomHi);
  });
  return ellipse(x, y + r * 0.1, r, r * 0.9, c.bloom) + petals.join('') + ellipse(x - r * 0.25, y - r * 0.3, r * 0.3, r * 0.26, c.bloomHi);
}

/** A geranium leaf: round, a darker ring inside its edge, as theirs have. */
function leaf(c: Palette, x: number, y: number, r: number, deg: number): string {
  const turn = ` transform="rotate(${deg} ${x} ${y})"`;
  return ellipse(x, y, r, r * 0.66, c.leaf, turn) + ellipse(x, y, r * 0.62, r * 0.4, c.leafLo, `${alpha(0.45)}${turn}`);
}

/** What stands in front of him: the sill he leans over, and the pot of geraniums at its end. */
function front(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const left = OPENING.left - FRAME - 18;
  const right = OPENING.right + FRAME + 18;
  const pot = { x: 452, top: SILL - 62, w: 60 };
  return part(
    [
      linearAt(id('sill'), [[0, c.sillFront], [1, c.sillLo]], 0, SILL + 10, 0, SILL + 50),
      linearAt(id('pot'), [[0, c.potRim], [0.35, c.pot], [1, c.potLo]], pot.x - pot.w / 2, 0, pot.x + pot.w / 2, 0),
    ],
    [
      // the sill: its top in the light, its front face in shade
      fill(roundRect(left, SILL - 6, right - left, 22, 9), c.sillTop),
      fill(roundRect(left + 4, SILL + 10, right - left - 8, 40, 9), `url(#${id('sill')})`),
      // the pot on the sill's far end, its leaves over its rim and its flowers over them
      ellipse(pot.x, SILL + 1, pot.w * 0.55, 6, c.shade, alpha(0.3)),
      fill(`M${n(pot.x - pot.w / 2)},${n(pot.top)}H${n(pot.x + pot.w / 2)}L${n(pot.x + pot.w * 0.36)},${n(SILL)}H${n(pot.x - pot.w * 0.36)}z`, `url(#${id('pot')})`),
      leaf(c, pot.x - 30, pot.top - 8, 24, -22),
      leaf(c, pot.x + 30, pot.top - 6, 22, 24),
      leaf(c, pot.x + 2, pot.top - 16, 22, -4),
      fill(roundRect(pot.x - pot.w / 2 - 5, pot.top - 2, pot.w + 10, 14, 6), c.potRim),
      geranium(c, pot.x - 18, pot.top - 44, 20),
      geranium(c, pot.x + 22, pot.top - 36, 17),
      geranium(c, pot.x + 4, pot.top - 76, 16),
    ],
  );
}

export interface WindowArt {
  /** behind him: the wall, the room and the frame */
  back: string;
  /** in front of him: the sill and the pot */
  front: string;
}

const box = (b: CharacterBox): string => `${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}`;
const svg = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(WINDOW_VIEW)}" aria-hidden="true" focusable="false">${inner}</svg>`;

/**
 * The window, as two standalone drawings in `WINDOW_VIEW`: what lies behind
 * him and what stands in front of him. Decorative: whatever he says, the
 * words beside him say. `dark` for a dark screen; ids start with `idPrefix`.
 */
export function windowArt(options: { dark?: boolean; idPrefix?: string } = {}): WindowArt {
  const dark = options.dark === true;
  const p = `${prefixFor(options.idPrefix ?? `hvwindow${dark ? 'd' : 'l'}`)}-`;
  const c = dark ? DUSK : DAY;
  return { back: svg(back(c, p)), front: svg(front(c, p)) };
}

/** A box as shares of the window's own, from its top left. */
export interface WindowShare {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where he goes in the window, as shares of its box: the `head` crop's box
 * (`figure`); the line he is cut off at (`sill`, from the top); and how far
 * below his place he waits before he pops up (`drop`), all of him under the
 * sill.
 */
export const WINDOW_PLACE: { figure: WindowShare; sill: number; drop: number } = {
  figure: {
    left: (NECK_BOX.x - WINDOW_VIEW.x) / WINDOW_VIEW.w,
    top: (NECK_BOX.y - WINDOW_VIEW.y) / WINDOW_VIEW.h,
    width: NECK_BOX.w / WINDOW_VIEW.w,
    height: NECK_BOX.h / WINDOW_VIEW.h,
  },
  sill: (SILL - WINDOW_VIEW.y) / WINDOW_VIEW.h,
  drop: (SILL - NECK_BOX.y) / WINDOW_VIEW.h,
};

/**
 * His head rising into the window: how long after the window appears it
 * starts, and how long the spring takes to carry it up and settle (the
 * phone's `bouncy` spring, a little joy; the website's `--ease-spring`).
 * Under Reduce Motion he is simply there.
 */
export const WINDOW_POP = { delayMs: 140, ms: 560 } as const;
