/**
 * The living rounds of the houses and boats (gift-art-homes.ts): the rowing boat, the village house, the raft, the
 * black tent, the sailing ship, the mansion and the castle. Each layer named here is painted by the gift's drawing under
 * the same name, back to front.
 */
import { giftLoop, giftLoopSmooth, giftLoopWisp, type GiftLoop, type GiftLoopBox, type GiftLoopPlan, type GiftLoopPose } from './gift-loop.js';
import type { GiftArtId } from './gift-art.js';
import type { Pt } from './svg.js';

const TAU = Math.PI * 2;
const wave = (t: number, k: number, phase = 0): number => Math.sin(TAU * k * t + phase);

/** How a body floats at a share of its round: moved by x and y, and turned `rot` degrees about its pivot. */
interface Float {
  x: number;
  y: number;
  rot: number;
}

/**
 * A part carried by a floating body: the body turns about `pivot`, the part about its own `origin`, so the part's move
 * is the body's plus what turning about the pivot rather than its origin adds. `own` is the part's own play on top.
 */
function carried(
  box: GiftLoopBox,
  origin: Pt,
  pivot: Pt,
  body: (t: number) => Float,
  own: (t: number) => Partial<GiftLoopPose> = () => ({}),
  samples?: number,
): GiftLoopPlan {
  return {
    box,
    origin,
    ...(samples ? { samples } : {}),
    motion: (t) => {
      const b = body(t);
      const p = own(t);
      const a = (b.rot * Math.PI) / 180;
      const [dx, dy] = [pivot[0] - origin[0], pivot[1] - origin[1]];
      const x = b.x + dx - (Math.cos(a) * dx - Math.sin(a) * dy) + (p.x ?? 0);
      const y = b.y + dy - (Math.sin(a) * dx + Math.cos(a) * dy) + (p.y ?? 0);
      return { ...p, x, y, rot: b.rot + (p.rot ?? 0) };
    },
  };
}

/** Seen while it drifts across the middle of its pass, and gone at either end, where it starts over unseen. */
const passing = (u: number): number => (u < 0.35 ? giftLoopSmooth(u / 0.35) : u < 0.65 ? 1 : 1 - giftLoopSmooth((u - 0.65) / 0.35));

/**
 * Ripples drifting `reach` units along the water as it swells, fading in and out: halfway through their pass at `born`
 * of the round's start, so a set born at 0.5 is wholly seen, where it is drawn, in the still.
 */
function drift(box: GiftLoopBox, swell: (t: number) => Float, born: number, reach: number): GiftLoopPlan {
  return {
    box,
    wrap: (1 - born) % 1,
    motion: (t) => {
      const u = (t + born) % 1;
      const s = swell(t);
      return { x: s.x + reach * (u - 0.5), y: s.y, o: passing(u) };
    },
  };
}

/** A flame's unsteady breath, about -1 to 1, its quicker tremors at whole turns of the round so it loops. */
const flicker = (t: number): number => 0.5 * wave(t, 7, 0.4) + 0.3 * wave(t, 11, 2.1) + 0.2 * wave(t, 17, 4.4);

// ─────────────────────────────────────────────────────────────────── belem

const BELEM_PIVOT: Pt = [60, 82];
const belemSwell = (t: number): Float => ({ x: 0.6 * wave(t, 1, 1.2), y: 0.4 * wave(t, 1), rot: 0 });
const belemBoat = (t: number): Float => ({ x: 0, y: 0.5 * wave(t, 1, -0.4), rot: -0.85 * wave(t, 1, 1.1) });

