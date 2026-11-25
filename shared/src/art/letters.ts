/**
 * The pictures for letters by bird (shared/src/letters.ts): your window seen from inside a village room, deep in a mud
 * wall with an old wooden frame, shutters and sill, the pigeons, and a letter in its envelope. Each window layer is its
 * own same-sized picture (`part`) so apps can stack and animate them; `whole` is all of it, still. The pigeon is drawn
 * separately (`letterBirdSvg`) so it can stand on the sill in front of the room or fly out behind it; `LETTER_SILL`
 * places it and `LETTER_FLIGHT` is its flight path.
 */
import { LETTER_BIRDS } from '../letters.js';
import { fill, form, line as stroke, ring, rr, type Tones } from './cutout.js';
import { leaf } from './paint.js';
import { PIGEON_PECK, pigeon, pigeonHolds, pigeonShadow, type PigeonPose } from './pigeon.js';
import { Drawing, checkSize, linearAt, mix, n, n2, prefixFor, radialAt, radialBox, seeded, tint, type Pt } from './svg.js';
import type { TreeSky } from './tree-scene.js';

/** What changes with the hour: the country outside, and the room's mud and wood in its light. */
interface Hour {
  sky: readonly [top: string, horizon: string];
  /** The sun or moon: position, radius, colour and glow. */
  orb: readonly [x: number, y: number, r: number, colour: string, glow: string];
  cloud: string;
  mountains: readonly [far: string, near: string];
  snow: string;
  hills: readonly [back: string, front: string];
  trees: readonly [crown: string, trunk: string];
  meadow: readonly [string, string];
  grass: string;
  flowers: readonly [string, string, string];
  heart: string;
  /** The sun-dried mud plaster of the wall and its reveal. */
  mud: Tones;
  /** The old walnut of the lintel and frame. */
  wood: Tones;
  /** The weathered poplar boards of the shutters and sill. */
  board: Tones;
  /** The darkest wood: joints, grooves, nails and the gaps where wood meets mud. */
  joint: string;
  /** The light coming in, and its strength on the sill. */
  light: readonly [string, number];
  /** A lamp lit in the room, low on the left: its colour and strength. */
  lamp?: readonly [string, number];
  /** A low sun's light across the shutter that faces it: its strength. */
  sun?: number;
  night?: true;
}

const HOURS: Record<TreeSky, Hour> = {
  day: {
    sky: ['#8fcbf0', '#e2f3fb'],
    orb: [82, 30, 5.2, '#fff8d8', '#fff2b4'],
    cloud: '#ffffff',
    mountains: ['#b9cfe4', '#9db9d8'],
    snow: '#f4f8fc',
    hills: ['#b5d67a', '#9cc862'],
    trees: ['#5f9f48', '#7b5a3c'],
    meadow: ['#8cc653', '#a3d468'],
    grass: '#5f9a3e',
    flowers: ['#f9df4b', '#f2708f', '#a6d8f4'],
    heart: '#f06d8c',
    mud: { light: '#ecce9f', base: '#d9b07b', shade: '#b98d5c' },
    wood: { light: '#a97851', base: '#875a39', shade: '#5f3d25' },
    board: { light: '#ccab85', base: '#a88563', shade: '#7c5f43' },
    joint: '#45291a',
    light: ['#fff4d6', 0.5],
  },
  dawn: {
    sky: ['#f2b9a4', '#fde7d2'],
    orb: [36, 50, 5.6, '#fff1cf', '#ffd59a'],
    cloud: '#fff4ec',
    mountains: ['#d6c3d6', '#bfa9c8'],
    snow: '#fff6f0',
    hills: ['#c4cf7e', '#a9c464'],
    trees: ['#6d9a4c', '#7b5a3c'],
    meadow: ['#94c058', '#accd6c'],
    grass: '#678f42',
    flowers: ['#f9df4b', '#f2708f', '#a6d8f4'],
    heart: '#f06d8c',
    mud: { light: '#f0cda9', base: '#dcad86', shade: '#bc8b64' },
    wood: { light: '#ac7656', base: '#895a3e', shade: '#613f2b' },
    board: { light: '#d1a98a', base: '#ab8467', shade: '#7f5e48' },
    joint: '#47291c',
    light: ['#ffe2c4', 0.5],
    sun: 0.3,
  },
  dusk: {
    sky: ['#b06a98', '#f7bf9c'],
    orb: [86, 52, 6, '#ffd9a0', '#ff9f70'],
    cloud: '#fcd8c8',
    mountains: ['#a882a8', '#8b6996'],
    snow: '#fbe6e2',
    hills: ['#a6b86a', '#8eaa58'],
    trees: ['#5a8644', '#6e4f36'],
    meadow: ['#7fae4e', '#94bf5c'],
    grass: '#58833c',
    flowers: ['#f6d25a', '#ee6f8e', '#b5c8f0'],
    heart: '#e9627f',
    mud: { light: '#f3c78f', base: '#d6a26f', shade: '#ae7a52' },
    wood: { light: '#ae774d', base: '#855637', shade: '#5c3b26' },
    board: { light: '#d4a67b', base: '#aa7f5a', shade: '#7c5a3f' },
    joint: '#432718',
    light: ['#ffc77e', 0.55],
    lamp: ['#ffb35c', 0.14],
    sun: 0.36,
  },
  night: {
    sky: ['#121a44', '#2d3b7a'],
    orb: [80, 28, 4.6, '#f6f1d6', '#a9b8ff'],
    cloud: '#36427c',
    mountains: ['#27346a', '#202b5a'],
    snow: '#8e9ccc',
    hills: ['#2b4a44', '#25413a'],
    trees: ['#1f3a33', '#2a2a3a'],
    meadow: ['#264236', '#2c4c3c'],
    grass: '#1c3329',
    flowers: ['#d9c35a', '#c9667f', '#8fb0d6'],
    heart: '#c25a74',
    mud: { light: '#7a573a', base: '#5c402c', shade: '#45301f' },
    wood: { light: '#6a4a31', base: '#47301f', shade: '#311f14' },
    board: { light: '#7b5f45', base: '#5b4431', shade: '#3e2e21' },
    joint: '#22140c',
    light: ['#c4d2ff', 0.2],
    lamp: ['#ffa04a', 0.46],
    night: true,
  },
};

/**
 * The window on its 120-unit square: where the wall's face turns into its deep reveal, the frame set back in it, the
 * opening, the sill, and the lintel beam over it all.
 */
const REVEAL = { x0: 14, y0: 11, x1: 106, y1: 92 } as const;
const FRAME = { x0: 21, y0: 17, x1: 99, y1: 88 } as const;
const LINTEL = { x0: 8, x1: 112, y0: 2.2, y1: 8.6 } as const;
const OPENING = { x0: 25.4, y0: 21.4, x1: 94.6, y1: 85.4 } as const;
/** Where the country shows through the window on its 120-unit square; a pigeon flying out is wholly inside it once behind the room. */
export const LETTER_OPENING = OPENING;
const SILL_FRONT = { x0: 10, x1: 110, y: 96, depth: 4.8 } as const;

/**
 * The window's layers, back to front. A pigeon on the sill stands over all of them, the sill light included. The pot's
 * plant is its own layer so it can sway.
 */
export const LETTER_WINDOW_PARTS = ['sky', 'clouds', 'far', 'near', 'room', 'left', 'right', 'plant', 'light'] as const;
export type LetterWindowPart = (typeof LETTER_WINDOW_PARTS)[number];

/**
 * How far each layer shifts with the eye, as a share of the window's width at the extreme: nearer country more, the
 * room and shutters not at all, so the frame holds still and the outside turns behind it.
 */
export const LETTER_WINDOW_DEPTH: Readonly<Record<LetterWindowPart, number>> = { sky: 0.006, clouds: 0.012, far: 0.02, near: 0.04, room: 0, left: 0, right: 0, plant: 0, light: 0 };

/** The plant's pivot (the pot's rim, on the window's square), its sway each way in degrees, and one sway's duration. */
export const LETTER_PLANT_SWAY = { x: 90, y: 86, turn: 3.2, ms: 5600 } as const;

/** A pigeon's place on the sill, on the window's 120-unit square: its feet, and its own square's width (`letterBirdSvg`) as a share of the window's. */
export const LETTER_SILL = { x: 50, y: 93.4, birdShare: 0.46 } as const;

