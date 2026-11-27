/**
 * The living rounds of the warm gifts (gift-art-warm.ts): tea and coffee, the apples, the samovar, the drum and the saz.
 * Each layer named here is painted by the gift's drawing under the same name, back to front.
 */
import { giftLoop, giftLoopSmooth, giftLoopSweepLayers, giftLoopWisp, type GiftLoop, type GiftLoopPlan } from './gift-loop.js';
import type { GiftArtId } from './gift-art.js';

/** Five wisps off the tea, born a fifth of the round apart, so one is always rising as another goes. */
const cay = giftLoop(4200, {
  steam1: giftLoopWisp([46, 6, 10, 31], [51.6, 35], 0.6, { lift: 5, turn: 0.4 }),
  steam2: giftLoopWisp([59, 10, 8, 28], [61, 35.6], 0.8, { lift: 6, turn: 2.2 }),
  steam3: giftLoopWisp([68, 18, 7, 18], [69.6, 34], 0.45, { lift: 7, curl: 9, turn: 4 }),
  steam4: giftLoopWisp([53, 8, 9, 29], [56.2, 35.2], 0.2, { lift: 6, turn: 5.1 }),
  steam5: giftLoopWisp([61, 15, 8, 22], [65.6, 35], 0.0, { lift: 7, turn: 1.3 }),
});

const TAU = Math.PI * 2;

/** Four wisps off the coffee, the tallest at its fullest as the round begins. */
const qehwe = giftLoop(4200, {
  steam1: giftLoopWisp([49, 18, 10, 33], [55, 49], 0.6, { lift: 6, turn: 0.8 }),
  steam2: giftLoopWisp([63, 28, 8, 24], [65, 49.6], 0.85, { lift: 6, turn: 2.6 }),
  steam3: giftLoopWisp([57, 21, 8, 31], [60, 49.4], 0.2, { lift: 6, turn: 4.4 }),
  steam4: giftLoopWisp([66, 32, 7, 19], [70, 48.6], 0.4, { lift: 7, curl: 9, turn: 1.7 }),
});

/** The samovar: light runs across its brass urn now and then, while steam curls off the teapot's spout and lid. */
const semawer = giftLoop(4800, {
  ...giftLoopSweepLayers(['glint1', 'glint2', 'glint3', 'glint4', 'glint5'], [[31, 41, 8, 42], [38, 41, 7, 47], [45, 41, 7, 47], [52, 41, 7, 47], [59, 41, 7, 43]], 900, 2400, 1),
  steam1: giftLoopWisp([67, 5, 8, 15], [69, 17.6], 0.55, { lift: 4, sway: 0.9, turn: 1 }),
  steam2: giftLoopWisp([46, 5, 7, 11], [51, 14.4], 0.2, { lift: 4, sway: 0.8, turn: 3.2 }),
  steam3: giftLoopWisp([66, 4, 8, 15], [71, 17], 0.9, { lift: 4, sway: 0.9, turn: 5 }),
});

/** Where `p` goes when turned `deg` degrees about `c`, less where it was: what a part riding on a turning one moves by. */
function carried(c: readonly [number, number], p: readonly [number, number], deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [p[0] - c[0], p[1] - c[1]];
  return { x: c[0] + dx * Math.cos(a) - dy * Math.sin(a) - p[0], y: c[1] + dx * Math.sin(a) + dy * Math.cos(a) - p[1] };
}

const SEV_FOOT = [60, 98.6] as const;
const SEV_STALK = [55.8, 31.4] as const;
const SEV_GLINT = [39, 56.4] as const;
const rock = (t: number): number => 2.4 * Math.sin(TAU * t);

/** The apple rocks gently where it stands, its leaves fluttering on as it does, and a glint comes and goes on its skin. */
const sev = giftLoop(4000, {
  apple: { box: [19, 26, 76, 76], origin: SEV_FOOT, motion: (t) => ({ rot: rock(t) }) },
  leaves: { box: [34, 12, 49, 22], origin: SEV_STALK, motion: (t) => ({ ...carried(SEV_FOOT, SEV_STALK, rock(t)), rot: rock(t) + 3 * Math.sin(TAU * 2 * t + 0.6) }) },
  glint: {
    box: [33, 51, 12, 11],
    origin: SEV_GLINT,
    samples: 60,
    motion: (t) => {
      const flare = Math.exp(-Math.pow((t - 0.32) / 0.07, 2));
      return { ...carried(SEV_FOOT, SEV_GLINT, rock(t)), rot: rock(t) + 30 * Math.sin(TAU * (t - 0.32)), sx: 0.4 + 0.7 * flare, sy: 0.4 + 0.7 * flare, o: flare };
    },
  },
});

const SEV_MEXEK_GLINT = [45.8, 57] as const;
/** A glint's flare about its peak `at`, `width` of the round wide. */
const peakAt = (t: number, at: number, width: number): number => Math.exp(-Math.pow((t - at) / width, 2));

