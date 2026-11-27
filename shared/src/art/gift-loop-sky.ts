/**
 * The living rounds of the sky's gifts (gift-art-sky.ts): the moon, the galaxy, the shooting star, the rainbow, the
 * Newroz fire and the sun. Each layer named here is painted by the gift's drawing under the same name, back to front.
 */
import { giftLoop, giftLoopSmooth, giftLoopSweepLayers, type GiftLoop, type GiftLoopBeat, type GiftLoopPlan } from './gift-loop.js';
import type { GiftArtId } from './gift-art.js';

const TAU = Math.PI * 2;
const breath = (t: number): number => 0.5 - 0.5 * Math.cos(TAU * t);

/**
 * A star's sparkle coming out at `at` and going: it grows and turns a little as it brightens, and is gone again well
 * before the round ends, where it is set back unseen.
 */
function twinkle(box: GiftLoopPlan['box'], origin: readonly [number, number], at: number, ms: number, peak = 1): GiftLoopPlan {
  const beats: GiftLoopBeat[] = [
    [at, { o: 0, sx: 0.4, sy: 0.4, rot: -12 }, 'linear'],
    [at + 420, { o: peak, sx: 1, sy: 1, rot: 0 }, 'out'],
    [at + 620, { o: peak }, 'linear'],
    [at + 1400, { o: 0, sx: 0.55, sy: 0.55, rot: 14 }, 'inOut'],
    [ms, { sx: 0.4, sy: 0.4, rot: -12 }, 'linear'],
  ];
  return { box, origin, from: { o: 0, sx: 0.4, sy: 0.4, rot: -12 }, beats };
}

/** A star's glint flaring now and then, mostly low: bright for a moment at `phase` of the round, turning as it does. */
function flare(box: GiftLoopPlan['box'], origin: readonly [number, number], phase: number): GiftLoopPlan {
  return {
    box,
    origin,
    samples: 60,
    motion: (t) => {
      const c = Math.pow(0.5 + 0.5 * Math.cos(TAU * (t - phase)), 4);
      return { o: 0.5 + 0.5 * c, sx: 0.7 + 0.35 * c, sy: 0.7 + 0.35 * c, rot: 12 * Math.sin(TAU * (t - phase)) };
    },
  };
}

/** The plane the galaxy's disc lies in (gift-art-sky.ts): its long axis turned this far, squashed this much across. */
export const KADIZ_PLANE = { tilt: -26, squash: 0.42 };

/**
 * The galaxy: its disc turns in its own plane, once in a minute and a bit, arms trailing as a spiral's do, the dust
 * lane staying on the near side of its heart, and its four near stars flare each in turn.
 */
const kadiz = giftLoop(6000, {
  disc: { box: [12, 30, 93, 60], origin: [60, 60], plane: KADIZ_PLANE, ms: 72000, beats: [[72000, { rot: -360 }, 'linear']] },
  lane: { box: [48, 54, 26, 15] },
  star1: flare([21, 17, 10, 10], [26, 22], 0.1),
  star2: flare([94, 30, 8, 8], [98, 34], 0.35),
  star3: flare([16, 80, 8, 8], [20, 84], 0.6),
  star4: flare([84, 96, 8, 8], [88, 100], 0.85),
});

/** Where the shooting star travels: the way it goes, in frame units (gift-art-sky.ts draws it heading this way). */
const STERK_WAY = [-0.788, 0.616] as const;

/**
 * The shooting star's place along its way at `t`, how much of it is seen and how long its tail is: on through the
 * still, burning out to its head, gone, then back in, its tail drawing out behind it.
 */
function streak(t: number): { along: number; seen: number; size: number } {
  if (t < 0.12) return { along: 7 * (t / 0.12), seen: 1 - giftLoopSmooth((t - 0.03) / 0.09), size: 1 - 0.75 * giftLoopSmooth(t / 0.12) };
  if (t < 0.42) return { along: 7 - 37 * ((t - 0.12) / 0.3), seen: 0, size: 0.25 };
  return { along: -30 + 30 * ((t - 0.42) / 0.58), seen: giftLoopSmooth((t - 0.42) / 0.05), size: 0.25 + 0.75 * giftLoopSmooth((t - 0.42) / 0.14) };
}

