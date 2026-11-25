import { describe, expect, it } from 'vitest';
import { PLUS_PLANS, formatEuros, planMonthlyCents, planSavingPercent } from './plus.js';
import { PLUS_HERO_VIEW, plusHeroFigure, plusHeroSky, plusHeroSparkles } from './art/plus-hero.js';

const plan = (id: string) => PLUS_PLANS.find((p) => p.id === id)!;

describe('the Hevalo+ plans', () => {
  it('offers the yearly first, then the monthly and the family, at the prices in the money model', () => {
    expect(PLUS_PLANS.map((p) => [p.id, p.storeId, p.priceCents, p.period])).toEqual([
      ['yearly', 'app.hevalo.plus.yearly', 2999, 'year'],
      ['monthly', 'app.hevalo.plus.monthly', 399, 'month'],
      ['family', 'app.hevalo.family.yearly', 5999, 'year'],
    ]);
    expect(plan('monthly').introCents).toBe(99);
    expect(plan('family').people).toBe(6);
  });

  it('works out the smaller monthly line and the yearly saving honestly', () => {
    expect(planMonthlyCents(plan('yearly'))).toBe(250);
    expect(planMonthlyCents(plan('family'))).toBe(500);
    expect(planMonthlyCents(plan('monthly'))).toBe(399);
    // twelve months at 3.99 is 47.88, so 29.99 saves 37.3%, said as 37
    expect(planSavingPercent(plan('yearly'), plan('monthly'))).toBe(37);
    expect(planSavingPercent(plan('monthly'), plan('monthly'))).toBe(0);
  });

  it('writes a price the way the reader’s language does, and falls back where the runtime does not know it', () => {
    expect(formatEuros(2999, 'en')).toBe('€29.99');
    expect(formatEuros(2999, 'de')).toMatch(/^29,99\s€$/);
    expect(formatEuros(250, 'not-a-locale-at-all-x')).toBe('€2.50');
  });
});

describe('the Hevalo+ picture', () => {
  const layers = [plusHeroSky(), plusHeroSky({ dark: true }), plusHeroFigure(), plusHeroSparkles(), plusHeroSparkles({ dark: true })];

  it('draws every layer on the one frame, so the apps can stack them', () => {
    for (const svg of layers) expect(svg).toContain(`viewBox="0 0 ${PLUS_HERO_VIEW.w} ${PLUS_HERO_VIEW.h}"`);
  });

  it('is the same picture every time, and hidden from screen readers, since the words beside it say it all', () => {
    expect(plusHeroSky({ dark: true })).toBe(plusHeroSky({ dark: true }));
    for (const svg of layers) expect(svg).toContain('aria-hidden="true"');
  });

  it('puts the deer and his gold crown on the hill, under a night sky by night and a morning by day', () => {
    expect(plusHeroFigure()).toContain('#f2b632');
    expect(plusHeroSky({ dark: true })).not.toBe(plusHeroSky());
    expect((plusHeroSky({ dark: true }).match(/<circle /g) ?? []).length).toBeGreaterThan(20);
    expect(plusHeroSky()).not.toContain('<circle ');
  });
});
