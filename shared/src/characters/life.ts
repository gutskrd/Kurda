import type { Viseme } from '../lipsync/visemes.js';
import type { CharacterArt, CharacterPoint, EyeState } from './types.js';

/**
 * How a character is alive between the words: the same on the website and
 * on the phone, which each play it with their own animation.
 *
 * Alive, never busy. A character breathes, its head drifts a degree either
 * way, it blinks every few seconds and now and then glances about; the deer
 * twitches an ear or sniffs. Nothing more until somebody does something: a
 * tap gets a greeting (both ears up, a blink, a sniff and a little hop), a
 * right answer a cheer, a miss a curious tilt of the head — never a sad face,
 * because the person who missed is often a child learning.
 *
 * An act is a short movement made of tracks, each a list of keys: at `t` (a
 * share of the act's length) the track reaches `v`, easing in and out from
 * the key before. A platform plays a track as it likes (a run of timings on
 * the phone, a frame loop on the web); `sampleKeys` says where it is at any
 * moment, for the web and for tests.
 */

/** One track: at each `t` from 0 to 1 the value is `v`. The first key is at 0 and the last at 1. */
export type Keys = readonly (readonly [t: number, v: number])[];

/** A span of an act, from `from` to `to` (shares of its length), when the eyes or the mouth are held a certain way. */
export type Hold<T> = readonly (readonly [from: number, to: number, value: T])[];

export interface Act {
  ms: number;
  /** each ear's lift in degrees: up is positive, laid back negative (the deer's ears; ignored without them) */
  earLeft?: Keys;
  earRight?: Keys;
  /** the nose's size, 1 as drawn */
  sniff?: Keys;
  /** how far the whole figure rises off the ground, as a share of its height */
  rise?: Keys;
  /** the figure's height about its feet, 1 as drawn: below for a crouch, above for a stretch */
  stretch?: Keys;
  /** degrees the head tilts about the neck, beyond any nod */
  tilt?: Keys;
  eyes?: Hold<EyeState>;
  mouth?: Hold<Viseme>;
  /** where the pupils look while it lasts, each way from -1 to 1 of their reach */
  look?: CharacterPoint;
}

export type ActName = 'arrive' | 'greet' | 'twitchLeft' | 'twitchRight' | 'sniff' | 'cheer' | 'hmm';

/** An ear's flick: back, forward past where it rests, and settled. */
const TWITCH: Keys = [
  [0, 0],
  [0.25, -11],
  [0.5, 5],
  [0.75, -2],
  [1, 0],
];

/** Two quick swells of the nose. */
const SNIFF: Keys = [
  [0, 1],
  [0.2, 1.07],
  [0.4, 1],
  [0.6, 1.07],
  [0.8, 1],
  [1, 1],
];

/** A blink inside an act, starting at `at`: half shut, shut, half shut, over about 190 ms of an act `ms` long. */
function blinkAt(at: number, ms: number): Hold<EyeState> {
  const half = 50 / ms;
  const shut = 90 / ms;
  return [
    [at, at + half, 'half'],
    [at + half, at + half + shut, 'closed'],
    [at + half + shut, at + 2 * half + shut, 'half'],
  ];
}