/**
 * The shooting star: it crosses the night head first, its tail behind it, the cross of light at its head flaring as it
 * goes by the place the still shows it, while three far stars twinkle.
 */
const sterk = giftLoop(4200, {
  star: {
    box: [33, 31, 49, 43],
    samples: 60,
    origin: [42, 66],
    motion: (t) => {
      const { along, seen, size } = streak(t);
      return { x: STERK_WAY[0] * along, y: STERK_WAY[1] * along, sx: size, sy: size, o: seen };
    },
  },
  glint: {
    box: [30, 55, 24, 22],
    origin: [42, 66],
    samples: 60,
    motion: (t) => {
      const { along } = streak(t);
      const near = t < 0.5 ? t : t - 1;
      const flare = Math.exp(-Math.pow(near / 0.07, 2));
      return { x: STERK_WAY[0] * along, y: STERK_WAY[1] * along, o: flare, sx: 0.6 + 0.5 * flare, sy: 0.6 + 0.5 * flare, rot: 160 * near };
    },
  },
  star1: twinkle([22, 26, 8, 8], [26, 30], 700, 4200, 0.9),
  star2: twinkle([86, 54, 8, 8], [90, 58], 1900, 4200, 0.8),
  star3: twinkle([66, 12, 8, 8], [70, 16], 2600, 4200, 0.85),
});

/** The rainbow: light runs over its bands from west to east and is gone, then the bow rests a while. */
const keskesor = giftLoop(4500, giftLoopSweepLayers(['light1', 'light2', 'light3', 'light4', 'light5', 'light6', 'light7', 'light8', 'light9'], [
  [5, 52, 28, 25], [5, 40, 37, 35], [13, 31, 38, 36], [26, 28, 35, 34], [42, 28, 36, 30], [59, 28, 35, 34], [69, 31, 38, 37], [78, 40, 36, 31], [92, 52, 22, 19],
], 500, 3000, 1));

/**
 * A group of flame tongues flickering about its root: it stretches up and draws in, and leans, by a few waves of
 * different pace that all come round together at the end of the round.
 */
function flicker(box: GiftLoopPlan['box'], root: readonly [number, number], amp: number, seed: number): GiftLoopPlan {
  const wave = (t: number, k: number): number =>
    0.55 * Math.sin(TAU * (t + 0.13 * k + seed)) + 0.3 * Math.sin(TAU * (2 * t + 0.29 * k + seed * 1.7)) + 0.15 * Math.sin(TAU * (3 * t + 0.41 * k + seed * 2.3));
  return { box, origin: root, samples: 60, motion: (t) => ({ sy: 1 + amp * wave(t, 1), sx: 1 - amp * 0.4 * wave(t, 1), rot: 2.6 * wave(t, 2) }) };
}

/** An ember drawn at `at` halfway up its flight: born at the fire's top, it rises, drifts, shrinks and goes out. */
function ember(box: GiftLoopPlan['box'], at: readonly [number, number], born: number, drift: number): GiftLoopPlan {
  return {
    box,
    origin: at,
    wrap: born > 0 ? born : undefined,
    samples: 48,
    motion: (t) => {
      const u = (((t - born) % 1) + 1) % 1;
      const seen = u < 0.14 ? giftLoopSmooth(u / 0.14) : 1 - giftLoopSmooth((u - 0.14) / 0.82);
      return { y: 30 * (0.5 - u), x: drift * (u - 0.5) + 1.2 * Math.sin(TAU * u * 1.5), rot: drift * 6 * (u - 0.5), sx: 1.15 - 0.5 * u, sy: 1.15 - 0.5 * u, o: seen };
    },
  };
}

/**
 * The Newroz fire: its tongues flicker in groups, each at its own pace, the inner ones livelier, while embers rise
 * out of it one after another and go out in the night.
 */