/** Where a pigeon's feet are on its own square, and its scale there relative to its own drawing. */
export const LETTER_BIRD_FEET = { x: 60, y: 100, scale: 1.5 } as const;

/** How far ahead of its feet a letter lies for pecking it up or laying it down: under the pecking beak, as shares of its square. */
const PECK_LETTER = Math.round(((PIGEON_PECK.letter * LETTER_BIRD_FEET.scale) / 120) * 1000) / 1000;

/**
 * How a pigeon flies off with a letter, out through the window and away: per moment (`at`, 0 to 1) its square's offset
 * from its sill place (shares of the window), its scale and opacity. From `behindAt` on it is outside and small enough
 * to fit in the opening, so apps draw it behind the room. An incoming pigeon flies the same path backwards.
 */
export const LETTER_FLIGHT = {
  keys: [
    { at: 0, x: 0, y: 0, scale: 1, seen: 1 },
    { at: 0.12, x: 0, y: 0.012, scale: 1, seen: 1 },
    { at: 0.26, x: 0.03, y: -0.1, scale: 0.92, seen: 1 },
    { at: 0.42, x: 0.08, y: -0.2, scale: 0.62, seen: 1 },
    { at: 0.7, x: 0.2, y: -0.27, scale: 0.32, seen: 1 },
    { at: 0.86, x: 0.26, y: -0.29, scale: 0.18, seen: 1 },
    { at: 1, x: 0.3, y: -0.3, scale: 0.1, seen: 0 },
  ],
  behindAt: 0.42,
  /** Its duration, and one wingbeat's (wings up, then down). */
  ms: 2600,
  beatMs: 240,
} as const;

/** A pigeon's place at one moment of its play: forward and down offset (shares of its square), lean, and stretch; `sx` -1 is turned round. */
export interface LetterPlayMove {
  at: number;
  x: number;
  y: number;
  tilt: number;
  sx: number;
  sy: number;
}

/**
 * A pigeon's play on the sill, alike on both apps: its duration; its movement (`moves`, about its feet, leaning and
 * stepping where it faces); which picture shows when (`poses`); and, for a letter on the sill, its offset in front of
 * the feet and how it comes down and goes (`letter`, its height in shares of the pigeon's square, and its opacity).
 */
export interface LetterPlay {
  ms: number;
  loop: boolean;
  moves: readonly LetterPlayMove[];
  poses: ReadonlyArray<readonly [at: number, pose: PigeonPose, letter: boolean]>;
  letterAt: number;
  letter: ReadonlyArray<{ at: number; y: number; seen: number }>;
}

/**
 * A play timed in milliseconds from its start: `moves` (each key keeps what it omits from the previous one), `poses` and
 * the sill `letter`. It is converted to shares of its length, the clock an app runs it on.
 */
function timed(play: {
  ms: number;
  loop?: boolean;
  moves: ReadonlyArray<Partial<LetterPlayMove> & { at: number }>;
  poses: ReadonlyArray<readonly [at: number, pose: PigeonPose, letter: boolean]>;
  letterAt?: number;
  letter?: ReadonlyArray<{ at: number; y: number; seen: number }>;
}): LetterPlay {
  const share = (at: number): number => Math.round((at / play.ms) * 100000) / 100000;
  let last: LetterPlayMove = { at: 0, x: 0, y: 0, tilt: 0, sx: 1, sy: 1 };
  const keyed = play.moves.map((k) => (last = { ...last, ...k }));
  return {
    ms: play.ms,
    loop: play.loop ?? false,
    moves: [...keyed, { ...last, at: play.ms }].map((m) => ({ ...m, at: share(m.at) })),
    poses: play.poses.map(([at, pose, letter]) => [share(at), pose, letter] as const),
    letterAt: play.letterAt ?? 0,
    letter: (play.letter ?? []).map((k) => ({ ...k, at: share(k.at) })),
  };
}

/**
 * A pigeon's plays: before it leaves, after it lands, idle at home, two for a bird at someone else's window (`fetch`
 * picks its own letter up again when sent on; `take` collects an answer that drops in front of it), and `turn` to face
 * the other way. Neither window play steps toward a neighbouring bird.
 */
