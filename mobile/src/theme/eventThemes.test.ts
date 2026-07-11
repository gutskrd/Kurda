import { describe, expect, it } from 'vitest';
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
