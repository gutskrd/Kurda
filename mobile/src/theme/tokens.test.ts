import { describe, expect, it } from 'vitest';
import { colors, KURDISH_CHARSET, radii, spacing, typography } from './tokens';

describe('design tokens', () => {
  it('defines all colors as hex values', () => {
    for (const [name, value] of Object.entries(colors)) {
      expect(value, `color ${name}`).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('spacing and radii scales are ascending', () => {
    const asc = (values: number[]) =>
      values.every((v, i) => i === 0 || v > (values[i - 1] as number));
    expect(asc(Object.values(spacing))).toBe(true);
    expect(asc(Object.values(radii))).toBe(true);
    expect(asc(Object.values(typography.sizes))).toBe(true);
  });

  it('the Kurdish charset covers every special letter in both cases', () => {
    for (const ch of ['Ê', 'ê', 'Î', 'î', 'Û', 'û', 'Ç', 'ç', 'Ş', 'ş']) {
      expect(KURDISH_CHARSET).toContain(ch);
    }
  });
});
