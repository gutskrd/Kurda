import { describe, expect, it } from 'vitest';
import { HUES, HUE_NAMES, hueSteps, isHueName, type HueScheme } from './hues.js';

/** WCAG relative luminance of `#rrggbb`. */
function luminance(hex: string): number {
  const channel = (at: number): number => {
    const v = parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SCHEMES: readonly HueScheme[] = ['light', 'dark'];

describe('the hues', () => {
  it('gives every hue its four steps in both themes, as six-digit colours', () => {
    for (const scheme of SCHEMES) {
      expect(Object.keys(HUES[scheme])).toEqual([...HUE_NAMES]);
      for (const name of HUE_NAMES) {
        for (const step of Object.values(hueSteps(scheme, name))) expect(step).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('writes a hue’s deep shade on its tint and on its wash at 7:1 or better', () => {
    for (const scheme of SCHEMES) {
      for (const name of HUE_NAMES) {
        const { tint, wash, deep } = hueSteps(scheme, name);
        expect(contrast(deep, tint), `${scheme} ${name} on its tint`).toBeGreaterThanOrEqual(7);
        expect(contrast(deep, wash), `${scheme} ${name} on its wash`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('keeps the steps in order: pale grounds by day, deep ones by night', () => {
    for (const name of HUE_NAMES) {
      const day = hueSteps('light', name);
      expect(luminance(day.tint)).toBeGreaterThan(luminance(day.wash));
      expect(luminance(day.wash)).toBeGreaterThan(luminance(day.base));
      expect(luminance(day.base)).toBeGreaterThan(luminance(day.deep));
      const night = hueSteps('dark', name);
      expect(luminance(night.tint)).toBeLessThan(luminance(night.wash));
      expect(luminance(night.wash)).toBeLessThan(luminance(night.base));
      expect(luminance(night.base)).toBeLessThan(luminance(night.deep));
    }
  });

  it('knows a hue’s name from anything else', () => {
    expect(isHueName('teal')).toBe(true);
    expect(isHueName('beige')).toBe(false);
    expect(isHueName(undefined)).toBe(false);
  });
});
