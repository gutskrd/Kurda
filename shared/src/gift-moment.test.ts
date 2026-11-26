import { describe, expect, it } from 'vitest';
import { GIFTS, giftGlow, giftSku } from './gift-catalogue.js';
import { GIFT_MOMENT_LOOK, GIFT_SENT_LOOK, giftRaysPath, giftSeed, giftSparkles } from './gift-moment.js';
import { GIFT_TIERS } from './gifts.js';

describe('the moment a gift is opened', () => {
  it('grows with the tier: a gentle glow and short rays, then brighter rays and sparkles, then the night sky', () => {
    const { common, rare, grand } = GIFT_MOMENT_LOOK;
    expect(common.sparkles).toBe(0);
    expect(common.sky).toBe(false);
    expect(rare.rayStrength).toBeGreaterThan(common.rayStrength);
    expect(rare.reach).toBeGreaterThan(common.reach);
    expect(rare.sparkles).toBeGreaterThan(0);
    expect(grand.sky).toBe(true);
    expect(grand.rays).toBeGreaterThanOrEqual(rare.rays);
    for (const tier of GIFT_TIERS) {
      const look = GIFT_MOMENT_LOOK[tier];
      expect(look.glow).toBeGreaterThan(0);
      expect(look.glow).toBeLessThanOrEqual(1);
      // slow enough to read as light turning, not a wheel spinning
      expect(look.turnMs).toBeGreaterThanOrEqual(60_000);
    }
  });

  it('keeps the sender’s own small and quiet', () => {
    expect(GIFT_SENT_LOOK.sparkles).toBe(0);
    expect(GIFT_SENT_LOOK.burst).toBe(0);
  });

  it('draws the rays as one path, a wedge for each, inside the box', () => {
    const d = giftRaysPath(12, 0.9);
    expect(d.match(/M/g)).toHaveLength(12);
    expect(d.match(/Z/g)).toHaveLength(12);
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.max(...numbers.map(Math.abs))).toBeLessThanOrEqual(100);
    expect(giftRaysPath(0, 1)).toBe('');
    // the same every time
    expect(giftRaysPath(16, 1)).toBe(giftRaysPath(16, 1));
  });

  it('places the sparkles round the gift, the same for a gift each time', () => {
    const sparkles = giftSparkles(10, giftSeed('gift-heyv'));
    expect(sparkles).toHaveLength(10);
    for (const s of sparkles) {
      const r = Math.hypot(s.x, s.y);
      expect(r).toBeGreaterThanOrEqual(0.49);
      expect(r).toBeLessThanOrEqual(0.91);
      expect(s.offset).toBeGreaterThanOrEqual(0);
      expect(s.offset).toBeLessThanOrEqual(1);
    }
    expect(giftSparkles(10, giftSeed('gift-heyv'))).toEqual(sparkles);
    expect(giftSparkles(10, giftSeed('gift-roj'))).not.toEqual(sparkles);
  });

  it('gives every gift a colour of its own to glow in, and anything else a warm one', () => {
    for (const g of GIFTS) expect(giftGlow(giftSku(g.id)), g.id).toMatch(/^#[0-9a-f]{6}$/);
    expect(giftGlow('gift-heyv')).not.toBe(giftGlow('gift-cay'));
    expect(giftGlow('bg-made-bihar')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
