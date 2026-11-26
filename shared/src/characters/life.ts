import type { BrowState, CharacterArt, CharacterId, CharacterPoint, EyeState, MouthShape } from './types.js';

/**
 * How a character stays alive between words, alike on both apps, each with its own animation. Alive, never busy: it
 * breathes, its head drifts a degree, it blinks every few seconds and glances about, and each has its own habits
 * (`CHARACTER_HABITS`). Taps get a greeting, then a giggle, then a start and a laugh (`tapActs`); a right answer gets a
 * cheer and a miss a curious tilt, never a sad face, since the learner is often a child. Screens can ask for more
 * (`CharacterReaction`).
 *
 * Every act is shared and played each character's way (`actFor`). An act is a set of tracks, each a list of keys: at `t`
 * (a share of the act) the track reaches `v`, easing from the key before. Platforms play tracks their own way (timing runs
 * on the phone, a frame loop on the web); `sampleKeys` gives a track's value at any moment.
 */

/** One track: the value `v` at each `t` from 0 to 1; the first key is at 0 and the last at 1. */
export type Keys = readonly (readonly [t: number, v: number])[];

/** Spans of an act, from `from` to `to` (shares of its length), in which the eyes or mouth are held a certain way. */
export type Hold<T> = readonly (readonly [from: number, to: number, value: T])[];

/** The cheeks blushing, for a character drawn with a blush. */
export type CheekState = 'blush';

export interface Act {
  ms: number;
  /** each ear's lift in degrees, up positive and laid back negative (the deer's; ignored without ears) */
  earLeft?: Keys;
  earRight?: Keys;
  /** the nose's size, 1 as drawn */
  sniff?: Keys;
  /** how far the whole figure rises off the ground, as a share of its height */
  rise?: Keys;
  /** the figure's height about its feet, 1 as drawn: lower to crouch, higher to stretch */
  stretch?: Keys;
  /** degrees the head tilts about the neck, beyond any nod */
  tilt?: Keys;
  /** degrees the whole figure rocks from side to side about its feet */
  wiggle?: Keys;
  /** degrees the near end of a moustache lifts about its root (Hamo's; ignored without one) */
  lift?: Keys;
  /** degrees a loose lock swings about where it parts (Xezo's wisp; ignored without one) */
  hair?: Keys;
  eyes?: Hold<EyeState>;
  mouth?: Hold<MouthShape>;
  /** how the brows sit meanwhile (the deer's lids; ignored without a brow layer) */
  brows?: Hold<BrowState>;
  /** the cheeks blushing meanwhile (ignored without a blush) */
  cheeks?: Hold<CheekState>;
  /** where the eyes look meanwhile, each way from -1 to 1 of their reach */
  look?: CharacterPoint;
}

export type ActName =
  | 'arrive'
  | 'greet'
  | 'twitchLeft'
  | 'twitchRight'
  | 'sniff'
  | 'cheer'
  | 'hmm'
  | 'nod'
  | 'ponder'
  | 'wink'
  | 'surprised'
  | 'giggle'
  | 'chuckle'
  | 'pout'
  | 'tongue'
  | 'preen'
  | 'tuck'
  | 'chew'
  | 'hiccup'
  | 'offer';

/**
 * What a screen can ask a character to do about what it saw: a cheer for a right answer, a curious `hmm` for a miss (or,
 * on a calm page, a quiet `nod` and a kind `ponder`), and the rest for moments between. Each character plays them its way (`reactionAct`): only Hamo chuckles, only Xezo pouts.
 */
export type CharacterReaction = 'cheer' | 'hmm' | 'nod' | 'ponder' | 'wink' | 'surprised' | 'giggle' | 'chuckle' | 'pout' | 'tongue';

/** An ear's flick: back, forward past rest, settled. */
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

/** Both ears up for a moment, as at anything new. */
const EARS_UP: Keys = [
  [0, 0],
  [0.12, 16],
  [0.7, 14],
  [1, 0],
];

