import type { Pt } from '../art/svg.js';
import { linearAt, n, prefixFor, radialAt, radialBox } from '../art/svg.js';
import { NECK_BOX, NECK_SILL } from './hevalo.js';
import { alpha, circle, clipDef, clipped, curve, ellipse, fill, part, taper, type Knot } from './pen.js';
import type { CharacterBox } from './types.js';

/**
 * Hevalo putting his head in at the window: we are inside a cosy village
 * room, and he is outside and pokes his head and neck in through a
 * round-arched window to see us (the `head` crop). Through the opening, behind
 * him, the outside: by day a bright sky with the sun's glow and a cloud,
 * mountain ridges and poplars; at dusk an evening sky, violet to amber at the
 * horizon, a first star or two, the mountains in silhouette. On our side, the
 * room's warm plastered wall, the deep reveal of the opening and its frame
 * painted the blue-green village windows are, and a broad inner sill with a
 * pot of geraniums.
 *
 * Drawn in his own units, so the picture and the crop line up without
 * measuring: what lies behind him (`back`: the outside, the frame, the wall),
 * then him, cut off at the sill, then what is on our side of him (`front`:
 * the curtains, the sill and the pot), and last the shadow he throws on the
 * sill (`shadow`), which comes as he does. Each app lays them in one box of
 * the picture's shape (`WINDOW_VIEW`); he comes in from outside, rising over
 * the sill and growing a little as he comes closer (`WINDOW_PLACE`), on a
 * spring (`WINDOW_POP`).
 *
 * The picture is the same on both sides of his middle but for the pot and
 * the landscape; turned round for a page read from the right, it is mirrored
 * whole, and so is he.
 */

/** His middle, in his own units: the window is centred on it. */
const AXIS = 255;

/** The picture's box, in Hevalo's units: the wall, with room round it for his ears and antlers. */
export const WINDOW_VIEW: CharacterBox = { x: -130, y: -100, w: 770, h: 880 };

/** The opening: its sides, the line its arch springs from, and its foot (the sill, where he is cut off). */
const OPENING = { left: 25, right: 485, spring: 280 } as const;
const RADIUS = (OPENING.right - OPENING.left) / 2;
/** How wide the painted frame round the opening is. */
const FRAME = 26;
/** How deep the wall is: the plastered reveal seen round the frame, from the frame to the face of the wall. */
const REVEAL = 34;
/** The wall: a plastered panel, its top arched over the window as the window's is, its foot square with soft corners. */
const WALL = { x: -110, w: 730, top: -80, foot: 760, r: 64 } as const;

/** Where he is cut off: the sill's back edge, against the frame. */
const SILL = NECK_SILL;
/** The broad sill on our side: how far toward us it runs (as seen, down), how thick its front is, and how far its front corners spread past its back ones. */
const LEDGE = { deep: 32, face: 24, spread: 30 } as const;

interface Palette {
  wallHi: string;
  wall: string;
  wallLo: string;
  plaster: string;
  /** the light on the wall: the daylight coming in round the window, or the lamplight from below at dusk; its middle and its reach */
  spill: string;
  spillAt: readonly [number, number, number];
  revealHi: string;
  revealLo: string;
  edge: string;
  skyTop: string;
  sky: string;
  skyLow: string;
  sun: string;
  cloud: string;
  cloudLo: string;
  far: string;
  near: string;
  hill: string;
  hillLo: string;
  poplar: string;
  poplarLo: string;
  /** the first stars, or none by day */
  star: string | null;
  frameHi: string;
  frame: string;
  frameLo: string;
  chip: string;
  ledgeHi: string;
  ledge: string;
  ledgeFace: string;
  ledgeLo: string;
  shade: string;
  pot: string;
  potLo: string;
  potRim: string;
  leaf: string;
  leafLo: string;
  bloom: string;
  bloomHi: string;
}

