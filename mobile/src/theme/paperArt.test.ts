import { describe, expect, it } from 'vitest';
import { PALETTES } from './palette';
import { paperArt } from './paperArt';

describe('the games page’s paper drawings', () => {
  it('cut them from light paper with their marks in ink in both schemes, never in gold', () => {
    const luminance = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    for (const scheme of ['light', 'dark'] as const) {
      const colors = PALETTES[scheme];
      const art = paperArt(colors, scheme === 'dark');
      // the paper is light and its tiles and places dark, whichever page it sits on
      expect(luminance(art.paper), scheme).toBeGreaterThan(0.75);
      expect(luminance(art.ink), scheme).toBeLessThan(0.2);
      expect(art.paper.toLowerCase()).not.toBe(colors.gold.toLowerCase());
      // by day it is lighter than the card and edged; by night the paper stands out on its own
      if (scheme === 'light') {
        expect(luminance(art.paper)).toBeGreaterThan(luminance(colors.surface));
        expect(art.edge).not.toBeNull();
      } else expect(art.edge).toBeNull();
    }
  });
});