/** The shoulders going in a laugh: the figure a touch shorter and taller by turns. */
const SHAKING: Keys = [
  [0, 1],
  [0.15, 0.982],
  [0.3, 1.014],
  [0.45, 0.982],
  [0.6, 1.014],
  [0.75, 0.99],
  [1, 1],
];

/** A blink inside an act starting at `at`: half shut, shut, half shut over about 190 ms of an act `ms` long. */
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
  /** Coming on screen: the laid-back ears spring up past rest and settle, and the character blinks as if just seeing you. */
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
  /** A right answer: two happy hops, ears up, eyes smiling, the open mouth settling into a grin. */
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
    mouth: [
      [0.08, 0.55, 'a'],
      [0.55, 0.9, 'grin'],
    ],
  },
  /** A miss: the head tilts, the ears dip and recover, the eyes look up and aside as if thinking, then a slow blink. Curious, not sorry. */
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
  /**
   * A quiet right answer, for a calm page: one small nod, brows lifting, eyes smiling and a grin, nothing more. No hop
   * and no rocking, so it moves nothing beside the character.
   */
  nod: {
    ms: 1300,
    stretch: [
      [0, 1],
      [0.14, 0.988],
      [0.32, 1.004],
      [0.48, 1],
      [1, 1],
    ],
    tilt: [
      [0, 0],
      [0.18, -1.5],
      [0.75, -1.5],
      [1, 0],
    ],
    brows: [[0.06, 0.8, 'raised']],
    eyes: [[0.1, 0.85, 'happy']],
    mouth: [[0.08, 0.88, 'grin']],
  },
  /**
   * A quiet miss: the head tilts gently and holds, the eyes go up and aside as if weighing it, then a slow blink and a
   * warm look back. Kind, never a shake of the head.
   */
  ponder: {
    ms: 1700,
    tilt: [
      [0, 0],
      [0.3, 5],
      [0.72, 5],
      [1, 0],
    ],
    look: { x: 0.6, y: -0.5 },
    brows: [[0.15, 0.72, 'raised']],
    mouth: [
      [0.2, 0.72, 'mbp'],
      [0.82, 0.98, 'grin'],
    ],
    eyes: [...blinkAt(0.72, 1700), [0.82, 0.98, 'happy']],
  },
  /** A wink: the near eye shut in a smile, a grin, the head dipped a touch that way; Xezo blushes with it. */
  wink: {
    ms: 800,
    tilt: [
      [0, 0],
      [0.2, -4],
      [0.75, -4],
      [1, 0],
    ],
    eyes: [[0.15, 0.8, 'wink']],
    mouth: [[0.15, 0.85, 'grin']],
    cheeks: [[0.15, 0.9, 'blush']],
  },
  /** A start: drawn up straight for a moment, ears and brows up, eyes wide, the mouth a small round "oh". */
  surprised: {
    ms: 900,
    earLeft: EARS_UP,
    earRight: EARS_UP,
    stretch: [
      [0, 1],
      [0.1, 1.04],
      [0.3, 1.01],
      [1, 1],
    ],
    eyes: [[0.05, 0.8, 'wide']],
    brows: [[0.05, 0.8, 'raised']],
    mouth: [[0.08, 0.8, 'o']],
  },
  /** A giggle: a quick rock from side to side with the shoulders going, eyes smiling, the grin opening and closing. */
  giggle: {
    ms: 1100,
    wiggle: [
      [0, 0],
      [0.15, -3],
      [0.35, 3],
      [0.55, -2.5],
      [0.75, 2],
      [1, 0],
    ],
    stretch: SHAKING,
    tilt: [
      [0, 0],
      [0.3, 3],
      [0.7, 3],
      [1, 0],
    ],
    eyes: [[0.1, 0.9, 'happy']],
    mouth: [
      [0.1, 0.35, 'grin'],
      [0.35, 0.55, 'a'],
      [0.55, 0.9, 'grin'],
    ],
    cheeks: [[0.1, 0.95, 'blush']],
  },
  /** Hamo's chuckle with his whole face: brows up, eyes shut in a smile, shoulders and head going, mouth opening and closing, moustache lifted. */
  chuckle: {
    ms: 1400,
    stretch: SHAKING,
    tilt: [
      [0, 0],
      [0.2, -2],
      [0.45, 2],
      [0.7, -1.5],
      [1, 0],
    ],
    lift: [
      [0, 0],
      [0.25, 2],
      [0.75, 2],
      [1, 0],
    ],
    eyes: [[0.1, 0.9, 'happy']],
    brows: [[0.05, 0.9, 'raised']],
    mouth: [
      [0.1, 0.3, 'grin'],
      [0.3, 0.5, 'a'],
      [0.5, 0.65, 'grin'],
      [0.65, 0.8, 'a'],
      [0.8, 0.9, 'grin'],
    ],
  },
  /** Xezo's pout: brows knitted, lips pushed out, head tilted, eyes down and aside, over with a blink. */
  pout: {
    ms: 1300,
    tilt: [
      [0, 0],
      [0.2, 5],
      [0.75, 5],
      [1, 0],
    ],
    look: { x: -0.7, y: 0.3 },
    brows: [[0.12, 0.8, 'knit']],
    mouth: [[0.12, 0.8, 'u']],
    eyes: blinkAt(0.82, 1300),
  },
  /** The tongue poked out cheekily: head cocked, ears up, eyes smiling. */
  tongue: {
    ms: 1000,
    tilt: [
      [0, 0],
      [0.2, -5],
      [0.75, -5],
      [1, 0],
    ],
    earLeft: [
      [0, 0],
      [0.2, 8],
      [0.75, 8],
      [1, 0],
    ],
    earRight: [
      [0, 0],
      [0.2, 8],
      [0.75, 8],
      [1, 0],
    ],
    eyes: [[0.15, 0.85, 'happy']],
    mouth: [[0.15, 0.85, 'tongue']],
  },
  /** Hamo's habit: a small slow lift of his moustache's near end and a settle, with a smile in his eyes. */
  preen: {
    ms: 1600,
    lift: [
      [0, 0],
      [0.3, 2],
      [0.5, 1.4],
      [0.7, 2],
      [1, 0],
    ],
    eyes: [[0.35, 0.8, 'happy']],
  },
  /** Xezo's habit: tucking a wisp back as the head tilts, her eyes going aside and back smiling. */
  tuck: {
    ms: 1400,
    tilt: [
      [0, 0],
      [0.25, 6],
      [0.7, 6],
      [1, 0],
    ],
    // Positive turns the wisp back toward the hair, where it hides a moment before springing back.
    hair: [
      [0, 0],
      [0.25, 9],
      [0.5, -4],
      [0.75, 1.5],
      [1, 0],
    ],
    look: { x: 0.6, y: -0.2 },
    eyes: [[0.4, 0.8, 'happy']],
  },
  /** A bite and a chew: the head dips to the side for the bite, the mouth working, the eyes shut in bliss, then a blink. */
  chew: {
    ms: 1600,
    tilt: [
      [0, 0],
      [0.1, -7],
      [0.22, -2],
      [0.5, -1],
      [1, 0],
    ],
    earLeft: [
      [0, 0],
      [0.1, -6],
      [0.3, 2],
      [0.5, 0],
      [1, 0],
    ],
    mouth: [
      [0.02, 0.12, 'a'],
      [0.12, 0.24, 'mbp'],
      [0.24, 0.34, 'etc'],
      [0.34, 0.46, 'mbp'],
      [0.46, 0.56, 'etc'],
      [0.56, 0.68, 'mbp'],
    ],
    eyes: [[0.2, 0.7, 'happy'], ...blinkAt(0.84, 1600)],
  },
  /** A hiccup: a little jump the whole body makes, ears and eyes startled, the mouth an O. */
  hiccup: {
    ms: 900,
    rise: [
      [0, 0],
      [0.1, 0.045],
      [0.28, 0],
      [1, 0],
    ],
    stretch: [
      [0, 1],
      [0.08, 1.05],
      [0.26, 0.98],
      [0.4, 1],
      [1, 1],
    ],
    earLeft: EARS_UP,
    earRight: EARS_UP,
    eyes: [[0.06, 0.62, 'wide']],
    brows: [[0.06, 0.62, 'raised']],
    mouth: [[0.06, 0.4, 'o']],
  },
  /** Holding something out to you: the head leaning to it, ears up, eyes smiling, a grin. */
  offer: {
    ms: 1300,
    tilt: [
      [0, 0],
      [0.25, -8],
      [0.75, -8],
      [1, 0],
    ],
    earLeft: EARS_UP,
    earRight: EARS_UP,
    look: { x: 0, y: 0.2 },
    eyes: [[0.15, 0.85, 'happy']],
    mouth: [[0.2, 0.8, 'grin']],
  },
};

