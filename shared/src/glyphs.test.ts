import { describe, expect, it } from 'vitest';
import { HEVALO_GLYPHS } from './glyphs.js';

describe('Hevalo’s own glyphs', () => {
  it('start every shape with a moveto and keep it inside the 256 box', () => {
    for (const [name, paths] of Object.entries(HEVALO_GLYPHS)) {
      for (const d of paths) {
        expect(d.startsWith('M'), name).toBe(true);
        // Absolute points only: every number after a capital M, A end point or relative step stays in the box.
        const moves = [...d.matchAll(/M(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
        for (const [x, y] of moves) {
          expect(x, name).toBeGreaterThanOrEqual(8);
          expect(x, name).toBeLessThanOrEqual(248);
          expect(y, name).toBeGreaterThanOrEqual(8);
          expect(y, name).toBeLessThanOrEqual(248);
        }
      }
    }
  });
});
