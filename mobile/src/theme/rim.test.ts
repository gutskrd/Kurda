import { describe, expect, it } from 'vitest';
import { rimBand } from './rim';
import { radii } from './tokens';

describe('rimBand', () => {
  /*
   * The one that actually happened.
   *
   * `radii.pill` is 999. Sized off it without a cap, the band is 180 points
   * wide, which on a thirty-point capsule is not an edge — it is the entire
   * surface, painted orange down one side and violet down the other. The
   * segmented control shipped like that for about ten minutes.
   */
  it('does not believe radii.pill', () => {
    expect(radii.pill).toBe(999);
    expect(rimBand(radii.pill)).toBeLessThanOrEqual(6);
  });

  it('is a thin edge for every real radius on the scale', () => {
    for (const [name, r] of Object.entries(radii)) {
      if (name === 'pill') continue;
      expect(rimBand(r), name).toBeLessThanOrEqual(5);
      expect(rimBand(r), name).toBeGreaterThanOrEqual(2);
    }
  });

  /* A capsule half of whose height is the radius: 15 gives 3, not 2 and not 6. */
  it('scales with the surface between the floor and the cap', () => {
    expect(rimBand(4)).toBe(2);
    expect(rimBand(15)).toBe(3);
    expect(rimBand(30)).toBe(5);
    expect(rimBand(100)).toBe(6);
  });
});