export const LETTER_PLAY: Readonly<Record<'before' | 'after' | 'idle' | 'fetch' | 'take' | 'turn', LetterPlay>> = {
  // Your letter drops onto the sill; the pigeon looks up, hops and chirps, hops over and picks it up, shows it to you,
  // and beats its wings, ready.
  before: timed({
    ms: 4900,
    moves: [
      { at: 0 },
      { at: 720, tilt: -8 },
      { at: 960, tilt: 0 },
      { at: 1120, y: -0.06, sx: 0.96, sy: 1.05 },
      { at: 1320, y: 0, sx: 1.08, sy: 0.9 },
      { at: 1480, sx: 1, sy: 1 },
      { at: 1680, x: 0.035, y: -0.045 },
      { at: 1880, x: 0.07, y: 0, sx: 1.06, sy: 0.92 },
      { at: 2000, sx: 1, sy: 1 },
      // It draws itself up looking down at the letter, then its head goes down quickly, the body after, giving as the beak
      // meets the sill.
      { at: 2100, sx: 0.98, sy: 1.03 },
      { at: 2200, sx: 1, sy: 1 },
      { at: 2290 },
      { at: 2330, sx: 1.03, sy: 0.96 },
      { at: 2440, sx: 1, sy: 1 },
      // A small hop as it turns to you with the letter, and another as it turns back.
      { at: 2640 },
      { at: 2690, y: -0.03 },
      { at: 2740, y: 0 },
      { at: 3380 },
      { at: 3430, y: -0.03 },
      { at: 3490, y: 0 },
      { at: 3660, y: -0.05 },
      { at: 3840, y: 0 },
      { at: 4020, x: 0.045, y: -0.06 },
      { at: 4200, y: 0 },
      { at: 4380, x: 0.02, y: -0.05 },
      { at: 4560, x: 0, y: 0 },
    ],
    poses: [
      [0, 'perched', false],
      [400, 'blink', false],
      [560, 'perched', false],
      [1040, 'happy', false],
      [1600, 'perched', false],
      [2200, 'peck-1', false],
      [2245, 'peck-2', false],
      [2290, 'peck', false],
      // It lifts the letter off the sill as its head comes up, the letter hanging under the beak throughout.
      [2500, 'peck-2', true],
      [2560, 'peck-1', true],
      [2620, 'perched', true],
      [2660, 'turn', true],
      [2730, 'front', true],
      [3400, 'turn', true],
      [3470, 'perched', true],
      [3580, 'wings-up', true],
      [3748, 'wings-down', true],
      [3928, 'wings-up', true],
      [4100, 'wings-down', true],
      [4280, 'wings-up', true],
      [4460, 'wings-down', true],
      [4640, 'perched', true],
    ],
    letterAt: 0.07 + PECK_LETTER,
    letter: [
      { at: 0, y: -0.55, seen: 0 },
      { at: 160, y: -0.5, seen: 1 },
      { at: 640, y: 0, seen: 1 },
      { at: 760, y: -0.04, seen: 1 },
      { at: 880, y: 0, seen: 1 },
      { at: 2496, y: 0, seen: 1 },
      { at: 2500, y: 0, seen: 0 },
      { at: 4900, y: 0, seen: 0 },
    ],
  }),
  // Landed with a letter: it lays the letter on the sill and taps it, shakes its feathers, chirps, turns to look behind,
  // turns back to wave hello, and stands as it came.
  after: timed({
    ms: 5300,
    moves: [
      { at: 0, sx: 1.08, sy: 0.9 },
      { at: 240, sx: 1, sy: 1 },
      { at: 300 },
      { at: 390 },
      { at: 430, sx: 1.03, sy: 0.96 },
      { at: 540, sx: 1, sy: 1 },
      { at: 1040 },
      { at: 1180, tilt: -7 },
      { at: 1320, tilt: 7 },
      { at: 1460, tilt: -5 },
      { at: 1600, tilt: 4 },
      { at: 1740, tilt: 0 },
      { at: 2016, y: -0.06, sx: 0.96, sy: 1.05 },
      { at: 2256, y: 0, sx: 1.08, sy: 0.9 },
      { at: 2400, sx: 1, sy: 1 },
      { at: 2860 },
      { at: 2994.5, y: -0.045 },
      { at: 2995, sx: -1 },
      { at: 3130, y: 0 },
      { at: 3680 },
      { at: 3730, y: -0.03 },
      { at: 3790, y: 0 },
      { at: 3859.5 },
      { at: 3860, sx: 1 },
      { at: 4680 },
      { at: 4730, y: -0.03 },
      { at: 4790, y: 0 },
    ],
    poses: [
      [0, 'perched', true],
      // It brings the letter down hanging from its beak and lets go as the beak reaches the sill.
      [300, 'peck-1', true],
      [345, 'peck-2', true],
      [390, 'peck', false],
      [640, 'peck-2', false],
      [700, 'peck-1', false],
      [760, 'perched', false],
      [1968, 'happy', false],
      [2544, 'perched', false],
      [2688, 'blink', false],
      [2784, 'perched', false],
      [2880, 'turn', false],
      [2950, 'front', false],
      [3040, 'turn', false],
      [3110, 'perched', false],
      [3700, 'turn', false],
      [3770, 'front', false],
      [3950, 'hello', false],
      [4170, 'front', false],
      [4330, 'hello', false],
      [4550, 'front', false],
      [4700, 'turn', false],
      [4770, 'perched', false],
    ],
    letterAt: PECK_LETTER,
    letter: [
      { at: 0, y: 0, seen: 0 },
      { at: 386, y: 0, seen: 0 },
      { at: 390, y: 0, seen: 1 },
      { at: 5300, y: 0, seen: 1 },
    ],
  }),
  // Sent on: it looks at you a while, then down at its letter, picks it up, turns the way it will fly, and beats its
  // wings, ready.
  fetch: timed({
    ms: 3900,
    moves: [
      { at: 0 },
      { at: 220 },
      { at: 270, y: -0.03 },
      { at: 330, y: 0 },
      { at: 880 },
      { at: 930, y: -0.03 },
      { at: 990, y: 0 },
      { at: 1300, sx: 0.98, sy: 1.03 },
      { at: 1400, sx: 1, sy: 1 },
      { at: 1490 },
      { at: 1530, sx: 1.03, sy: 0.96 },
      { at: 1640, sx: 1, sy: 1 },
      { at: 1820 },
      { at: 1860 },
      { at: 1994.5, y: -0.04 },
      { at: 1995, sx: -1 },
      { at: 2130, y: 0 },
      { at: 2220 },
      { at: 2350, y: -0.05 },
      { at: 2540, y: 0 },
      { at: 2730, y: -0.05 },
      { at: 2920, y: 0 },
      { at: 3110, y: -0.04 },
      { at: 3300, y: 0 },
    ],
    poses: [
      [0, 'perched', false],
      [240, 'turn', false],
      [310, 'front', false],
      [900, 'turn', false],
      [970, 'perched', false],
      [1400, 'peck-1', false],
      [1445, 'peck-2', false],
      [1490, 'peck', false],
      [1690, 'peck-2', true],
      [1750, 'peck-1', true],
      [1810, 'perched', true],
      [1880, 'turn', true],
      [1950, 'front', true],
      [2040, 'turn', true],
      [2110, 'perched', true],
      [2260, 'wings-up', true],
      [2450, 'wings-down', true],
      [2640, 'wings-up', true],
      [2830, 'wings-down', true],
      [3020, 'wings-up', true],
      [3210, 'wings-down', true],
      [3440, 'perched', true],
    ],
    letterAt: PECK_LETTER,
    letter: [
      { at: 0, y: 0, seen: 1 },
      { at: 1686, y: 0, seen: 1 },
      { at: 1690, y: 0, seen: 0 },
      { at: 3900, y: 0, seen: 0 },
    ],
  }),
  // Answered: it watches the answer drop in front of it, chirps, picks it up, turns the way it will fly, and beats its
  // wings, ready to take it home.
  take: timed({
    ms: 3800,
    moves: [
      { at: 0 },
      { at: 204, tilt: -10 },
      { at: 612, tilt: -10 },
      { at: 884, tilt: 0 },
      { at: 1180, sx: 0.98, sy: 1.03 },
      { at: 1280, sx: 1, sy: 1 },
      { at: 1370 },
      { at: 1410, sx: 1.03, sy: 0.96 },
      { at: 1520, sx: 1, sy: 1 },
      { at: 1700 },
      { at: 1740 },
      { at: 1874.5, y: -0.04 },
      { at: 1875, sx: -1 },
      { at: 2010, y: 0 },
      { at: 2100 },
      { at: 2230, y: -0.05 },
      { at: 2420, y: 0 },
      { at: 2610, y: -0.05 },
      { at: 2800, y: 0 },
      { at: 2990, y: -0.04 },
      { at: 3180, y: 0 },
    ],
    poses: [
      [0, 'perched', false],
      [816, 'happy', false],
      [1020, 'perched', false],
      [1280, 'peck-1', false],
      [1325, 'peck-2', false],
      [1370, 'peck', false],
      [1570, 'peck-2', true],
      [1630, 'peck-1', true],
      [1690, 'perched', true],
      [1760, 'turn', true],
      [1830, 'front', true],
      [1920, 'turn', true],
      [1990, 'perched', true],
      [2140, 'wings-up', true],
      [2330, 'wings-down', true],
      [2520, 'wings-up', true],
      [2710, 'wings-down', true],
      [2900, 'wings-up', true],
      [3090, 'wings-down', true],
      [3320, 'perched', true],
    ],
    letterAt: PECK_LETTER,
    letter: [
      { at: 0, y: -0.55, seen: 0 },
      { at: 102, y: -0.5, seen: 1 },
      { at: 510, y: 0, seen: 1 },
      { at: 612, y: -0.04, seen: 1 },
      { at: 714, y: 0, seen: 1 },
      { at: 1566, y: 0, seen: 1 },
      { at: 1570, y: 0, seen: 0 },
      { at: 3800, y: 0, seen: 0 },
    ],
  }),
  // At home, looping: a head bob, a peck at the seeds, a look at the sky, a chirp, a turn to look the other way, and a
  // turn back that pauses to look at you.
  idle: timed({
    ms: 15000,
    loop: true,
    moves: [
      { at: 0 },
      { at: 1500 },
      // A step on the spot with each bob, the body catching up with the head.
      { at: 1620, x: 0.006 },
      { at: 1900, x: 0.012 },
      { at: 2180, x: 0.006 },
      { at: 2460, x: 0 },
      // Two pecks at the seeds, the second without coming all the way up between.
      { at: 4100, sx: 0.98, sy: 1.03 },
      { at: 4200, sx: 1, sy: 1 },
      { at: 4290 },
      { at: 4330, sx: 1.03, sy: 0.96 },
      { at: 4440, sx: 1, sy: 1 },
      { at: 4620 },
      { at: 4660, sx: 1.03, sy: 0.96 },
      { at: 4770, sx: 1, sy: 1 },
      { at: 5400 },
      { at: 7200 },
      { at: 7500, tilt: -12 },
      { at: 8700, tilt: -12 },
      { at: 9000, tilt: 0 },
      { at: 10780 },
      { at: 10914.5, y: -0.045 },
      { at: 10915, sx: -1 },
      { at: 11050, y: 0 },
      { at: 12880 },
      { at: 12930, y: -0.03 },
      { at: 12990, y: 0 },
      { at: 13499.5 },
      { at: 13500, sx: 1 },
      { at: 14030 },
      { at: 14080, y: -0.03 },
      { at: 14140, y: 0 },
    ],
    poses: [
      [0, 'perched', false],
      [750, 'blink', false],
      [900, 'perched', false],
      [1500, 'bob', false],
      [1620, 'perched', false],
      [1780, 'bob', false],
      [1900, 'perched', false],
      [2060, 'bob', false],
      [2180, 'perched', false],
      [2340, 'bob', false],
      [2460, 'perched', false],
      [4200, 'peck-1', false],
      [4245, 'peck-2', false],
      [4290, 'peck', false],
      [4470, 'peck-2', false],
      [4530, 'peck-1', false],
      [4575, 'peck-2', false],
      [4620, 'peck', false],
      [4840, 'peck-2', false],
      [4900, 'peck-1', false],
      [4960, 'perched', false],
      [6000, 'blink', false],
      [6150, 'perched', false],
      [9300, 'happy', false],
      [10200, 'perched', false],
      [10800, 'turn', false],
      [10870, 'front', false],
      [10960, 'turn', false],
      [11030, 'perched', false],
      [12000, 'blink', false],
      [12150, 'perched', false],
      [12900, 'turn', false],
      [12970, 'front', false],
      [14050, 'turn', false],
      [14120, 'perched', false],
    ],
  }),
  // Turning round on the spot to face the other way, with a small hop as it passes through facing you.
  turn: timed({
    ms: 640,
    moves: [{ at: 0 }, { at: 40 }, { at: 174.5, y: -0.04 }, { at: 175, sx: -1 }, { at: 310, y: 0 }],
    poses: [
      [0, 'perched', false],
      [60, 'turn', false],
      [130, 'front', false],
      [220, 'turn', false],
      [290, 'perched', false],
    ],
  }),
};

