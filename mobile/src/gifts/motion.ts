import { GIFT_REDUCED_MOTION_MS, GIFT_UNWRAP_MS, type GiftTier } from '@kurda/shared';

/**
 * The unwrap's choreography, as numbers — pure, so it can be tested without a
 * screen, and the same every time a tier plays.
 *
 * One progress value runs 0 → 1 over the tier's `GIFT_UNWRAP_MS`; everything
 * on screen is an interpolation of it, so the whole moment runs on the native
 * driver (transform and opacity only) and a skip is one `setValue(1)`.
 */

export interface UnwrapPlan {
  durationMs: number;
  /** where in the progress the lid comes off (the haptic tick is here) */
  popAt: number;
  particles: Particle[];
  /** the legendary's flame behind the box */
  flame: boolean;
  /** how the gift is shown: in a card at the bubble's scale, a sheet, or the whole screen */
  stage: 'card' | 'sheet' | 'full';
}

export interface Particle {
  kind: 'seed' | 'spark';
  /** where it ends, from the centre, in points */
  dx: number;
  dy: number;
  /** turns while it flies (degrees) */
  spin: number;
  size: number;
  /** when it sets off, as a share of the progress */
  delay: number;
}

const COUNT: Record<GiftTier, number> = { common: 8, rare: 18, legendary: 30 };
const REACH: Record<GiftTier, number> = { common: 70, rare: 130, legendary: 190 };
const STAGE: Record<GiftTier, UnwrapPlan['stage']> = { common: 'card', rare: 'sheet', legendary: 'full' };

/** A tiny deterministic generator, so a tier's burst looks the same each time (and in a test). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function unwrapPlan(tier: GiftTier, reduceMotion: boolean): UnwrapPlan {
  if (reduceMotion) {
    return { durationMs: GIFT_REDUCED_MOTION_MS, popAt: 0, particles: [], flame: false, stage: STAGE[tier] };
  }
  const rand = seeded(tier.length * 7919);
  const particles: Particle[] = Array.from({ length: COUNT[tier] }, (_, i) => {
    const angle = (i / COUNT[tier]) * Math.PI * 2 + rand() * 0.5;
    const reach = REACH[tier] * (0.55 + rand() * 0.45);
    return {
      kind: i % 3 === 0 ? 'spark' : 'seed',
      dx: Math.cos(angle) * reach,
      // a little more upward than down: the seeds are thrown, then they fall
      dy: Math.sin(angle) * reach * 0.8 - reach * 0.15,
      spin: (rand() - 0.5) * 540,
      size: i % 3 === 0 ? 10 + rand() * 6 : 8 + rand() * 4,
      delay: rand() * 0.08,
    };
  });
  return { durationMs: GIFT_UNWRAP_MS[tier], popAt: 0.4, particles, flame: tier === 'legendary', stage: STAGE[tier] };
}

/** The send animation: the present appears, holds, and flies into the chat. */
export const SEND_FLY_MS = 900;
