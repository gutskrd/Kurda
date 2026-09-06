import { describe, it, expect } from 'vitest';
import {
  formatHsl,
  formatRgb,
  hslToRgb,
  hsvToRgb,
  parseHex,
  parseHsl,
  parseRgb,
  rgbToHsl,
  rgbToHsv,
  toHex,
  type Rgb,
} from './color';

const SAMPLES: Rgb[] = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 255, b: 255 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 58, g: 178, b: 111 },
  { r: 240, g: 194, b: 74 },
  { r: 17, g: 17, b: 17 },
  { r: 128, g: 128, b: 128 },
];

describe('hex', () => {
  it('reads the shapes people actually type', () => {
    expect(parseHex('#3ab26f')).toEqual({ r: 58, g: 178, b: 111 });
    expect(parseHex('3ab26f')).toEqual({ r: 58, g: 178, b: 111 });
    expect(parseHex('  #3AB26F  ')).toEqual({ r: 58, g: 178, b: 111 });
    // the short form is a real form, not a typo
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('refuses what is not a colour rather than guessing', () => {
    for (const bad of ['', '#', '#12', '#12345', 'zzzzzz', '#3ab26fff', 'rgb(1,2,3)']) {
      expect(parseHex(bad), bad).toBeNull();
    }
  });

  it('round-trips every sample', () => {
    for (const rgb of SAMPLES) expect(parseHex(toHex(rgb))).toEqual(rgb);
  });

  it('clamps rather than emitting a hex that is not six digits', () => {
    expect(toHex({ r: 300, g: -20, b: 128 })).toBe('#ff0080');
  });
});

describe('rgb ↔ hsl', () => {
  it('round-trips every sample', () => {
    // the picker shows both at once and lets you type into either, so a colour
    // must survive the trip or the two boxes will disagree in front of you
    for (const rgb of SAMPLES) {
      const back = hslToRgb(rgbToHsl(rgb));
      expect(back, JSON.stringify(rgb)).toEqual(rgb);
    }
  });

  it('gets the primaries right', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toMatchObject({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 255, b: 0 })).toMatchObject({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toMatchObject({ h: 240, s: 100, l: 50 });
  });

  it('calls grey grey, with no hue to speak of', () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toMatchObject({ h: 0, s: 0 });
  });

  it('wraps a hue past the circle instead of clipping it', () => {
    expect(hslToRgb({ h: 380, s: 100, l: 50 })).toEqual(hslToRgb({ h: 20, s: 100, l: 50 }));
    expect(hslToRgb({ h: -20, s: 100, l: 50 })).toEqual(hslToRgb({ h: 340, s: 100, l: 50 }));
  });
});

describe('rgb ↔ hsv', () => {
  it('round-trips every sample', () => {
    // the gradient square is saturation/value, not saturation/lightness — the
    // two are different axes and conflating them bends the colours
    for (const rgb of SAMPLES) {
      expect(hsvToRgb(rgbToHsv(rgb)), JSON.stringify(rgb)).toEqual(rgb);
    }
  });

  it('puts full colour at the top-right of the square', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toMatchObject({ s: 1, v: 1 });
    // and black at the bottom, whatever the hue
    expect(rgbToHsv({ r: 0, g: 0, b: 0 }).v).toBe(0);
  });
});

describe('parsing what someone typed', () => {
  it('takes RGB however it is punctuated', () => {
    for (const input of ['rgb(58, 178, 111)', '58, 178, 111', '58 178 111', '  58,178,111  ']) {
      expect(parseRgb(input), input).toEqual({ r: 58, g: 178, b: 111 });
    }
  });

  it('refuses an RGB channel outside the byte range', () => {
    expect(parseRgb('300, 0, 0')).toBeNull();
    expect(parseRgb('-1, 0, 0')).toBeNull();
    expect(parseRgb('1, 2')).toBeNull();
  });

  it('takes HSL however it is punctuated, and wraps the hue', () => {
    expect(parseHsl('hsl(150, 51%, 46%)')).toEqual({ h: 150, s: 51, l: 46 });
    expect(parseHsl('510, 51, 46')).toEqual({ h: 150, s: 51, l: 46 });
  });

  it('refuses a percentage that is not one', () => {
    expect(parseHsl('150, 120, 46')).toBeNull();
    expect(parseHsl('150, 51, -4')).toBeNull();
  });

  it('formats back into what the boxes show', () => {
    expect(formatRgb({ r: 58, g: 178, b: 111 })).toBe('58, 178, 111');
    expect(formatHsl({ h: 150.4, s: 50.7, l: 46.3 })).toBe('150, 51%, 46%');
  });
});