/** How long a switch from one picture to the next takes, as a share of the play: its clock's finest step. */
const SWITCH = 0.00001;

/**
 * Every picture a play shows (named `pose` or `pose+letter`), with the moments its visibility changes, so an app can
 * stack them all and switch between them on the play's clock.
 */
export function letterPlayShows(play: LetterPlay): Array<{ pose: PigeonPose; letter: boolean; steps: Array<readonly [at: number, seen: 0 | 1]> }> {
  const key = (pose: PigeonPose, letter: boolean): string => `${pose}${letter ? '+letter' : ''}`;
  const shows = new Map<string, { pose: PigeonPose; letter: boolean; steps: Array<readonly [number, 0 | 1]> }>();
  for (const [, pose, letter] of play.poses) if (!shows.has(key(pose, letter))) shows.set(key(pose, letter), { pose, letter, steps: [] });
  play.poses.forEach(([at, pose, letter], i) => {
    for (const [k, show] of shows) {
      const seen: 0 | 1 = k === key(pose, letter) ? 1 : 0;
      const before = i === 0 ? null : show.steps[show.steps.length - 1]![1];
      if (before === null) show.steps.push([0, seen]);
      // The switch is nearly instant (a hundred-thousandth of the play), since a cross-fade would show two pictures at once.
      else if (before !== seen) show.steps.push([Math.max(0, at - SWITCH), before], [at, seen]);
    }
  });
  for (const show of shows.values()) show.steps.push([1, show.steps[show.steps.length - 1]![1]]);
  return [...shows.values()];
}

/** A sill shadow at one moment: offset (shares of the pigeon's square), rotation and stretch, and opacity. */
export interface LetterShadowKey {
  at: number;
  x: number;
  sx: number;
  sy: number;
  seen: number;
}

/** A shadow for a pigeon `lift` (shares of its square) above the sill: smaller and fainter the higher it is. */
const lifted = (lift: number): { size: number; seen: number } => ({ size: Math.max(0.3, 1 - Math.max(0, lift) * 3), seen: Math.max(0, 1 - Math.max(0, lift) * 6) });

/**
 * The shadows a play lays on the sill, on the play's clock. The pigeon's (`moves`) stays under it as it steps, turns
 * with it, slides ahead as it pecks, and shrinks and fades during a hop; its shape follows the pigeon's view, with the
 * letter's when it holds one (`shapes`, stepped as `letterPlayShows` gives them). A letter on the sill has its own
 * (`letter`), present before it lands and darker the lower it comes.
 */
export function letterPlayShadow(play: LetterPlay): {
  moves: LetterShadowKey[];
  shapes: Array<{ pose: PigeonPose; letter: boolean; steps: Array<readonly [at: number, seen: 0 | 1]> }>;
  letter: Array<{ at: number; size: number; seen: number }>;
} {
  const moves = play.moves.map((m) => {
    const { size, seen } = lifted(-m.y);
    return { at: m.at, x: m.x + Math.sin((m.tilt * Math.PI) / 180) * 0.05, sx: m.sx * size, sy: size, seen };
  });
  // The shadow takes the pigeon's shape as seen (side on, turned or facing you), with the letter's when it holds one.
  const shapes = letterPlayShows({ ...play, poses: play.poses.map(([at, pose, letter]) => [at, shadowShape(pose), pigeonHolds(pose, letter)] as const) });
  // A letter falls further than a pigeon hops, so its shadow fades more gently with height.
  const letter = play.letter.map((k) => ({ at: k.at, size: Math.max(0.4, 1 + k.y * 0.9), seen: k.seen * Math.max(0, 1 + k.y * 1.3) }));
  return { moves, shapes, letter };
}

/** The shadow shape for `pose`: side on, bowed to peck, three-quarters, or facing you (waving or not, the same round). */
function shadowShape(pose: PigeonPose): PigeonPose {
  return pose === 'turn' || pose === 'peck' || pose === 'peck-2' ? pose : pose === 'front' || pose === 'hello' ? 'front' : 'perched';
}

/**
 * The shadow of a pigeon flying off the sill, on `LETTER_FLIGHT`'s clock (backwards for an incoming bird): it stays on
 * the sill under the bird and is gone as the bird rises. Measured on the pigeon's own square, like the play shadows.
 */
export function letterFlightShadow(): LetterShadowKey[] {
  return LETTER_FLIGHT.keys.map((k) => {
    const lift = -k.y / LETTER_SILL.birdShare;
    const { size, seen } = lifted(lift * 0.7);
    return { at: k.at, x: k.x / LETTER_SILL.birdShare, sx: size, sy: size, seen };
  });
}

/** A puffy cloud of a few round lobes on a flat foot; each puff is a separate circle, so overlaps leave no seam. */
function cloud(dr: Drawing, x: number, y: number, s: number, hex: string): void {
  const lobes: ReadonlyArray<readonly [number, number, number]> = [
    [-9, 1, 5.2],
    [-3, -3, 6.6],
    [4, -4.6, 7.4],
    [10.4, 0, 5.4],
  ];
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

/** The sky with its light toward the horizon, and the sun or moon with the stars. */
function skyPart(dr: Drawing, h: Hour): void {
  const air = dr.id('a');
  dr.def(linearAt(air, [[0, h.sky[0]], [1, h.sky[1]]], 0, 6, 0, 66));
  dr.add(`<rect x="0" y="0" width="120" height="120" fill="url(#${air})"/>`);
  const [ox, oy, or, colour, glow] = h.orb;
  const halo = dr.id('h');
  dr.def(radialAt(halo, [[0, glow, 0.7], [0.45, glow, 0.25], [1, glow, 0]], ox, oy, or * 4));
  dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or * 4)}" fill="url(#${halo})"/>`);
  if (!h.night) dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or)}" fill="${colour}"/>`);
  if (h.night) {
    // A young moon's horn: an outer arc and a shallower arc back, the edge of its shadow.
    dr.add(`<path d="M${n(ox)} ${n(oy - or)}A${n(or)} ${n(or)} 0 1 0 ${n(ox)} ${n(oy + or)}A${n(or * 1.35)} ${n(or * 1.35)} 0 0 1 ${n(ox)} ${n(oy - or)}Z" fill="${colour}" transform="rotate(-24 ${n(ox)} ${n(oy)})"/>`);
    const rand = seeded('letter-stars');
    let stars = '';
    for (let i = 0; i < 26; i++) stars += `<circle cx="${n(14 + rand() * 92)}" cy="${n(12 + rand() * 40)}" r="${n(0.3 + rand() * 0.4)}" fill="#ffffff" opacity="${i % 3 === 0 ? '0.95' : '0.6'}"/>`;
    dr.add(stars);
  }
}

/** The clouds, and two far-off birds between them. */
function cloudsPart(dr: Drawing, h: Hour): void {
  cloud(dr, 40, 30, 0.6, h.cloud);
  cloud(dr, 76, 40, 0.86, h.cloud);
  cloud(dr, 104, 26, 0.5, h.cloud);
  const far = h.night ? mix(h.cloud, '#ffffff', 0.3) : mix(h.mountains[1], '#2a3050', 0.5);
  dr.add(`<path d="M55 24.4Q56.4 23 57.6 24.2Q58.8 23 60.2 24.4M61.6 21.2Q62.7 20.2 63.6 21.1Q64.5 20.2 65.6 21.2" fill="none" stroke="${far}" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round"/>`);
}

