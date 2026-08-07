import { describe, expect, it } from 'vitest';
import { MAX_FONT_SCALE, MIN_FONT_SCALE, clampFontScale, scaledFontSize } from './dynamicType';

describe('clampFontScale', () => {
  it('passes through a scale already in range', () => {
    expect(clampFontScale(1)).toBe(1);
    expect(clampFontScale(1.3)).toBe(1.3);
  });

  it('caps oversized OS scales so layouts survive', () => {
    expect(clampFontScale(2)).toBe(MAX_FONT_SCALE);
    expect(clampFontScale(3.1)).toBe(MAX_FONT_SCALE); // iOS largest accessibility sizes
  });

  it('floors tiny scales', () => {
    expect(clampFontScale(0.5)).toBe(MIN_FONT_SCALE);
  });

  it('honours custom bounds', () => {
    expect(clampFontScale(2, { max: 1.3 })).toBe(1.3);
    expect(clampFontScale(1.5, { max: 1.3 })).toBe(1.3);
    expect(clampFontScale(0.9, { min: 1 })).toBe(1);
  });

  it('falls back to a neutral scale for garbage input', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const v = clampFontScale(bad);
      expect(v).toBeGreaterThanOrEqual(MIN_FONT_SCALE);
      expect(v).toBeLessThanOrEqual(MAX_FONT_SCALE);
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('scaledFontSize', () => {
  it('scales a base size by the clamped OS scale, rounded to a whole px', () => {
    expect(scaledFontSize(16, 1)).toBe(16);
    expect(scaledFontSize(16, 1.25)).toBe(20);
    expect(scaledFontSize(17, 1.1)).toBe(19); // 18.7 → 19
  });

  it('respects the clamp when scaling', () => {
    expect(scaledFontSize(20, 5)).toBe(Math.round(20 * MAX_FONT_SCALE));
    expect(scaledFontSize(20, 5, { max: 1.3 })).toBe(26);
  });
});