/**
 * What each character lays over the shared act: Hamo meets a miss with one raised brow and ends a cheer with brows up and
 * his moustache lifted; Xezo pouts at a miss and ends a cheer with a wink and a blush; the deer plays every act as shared.
 */
const OWN_WAY: Readonly<Record<CharacterId, Partial<Record<ActName, Partial<Act>>>>> = {
  hevalo: {},
  hamo: {
    hmm: { brows: [[0.2, 0.75, 'one']] },
    cheer: {
      brows: [[0.08, 0.9, 'raised']],
      lift: [
        [0, 0],
        [0.55, 0],
        [0.72, 2],
        [1, 0],
      ],
    },
  },
  xezo: {
    hmm: { brows: [[0.2, 0.75, 'knit']], mouth: [[0.2, 0.75, 'u']] },
    cheer: {
      eyes: [
        [0.08, 0.6, 'happy'],
        [0.6, 0.9, 'wink'],
      ],
      cheeks: [[0.1, 1, 'blush']],
    },
    nod: { cheeks: [[0.12, 0.9, 'blush']] },
  },
};

/** The act `name` as `id` plays it: the shared act with that character's own parts laid over. */
export function actFor(id: CharacterId, name: ActName): Act {
  const own = OWN_WAY[id]?.[name];
  const base = ACTS[name];
  return own ? { ...base, ...own } : base;
}

