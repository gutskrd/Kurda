import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hexToRgb,
  relativeLuminance,
} from './contrast.js';

describe('hexToRgb', () => {
  it('parses 6-digit hex with or without #', () => {
    expect(hexToRgb('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
    expect(hexToRgb('ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('expands 3-digit shorthand', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#0a0')).toEqual({ r: 0, g: 170, b: 0 });
  });

  it('throws on an invalid hex', () => {
    expect(() => hexToRgb('#xyz')).toThrow();
    expect(() => hexToRgb('#ff88')).toThrow();
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is 1:1 for identical colours', () => {
    expect(contrastRatio('#345678', '#345678')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(contrastRatio('#fff', '#000'), 5);
  });
});
