import { describe, expect, it } from 'vitest';
import { AA_NORMAL, contrastRatio, hexToRgb, type Rgb } from '../a11y/contrast';
import { ICON_PATHS } from './icon-paths';
import {
  EVENT_THEME_PACKS,
  flameSkin,
  resolveEventTheme,
  themeAccent,
} from './eventThemes.js';

describe('resolveEventTheme', () => {
  it('picks the first live event with a known pack', () => {
    const pack = resolveEventTheme([{ theme: 'unknown' }, { theme: 'newroz' }], false);
    expect(pack?.key).toBe('newroz');
  });

  it('returns null when the user opted out', () => {
    expect(resolveEventTheme([{ theme: 'newroz' }], true)).toBeNull();
  });

  it('returns null when nothing themed is live', () => {
    expect(resolveEventTheme([{ theme: null }, { theme: 'no-such-pack' }], false)).toBeNull();
    expect(resolveEventTheme([], false)).toBeNull();
  });
});

describe('flameSkin / themeAccent', () => {
  it('use the pack value or fall back', () => {
    expect(flameSkin(EVENT_THEME_PACKS.yalda!)).toBe('🕯️');
    expect(flameSkin(null)).toBe('🔥');
    expect(themeAccent(EVENT_THEME_PACKS.newroz!, '#000')).toBe('#E8B923');
    expect(themeAccent(null, '#123456')).toBe('#123456');
  });
});

/*
 * The banner writes an event's name on the pack's first colour. It used the
 * colour of a button's label for that, which is white by day and near-black
 * by evening, and neither is legible on every pack: 1.8:1 on Newroz's gold,
 * 2.1:1 on Yalda's violet.
 */
describe('a pack’s banner', () => {
  /** The ink as the banner’s second line draws it: nine tenths opaque, over the fill. */
  const faded = (ink: string, fill: string): Rgb => {
    const top = hexToRgb(ink);
    const under = hexToRgb(fill);
    const mix = (a: number, b: number) => Math.round(a * 0.9 + b * 0.1);
    return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b) };
  };

  it('writes in an ink that meets AA (4.5:1) on its own fill, the fainter second line too', () => {
    for (const pack of Object.values(EVENT_THEME_PACKS)) {
      const fill = pack.bannerColors[0];
      expect(contrastRatio(pack.ink, fill), pack.key).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(faded(pack.ink, fill), fill), `${pack.key}, second line`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('draws a glyph the app has', () => {
    for (const pack of Object.values(EVENT_THEME_PACKS)) {
      expect(ICON_PATHS[pack.icon]?.length, pack.key).toBeGreaterThan(0);
    }
  });
});