/** The act a character plays for a reaction: only Hamo chuckles (the others giggle), only Xezo pouts (the others go `hmm`). */
export function reactionAct(id: CharacterId, reaction: CharacterReaction): ActName {
  if (reaction === 'chuckle' && id !== 'hamo') return 'giggle';
  if (reaction === 'pout' && id !== 'xezo') return 'hmm';
  return reaction;
}

/** Taps this close together are one run: a greeting, then a giggle, then a start and a laugh. */
export const TAP_RUN_MS = 1600;

/** What the `taps`th quick tap in a run gets: a greeting; a giggle; a start, then the character's laugh. The run then starts again. */
export function tapActs(id: CharacterId, taps: number): ActName[] {
  const step = ((Math.max(1, Math.floor(taps)) - 1) % 3) + 1;
  if (step === 1) return ['greet'];
  if (step === 2) return ['giggle'];
  return ['surprised', reactionAct(id, 'chuckle')];
}

/** Easing in and out: slow off the mark and slow into the next key. */
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

/** A track as steps for an animation library: go to `to` over `ms`, one after another from the first key's value. */
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

/** The breath: the figure's height swells by this share and back once every `ms`. */
export const BREATH = { ms: 3600, depth: 0.012 } as const;

/** The head's drift while still: this many degrees either way once every `ms`. */
export const SWAY = { ms: 6200, degrees: 1.1 } as const;

/**
 * Resting, asleep while there is nothing to do: eyes shut, head dipped `dip` degrees, a slower deeper breath, and a "z"
 * rising `zRise` of the head's height every `zMs` before it fades. The "z"s start `zAt` of the head's size from the
 * middle of the eyes, out past the antler or hair, so they read the same whether the whole figure or only the head is
 * drawn. No blinks, glances or twitches. A tap still wakes it for its greeting, and it settles back.
 */
export const RESTING = { breathMs: 5600, depth: 0.022, dip: 5, zMs: 2400, zRise: 0.22, zAt: { x: 0.46, y: 0.38 } } as const;

/** The pieces of a blink, in milliseconds: half shut, shut, half shut. */
export const BLINK_STEPS = { half: 50, shut: 90 } as const;