/** The far country: distant blue mountains with snowy tops, and green hills before them with round trees. */
function farPart(dr: Drawing, h: Hour): void {
  dr.add(`<path d="M-6 62L4 52L14 55L26 44L36 51L44 47L56 38L68 49L78 45L90 52L100 42L112 50L126 46V64H-6Z" fill="${h.mountains[0]}"/>`);
  // Snow on the two highest.
  dr.add(`<path d="M51.2 42.4L56 38L60.6 42.6L58.2 41.6L56.2 43.2L54 41.4ZM96.4 45.2L100 42L103.6 44.6L101.6 44.2L100 45.6L98.2 44.4Z" fill="${h.snow}"/>`);
  dr.add(`<path d="M-6 64L8 56L20 59L30 53L44 58L58 52L70 57L84 51L98 57L112 53L126 57V68H-6Z" fill="${h.mountains[1]}"/>`);
  dr.add(`<path d="M-6 66C10 60 26 59 42 62C58 65 72 60 88 58C102 56.6 114 59 126 62V80H-6Z" fill="${h.hills[0]}"/>`);
  dr.add(`<path d="M-6 72C12 67 30 66 50 68.6C70 71 90 66 106 65C114 64.6 120 65.6 126 67V84H-6Z" fill="${h.hills[1]}"/>`);
  // Round trees along the hills, small with distance.
  const trees: ReadonlyArray<readonly [number, number, number]> = [[18, 61.4, 1.9], [23, 61.8, 1.5], [62, 63.8, 1.7], [84, 59.6, 2.1], [89, 59.4, 1.6], [104, 66.4, 2.2]];
  for (const [x, y, r] of trees) {
    dr.add(`<path d="M${n(x - 0.3)} ${n(y)}h0.6v${n(r * 1.2)}h-0.6Z" fill="${h.trees[1]}"/>`);
    dr.add(`<circle cx="${n(x)}" cy="${n(y - r * 0.2)}" r="${n(r)}" fill="${h.trees[0]}"/>`);
  }
}

/** The meadow just outside: grass and flowers. */
function nearPart(dr: Drawing, h: Hour): void {
  dr.add(`<path d="M-6 76C16 72 36 71.4 56 73.4C76 75.4 96 71 126 70.6V126H-6Z" fill="${h.meadow[0]}"/>`);
  dr.add(`<path d="M-6 80C20 77 44 77.6 66 79.4C88 81 106 78 126 77V126H-6Z" fill="${h.meadow[1]}"/>`);
  const tufts: ReadonlyArray<readonly [number, number]> = [[28, 76], [36, 81], [47, 77], [58, 80.6], [70, 76.6], [82, 80], [90, 77], [33, 87], [64, 86], [86, 88]];
  const grass = tufts.map(([gx, gy]) => `M${gx} ${gy}L${n(gx - 0.5)} ${n(gy - 2.2)}M${n(gx + 1.6)} ${gy}L${n(gx + 1.3)} ${n(gy - 1.8)}`).join('');
  dr.add(`<path d="${grass}" fill="none" stroke="${h.grass}" stroke-width="1" stroke-linecap="round"/>`);
  const [yellow, pink, blue] = h.flowers;
  flower(dr, 40, 79, 1.5, yellow, h.heart);
  flower(dr, 76, 82, 1.9, yellow, h.heart);
  flower(dr, 62, 77.4, 1.2, pink, tint(pink, 0.3));
  flower(dr, 30, 83, 1.1, blue, tint(blue, 0.35));
  flower(dr, 88, 78.4, 1.1, pink, tint(pink, 0.3));
  flower(dr, 52, 84.6, 1.3, blue, tint(blue, 0.35));
}

/** A closed outline rounded through `pts`: it runs through the midpoints between them, each point bending it. */
function smoothLoop(pts: readonly Pt[]): string {
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[pts.length - 1]!, pts[0]!);
  let d = `M${n(start[0])} ${n(start[1])}`;
  pts.forEach((p, i) => {
    const m = mid(p, pts[(i + 1) % pts.length]!);
    d += `Q${n(p[0])} ${n(p[1])} ${n(m[0])} ${n(m[1])}`;
  });
  return `${d}Z`;
}

/**
 * Where the wall's face turns into the reveal: an oblong smoothed by hand, rounded where the plaster wraps round its
 * corners and a little out of true along its sides. Seeded, so it is the same at every hour and on every device.
 */
const REVEAL_EDGE = (() => {
  const rand = seeded('letter-window-reveal');
  const wobble = (s: number): number => (rand() - 0.5) * 2 * s;
  const { x0, y0, x1, y1 } = REVEAL;
  const corners: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const pts: Pt[] = [];
  corners.forEach((c, i) => {
    const next = corners[(i + 1) % 4]!;
    pts.push([c[0] + Math.sign(60 - c[0]) * 0.5 + wobble(0.3), c[1] + Math.sign(52 - c[1]) * 0.5 + wobble(0.3)]);
    // Points along the side, the first and last close to the corners so the plaster's turn stays tight.
    const len = Math.hypot(next[0] - c[0], next[1] - c[1]);
    const steps = Math.round((len - 9) / 11);
    const along = [4.5, ...Array.from({ length: steps - 1 }, (_, k) => 4.5 + ((len - 9) * (k + 1)) / steps), len - 4.5];
    const level = c[1] === next[1];
    for (const dist of along) {
      const t = dist / len;
      const w = wobble(0.45);
      pts.push([c[0] + (next[0] - c[0]) * t + (level ? 0 : w), c[1] + (next[1] - c[1]) * t + (level ? w : 0)]);
    }
  });
  return smoothLoop(pts);
})();

/** A clay pot on the sill at `x`, `y`: its shadow, body and rim. Its plant is drawn separately (`plant`). */
function pot(dr: Drawing, shadow: string, x: number, y: number): void {
  const clay: Tones = { light: '#eea17a', base: '#d9825b', shade: '#b8663f' };
  dr.add(`<ellipse cx="${n(x)}" cy="${n(y + 0.4)}" rx="7.4" ry="1.4" fill="${shadow}" opacity="0.24"/>`);
  form(dr, `M${n(x - 5.6)} ${n(y - 7)}L${n(x + 5.6)} ${n(y - 7)}L${n(x + 4.2)} ${n(y)}L${n(x - 4.2)} ${n(y)}Z`, clay, 0.8, 0.6);
  dr.add(`<path d="${rr(x - 6.6, y - 8.6, 13.2, 2.6, 1)}" fill="${clay.light}"/>`);
}

/** The pot's plant at `x`, `y`: a stem, four leaves and two flowers rising from under the rim. */
function plant(dr: Drawing, h: Hour, x: number, y: number): void {
  const stem = h.night ? '#2f5a3f' : '#4f8f3e';
  const leafy = h.night ? '#3c6b4a' : '#6fb04f';
  // The stem rises from the rim's top, the plant's sway pivot (`LETTER_PLANT_SWAY`).
  dr.add(`<path d="M${n(x)} ${n(y - 8.6)}Q${n(x - 0.6)} ${n(y - 13)} ${n(x + 0.4)} ${n(y - 17)}" fill="none" stroke="${stem}" stroke-width="0.8" stroke-linecap="round"/>`);
  const leaves: ReadonlyArray<readonly [Pt, Pt, number]> = [
    [[x, y - 9], [-0.86, -0.5], 5.2],
    [[x, y - 9.4], [0.86, -0.5], 5],
    [[x - 0.2, y - 12.6], [-0.8, -0.6], 4.2],
    [[x + 0.2, y - 13], [0.8, -0.6], 4],
  ];
  for (const [base, u, len] of leaves) dr.add(`<path d="${leaf(base, u, len, len * 0.42)}" fill="${leafy}"/>`);
  flower(dr, x + 0.4, y - 17.6, 1.5, h.flowers[1], h.flowers[0]);
  flower(dr, x - 3.6, y - 14.6, 1, h.flowers[0], h.heart);
}