/** The rowing boat rides the swell, heaving and pitching about its waterline, its lantern burning at the bow. */
const belem = giftLoop(4800, {
  boat: carried([6, 52, 109, 36], BELEM_PIVOT, BELEM_PIVOT, belemBoat),
  swell: { box: [0, 80, 120, 23], motion: belemSwell },
  ripples: drift([16, 91, 86, 9], belemSwell, 0.5, 2.4),
  ripplesNext: drift([29, 92, 78, 9], belemSwell, 0, 2.4),
  gold: { box: [105, 84, 8, 16], origin: [109.2, 92.4], motion: (t) => ({ ...belemSwell(t), sx: 1 + 0.08 * wave(t, 3, 0.5), o: 0.8 + 0.2 * flicker(t) }) },
  lap: { box: [11, 98, 98, 8], motion: (t) => ({ x: -0.7 * wave(t, 1, 1.2), y: 0.2 * wave(t, 1, 0.3) }) },
  lantern: carried([99, 26, 17, 39], BELEM_PIVOT, BELEM_PIVOT, belemBoat),
  lit: carried([107, 38, 7, 8], [110.4, 43.08], BELEM_PIVOT, belemBoat, (t) => ({ o: 0.3 + 0.3 * flicker(t) }), 160),
  flame: carried([108, 39, 5, 6], [110.4, 43.08], BELEM_PIVOT, belemBoat, (t) => ({ sy: 1 + 0.13 * flicker(t), sx: 1 - 0.06 * flicker(t), rot: 3 * wave(t, 5, 1) }),
    160),
  rail: carried([92, 56, 20, 11], [102, 61.2], BELEM_PIVOT, belemBoat, (t) => ({ o: 0.78 + 0.22 * flicker(t) }), 160),
});

// ───────────────────────────────────────────────────────────────────── gemî

const GEMI_PIVOT: Pt = [58, 86];
const gemiShip = (t: number): Float => ({ x: 0, y: 0.5 * wave(t, 1, -0.4), rot: 0.9 * wave(t, 1, 0.8) });
const gemiSwell = (t: number): Float => ({ x: 0.5 * wave(t, 1, 1.4), y: 0.32 * wave(t, 1, 0.2), rot: 0 });
/** A gust filling a sail from its yard and easing off again, reaching each sail a little after the one astern of it. */
const fill = (lag: number, reach = 0.03) => (t: number): Partial<GiftLoopPose> => {
  const f = 0.5 - 0.5 * Math.cos(TAU * (t - lag));
  return { sx: 1 + reach * f, sy: 1 - reach * 0.4 * f };
};
/** A pennant streaming from its masthead: swinging about the hoist, its fly rippling quicker than it swings. */
const stream = (lean: number, swing: number, phase: number) => (t: number): Partial<GiftLoopPose> => ({
  rot: lean + swing * wave(t, 2, phase),
  sx: 1 + 0.04 * wave(t, 2, phase + 1),
  sy: 1 + 0.05 * wave(t, 3, phase + 2),
});
/** A gull gliding in slow loops, now and then beating its wings three times. */
const gull = (phase: number, beatAt: number) => (t: number): Partial<GiftLoopPose> => {
  const u = (((t - beatAt) % 1) + 1) % 1;
  const beat = u < 0.24 ? Math.sin((Math.PI * 3 * u) / 0.24) ** 2 : 0;
  return { x: 1.4 * wave(t, 1, phase), y: 0.9 * wave(t, 1, phase + 1.4), rot: 5 * wave(t, 1, phase + 0.6), sy: 1 - 0.5 * beat };
};

/** The ship rolls and heaves about its waterline as its sails fill and ease, aft to fore, and its pennants stream. */
const gemi = giftLoop(5600, {
  rig: carried([4, 3, 98, 76], GEMI_PIVOT, GEMI_PIVOT, gemiShip),
  foreTop: carried([27, 13, 25, 20], [40, 15], GEMI_PIVOT, gemiShip, fill(0.12)),
  mainTop: carried([52, 7, 30, 22], [67.4, 9], GEMI_PIVOT, gemiShip, fill(0.04)),
  foreSail: carried([23, 30, 33, 29], [40, 32], GEMI_PIVOT, gemiShip, fill(0.1)),
  mainSail: carried([47, 26, 39, 36], [67.4, 28], GEMI_PIVOT, gemiShip, fill(0)),
  jib: carried([6, 15, 36, 53], [23, 39], GEMI_PIVOT, gemiShip, fill(0.18, 0.015)),
  foreFlag: carried([26, 6, 15, 7], [40, 11], GEMI_PIVOT, gemiShip, stream(-2, 3, 1.3), 112),
  mainFlag: carried([49, 1, 19, 8], [67, 5], GEMI_PIVOT, gemiShip, stream(-2.5, 2.5, 0), 112),
  hull: carried([10, 50, 95, 41], GEMI_PIVOT, GEMI_PIVOT, gemiShip),
  sea: { box: [1, 84, 118, 19], motion: gemiSwell },
  crests: drift([25, 90, 79, 13], gemiSwell, 0.5, 3),
  crestsNext: drift([37, 94, 56, 8], gemiSwell, 0, 3),
  foam: { box: [10, 83, 21, 8], origin: [20, 87.5], motion: (t) => ({ ...gemiSwell(t), sx: 1 + 0.07 * wave(t, 2, 0.6), sy: 1 + 0.07 * wave(t, 2, 0.6),
    o: 0.88 + 0.12 * wave(t, 2, 2) }) },
  deep: { box: [9, 99, 98, 8], motion: (t) => ({ x: -0.6 * wave(t, 1, 1.4), y: 0.2 * wave(t, 1, 0.6) }) },
  gull: { box: [91, 18, 7, 5], origin: [94.5, 21], samples: 140, motion: gull(0, 0.3) },
  gullNext: { box: [99, 25, 6, 4], origin: [102, 27.2], samples: 140, motion: gull(2.2, 0.72) },
});