/**
 * How often each habit comes round in ms (a random time between the two), and how long a glance rests. Everyone blinks and
 * glances; which other habits each character has is in `CHARACTER_HABITS`.
 */
export const HABITS = {
  blink: [2600, 6000],
  /** a second blink straight after the first, this often */
  doubleBlink: 0.2,
  glance: [3500, 8000],
  glanceHold: [700, 1600],
  twitch: [6000, 12000],
  sniff: [9000, 16000],
  /** the deer's tongue, rarely: a treat, not a tic */
  tongue: [45000, 100000],
  /** Hamo's hand to his moustache */
  preen: [14000, 30000],
  /** Xezo tucking her hair back */
  tuck: [12000, 26000],
} as const;

/** Something a character does by itself now and then: one of `acts` at random, every so often. */
export interface Habit {
  acts: readonly ActName[];
  every: readonly [number, number];
}

/** Each character's own habits and timing: the deer flicks an ear, sniffs and rarely shows his tongue; Hamo lifts his moustache; Xezo tucks a wisp back. */
export const CHARACTER_HABITS: Readonly<Record<CharacterId, readonly Habit[]>> = {
  hevalo: [
    { acts: ['twitchLeft', 'twitchRight'], every: HABITS.twitch },
    { acts: ['sniff'], every: HABITS.sniff },
    { acts: ['tongue'], every: HABITS.tongue },
  ],
  hamo: [{ acts: ['preen'], every: HABITS.preen }],
  xezo: [{ acts: ['tuck'], every: HABITS.tuck }],
};

/** Which of a habit's acts to play this time. */
export function pickAct(habit: Habit, random: () => number = Math.random): ActName {
  const i = Math.min(habit.acts.length - 1, Math.floor(random() * habit.acts.length));
  return habit.acts[i] ?? (habit.acts[0] as ActName);
}

/** A random time within a habit's range. */
export function between([min, max]: readonly [number, number], random: () => number = Math.random): number {
  return min + random() * (max - min);
}

/** The least a glance goes to one side, as a share of the eyes' reach: one near the middle reads as a startled stare. */
export const GLANCE_ASIDE = 0.45;

/** Somewhere to glance: off to one side or the other, and only a little up or down. */
export function glanceTarget(random: () => number = Math.random): CharacterPoint {
  const across = random() * 2 - 1;
  const x = Math.sign(across || 1) * (GLANCE_ASIDE + (1 - GLANCE_ASIDE) * Math.abs(across));
  return { x: Math.round(x * 100) / 100, y: Math.round((random() * 1.1 - 0.5) * 100) / 100 };
}

// ─────────────────────────────────────────────────────────────── looking at things

/** Where to look, each way from -1 to 1, for something at `dx`, `dy` from the eyes (any unit): further the further away, at full stretch from about `far`. */
export function lookToward(dx: number, dy: number, far: number): CharacterPoint {
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0) || !(far > 0)) return { x: 0, y: 0 };
  const stretch = Math.min(1, distance / far);
  return { x: (dx / distance) * stretch, y: (dy / distance) * stretch };
}

/**
 * How far each pupil moves from where it is drawn, in drawing units, to look `look` (-1 to 1), with `focus` from 0 (as
 * drawn, turned in) to 1 (centred, looking).
 */
export function pupilShift(art: CharacterArt, look: CharacterPoint, focus: number): { left: CharacterPoint; right: CharacterPoint } {
  const rig = art.rig;
  if (!rig) return { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  // A look past the reach is clamped to its ellipse, so a pupil never leaves its white.
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

/** The middle of the eyes in drawing units, which a look is measured from. */
export function eyesMiddle(art: CharacterArt): CharacterPoint {
  if (art.rig) {
    const { left, right } = art.rig.look;
    return { x: (left.centre.x + right.centre.x) / 2, y: (left.centre.y + right.centre.y) / 2 };
  }
  // A face sits about a third of the way down a bust.
  return { x: art.bust.x + art.bust.w / 2, y: art.bust.y + art.bust.h * 0.48 };
}
