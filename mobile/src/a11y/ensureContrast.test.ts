import { describe, expect, it } from 'vitest';
import { AA_NORMAL, AAA_NORMAL, contrastRatio, relativeLuminance } from './contrast';
import { ensureContrast } from './ensureContrast';

const HEX = /^#[0-9a-f]{6}$/;

describe('ensureContrast', () => {
  it('leaves an already-compliant colour unchanged', () => {
    expect(ensureContrast('#000000', '#FFFFFF', AA_NORMAL).toLowerCase()).toBe('#000000');
    // brand green already clears AA against white
    expect(ensureContrast('#2D6A4F', '#FFFFFF', AA_NORMAL).toLowerCase()).toBe('#2d6a4f');
  });

  it('darkens a low-contrast colour until it meets the target against white', () => {
    // teal at 5.01:1 vs white fails AAA (7:1)
    const fixed = ensureContrast('#147D6F', '#FFFFFF', AAA_NORMAL);
    expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(AAA_NORMAL);
    // it moved darker (lower luminance) since the counterpart is white
    expect(relativeLuminance(fixed)).toBeLessThan(relativeLuminance('#147D6F'));
  });

  it('lightens when the counterpart is dark', () => {
    const fixed = ensureContrast('#333333', '#000000', AAA_NORMAL);
    expect(contrastRatio(fixed, '#000000')).toBeGreaterThanOrEqual(AAA_NORMAL);
    expect(relativeLuminance(fixed)).toBeGreaterThan(relativeLuminance('#333333'));
  });

  it('brings every AA-only avatar colour up to AAA against white', () => {
    const palette = ['#2D6A4F', '#1B6E8C', '#8E44AD', '#C0392B', '#8A5A0B', '#2C3E50', '#147D6F', '#A83279'];
    for (const c of palette) {
      const fixed = ensureContrast(c, '#FFFFFF', AAA_NORMAL);
      expect(fixed).toMatch(HEX);
      expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(AAA_NORMAL);
    }
  });

  it('is deterministic', () => {
    expect(ensureContrast('#147D6F', '#FFFFFF', AAA_NORMAL)).toBe(ensureContrast('#147D6F', '#FFFFFF', AAA_NORMAL));
  });

  it('returns a valid hex even when the target is unreachable', () => {
    // nothing contrasts 21:1 with mid-grey → best effort, no throw
    const fixed = ensureContrast('#808080', '#808080', 21);
    expect(fixed).toMatch(HEX);
  });
});