// ───────────────────────────────────────────────────────────────────── kelek

const KELEK_PIVOT: Pt = [60, 80];
const kelekRaft = (t: number): Float => ({ x: 0, y: 0.45 * wave(t, 1, -0.6), rot: 0.6 * wave(t, 1, 0.7) });
const kelekSwell = (t: number): Float => ({ x: 0.4 * wave(t, 1, 1.1), y: 0.32 * wave(t, 1), rot: 0 });

/** The raft rides low and heavy on the river, the steersman working the sweep as the current runs past downstream. */
const kelek = giftLoop(5200, {
  raft: carried([10, 37, 99, 49], KELEK_PIVOT, KELEK_PIVOT, kelekRaft),
  sweep: carried([90, 46, 26, 37], [92, 48], KELEK_PIVOT, kelekRaft, (t) => ({ rot: 2.4 * wave(t, 1, -0.3) })),
  river: { box: [3, 77, 114, 16], motion: kelekSwell },
  current: drift([29, 82, 55, 8], kelekSwell, 0.5, -4),
  currentNext: drift([20, 82, 78, 8], kelekSwell, 0, -4),
  lap: { box: [15, 89, 90, 7], motion: (t) => ({ x: -0.5 * wave(t, 1, 1.1), y: 0.15 * wave(t, 1, 0.5) }) },
});

// ─────────────────────────────────────────────────────────────── mala gund

/** The house: smoke curling up from the chimney in four wisps, and the lamplight in its window breathing. */
const mal = giftLoop(5600, {
  lamp: { box: [56, 58, 12, 12], samples: 112, motion: (t) => ({ o: 0.32 + 0.2 * wave(t, 1, -1.2) + 0.1 * flicker(t) }) },
  sill: { box: [52, 58, 20, 16] },
  smoke1: giftLoopWisp([54, 8, 8, 23], [58, 29.6], 0.6, { lift: 7, sway: 1.1, curl: 6, turn: 0.3 }),
  smoke2: giftLoopWisp([58, 14, 7, 17], [59.4, 29.4], 0.35, { lift: 7, sway: 1, curl: 7, turn: 2.4 }),
  smoke3: giftLoopWisp([53, 15, 7, 16], [57.2, 29.8], 0.1, { lift: 8, sway: 1.2, curl: 6, turn: 4.2 }),
  smoke4: giftLoopWisp([56, 9, 8, 22], [58.8, 29.6], 0.85, { lift: 7, sway: 1.1, curl: 5, turn: 5.3 }),
});

// ─────────────────────────────────────────────────────────────────── reşmal

/** A flame licking up from its base: taller and narrower as it flares, leaning this way and that. */
const lick = (shift: number, lean: number) => (t: number): Partial<GiftLoopPose> => {
  const f = flicker(t + shift);
  return { sy: 1 + 0.16 * f, sx: 1 - 0.07 * f, rot: lean * wave(t, 5, shift * TAU) };
};

/** The flap stirring from under the roof's edge, only ever inward, so it never opens a gap at the tent's side. */
const stir = (t: number): Partial<GiftLoopPose> => {
  const gust = 0.5 - 0.5 * Math.cos(TAU * t);
  return { rot: 1.7 * gust * (1 + 0.2 * wave(t, 3)), sx: 1 - 0.012 * gust };
};