/** The shine on the clove apple's heart beats twice, as a heart does, then rests. */
const sevMexek = giftLoop(3200, {
  glint: {
    box: [40, 51, 12, 12],
    origin: SEV_MEXEK_GLINT,
    samples: 60,
    motion: (t) => {
      const beat = peakAt(t, 0.34, 0.045) + 0.75 * peakAt(t, 0.5, 0.045);
      return { rot: 25 * Math.sin(TAU * (t - 0.42)), sx: 0.4 + 0.7 * beat, sy: 0.4 + 0.7 * beat, o: Math.min(1, beat) };
    },
  },
});

/** How long ago, as a share of the round, the beat at `at` fell. */
const since = (t: number, at: number): number => (((t - at) % 1) + 1) % 1;
/** A beat's strike: up at once, dying away over `fade`, and wholly gone long before the next round. */
const strike = (d: number, fade: number): number => (d < 0.6 ? Math.exp(-d / fade) * giftLoopSmooth(d / 0.045) : 0);
const DUM = 0.08;
const TEK = 0.56;
const DRUM_MIDDLE = [56.9, 57.3] as const;

/** A ring running out over the drum's skin from its middle after a beat, fading as it widens. */
function ripple(box: GiftLoopPlan['box'], at: number, strength: number): GiftLoopPlan {
  return {
    box,
    origin: DRUM_MIDDLE,
    samples: 64,
    from: { o: 0 },
    motion: (t) => {
      const d = since(t, at);
      const s = 0.3 + 1.15 * Math.min(1, d / 0.42);
      return { sx: s, sy: s, o: d < 0.42 ? strength * giftLoopSmooth(d / 0.05) * Math.pow(1 - d / 0.42, 1.4) : 0 };
    },
  };
}

/**
 * The frame drum: a deep beat and a lighter one, the skin swelling a little at each strike, a ring running out over it,
 * the henna star glowing up and settling, and the tassel set swinging.
 */
const def = giftLoop(3200, {
  drum: {
    box: [17, 12, 87, 91],
    origin: DRUM_MIDDLE,
    samples: 64,
    motion: (t) => {
      const s = 1 + 0.011 * strike(since(t, DUM), 0.07) + 0.006 * strike(since(t, TEK), 0.07);
      return { sx: s, sy: s };
    },
  },
  ripple1: ripple([35, 33, 43, 49], DUM, 0.75),
  ripple2: ripple([36, 33, 43, 49], TEK, 0.45),
  star: {
    box: [42, 40, 30, 35],
    origin: DRUM_MIDDLE,
    samples: 64,
    motion: (t) => {
      const glow = Math.max(strike(since(t, DUM), 0.16), 0.7 * strike(since(t, TEK), 0.14));
      return { o: 0.12 + 0.88 * glow, sx: 1 + 0.05 * glow, sy: 1 + 0.05 * glow };
    },
  },
  tassel: {
    box: [96, 64, 8, 30],
    origin: [99, 66],
    samples: 64,
    motion: (t) => {
      const swing = (d: number, k: number): number => k * Math.exp(-d / 0.22) * Math.sin((TAU * d) / 0.38) * (d < 0.6 ? 1 : 1 - giftLoopSmooth((d - 0.6) / 0.3));
      return { rot: 5 * (swing(since(t, DUM + 0.02), 1) + swing(since(t, TEK + 0.02), 0.6)) };
    },
  },
});

/** A note drawn at its middle height that rises `rise` from the instrument, drifting `drift` across, and is gone. */
function note(box: GiftLoopPlan['box'], at: readonly [number, number], born: number, rise: number, drift: number): GiftLoopPlan {
  return {
    box,
    origin: at,
    wrap: born,
    samples: 60,
    motion: (t) => {
      const u = (((t - born) % 1) + 1) % 1;
      const seen = u < 0.2 ? giftLoopSmooth(u / 0.2) : u < 0.55 ? 1 : 1 - giftLoopSmooth((u - 0.55) / 0.4);
      return { y: rise * (0.5 - u), x: drift * (0.5 - u) + 1.2 * Math.sin(TAU * u), rot: 12 * Math.sin(TAU * u + 0.5), o: seen };
    },
  };
}

/** Where each stretch of the saz's strings lights, as boxes up its neck. */
const SHIMMER_BOXES: Array<GiftLoopPlan['box']> = [[25, 84, 17, 20], [34, 72, 18, 20], [45, 58, 19, 22], [56, 46, 18, 20], [67, 34, 17, 20]];

/** The saz: its strings ring, the light running up them, the tassel swaying, and a note or two rising into the air. */
const saz = giftLoop(4400, {
  tassel: { box: [88, 28, 7, 19], origin: [91, 29.2], motion: (t) => ({ rot: 3.2 * Math.sin(TAU * t - 0.4) }) },
  ...giftLoopSweepLayers(['shimmer1', 'shimmer2', 'shimmer3', 'shimmer4', 'shimmer5'], SHIMMER_BOXES, 200, 1500, 1),
  note1: note([26, 39, 11, 14], [30, 50], 0.62, 24, 8),
  note2: note([13, 16, 9, 12], [16, 25], 0.12, 22, 4),
});

export const WARM_LOOPS: Readonly<Partial<Record<GiftArtId, GiftLoop>>> = { cay, qehwe, sev, semawer, def, saz, 'sev-mexek': sevMexek };
