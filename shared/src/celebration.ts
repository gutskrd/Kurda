/**
 * One celebration, the same everywhere something is earned — a lesson
 * finished, a goal met, a new level, rank, league or badge.
 *
 * The thing earned arrives on a spring, a soft ring of its colour widens once
 * behind it, a light handful of flecks in its colours is thrown out and falls
 * away, and then the words fade in. All of it is over inside
 * `CELEBRATE_MS` (1.6 s), a tap anywhere skips to the end, and nothing
 * keeps moving afterwards: once the words are there, the screen is still.
 *
 * Under Reduce Motion it is a fade and nothing travels. The buzz is not motion
 * and has its own switch (Settings → Vibration), so it is felt either way.
 *
 * Pure numbers, so the choreography is tested without a screen — and shared,
 * so the phone (theme/CelebrationParts.tsx) and the website
 * (ranks/Celebration.tsx) play the same moment the same way.
 */

/** The whole of it, from the first frame to the last fleck. */
export const CELEBRATE_MS = 1600;
/** A fade (Reduce Motion), and the words arriving. */
const FADE_MS = 200;
const WORDS_MS = 320;

export interface CelebrationPlan {
  /** the art's arrival (a spring, or a fade) */
  artMs: number;
  /** the ring widening once behind the art; 0 for none */
  ringDelayMs: number;
  ringMs: number;
  /** the flecks, from the first thrown to the last gone; 0 for none */
  burstDelayMs: number;
  burstMs: number;
  /** the words */
  detailsDelayMs: number;
  detailsMs: number;
  /** when it is felt: as the art lands */
  hapticAtMs: number;
  /** whether anything moves rather than fades */
  travel: boolean;
}

export function celebrationPlan(reduce: boolean): CelebrationPlan {
  if (reduce) {
    return { artMs: FADE_MS, ringDelayMs: 0, ringMs: 0, burstDelayMs: 0, burstMs: 0, detailsDelayMs: 0, detailsMs: FADE_MS, hapticAtMs: 0, travel: false };
  }
  return {
    artMs: 520,
    ringDelayMs: 160,
    ringMs: 760,
    burstDelayMs: 180,
    burstMs: CELEBRATE_MS - 180,
    detailsDelayMs: 420,
    detailsMs: WORDS_MS,
    hapticAtMs: 200,
    travel: true,
  };
}

/** When the last thing in the plan stops moving. */
export function celebrationEndMs(plan: CelebrationPlan): number {
  return Math.max(plan.artMs, plan.ringDelayMs + plan.ringMs, plan.burstDelayMs + plan.burstMs, plan.detailsDelayMs + plan.detailsMs);
}

/** How many flecks each kind of moment gets: a lesson or a division is a nod, a new tier a little more. */
export const BURST = { lesson: 14, division: 14, badge: 16, placed: 18, league: 18, tier: 22 } as const;

export interface Fleck {
  /** where it is thrown to, from the middle of the art, in points */
  dx: number;
  dy: number;
  /** how far it then falls, in points */
  fall: number;
  /** when it is thrown and when it is gone, as shares (0…1) of the burst */
  start: number;
  end: number;
  /** how far it turns, in degrees */
  spin: number;
  /** a sliver, not a square */
  w: number;
  h: number;
  /** which of the moment's colours (an index into the palette given) */
  colour: number;
}

/** A small deterministic generator, so a moment looks the same each time it plays (and in a test). */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * The flecks, thrown out in a ring from the art and falling away: spread
 * evenly round the circle with a little jitter (so no clump and no gap), a
 * little more upwards than down, each gone before the burst ends.
 */
export function burstPlan(count: number, seed: number, colours: number, reach: number): Fleck[] {
  const rnd = seeded(seed);
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const angle = ((i + rnd() * 0.6) / Math.max(1, count)) * Math.PI * 2;
    const r = reach * (0.55 + rnd() * 0.45);
    const start = rnd() * 0.12;
    return {
      dx: Math.round(Math.cos(angle) * r),
      dy: Math.round(Math.sin(angle) * r * 0.85 - reach * 0.2),
      fall: Math.round(reach * (0.35 + rnd() * 0.35)),
      start,
      end: Math.min(1, start + 0.72 + rnd() * 0.16),
      spin: Math.round((rnd() - 0.5) * 420),
      w: Math.round(4 + rnd() * 3),
      h: Math.round(8 + rnd() * 5),
      colour: Math.floor(rnd() * Math.max(1, colours)),
    };
  });
}
