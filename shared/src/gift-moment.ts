/**
 * The moment a gift is opened, the same on the website and the phone: the backdrop dims, the gift springs in large in
 * the middle on a round glow of its own colour, a ring of light rays turns slowly behind it, and light sparkles drift.
 * The tier sets how strong it is: a common gift has a gentle glow and short rays, a rare one brighter rays and sparkles,
 * a grand one its night sky with the rays as well. The sender sees a smaller, shorter one as a gift goes. Under Reduce
 * Motion the glow and rays are there and nothing moves. Pure numbers and one path, so both apps draw it alike and the
 * tests need no screen.
 */
import { BURST } from './celebration.js';
import type { GiftTier } from './gifts.js';

export interface GiftMomentLook {
  /** the glow's strength at its middle, 0–1 */
  glow: number;
  /** how wide the glow is, as a multiple of the gift's picture */
  halo: number;
  /** how many rays */
  rays: number;
  /** how far the long rays reach, as a share of the stage's half-width; every other ray is shorter */
  reach: number;
  /** the rays' strength at their root, 0–1 */
  rayStrength: number;
  /** light sparkles drifting round the gift; 0 for none */
  sparkles: number;
  /** one slow turn of the rays */
  turnMs: number;
  /** flecks thrown once as the gift lands (shared `BURST`); 0 for none */
  burst: number;
  /** a grand gift's night sky behind it all */
  sky: boolean;
}

/** Each tier's moment, from a gentle glow to the full night sky. A legendary gift (a season's own) is a rare one's, fuller. */
export const GIFT_MOMENT_LOOK: Readonly<Record<GiftTier, GiftMomentLook>> = {
  common: { glow: 0.5, halo: 1.9, rays: 12, reach: 0.62, rayStrength: 0.3, sparkles: 0, turnMs: 90_000, burst: 0, sky: false },
  rare: { glow: 0.7, halo: 2.2, rays: 16, reach: 0.9, rayStrength: 0.5, sparkles: 8, turnMs: 70_000, burst: BURST.badge, sky: false },
  legendary: { glow: 0.75, halo: 2.3, rays: 16, reach: 0.95, rayStrength: 0.55, sparkles: 10, turnMs: 70_000, burst: BURST.placed, sky: false },
  grand: { glow: 0.85, halo: 2.4, rays: 20, reach: 1, rayStrength: 0.6, sparkles: 14, turnMs: 80_000, burst: BURST.tier, sky: true },
};

/** The sender's own as a gift goes: the same glow and rays, smaller, still and soon gone. */
export const GIFT_SENT_LOOK: GiftMomentLook = { ...GIFT_MOMENT_LOOK.common, sparkles: 0, burst: 0 };

/** How long the sender's moment stays before it fades, and the fade; under Reduce Motion it is shown, then gone. */
export const GIFT_SENT_MS = 1300;
export const GIFT_SENT_FADE_MS = 260;

/** The moment's timing: the gift's spring, the rays' arrival and the words after them. */
export const GIFT_MOMENT_MS = {
  /** the gift springing in */
  pop: 560,
  /** the rays and glow coming up behind it */
  raysIn: 700,
  /** the title, the name and the buttons, after the gift has landed */
  wordsDelay: 360,
  words: 280,
  /** one sparkle's drift, rising and fading */
  sparkle: 2600,
} as const;

/**
 * The rays as one SVG path in a 200 × 200 box centred on 0,0: thin wedges from near the middle out to `reach` of the
 * box's half-width, every other one shorter, so a ring of them reads as light and not a wheel. Filled with a radial
 * gradient of the gift's colour, it fades out along each ray.
 */
export function giftRaysPath(count: number, reach: number): string {
  const n = Math.max(0, Math.round(count));
  if (n === 0) return '';
  const step = (Math.PI * 2) / n;
  const inner = 14;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const at = i * step - Math.PI / 2;
    const outer = 100 * reach * (i % 2 === 0 ? 1 : 0.72);
    // wide at the tip and narrow at the root, a third of the gap between rays at most
    const tip = step * 0.22;
    const root = step * 0.06;
    const pt = (r: number, a: number): string => `${round(Math.cos(a) * r)} ${round(Math.sin(a) * r)}`;
    parts.push(`M${pt(inner, at - root)}L${pt(outer, at - tip)}L${pt(outer, at + tip)}L${pt(inner, at + root)}Z`);
  }
  return parts.join('');
}

const round = (v: number): number => Math.round(v * 100) / 100;

export interface GiftSparkle {
  /** where it starts, as shares (−1…1) of the glow's radius from the middle */
  x: number;
  y: number;
  /** its size, in points */
  size: number;
  /** how far it rises over one drift, as a share of the glow's radius */
  rise: number;
  /** when in the drift it starts, as a share (0…1), so they do not all rise at once */
  offset: number;
}

/** A small deterministic generator, so a gift's sparkles sit the same each time it is opened, and in tests. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** The sparkles round the gift: spread evenly round a ring, outside the picture and inside the glow. */
export function giftSparkles(count: number, seed: number): GiftSparkle[] {
  const rnd = seeded(seed);
  const n = Math.max(0, Math.round(count));
  return Array.from({ length: n }, (_, i) => {
    const angle = ((i + rnd() * 0.7) / Math.max(1, n)) * Math.PI * 2;
    const r = 0.5 + rnd() * 0.4;
    return {
      x: round(Math.cos(angle) * r),
      y: round(Math.sin(angle) * r),
      size: Math.round(5 + rnd() * 6),
      rise: round(0.12 + rnd() * 0.14),
      offset: round(rnd()),
    };
  });
}

/** A seed from a gift's sku, so each gift's sparkles sit their own way. */
export function giftSeed(sku: string): number {
  let h = 7;
  for (let i = 0; i < sku.length; i++) h = (h * 31 + sku.charCodeAt(i)) >>> 0;
  return h;
}