const pet = giftLoop(3000, {
  redLeft: flicker([24, 20, 41, 80], [49, 96], 0.05, 0.1),
  redRight: flicker([49, 10, 50, 90], [73, 96], 0.05, 0.55),
  orangeLeft: flicker([33, 28, 35, 71], [53, 96], 0.07, 0.3),
  orangeRight: flicker([56, 22, 33, 77], [70, 96], 0.07, 0.8),
  gold: flicker([43, 38, 37, 60], [62, 96], 0.09, 0.45),
  heart: flicker([52, 68, 17, 30], [61, 96], 0.12, 0.7),
  stones: { box: [17, 97, 86, 15] },
  ember1: ember([34, 31, 4, 6], [36, 34], 0, -5),
  ember2: ember([82, 37, 4, 6], [84, 40], 0.17, 4),
  ember3: ember([48, 17, 4, 6], [50, 20], 0.34, -2),
  ember4: ember([72, 21, 4, 6], [74, 24], 0.5, 6),
  ember5: ember([26, 45, 4, 6], [28, 48], 0.67, -6),
  ember6: ember([89, 49, 4, 6], [91, 52], 0.84, 3),
});

/**
 * The moon: its halo breathes out and back, a thin cloud drifts across its face and is gone, moonlight runs along the
 * far ridge's crest, and four stars twinkle each in its own time. All of it starts unseen, so the still is the base.
 */
const heyv = giftLoop(6000, {
  bloom: { box: [31, 17, 58, 56], origin: [60, 45], from: { o: 0 }, beats: [[2600, { o: 1 }], [5600, { o: 0 }]] },
  glow: { box: [26, 12, 68, 65], origin: [60, 45], from: { o: 0 }, beats: [[600, { o: 0 }], [3400, { o: 1, sx: 1.04, sy: 1.04 }], [6000, { o: 0, sx: 1, sy: 1 }]] },
  cloud: {
    box: [34, 44, 50, 13],
    origin: [60, 49],
    samples: 60,
    motion: (t) => {
      const drift = t < 0.88 ? t / 0.88 : 1 - (t - 0.88) / 0.12;
      const seen = t < 0.26 ? giftLoopSmooth(t / 0.26) : t < 0.6 ? 1 : 1 - giftLoopSmooth((t - 0.6) / 0.26);
      return { x: -13 + 26 * drift, y: 0.8 - 1.6 * drift, sx: 0.94 + 0.1 * drift, o: seen };
    },
  },
  ...giftLoopSweepLayers(['shine1', 'shine2', 'shine3', 'shine4'], [[33, 73, 11, 5], [43, 75, 12, 5], [56, 74, 11, 5], [69, 71, 11, 5]], 1600, 2800),
  star1: twinkle([17, 21, 10, 10], [22, 26], 200, 6000),
  star2: twinkle([91, 13, 10, 10], [96, 18], 2300, 6000, 0.9),
  star3: twinkle([98, 46, 8, 8], [102, 50], 3600, 6000, 0.85),
  star4: twinkle([13, 52, 8, 8], [17, 56], 4500, 6000, 0.8),
});

/** The sun: its two rings of rays breathing out and in a beat apart, turning a little, and its face churning slowly. */
const roj = giftLoop(6000, {
  back: { box: [11, 14, 99, 94], origin: [60, 60], motion: (t) => ({ sx: 1 + 0.05 * breath(t), sy: 1 + 0.05 * breath(t), rot: 2.4 * Math.sin(TAU * t) }) },
  long: { box: [5, 6, 111, 110], origin: [60, 60], motion: (t) => ({ sx: 1 + 0.04 * breath(t - 0.2), sy: 1 + 0.04 * breath(t - 0.2), rot: -1.6 * Math.sin(TAU * t) }) },
  disc: { box: [26, 26, 68, 68] },
  swirl: { box: [33, 37, 52, 50], origin: [60, 60], motion: (t) => ({ rot: 9 * Math.sin(TAU * t) }) },
  face: { box: [30, 29, 60, 62] },
}, { base: 'none' });

export const SKY_LOOPS: Readonly<Partial<Record<GiftArtId, GiftLoop>>> = { heyv, kadiz, sterk, keskesor, pet, roj };