/** The tent: its flap stirring in the wind, the fire under the kettle flickering, and the steam off the spout. */
const kon = giftLoop(4400, {
  flap: { box: [97, 61, 17, 37], origin: [104.5, 64.5], samples: 88, motion: stir },
  roof: { box: [6, 34, 108, 66] },
  glow: { box: [96, 96, 15, 8], origin: [103.2, 99.8], samples: 132, motion: (t) => ({ o: 0.75 + 0.25 * flicker(t + 0.1), sx: 1 + 0.06 * flicker(t + 0.1),
    sy: 1 + 0.06 * flicker(t + 0.1) }) },
  stones: { box: [97, 96, 13, 9] },
  flameLeft: { box: [98, 94, 4, 7], origin: [100.8, 99.6], samples: 132, motion: lick(0.37, 4) },
  flameRight: { box: [104, 95, 4, 6], origin: [105.6, 99.8], samples: 132, motion: lick(0.71, 4) },
  flame: { box: [100, 93, 6, 8], origin: [103, 99.6], samples: 132, motion: lick(0, 3) },
  kettle: { box: [98, 88, 13, 11] },
  steam1: giftLoopWisp([107, 72, 5, 19], [110, 89.6], 0.6, { lift: 5, sway: 0.9, curl: 6, turn: 0.8 }),
  steam2: giftLoopWisp([109, 74, 5, 17], [110.4, 89.4], 0.27, { lift: 5, sway: 0.8, curl: 7, turn: 3 }),
  steam3: giftLoopWisp([107, 80, 4, 11], [109.8, 89.8], 0.93, { lift: 5, sway: 0.9, curl: 6, turn: 4.6 }),
});

// ───────────────────────────────────────────────────────────────────── koşk

/** The mansion: the lamp in its arcade swaying a little on its chain, its light breathing, the pomegranate tree stirring. */
const kosk = giftLoop(5200, {
  glow: { box: [46, 69, 18, 34], samples: 104, motion: (t) => ({ o: 0.72 + 0.2 * wave(t, 1, -1.6) + 0.08 * flicker(t) }) },
  lamp: { box: [52, 68, 6, 14], origin: [55, 69], motion: (t) => ({ rot: 3.6 * wave(t, 1) }) },
  upper: { box: [21, 41, 68, 62] },
  tree: { box: [88, 60, 26, 39], origin: [100, 98], motion: (t) => ({ rot: 0.7 * wave(t, 1, 0.5) + 0.25 * wave(t, 3, 1.9) }) },
});

// ──────────────────────────────────────────────────────────────────── keleh

/** A swift wheeling about the keep, banking into its turns and now and then beating its wings. */
const swift = (reach: number, phase: number, beatAt: number) => (t: number): Partial<GiftLoopPose> => {
  const u = (((t - beatAt) % 1) + 1) % 1;
  const beat = u < 0.3 ? Math.sin((Math.PI * 4 * u) / 0.3) ** 2 : 0;
  return { x: reach * wave(t, 1, phase), y: 2.6 * wave(t, 1, phase + Math.PI / 2), rot: 9 * wave(t, 1, phase + Math.PI / 2), sy: 1 - 0.5 * beat };
};

/** The castle: its pennant flying from the keep, lamplight brightening in its windows and the village's, two swifts wheeling. */
const keleh = giftLoop(5000, {
  pennant: { box: [52, 14, 11, 6], origin: [53.26, 16.06], samples: 100, motion: (t) => ({ rot: 4 * wave(t, 2, 0.4) - 1, sx: 1 + 0.05 * wave(t, 2, 1.6),
    sy: 1 + 0.12 * wave(t, 3, 0.9) }) },
  lamps: { box: [32, 34, 58, 26], samples: 100, motion: (t) => ({ o: 0.45 + 0.3 * wave(t, 1, -1) + 0.15 * flicker(t) }) },
  village: { box: [28, 105, 61, 6], samples: 100, motion: (t) => ({ o: 0.45 + 0.3 * wave(t, 1, 1.8) + 0.15 * flicker(t + 0.5) }) },
  swift: { box: [32, 18, 9, 4], origin: [36.4, 19.8], samples: 150, motion: swift(9, 0, 0.15) },
  swiftNext: { box: [69, 10, 8, 4], origin: [73.2, 12.2], samples: 150, motion: swift(-8, 2.1, 0.62) },
});

export const HOMES_LOOPS: Readonly<Partial<Record<GiftArtId, GiftLoop>>> = { belem, mal, kelek, kon, gemi, kosk, keleh };
