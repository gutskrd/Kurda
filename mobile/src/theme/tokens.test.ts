import { describe, expect, it } from 'vitest';
import { MAX_FONT_SCALE } from '../a11y/dynamicType';
import * as tokens from './tokens';
import { fontScaleCap, radii, spacing, typography } from './tokens';

describe('design tokens', () => {
  // Colours belong to the palette, one set per scheme.
  it('holds no colours of its own', () => {
    expect(Object.keys(tokens)).not.toContain('colors');
  });

  it('spacing and radii scales are ascending', () => {
    const asc = (values: number[]) =>
      values.every((v, i) => i === 0 || v > (values[i - 1] as number));
    expect(asc(Object.values(spacing))).toBe(true);
    expect(asc(Object.values(radii))).toBe(true);
    expect(asc(Object.values(typography.sizes))).toBe(true);
  });

  // A cap is for text in a box that cannot grow: it still allows growth, never shrinks, and stays under the 1.6 the app's clamp allows (a11y/dynamicType).
  it('lets capped text still grow with the reader’s text size, a title further than a letter in a box', () => {
    for (const [name, cap] of Object.entries(fontScaleCap)) {
      expect(cap, name).toBeGreaterThan(1);
      expect(cap, name).toBeLessThan(MAX_FONT_SCALE);
    }
    expect(fontScaleCap.heading).toBeGreaterThan(fontScaleCap.fixedBox);
  });
});