/** By day: a sunny sky behind him, the room's limewashed wall warm in the light that comes in. */
const DAY: Palette = {
  wallHi: '#f6e4c6',
  wall: '#ecd3ad',
  wallLo: '#d6b285',
  plaster: '#fbf0de',
  spill: '#fff7e8',
  spillAt: [255, 360, 430],
  revealHi: '#f6e6cc',
  revealLo: '#c9a77e',
  edge: '#a8835a',
  skyTop: '#62aee3',
  sky: '#9fd2f1',
  skyLow: '#e6f3ee',
  sun: '#fffbea',
  cloud: '#ffffff',
  cloudLo: '#d2e4f1',
  far: '#a6bfd8',
  near: '#7ea694',
  hill: '#9cc06f',
  hillLo: '#7aa356',
  poplar: '#4f8d48',
  poplarLo: '#356b33',
  star: null,
  frameHi: '#79c2ba',
  frame: '#3f918c',
  frameLo: '#2c6c69',
  chip: '#b0855b',
  ledgeHi: '#fcf2e2',
  ledge: '#f1dfc3',
  ledgeFace: '#dcc09a',
  ledgeLo: '#c3a37c',
  shade: '#5a3417',
  pot: '#cd6f43',
  potLo: '#a5502e',
  potRim: '#df8a5c',
  leaf: '#5f9d4a',
  leafLo: '#3e7534',
  bloom: '#e4473a',
  bloomHi: '#f6806a',
};

