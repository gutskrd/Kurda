import { describe, expect, it } from 'vitest';
import { COUNTRIES } from './countries.js';
import { flagDataUrl, flagSvg } from './flags.js';

describe('flags', () => {
  it('has a flag for every country a profile can name', () => {
    expect(COUNTRIES.filter((c) => !flagSvg(c.code)).map((c) => c.code)).toEqual([]);
  });

  it('draws every flag in 3:2 and as nothing but shapes', () => {
    for (const { code } of COUNTRIES) {
      const svg = flagSvg(code)!;
      const [, , w = 0, h = 1] = (svg.match(/^<svg [^>]*viewBox="([^"]+)"/)?.[1] ?? '').split(' ').map(Number);
      expect(w / h, code).toBeCloseTo(1.5, 2);
      expect(svg, code).not.toMatch(/<script|<image|<foreignObject|href=|on[a-z]+=/i);
    }
  });

  it('draws Kurdistan’s flag itself: three bands and a sun of twenty-one rays', () => {
    const svg = flagSvg('ku')!;
    expect(svg).toContain('#ED2024');
    expect(svg).toContain('#278E43');
    expect(svg.match(/Z/g)).toHaveLength(21);
  });

  it('has nothing for a code that is not a country’s', () => {
    expect(flagSvg('XX')).toBeNull();
    expect(flagSvg('nl"><script>')).toBeNull();
    expect(flagDataUrl('')).toBeNull();
  });

  it('gives a picture address an image can show', () => {
    expect(flagDataUrl('NL')).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  });
});