export const ACTS: Readonly<Record<ActName, Act>> = {
  /**
   * Coming on screen: the ears, laid back, spring up past where they rest
   * and settle, and the character blinks as if it had just seen you.
   */
  arrive: {
    ms: 900,
    earLeft: [
      [0, -22],
      [0.2, -22],
      [0.45, 8],
      [0.62, -2],
      [0.78, 0],
      [1, 0],
    ],
    earRight: [
      [0, -22],
      [0.2, -22],
      [0.45, 8],
      [0.62, -2],
      [0.78, 0],
      [1, 0],
    ],
    eyes: blinkAt(0.62, 900),
  },
  /** A tap: a little hop, both ears up and back, a smile, a sniff. */
  greet: {
    ms: 1000,
    earLeft: [
      [0, 0],
      [0.15, -8],
      [0.38, 12],
      [0.6, -3],
      [0.8, 0],
      [1, 0],
    ],
    earRight: [
      [0, 0],
      [0.15, -8],
      [0.38, 12],
      [0.6, -3],
      [0.8, 0],
      [1, 0],
    ],
    rise: [
      [0, 0],
      [0.14, 0],
      [0.36, 0.05],
      [0.56, 0],
      [1, 0],
    ],
    stretch: [
      [0, 1],
      [0.12, 0.95],
      [0.26, 1.04],
      [0.5, 1],
      [0.58, 0.97],
      [0.7, 1],
      [1, 1],
    ],
    sniff: [
      [0, 1],
      [0.62, 1],
      [0.72, 1.08],
      [0.82, 1],
      [0.9, 1.06],
      [1, 1],
    ],
    eyes: [[0.18, 0.62, 'happy']],
    mouth: [[0.18, 0.62, 'a']],
  },
  twitchLeft: { ms: 700, earLeft: TWITCH },
  twitchRight: { ms: 700, earRight: TWITCH },
  sniff: { ms: 800, sniff: SNIFF },
  /** A right answer: two happy hops, ears up, eyes smiling. */
  cheer: {
    ms: 1500,
    earLeft: [
      [0, 0],
      [0.1, -6],
      [0.25, 14],
      [0.75, 14],
      [0.9, -2],
      [1, 0],
    ],
    earRight: [
      [0, 0],
      [0.1, -6],
      [0.25, 14],
      [0.75, 14],
      [0.9, -2],
      [1, 0],
    ],
    rise: [
      [0, 0],
      [0.08, 0],
      [0.24, 0.07],
      [0.4, 0],
      [0.46, 0],
      [0.6, 0.045],
      [0.74, 0],
      [1, 0],
    ],
    stretch: [
      [0, 1],
      [0.07, 0.94],
      [0.18, 1.05],
      [0.38, 1],
      [0.44, 0.96],
      [0.54, 1.03],
      [0.72, 1],
      [0.78, 0.98],
      [0.86, 1],
      [1, 1],
    ],
    tilt: [
      [0, 0],
      [0.24, -3],
      [0.6, 3],
      [0.9, 0],
      [1, 0],
    ],
    eyes: [[0.08, 0.9, 'happy']],
    mouth: [[0.08, 0.9, 'a']],
  },
  /**
   * A miss: the head tilts, the ears dip and come back, the eyes look up and
   * aside as if thinking it over, and it settles with a slow blink. Curious,
   * not sorry.
   */
  hmm: {
    ms: 1700,
    tilt: [
      [0, 0],
      [0.25, 8],
      [0.7, 8],
      [1, 0],
    ],
    earLeft: [
      [0, 0],
      [0.25, -10],
      [0.7, -10],
      [1, 0],
    ],
    earRight: [
      [0, 0],
      [0.25, 4],
      [0.7, 4],
      [1, 0],
    ],
    look: { x: 0.7, y: -0.8 },
    mouth: [[0.2, 0.75, 'mbp']],
    eyes: blinkAt(0.78, 1700),
  },
};

/** An ease in and out: slow off the mark, slow into the next key. */
export function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

/** A track's value `t` of the way through its act (0 to 1, held at the ends). */
export function sampleKeys(keys: Keys, t: number): number {
  const first = keys[0];
  if (!first) return 0;
  if (!(t > first[0])) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i] as readonly [number, number];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1] as readonly [number, number];
      const span = t1 - t0;
      return span <= 0 ? v1 : v0 + (v1 - v0) * easeInOut((t - t0) / span);
    }
  }
  return (keys[keys.length - 1] as readonly [number, number])[1];
}

/** What a hold says `t` of the way through its act, or null between its spans. */
export function sampleHold<T>(hold: Hold<T> | undefined, t: number): T | null {
  if (!hold) return null;
  for (const [from, to, value] of hold) if (t >= from && t < to) return value;
  return null;
}

/**
 * A track as a run of steps for an animation library: go to `to` over `ms`,
 * one after the other from the first key's value.
 */
export function keySteps(keys: Keys, actMs: number): { to: number; ms: number }[] {
  const steps: { to: number; ms: number }[] = [];
  for (let i = 1; i < keys.length; i++) {
    const [t0] = keys[i - 1] as readonly [number, number];
    const [t1, v1] = keys[i] as readonly [number, number];
    steps.push({ to: v1, ms: Math.max(0, Math.round((t1 - t0) * actMs)) });
  }
  return steps;
}

