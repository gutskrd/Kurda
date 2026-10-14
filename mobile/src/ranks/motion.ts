/**
 * The celebrations' choreography, as numbers (no React Native): how long each
 * part takes, and where the flecks fall. Kept calm on purpose — a few flecks
 * drifting down once, not a burst that fills the screen — and nothing at all
 * moves under Reduce Motion: the moment is a fade.
 */

export interface Fleck {
  /** across the stage, 0 (left) … 1 (right) */
  x: number;
  /** how far below the top it comes to rest, 0 … 1 of the stage */
  fall: number;
  /** ms before it starts */
  delay: number;
  /** ms it takes to fall */
  duration: number;
  /** how far it turns on the way, in degrees */
  spin: number;
  /** width and height in points; a sliver, not a square */
  w: number;
  h: number;
  /** which of the tier's colours (an index into the palette given) */
  colour: number;
  /** a sideways drift on the way down, in points */
  drift: number;
}

/** A small deterministic generator, so a celebration looks the same each time it plays (and in a test). */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** How many flecks each kind of moment gets: a division is a nod, a new tier a little more. */
export const FLECKS = { division: 14, tier: 22, placed: 18, badge: 16 } as const;

export function confettiPlan(count: number, seed: number, colours: number): Fleck[] {
  const rnd = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    // spread evenly across the width with a little jitter, so no clump and no gap
    const lane = (i + 0.5) / count;
    return {
      x: Math.max(0.03, Math.min(0.97, lane + (rnd() - 0.5) / count)),
      fall: 0.55 + rnd() * 0.4,
      delay: Math.round(rnd() * 500),
      duration: Math.round(2200 + rnd() * 1200),
      spin: Math.round((rnd() - 0.5) * 540),
      w: Math.round(4 + rnd() * 3),
      h: Math.round(9 + rnd() * 6),
      colour: Math.floor(rnd() * Math.max(1, colours)),
      drift: Math.round((rnd() - 0.5) * 40),
    };
  });
}

export interface RevealPlan {
  /** the emblem's own entrance */
  emblemMs: number;
  /** the words, after the emblem */
  textDelayMs: number;
  /** when the light tick is felt, from the start; null for none */
  hapticAtMs: number | null;
  confetti: boolean;
  rays: boolean;
}

/** The reveal: a scale and a glow for the emblem, the words after it, one light tick; a fade under Reduce Motion. */
export function revealPlan(reduce: boolean): RevealPlan {
  if (reduce) return { emblemMs: 200, textDelayMs: 0, hapticAtMs: null, confetti: false, rays: false };
  return { emblemMs: 650, textDelayMs: 380, hapticAtMs: 320, confetti: true, rays: true };
}

/** How long the points take to count up, by how far they move: short moves are quick, long ones never drag. */
export function countUpMs(delta: number, reduce: boolean): number {
  if (reduce) return 0;
  const d = Math.abs(Math.round(delta));
  if (d === 0) return 0;
  return Math.round(Math.min(1400, 500 + d * 18));
}
