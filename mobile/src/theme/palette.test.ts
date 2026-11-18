import { describe, expect, it } from 'vitest';
import { DARK, LIGHT, PALETTES, type Palette } from './palette';

const HEX = /^#[0-9a-f]{6}$/i;
const CSS_COLOR = /^(#[0-9a-f]{6}|rgba?\()/i;
const HEX_KEYS: (keyof Palette)[] = [
  'primary',
  'accent',
  'gold',
  'danger',
  'success',
  'textPrimary',
  'textSecondary',
  'textOnPrimary',
  'textOnGold',
  'background',
];

describe('palettes', () => {
  it('light and dark expose exactly the same keys', () => {
    expect(Object.keys(LIGHT).sort()).toEqual(Object.keys(DARK).sort());
  });

  it('brand + text + background colours are valid hex in both schemes', () => {
    for (const p of [LIGHT, DARK]) {
      for (const k of HEX_KEYS) {
        expect(String(p[k]), `${p.scheme}.${String(k)}`).toMatch(HEX);
      }
    }
  });

  it('the spatial gradient has three colour stops', () => {
    for (const p of [LIGHT, DARK]) {
      expect(p.gradient).toHaveLength(3);
      for (const stop of p.gradient) expect(stop).toMatch(HEX);
    }
  });

  it('glass + clay fills are usable CSS colours', () => {
    for (const p of [LIGHT, DARK]) {
      expect(p.glassFill).toMatch(CSS_COLOR);
      expect(p.glassBorder).toMatch(CSS_COLOR);

    }
  });

  // Nothing blurs behind the tab bar, so any alpha in its fill would show content through it.
  it('gives the tab bar a solid fill', () => {
    for (const p of [LIGHT, DARK]) expect(p.barFill, p.scheme).toMatch(HEX);
  });

  // One ink for the brand, so a button's fill is never ambiguous.
  it('keeps one brand ink, with no stronger twin beside it', () => {
    for (const p of [LIGHT, DARK]) expect(Object.keys(p), p.scheme).not.toContain('primaryStrong');
  });

  it('PALETTES maps each scheme to its own palette', () => {
    expect(PALETTES.light.scheme).toBe('light');
    expect(PALETTES.dark.scheme).toBe('dark');
  });
});