/** The hand-drawn marks on the window's square: the mud's sweeps, patches and cracks, and the grain of the wood. */
const HAND = {
  sweeps:
    'M13 109.4C22 105.8 38 104.6 52 106.2C38 106.6 24 107.6 13 109.4ZM44 114.6C54 111.2 70 110.6 82 112C70 112.4 56 113.2 44 114.6Z' +
    'M2.6 44C1.4 36 2.6 26 6.4 18.6C4.6 27 4 35 2.6 44ZM117.6 92C119 82 118.6 71 115.4 62.4C116.6 72 117.4 82 117.6 92Z',
  patches:
    'M86.6 107.8L97.4 106.2Q103.6 105.6 105.6 108.4L106.4 112.6Q106.4 115.4 102.6 115.6L91 116.2Q87.4 116 86.8 113Z' +
    'M1.4 67.6L6.2 66.4Q8.2 66.4 8.2 68.4L8 76.4Q7.8 78.6 5.6 78.6L2.2 78.8Q0.6 78.6 0.8 76.6Z',
  patchEdges: 'M106.4 112.6Q106.4 115.4 102.6 115.6L91 116.2Q87.4 116 86.8 113M8 76.4Q7.8 78.6 5.6 78.6L2.2 78.8',
  cracks:
    'M12.8 101.6L11.6 103.8L12.2 105.4L10 108.6L10.5 110.4L8.2 114M10.9 107L13.6 108.4L14.2 110.6' +
    'M112.6 8.6L113.8 10.8L113.4 12.4L115.6 14.6L115.2 16.4L117.8 19.6M113.4 12.4L111.6 14.2M86.4 120L87.8 117.2L87.2 115.8',
  lintelGrain: 'M10 4.4C26 3.9 44 5 62 4.5S96 4.1 110 4.7M18 6.1C32 6.6 46 5.9 58 6.3M70 6.4C80 6 92 6.6 104 6.2',
  frameGrain: 'M30 19.4C48 18.9 66 19.8 88 19.2M23.2 26C23 42 23.6 58 23.2 80M96.8 28C97 46 96.5 62 96.9 82M34 86.8C50 87.1 70 86.5 86 86.9',
  sillGrain:
    'M24 89.7C40 89.3 56 90.1 74 89.6S92 89.4 97 89.9M15.6 92.4C30 91.9 44 92.8 58 92.3M66 92.6C78 92.2 90 92.9 104.4 92.4' +
    'M12 94.9C24 94.5 36 95.3 46 94.9M74 95C86 94.6 98 95.2 108 94.8',
  sillFrontGrain: 'M16 98.7C34 98.3 52 99.1 70 98.6M78 99.5C88 99.1 98 99.7 106 99.3',
} as const;

/**
 * The marks of a hand-plastered mud wall where it shows beside the shutters and under the sill: the sweeps of the hand
 * that smoothed it, two patches of newer plaster, chopped straw and grit, and hairline cracks running from the ends of
 * the lintel and the sill.
 */
function mudMarks(dr: Drawing, h: Hour): void {
  const { mud, joint } = h;
  fill(dr, HAND.sweeps, mud.light);
  fill(dr, HAND.patches, mix(mud.base, mud.light, 0.4));
  // The newer plaster stands a hair proud along its foot and one side.
  stroke(dr, HAND.patchEdges, mud.shade, 0.4);
  // Straw and grit on a loose grid over the open wall, each place jittered and some left bare, so they lie scattered but even.
  const rand = seeded('letter-window-straw');
  const places: Pt[] = [];
  for (let x = 4; x < 118; x += 7.5) for (const y of [105, 110.5, 116]) places.push([x, y]);
  for (let y = 13; y < 100; y += 7.5) places.push([4.2, y], [115.8, y]);
  let straw = '';
  let grit = '';
  for (const [px, py] of places) {
    const [keep, x, y] = [rand(), px + (rand() - 0.5) * 5, py + (rand() - 0.5) * 4];
    if (keep < 0.35) continue;
    if (keep < 0.6) {
      grit += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.26 + rand() * 0.18)}"/>`;
      continue;
    }
    // A blade of straw, slightly bent.
    const [a, r, bend] = [(rand() - 0.5) * 2.4, 0.45 + rand() * 0.75, (rand() - 0.5) * 0.6];
    const [dx, dy] = [Math.cos(a) * r, Math.sin(a) * r];
    straw += `M${n(x - dx)} ${n(y - dy)}Q${n(x - dy * bend)} ${n(y + dx * bend)} ${n(x + dx)} ${n(y + dy)}`;
  }
  stroke(dr, straw, mix(mud.light, '#f8dc9c', 0.45), 0.42);
  dr.add(`<g fill="${mud.shade}">${grit}</g>`);
  stroke(dr, HAND.cracks, mix(mud.shade, joint, 0.45), 0.36);
}

/** The lintel: an old squared beam set into the mud over the window, worn along its top, a row of notches cut along its foot. */
function lintel(dr: Drawing, h: Hour): void {
  const { wood, joint } = h;
  const { x0, x1, y0, y1 } = LINTEL;
  // The shadow it throws on the plaster below, and the dark gap where the mud was packed round the wood.
  fill(dr, `M${x0 + 1} ${y1}H${x1 - 1}L${x1 - 2.4} ${n(y1 + 1.6)}H${x0 + 2.4}Z`, joint, ' opacity="0.22"');
  fill(dr, `M${n(x0 - 0.6)} ${n(y0 - 0.5)}H${n(x1 + 0.6)}V${n(y1 + 0.5)}H${n(x0 - 0.6)}Z`, joint, ' opacity="0.55"');
  fill(dr, `M${x0} ${n(y0 + 0.2)}L${x1} ${y0}L${n(x1 - 0.2)} ${y1}L${n(x0 + 0.3)} ${y1}Z`, wood.base);
  fill(dr, `M${x0} ${n(y0 + 0.2)}L${x1} ${y0}V${n(y0 + 1.1)}L${x0} ${n(y0 + 1.3)}Z`, wood.light);
  stroke(dr, HAND.lintelGrain, wood.shade, 0.35);
  dr.add(`<ellipse cx="86" cy="5.1" rx="1.3" ry="0.7" fill="${wood.shade}"/>`);
  let notches = '';
  for (let i = 0; i < 21; i++) {
    const x = 15.4 + i * 4.3;
    notches += `M${n(x)} ${y1}L${n(x + 1.6)} ${n(y1 - 1.9)}L${n(x + 3.2)} ${y1}Z`;
  }
  fill(dr, notches, wood.shade);
}

/** The frame: its head and foot between two stiles, the dark joints and the gap round it, its inside edge in shade. */
function frame(dr: Drawing, h: Hour): void {
  const { wood, joint } = h;
  const [f, o] = [FRAME, OPENING];
  const inside = `M${f.x0} ${f.y0}V${f.y1}H${f.x1}V${f.y0}Z`;
  fill(dr, `M${n(f.x0 - 0.6)} ${n(f.y0 - 0.6)}H${n(f.x1 + 0.6)}V${f.y1}H${n(f.x0 - 0.6)}Z${inside}`, joint, ' fill-rule="evenodd" opacity="0.6"');
  fill(dr, `M${f.x0} ${f.y0}H${f.x1}V${f.y1}H${f.x0}ZM${o.x0} ${o.y0}V${o.y1}H${o.x1}V${o.y0}Z`, wood.base, ' fill-rule="evenodd"');
  stroke(dr, HAND.frameGrain, wood.shade, 0.32);
  stroke(dr, `M${o.x0} ${f.y0}V${o.y0}M${o.x1} ${f.y0}V${o.y0}M${o.x0} ${o.y1}V${f.y1}M${o.x1} ${o.y1}V${f.y1}`, joint, 0.45);
  // Its own thickness inside the opening: the head's underside and one stile's side in shade, the foot's top worn pale.
  fill(dr, `M${o.x0} ${o.y0}H${o.x1}L${n(o.x1 - 1.4)} ${n(o.y0 + 1.6)}H${n(o.x0 + 1.4)}V${o.y1}H${o.x0}Z`, wood.shade);
  fill(dr, `M${n(o.x0 + 1.4)} ${n(o.y1 - 0.8)}H${o.x1}V${o.y1}H${n(o.x0 + 1.4)}Z`, wood.light);
}

