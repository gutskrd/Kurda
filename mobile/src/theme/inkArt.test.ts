import { describe, expect, it } from 'vitest';
import { PALETTES } from './palette';
import { inkArt } from './inkArt';

describe('the games page’s ink drawings', () => {
  it('are dark on the light page and light on the dark one, with their marks in the card’s colour', () => {
    const luminance = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const light = inkArt(PALETTES.light);
    const dark = inkArt(PALETTES.dark);
    expect(luminance(light.body)).toBeLessThan(0.2);
    expect(luminance(dark.body)).toBeGreaterThan(0.75);
    for (const scheme of ['light', 'dark'] as const) {
      const colors = PALETTES[scheme];
      const art = inkArt(colors);
      // the marks read as holes through to the card, and the stub sits between the two
      expect(art.marks.toLowerCase(), scheme).toBe(colors.surface.toLowerCase());
      expect(Math.abs(luminance(art.body) - luminance(art.marks)), scheme).toBeGreaterThan(0.6);
      const [p, d, c] = [art.body, art.stub, art.marks].map(luminance);
      expect((d! - p!) * (d! - c!), scheme).toBeLessThan(0);
      expect(art.body.toLowerCase()).not.toBe(colors.gold.toLowerCase());
    }
  });
});
