import { describe, expect, it } from 'vitest';
import { DARK, LIGHT, PALETTES, type Palette } from './palette';

const HEX = /^#[0-9a-f]{6}$/i;
const CSS_COLOR = /^(#[0-9a-f]{6}|rgba?\()/i;
const HEX_KEYS: (keyof Palette)[] = [
  'primary',
  'primaryStrong',
  'accent',
  'gold',
  'danger',
  'success',
  'textPrimary',
  'textSecondary',
  'textOnPrimary',
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
      expect(p.glassHighlight).toMatch(CSS_COLOR);
      expect(p.clayFill).toHaveLength(2);
    }
  });

  it('PALETTES maps each scheme to its own palette', () => {
    expect(PALETTES.light.scheme).toBe('light');
    expect(PALETTES.dark.scheme).toBe('dark');
  });
});