/** The sill: a thick old board, its top pale where the light falls, grained and knotted, its front in shade over its shadow. */
function sill(dr: Drawing, h: Hour): void {
  const { board: wood, joint } = h;
  const { x0, x1, y, depth } = SILL_FRONT;
  const [foot, bend, low] = [n(y + depth), n(y + depth + 2), n(y + depth + 2.8)];
  const under = `M${x0 + 1} ${foot}H${x1 - 1}C${x1 - 2} ${bend} ${x1 - 5} ${low} ${x1 - 9} ${low}H${x0 + 9}C${x0 + 5} ${low} ${x0 + 2} ${bend} ${x0 + 1} ${foot}Z`;
  fill(dr, under, joint, ' opacity="0.26"');
  fill(dr, `M${FRAME.x0} ${FRAME.y1}H${FRAME.x1}L${x1} ${y}H${x0}Z`, wood.light);
  stroke(dr, HAND.sillGrain, wood.base, 0.36);
  dr.add(`<ellipse cx="18.8" cy="93.7" rx="1.3" ry="0.55" fill="${wood.base}"/><ellipse cx="103" cy="90.6" rx="1" ry="0.45" fill="${wood.base}"/>`);
  stroke(dr, `M${FRAME.x0} ${FRAME.y1}H${FRAME.x1}`, joint, 0.6);
  // Its front: the worn, rounded nosing, then the face in shade.
  fill(dr, rr(x0, y, x1 - x0, depth, 1.4), wood.shade);
  fill(dr, `M${x0 + 0.8} ${y}H${x1 - 0.8}Q${x1} ${y} ${x1} ${y + 0.8}V${n(y + 1.3)}H${x0}V${y + 0.8}Q${x0} ${y} ${x0 + 0.8} ${y}Z`, wood.base);
  stroke(dr, HAND.sillFrontGrain, joint, 0.3, ' opacity="0.5"');
}

/** The room round the window: the mud wall and its deep reveal, the lintel, the wooden frame, the sill and its pot. */
function roomPart(dr: Drawing, h: Hour): void {
  const { mud } = h;
  const { x0, y0, x1, y1 } = REVEAL;
  const f = FRAME;
  // The reveal, reaching a little under the wall's uneven edge: the jamb the light reaches, the one it does not, and
  // the soffit under the lintel in shade.
  const [a0, b0, a1, b1] = [x0 - 1.5, y0 - 1.5, x1 + 1.5, y1 + 1.5];
  fill(dr, `M${a0} ${b0}L${f.x0} ${f.y0}V${f.y1}L${a0} ${b1}Z`, mud.light);
  fill(dr, `M${a1} ${b0}L${f.x1} ${f.y0}V${f.y1}L${a1} ${b1}Z`, mud.base);
  fill(dr, `M${a0} ${b0}H${a1}L${f.x1} ${f.y0}H${f.x0}Z`, mud.shade);
  // The frame keeps the sky's light off the soffit next to it.
  const cast = 2.4 / (f.y0 - b0);
  fill(dr, `M${n(f.x0 - (f.x0 - a0) * cast)} ${n(f.y0 - 2.4)}H${n(f.x1 + (a1 - f.x1) * cast)}L${f.x1} ${f.y0}H${f.x0}Z`, h.joint, ' opacity="0.3"');
  // The wall's face with the reveal cut out of it, its marks, and the plaster's rounded turn catching the light.
  fill(dr, `M0 0H120V120H0Z${REVEAL_EDGE}`, mud.base, ' fill-rule="evenodd"');
  mudMarks(dr, h);
  dr.add(`<path d="${REVEAL_EDGE}" fill="none" stroke="${mud.light}" stroke-width="1.1"/>`);
  lintel(dr, h);
  frame(dr, h);
  sill(dr, h);
  // A few seeds on the sill either side of the pigeon's place, for it to peck at.
  const seed = mix(h.board.light, '#fff6e0', 0.6);
  for (const [x, y, turn] of [[64.6, 94.6, 20], [67.4, 95.4, -30], [69.2, 94.2, 60], [35.4, 94.8, -20], [32.8, 95.6, 35], [31, 94.4, -60]] as const) {
    dr.add(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="0.95" ry="0.6" fill="${seed}" transform="rotate(${turn} ${n(x)} ${n(y)})"/>`);
  }
  pot(dr, h.joint, 90, 94.6);
}

/**
 * One wooden shutter folded open into the room on its hinge at the frame, the free edge taller than the hinge since it
 * is nearer: three planks held by two nailed battens, lozenges carved between them, the free edge's thickness, and the
 * shadow it throws on the wall, which it carries as it stirs. The right one is turned from the light and darker, and a
 * low sun lays a band of light across the one that faces it.
 */
function shutterPart(dr: Drawing, h: Hour, side: 'left' | 'right'): void {
  const { joint, board } = h;
  const wood: Tones = side === 'left' ? board : { light: mix(board.light, board.base, 0.4), base: mix(board.base, board.shade, 0.3), shade: board.shade };
  const hinge = side === 'left' ? 24 : 96;
  const free = side === 'left' ? 9.6 : 110.4;
  const out = side === 'left' ? -1 : 1;
  const [ht, hb, ft, fb] = [FRAME.y0 + 1, FRAME.y1 - 0.4, 12, 94.6];
  // A point on the shutter: `u` across from hinge to free edge, `v` down from its top.
  const at = (u: number, v: number): Pt => {
    const top = ht + (ft - ht) * u;
    const bottom = hb + (fb - hb) * u;
    return [hinge + (free - hinge) * u, top + (bottom - top) * v];
  };
  const poly = (...p: Pt[]): string => `M${p.map((q) => `${n(q[0])} ${n(q[1])}`).join('L')}Z`;
  const quad = (u0: number, v0: number, u1: number, v1: number): string => poly(at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1));
  const seg = (u0: number, v0: number, u1: number, v1: number): string => {
    const [p, q] = [at(u0, v0), at(u1, v1)];
    return `M${n(p[0])} ${n(p[1])}L${n(q[0])} ${n(q[1])}`;
  };
  fill(dr, poly([free, ft + 1.4], [free + out * 2.6, ft + 3.2], [free + out * 2.6, fb - 1.6], [free, fb]), joint, ` opacity="${side === 'left' ? '0.26' : '0.18'}"`);
  fill(dr, poly([free, ft], [free + out * 1.2, ft + 0.6], [free + out * 1.2, fb - 0.6], [free, fb]), wood.shade);
  fill(dr, quad(0, 0, 1, 1), wood.base);
  // The grain of each plank and the grooves between them.
  stroke(dr, seg(0.17, 0.22, 0.16, 0.46) + seg(0.5, 0.56, 0.5, 0.78) + seg(0.84, 0.24, 0.85, 0.4) + seg(0.82, 0.6, 0.83, 0.76), wood.shade, 0.32);
  stroke(dr, seg(1 / 3, 0, 1 / 3, 1) + seg(2 / 3, 0, 2 / 3, 1), joint, 0.4);
  // The battens standing proud and catching the light, the shade under them, and their nails.
  let nails = '';
  for (const [v0, v1] of [[0.09, 0.16], [0.84, 0.91]] as const) {
    fill(dr, quad(0, v1, 1, v1 + 0.014), wood.shade);
    fill(dr, quad(0, v0, 1, v1), wood.light);
    for (const u of [1 / 6, 0.5, 5 / 6]) {
      const [x, y] = at(u, (v0 + v1) / 2);
      nails += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.36 + 0.14 * u)}"/>`;
    }
  }
  dr.add(`<g fill="${joint}">${nails}</g>`);
  // Lozenges carved down the middle plank, the middle one with a smaller one cut inside it.
  const lozenge = (v: number, du: number, dv: number): string => poly(at(0.5, v - dv), at(0.5 + du, v), at(0.5, v + dv), at(0.5 - du, v));
  fill(dr, lozenge(0.5, 0.13, 0.075) + lozenge(0.355, 0.08, 0.042) + lozenge(0.645, 0.08, 0.042), wood.shade);
  fill(dr, lozenge(0.5, 0.06, 0.035), wood.light);
  // A low sun comes in nearly level from its side of the sky and lies across the shutter facing it.
  if (h.sun && h.orb[0] < 60 === (side === 'right')) fill(dr, poly(at(0, 0.3), at(1, 0.4), at(1, 0.74), at(0, 0.62)), h.light[0], ` opacity="${n2(h.sun)}"`);
}