// ─────────────────────────────────────────────────────────────── between acts

/** The breath: the figure's height swells by this share and back, once every `ms`. */
export const BREATH = { ms: 3600, depth: 0.012 } as const;

/** The head's drift while still: this many degrees either way, once every `ms`. */
export const SWAY = { ms: 6200, degrees: 1.1 } as const;

/**
 * Resting — asleep where there is nothing yet to do: the eyes shut, the head
 * dipped `dip` degrees to one side, a breath slower and deeper than awake,
 * and a "z" drifting up from beside the head every `zMs`, `zRise` of the
 * figure's height before it fades. No blinks, glances or twitches: it is
 * still. A tap still wakes it for its greeting, and it settles back.
 */
export const RESTING = { breathMs: 5600, depth: 0.022, dip: 5, zMs: 2400, zRise: 0.22 } as const;

/** The pieces of a blink, in milliseconds: half shut, shut, half shut. */
export const BLINK_STEPS = { half: 50, shut: 90 } as const;

/**
 * How often each habit comes round, in milliseconds (a random time between
 * the two each time), and how long a glance rests where it looks. The deer
 * also twitches and sniffs; the people only blink and glance.
 */
export const HABITS = {
  blink: [2600, 6000],
  /** a second blink straight after the first, this often */
  doubleBlink: 0.2,
  glance: [3500, 8000],
  glanceHold: [700, 1600],
  twitch: [6000, 12000],
  sniff: [9000, 16000],
} as const;

/** A random time between the two ends of a habit's range. */
export function between([min, max]: readonly [number, number], random: () => number = Math.random): number {
  return min + random() * (max - min);
}

/** Somewhere to glance: anywhere across, and a little up or down rather than far. */
export function glanceTarget(random: () => number = Math.random): CharacterPoint {
  return { x: Math.round((random() * 2 - 1) * 100) / 100, y: Math.round((random() * 1.1 - 0.5) * 100) / 100 };
}

/** Whether a character has the parts the deer's habits move. */
export function hasRig(art: CharacterArt): boolean {
  return art.rig !== undefined;
}

// ─────────────────────────────────────────────────────────────── looking at things

/**
 * Where to look, each way from -1 to 1, for something at `dx`, `dy` from
 * the eyes (any unit, the same both ways): straight at it, further the
 * further away it is, at full stretch from about `far` away.
 */
export function lookToward(dx: number, dy: number, far: number): CharacterPoint {
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0) || !(far > 0)) return { x: 0, y: 0 };
  const stretch = Math.min(1, distance / far);
  return { x: (dx / distance) * stretch, y: (dy / distance) * stretch };
}

/**
 * How far each pupil moves from where it is drawn, in drawing units, to look
 * `look` (each way from -1 to 1), with `focus` from 0 (as drawn, turned in
 * towards each other) to 1 (in the middle of its eye, looking).
 */
export function pupilShift(art: CharacterArt, look: CharacterPoint, focus: number): { left: CharacterPoint; right: CharacterPoint } {
  const rig = art.rig;
  if (!rig) return { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  // looking out past the edge of the reach is clamped to its ellipse, so a pupil never leaves its white
  const length = Math.hypot(look.x, look.y);
  const k = length > 1 ? 1 / length : 1;
  const x = look.x * k * rig.look.reach.x;
  const y = look.y * k * rig.look.reach.y;
  const one = (p: { rest: CharacterPoint; centre: CharacterPoint }): CharacterPoint => ({
    x: focus * (p.centre.x - p.rest.x) + x,
    y: focus * (p.centre.y - p.rest.y) + y,
  });
  return { left: one(rig.look.left), right: one(rig.look.right) };
}

/** The middle of the eyes, in drawing units: what a look is measured from. */
export function eyesMiddle(art: CharacterArt): CharacterPoint {
  if (art.rig) {
    const { left, right } = art.rig.look;
    return { x: (left.centre.x + right.centre.x) / 2, y: (left.centre.y + right.centre.y) / 2 };
  }
  // a face is about a third of the way down a bust
  return { x: art.bust.x + art.bust.w / 2, y: art.bust.y + art.bust.h * 0.48 };
}
