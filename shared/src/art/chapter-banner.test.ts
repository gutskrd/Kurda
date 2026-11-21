import { describe, expect, it } from 'vitest';
import { PATH_LANDS } from '../path-world.js';
import { chapterBannerSvg } from './chapter-banner.js';

describe('chapterBannerSvg', () => {
  const land = PATH_LANDS[0]!;
  const base = { ground: land.ground, width: 358, height: 112 };

  it('draws every chapter by day and by night, the size it was asked for and hidden from screen readers', () => {
    for (const l of PATH_LANDS) {
      for (const dark of [false, true]) {
        const svg = chapterBannerSvg({ ...base, ground: l.ground, landmark: l.landmark, dark });
        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="358" height="112" viewBox="0 0 358 112" aria-hidden="true"')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
  });

  it('is the same drawing every time it is asked for', () => {
    expect(chapterBannerSvg({ ...base, landmark: land.landmark })).toBe(chapterBannerSvg({ ...base, landmark: land.landmark }));
  });

  it('stands the landmark at the far end only when asked, on the left for a right-to-left page', () => {
    const without = chapterBannerSvg(base);
    const ltr = chapterBannerSvg({ ...base, landmark: land.landmark });
    const rtl = chapterBannerSvg({ ...base, landmark: land.landmark, rtl: true });
    expect((ltr.match(/<svg /g) ?? []).length).toBe(2);
    expect((without.match(/<svg /g) ?? []).length).toBe(1);
    const x = (svg: string) => Number(/<svg x="([\d.]+)"/.exec(svg)?.[1]);
    expect(x(ltr)).toBeGreaterThan(358 / 2);
    expect(x(rtl)).toBeLessThan(358 / 2);
  });

  it('keeps its ids apart from another banner on the same page', () => {
    const a = chapterBannerSvg({ ...base, idPrefix: 'one' });
    const b = chapterBannerSvg({ ...base, idPrefix: 'two' });
    const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
  });

  it('refuses a size it cannot draw', () => {
    expect(() => chapterBannerSvg({ ...base, width: 0 })).toThrow(RangeError);
    expect(() => chapterBannerSvg({ ...base, height: Number.NaN })).toThrow(RangeError);
  });
});