/** The hour's light on the sill, cut by the frame, and its glow in the room; a lamp's warmth low on the left at evening. */
function lightPart(dr: Drawing, h: Hour): void {
  const [colour, strength] = h.light;
  // From high on the right, it falls on the sill a little left of the opening.
  dr.add(`<path d="M31 ${FRAME.y1}H91L84 ${SILL_FRONT.y}H23Z" fill="${colour}" opacity="${n2(strength * 0.6)}"/>`);
  if (!h.night) {
    const air = dr.id('r');
    dr.def(radialAt(air, [[0, colour, strength * 0.3], [1, colour, 0]], 60, 52, 46));
    dr.add(`<rect x="10" y="8" width="100" height="92" fill="url(#${air})"/>`);
  }
  if (h.lamp) {
    // Lamplight lies on the room, not on the country outside.
    const [warm, glow] = h.lamp;
    const lamp = dr.id('l');
    const o = OPENING;
    dr.def(radialAt(lamp, [[0, warm, glow], [0.45, warm, glow * 0.45], [1, warm, 0]], 4, 124, 96));
    dr.add(`<path d="M0 0H120V120H0ZM${o.x0} ${o.y0}V${o.y1}H${o.x1}V${o.y0}Z" fill="url(#${lamp})" fill-rule="evenodd"/>`);
  }
}

export interface LetterWindowOptions {
  /** The hour's sky through the window; day by default. */
  sky?: TreeSky;
  /** One layer, or the whole window still. */
  part?: LetterWindowPart | 'whole';
  size?: number;
  /** The accessible label; the apps usually describe what is happening beside it and hide the picture from screen readers. */
  title?: string;
  idPrefix?: string;
}

/** Your window at the hour, or one of its layers (`part`), each on the same square. */
export function letterWindowSvg(opts: LetterWindowOptions = {}): string {
  const size = checkSize(opts.size, 120);
  const skyName = opts.sky ?? 'day';
  const h = HOURS[skyName];
  if (!h) throw new RangeError(`art: no sky called ${String(skyName)}`);
  const part = opts.part ?? 'whole';
  if (part !== 'whole' && !LETTER_WINDOW_PARTS.includes(part)) throw new RangeError(`art: no window part called ${String(part)}`);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-window', skyName, part));
  const draw: Record<LetterWindowPart, () => void> = {
    sky: () => skyPart(dr, h),
    clouds: () => cloudsPart(dr, h),
    far: () => farPart(dr, h),
    near: () => nearPart(dr, h),
    room: () => roomPart(dr, h),
    left: () => shutterPart(dr, h, 'left'),
    right: () => shutterPart(dr, h, 'right'),
    plant: () => plant(dr, h, 90, 94.6),
    light: () => lightPart(dr, h),
  };
  if (part === 'whole') for (const p of LETTER_WINDOW_PARTS) draw[p]();
  else draw[part]();
  return dr.svg(size, opts.title ?? 'A window');
}

export interface LetterBirdOptions {
  /** The pigeon's number (`letterBirdOf`), which sets its colour. */
  bird: number;
  pose?: PigeonPose;
  /** A letter in its beak. */
  letter?: boolean;
  /** Facing left rather than right. */
  facingLeft?: boolean;
  /** Framed as a portrait, facing you unless a pose is given, head and body filling the square, instead of standing at the sill. */
  portrait?: boolean;
  /** With its shadow under it (the default); the window lays the shadow on the sill itself (`letterShadowSvg`). */
  shadow?: boolean;
  size?: number;
  title?: string;
  idPrefix?: string;
}

/**
 * How a pigeon is framed for its portrait: its feet's place on the square and its scale. Facing you, head and body fill
 * the round with the feet just showing; a side-on pose shows the whole bird, its body centred.
 */
const PORTRAIT = { x: 60, y: 112, scale: 2.8 } as const;
const PORTRAIT_SIDE = { x: 60, y: 104, scale: 2.4 } as const;

/** A member's pigeon on its own transparent square: standing, blinking, waving, asleep, or flying wings up or down. */
export function letterBirdSvg(opts: LetterBirdOptions): string {
  const size = checkSize(opts.size, 120);
  // A pigeon kind by name, or the grey's markings in a colour.
  const kind = LETTER_BIRDS[opts.bird];
  if (!kind) throw new RangeError(`art: no bird ${String(opts.bird)}`);
  const pose = opts.pose ?? (opts.portrait ? 'front' : 'perched');
  const flip = opts.facingLeft ? -1 : 1;
  const shadow = opts.shadow !== false;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-bird', opts.bird, pose, opts.letter ? 'letter' : '', flip, opts.portrait ? 'portrait' : '', shadow ? '' : 'unshaded'));
  const { x, y, scale } = !opts.portrait ? LETTER_BIRD_FEET : pose === 'front' || pose === 'hello' ? PORTRAIT : PORTRAIT_SIDE;
  // A left-facing pigeon is mirrored about its feet, so its square fits either way round.
  dr.add(`<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale * flip)} ${n(scale)})">`);
  pigeon(dr, kind, pose, opts.letter === true, shadow);
  dr.add('</g>');
  return dr.svg(size, opts.title ?? 'A pigeon');
}

export interface LetterShadowOptions {
  /** What the pigeon is doing; asleep, it casts a rounder shadow. */
  pose?: PigeonPose;
  /** Include the shadow of a letter in its beak. */
  letter?: boolean;
  facingLeft?: boolean;
  size?: number;
  title?: string;
  idPrefix?: string;
}

/**
 * A sill pigeon's shadow alone on the pigeon's square (`letterBirdSvg`), lying where its feet are, so an app can lay it
 * under a pigeon drawn without one and leave it on the sill while the pigeon hops or takes off.
 */
export function letterShadowSvg(opts: LetterShadowOptions = {}): string {
  const size = checkSize(opts.size, 120);
  const pose = opts.pose ?? 'perched';
  const flip = opts.facingLeft ? -1 : 1;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-shadow', pose, opts.letter ? 'letter' : '', flip));
  const { x, y, scale } = LETTER_BIRD_FEET;
  dr.add(`<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale * flip)} ${n(scale)})">`);
  pigeonShadow(dr, pose, opts.letter === true);
  dr.add('</g>');
  return dr.svg(size, opts.title ?? 'A shadow');
}

export interface LetterEnvelopeOptions {
  /** The shadow a flat letter casts, alone on the letter's square, instead of the letter. */
  shadow?: boolean;
  size?: number;
  title?: string;
  idPrefix?: string;
}

const PAPER: Tones = { light: '#fffaf1', base: '#f6ead6', shade: '#cdb898' };
const SEAL = '#d8493b';

/** A letter in its envelope, sealed with red wax, for a letter written or arriving. */
export function letterEnvelopeSvg(opts: LetterEnvelopeOptions = {}): string {
  const size = checkSize(opts.size, 120);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-envelope', opts.shadow ? 'shadow' : ''));
  if (opts.shadow) {
    // Lying flat on the sill with the window's light behind it: a close shade round the paper, deeper toward the room.
    const soft = dr.id('shadow');
    dr.def(radialBox(soft, [[0, '#1d1838', 1], [0.74, '#1d1838', 0.8], [1, '#1d1838', 0]]));
    dr.add(`<ellipse cx="61" cy="66" rx="56" ry="38" fill="url(#${soft})" opacity="0.3"/>`);
    return dr.svg(size, opts.title ?? 'A shadow');
  }
  form(dr, rr(14, 30, 92, 62, 8), PAPER, 4, 2);
  // The flaps: the bottom two meeting under the top one.
  dr.add(`<path d="M16 88L52 60M104 88L68 60" fill="none" stroke="${PAPER.shade}" stroke-width="1.6" stroke-linecap="round"/>`);
  form(dr, 'M16 34C16 31.8 17.6 30.6 19.6 31.6L60 63L100.4 31.6C102.4 30.6 104 31.8 104 34L66 66C62.6 68.8 57.4 68.8 54 66Z', PAPER, 1.6, 1);
  form(dr, ring(60, 64, 9), { light: tint(SEAL, 0.32), base: SEAL, shade: tint(SEAL, -0.32) }, 2, 1.4);
  dr.add(`<circle cx="60" cy="64" r="4.6" fill="none" stroke="${tint(SEAL, -0.2)}" stroke-width="1.2"/>`);
  return dr.svg(size, opts.title ?? 'A letter');
}