/** At dusk: an evening sky behind him, the room lamp-lit and warm. */
const DUSK: Palette = {
  wallHi: '#bb8c63',
  wall: '#9a6c48',
  wallLo: '#68432b',
  plaster: '#d2a479',
  spill: '#ffb766',
  spillAt: [255, 860, 620],
  revealHi: '#c79a6e',
  revealLo: '#6f4f37',
  edge: '#4a321f',
  skyTop: '#2d2a62',
  sky: '#77508f',
  skyLow: '#f2a65d',
  sun: '#ffd193',
  cloud: '#e59a9a',
  cloudLo: '#9d6696',
  far: '#6a5a8e',
  near: '#45386c',
  hill: '#30284f',
  hillLo: '#251f40',
  poplar: '#211b38',
  poplarLo: '#18142b',
  star: '#fff6dc',
  frameHi: '#5fa39c',
  frame: '#2f7672',
  frameLo: '#215451',
  chip: '#8a6545',
  ledgeHi: '#d4ab82',
  ledge: '#b88d66',
  ledgeFace: '#8f6a4b',
  ledgeLo: '#6c4e36',
  shade: '#21130a',
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

/** Where the plaster was smoothed by hand and catches the light a little more: soft patches, each its middle, its size and its lean. */
const TROWEL: readonly (readonly [number, number, number, number, number])[] = [
  [-70, 330, 30, 110, 6],
  [585, 360, 28, 120, -6],
  [80, 710, 120, 30, -4],
];

/** A puff of cloud: round tops on a flat foot, shaded under. */
function cloud(c: Palette, x: number, y: number, s: number): string {
  const puff = (dx: number, dy: number, rx: number, ry: number, colour: string): string => ellipse(x + dx * s, y + dy * s, rx * s, ry * s, colour);
  return (
    puff(0, 4, 46, 14, c.cloudLo) +
    puff(-22, -4, 22, 16, c.cloud) +
    puff(4, -14, 26, 22, c.cloud) +
    puff(28, -2, 20, 14, c.cloud) +
    puff(2, 0, 44, 11, c.cloud)
  );
}

/** A poplar: tall and narrow, as they stand in rows along the village streams, on a short trunk. */
function poplar(c: Palette, x: number, foot: number, tall: number, wide: number): string {
  const top = foot - tall;
  const spine: Pt[] = [
    [x, top],
    [x, top + tall * 0.25],
    [x, top + tall * 0.6],
    [x, foot - tall * 0.12],
  ];
  return (
    fill(taper([[x, foot - tall * 0.2], [x, foot]], [wide * 0.22, wide * 0.18]), c.poplarLo) +
    fill(taper(spine, [0, wide * 0.8, wide, wide * 0.5]), c.poplar) +
    fill(taper(spine.map(([px, py]) => [px + wide * 0.18, py] as Pt), [0, wide * 0.36, wide * 0.44, wide * 0.2]), c.poplarLo, alpha(0.7))
  );
}

/** A star: a point of light with a soft glow round it. */
function star(c: Palette, p: string, x: number, y: number, r: number): string {
  return ellipse(x, y, r * 4, r * 4, `url(#${p}twinkle)`) + circle(x, y, r, c.star ?? c.sun);
}

/** What lies outside, behind him: the sky, the sun's glow (or the evening's), the mountains and the trees, kept inside the opening. */
function outside(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const top = OPENING.spring - RADIUS;
  const dusk = c.star !== null;
  // the far range, its peaks sharp, and a nearer, lower one in front of it
  const far: Knot[] = [
    [OPENING.left - 10, 540, 0], [OPENING.left - 10, 470], [70, 432, 0.3], [120, 476], [190, 462], [250, 488], [330, 456], [400, 418, 0.3],
    [450, 452], [OPENING.right + 10, 466, 0], [OPENING.right + 10, 540, 0],
  ];
  const near: Knot[] = [
    [OPENING.left - 10, 560, 0], [OPENING.left - 10, 508], [80, 498], [150, 520], [240, 512], [340, 522], [420, 498], [OPENING.right + 10, 512, 0],
    [OPENING.right + 10, 560, 0],
  ];
  const meadow: Knot[] = [
    [OPENING.left - 10, SILL + 10, 0], [OPENING.left - 10, 552], [110, 540], [230, 556], [360, 542], [OPENING.right + 10, 552, 0], [OPENING.right + 10, SILL + 10, 0],
  ];
  // by day, snow on the high peaks
  const snow = dusk ? '' : fill(`M58,441L70,432L82,440L76,446L70,442L64,447z`, c.cloud, alpha(0.9)) + fill(`M388,427L400,418L413,428L406,433L400,429L394,434z`, c.cloud, alpha(0.9));
  return part(
    [
      linearAt(id('sky'), [[0, c.skyTop], [0.55, c.sky], [1, c.skyLow]], 0, top, 0, 520),
      // by day the sun high behind his head, lighting him round the edges; at dusk the afterglow low behind him
      dusk ? radialAt(id('sun'), [[0, c.sun, 0.75], [0.45, c.sun, 0.3], [1, c.sun, 0]], AXIS, 560, 330) : radialAt(id('sun'), [[0, c.sun, 1], [0.4, c.sun, 0.7], [1, c.sun, 0]], AXIS, 150, 250),
      linearAt(id('far'), [[0, c.far], [1, c.near, 0.6]], 0, 420, 0, 540),
      linearAt(id('meadow'), [[0, c.hill], [1, c.hillLo]], 0, 540, 0, SILL),
      ...(c.star ? [radialBox(id('twinkle'), [[0, c.star, 0.55], [1, c.star, 0]])] : []),
      clipDef(id('opening'), arch(0, SILL + 4)),
    ],
    [
      clipped(
        id('opening'),
        fill(arch(0, SILL + 4), `url(#${id('sky')})`) +
          fill(arch(0, SILL + 4), `url(#${id('sun')})`) +
          (dusk ? star(c, p, 214, 82, 3) + star(c, p, 318, 112, 2.2) + star(c, p, 62, 318, 2.4) + star(c, p, 452, 282, 2) : '') +
          cloud(c, 58, 290, 0.5) +
          cloud(c, 448, 318, 0.62) +
          fill(curve(far), `url(#${id('far')})`) +
          snow +
          fill(curve(near), c.near) +
          poplar(c, 64, 560, 150, 30) +
          poplar(c, 100, 566, 112, 24) +
          poplar(c, 448, 556, 96, 22) +
          fill(curve(meadow), `url(#${id('meadow')})`),
      ),
    ],
  );
}

/** What hangs behind him: the outside through the opening, the frame round it, and the room's wall with the deep reveal of the opening in it. */
function back(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const trowel = TROWEL.map(([x, y, rx, ry, deg]) => ellipse(x, y, rx, ry, `url(#${id('patch')})`, ` transform="rotate(${deg} ${x} ${y})"`)).join('');
  const reveal = arch(FRAME + REVEAL, SILL);
  return part(
    [
      linearAt(id('wall'), [[0, c.wallHi], [0.5, c.wall], [1, c.wallLo]], WALL.x, WALL.top, WALL.x + WALL.w * 0.7, WALL.foot),
      radialAt(id('spill'), [[0, c.spill, 0.7], [0.6, c.spill, 0.25], [1, c.spill, 0]], ...c.spillAt),
      // the room's corners, up under the ceiling and down by the floor, a little in shade
      radialAt(id('corners'), [[0.62, c.wallLo, 0], [1, c.wallLo, 0.7]], AXIS, 380, 520),
      // the reveal in shade under the arch, in the light toward the sill
      linearAt(id('reveal'), [[0, c.revealLo], [0.55, c.revealHi], [1, c.revealHi]], 0, OPENING.spring - RADIUS - FRAME - REVEAL, 0, SILL),
      linearAt(id('frame'), [[0, c.frameHi], [0.45, c.frame], [1, c.frameLo]], OPENING.left - FRAME, 0, OPENING.right + FRAME, SILL),
      radialBox(id('patch'), [[0, c.plaster, 0.32], [1, c.plaster, 0]]),
      clipDef(id('wallclip'), wallPath()),
    ],
    [
      fill(wallPath(), `url(#${id('wall')})`),
      clipped(id('wallclip'), trowel + fill(wallPath(), `url(#${id('spill')})`) + fill(wallPath(), `url(#${id('corners')})`)),
      // the wall's thickness round the opening, its edge a crisp line where it turns from the wall's face
      fill(reveal, `url(#${id('reveal')})`),
      `<path d="${reveal}" fill="none" stroke="${c.edge}" stroke-opacity="0.45" stroke-width="3"/>`,
      outside(c, p),
      // the painted frame, its paint worn through to the wood here and there, and the soft shade it throws on the reveal
      `<path d="${arch(FRAME + 6, SILL)}" fill="none" stroke="${c.shade}" stroke-opacity="0.12" stroke-width="8"/>`,
      fill(arch(FRAME, SILL) + arch(0, SILL + 1), `url(#${id('frame')})`, ' fill-rule="evenodd"'),
      ellipse(OPENING.left - FRAME * 0.5, 380, 5, 16, c.chip, alpha(0.7)),
      ellipse(OPENING.right + FRAME * 0.55, 210, 4, 12, c.chip, alpha(0.7)),
      ellipse(AXIS + 70, OPENING.spring - RADIUS - FRAME * 0.5, 12, 4, c.chip, alpha(0.6)),
      // the sill's shadow on the wall under it
      fill(roundRect(-70, SILL + LEDGE.deep + LEDGE.face, 650, 34, 17), c.shade, alpha(0.2)),
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

/** The sill's top, seen from a little above: from the frame toward us, spreading as it comes. */
function ledgeTop(): string {
  const back = { left: OPENING.left - FRAME - REVEAL, right: OPENING.right + FRAME + REVEAL };
  return `M${n(back.left)},${n(SILL - 3)}H${n(back.right)}L${n(back.right + LEDGE.spread)},${n(SILL + LEDGE.deep)}H${n(back.left - LEDGE.spread)}z`;
}

/** The pot on the sill: where it stands, and how wide its mouth is. */
const POT = { x: 506, foot: SILL + 24, w: 62, tall: 58 } as const;

/** What is on our side of him: the broad sill in front of him, and the pot of geraniums on it. */
function front(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  const left = OPENING.left - FRAME - REVEAL - LEDGE.spread;
  const right = OPENING.right + FRAME + REVEAL + LEDGE.spread;
  const top = POT.foot - POT.tall;
  return part(
    [
      linearAt(id('ledge'), [[0, c.ledgeHi], [1, c.ledge]], 0, SILL, 0, SILL + LEDGE.deep),
      linearAt(id('ledgeface'), [[0, c.ledgeFace], [1, c.ledgeLo]], 0, SILL + LEDGE.deep, 0, SILL + LEDGE.deep + LEDGE.face),
      linearAt(id('pot'), [[0, c.potRim], [0.35, c.pot], [1, c.potLo]], POT.x - POT.w / 2, 0, POT.x + POT.w / 2, 0),
    ],
    [
      // the sill: its top in the light, its front edge catching it, its front face in shade
      fill(ledgeTop(), `url(#${id('ledge')})`),
      fill(roundRect(left, SILL + LEDGE.deep - 4, right - left, LEDGE.face + 4, 8), `url(#${id('ledgeface')})`),
      fill(roundRect(left + 4, SILL + LEDGE.deep - 4, right - left - 8, 5, 2.5), c.ledgeHi, alpha(0.8)),
      // the pot at the sill's end, its leaves over its rim and its flowers over them
      ellipse(POT.x, POT.foot, POT.w * 0.6, 7, c.shade, alpha(0.28)),
      fill(`M${n(POT.x - POT.w / 2)},${n(top)}H${n(POT.x + POT.w / 2)}L${n(POT.x + POT.w * 0.36)},${n(POT.foot)}H${n(POT.x - POT.w * 0.36)}z`, `url(#${id('pot')})`),
      leaf(c, POT.x - 30, top - 8, 24, -22),
      leaf(c, POT.x + 30, top - 6, 22, 24),
      leaf(c, POT.x + 2, top - 16, 22, -4),
      fill(roundRect(POT.x - POT.w / 2 - 5, top - 2, POT.w + 10, 14, 6), c.potRim),
      geranium(c, POT.x - 18, top - 44, 20),
      geranium(c, POT.x + 22, top - 36, 17),
      geranium(c, POT.x + 4, top - 76, 16),
    ],
  );
}

/** The soft shadow his head and neck throw on the sill, toward us, the light being behind him. */
function shadow(c: Palette, p: string): string {
  const id = (name: string): string => `${p}${name}`;
  return part(
    [radialBox(id('cast'), [[0, c.shade, 0.42], [0.6, c.shade, 0.22], [1, c.shade, 0]]), clipDef(id('sill'), ledgeTop())],
    [clipped(id('sill'), ellipse(AXIS, SILL + 8, 200, 34, `url(#${id('cast')})`))],
  );
}

export interface WindowArt {
  /** behind him: the outside, the frame and the room's wall */
  back: string;
  /** on our side of him: the sill and the pot */
  front: string;
  /** the shadow he throws on the sill, drawn over it once he is there */
  shadow: string;
}

const box = (b: CharacterBox): string => `${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}`;
const svg = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(WINDOW_VIEW)}" aria-hidden="true" focusable="false">${inner}</svg>`;

/**
 * The window, as three standalone drawings in `WINDOW_VIEW`: what lies
 * behind him, what is on our side of him, and his shadow. Decorative:
 * whatever he says, the words beside him say. `dark` for a dark screen; ids
 * start with `idPrefix`.
 */
export function windowArt(options: { dark?: boolean; idPrefix?: string } = {}): WindowArt {
  const dark = options.dark === true;
  const p = `${prefixFor(options.idPrefix ?? `hvwindow${dark ? 'd' : 'l'}`)}-`;
  const c = dark ? DUSK : DAY;
  return { back: svg(back(c, p)), front: svg(front(c, p)), shadow: svg(shadow(c, p)) };
}

/** A box as shares of the window's own, from its top left. */
export interface WindowShare {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How big he is as he waits outside to come in, as a share of his size: farther off. */
const FAR = 0.8;

/**
 * Where he goes in the window, as shares of its box: the `head` crop's box
 * (`figure`), and the line he is cut off at (`sill`, from the top). Before he
 * comes in he waits outside, all of him under the sill: `drop` below his
 * place and `far` his size, as if farther off, about `through`, the middle of
 * his neck where it comes in over the sill (as shares of his own box). And
 * the room's wall the window is in (`wall`: its two sides across, its foot
 * down), what stands on the floor in front of it lines up with.
 */
export const WINDOW_PLACE: {
  figure: WindowShare;
  sill: number;
  drop: number;
  far: number;
  through: { x: number; y: number };
  wall: { left: number; right: number; foot: number };
} = {
  figure: {
    left: (NECK_BOX.x - WINDOW_VIEW.x) / WINDOW_VIEW.w,
    top: (NECK_BOX.y - WINDOW_VIEW.y) / WINDOW_VIEW.h,
    width: NECK_BOX.w / WINDOW_VIEW.w,
    height: NECK_BOX.h / WINDOW_VIEW.h,
  },
  sill: (SILL - WINDOW_VIEW.y) / WINDOW_VIEW.h,
  drop: (FAR * (SILL - NECK_BOX.y)) / WINDOW_VIEW.h,
  far: FAR,
  through: { x: (AXIS - NECK_BOX.x) / NECK_BOX.w, y: (SILL - NECK_BOX.y) / NECK_BOX.h },
  wall: { left: (WALL.x - WINDOW_VIEW.x) / WINDOW_VIEW.w, right: (WALL.x + WALL.w - WINDOW_VIEW.x) / WINDOW_VIEW.w, foot: (WALL.foot - WINDOW_VIEW.y) / WINDOW_VIEW.h },
};

/**
 * His coming in at the window: how long after the window appears he starts,
 * and how long the spring takes to carry him up and in and settle him (the
 * phone's `bouncy` spring, a little joy; the website's `--ease-spring`).
 * Under Reduce Motion he is simply there.
 */
export const WINDOW_POP = { delayMs: 140, ms: 560 } as const;
