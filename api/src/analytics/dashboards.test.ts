import { describe, expect, it } from 'vitest';
import { conversionRates, daysBefore, retentionRate, windowStart } from './dashboards.js';

describe('retentionRate', () => {
  it('is retained / cohort, guarding empty cohorts', () => {
    expect(retentionRate(100, 30)).toBe(0.3);
    expect(retentionRate(0, 0)).toBe(0);
  });
});

describe('conversionRates', () => {
  it('computes from-first and from-previous conversion', () => {
    const rates = conversionRates([
      { step: 'a', users: 100 },
      { step: 'b', users: 50 },
      { step: 'c', users: 25 },
    ]);
    expect(rates[0]).toMatchObject({ rateFromFirst: 1, rateFromPrev: 1 });
    expect(rates[1]).toMatchObject({ rateFromFirst: 0.5, rateFromPrev: 0.5 });
    expect(rates[2]).toMatchObject({ rateFromFirst: 0.25, rateFromPrev: 0.5 });
  });

  it('handles a zero top of funnel', () => {
    expect(conversionRates([{ step: 'a', users: 0 }])[0]).toMatchObject({ rateFromFirst: 0, rateFromPrev: 0 });
  });
});

describe('date windows', () => {
  it('windowStart is the inclusive first day of an N-day window', () => {
    expect(windowStart('2026-07-12', 1)).toBe('2026-07-12'); // DAU: single day
    expect(windowStart('2026-07-12', 7)).toBe('2026-07-06'); // WAU: 7 days incl. today
    expect(windowStart('2026-07-12', 30)).toBe('2026-06-13');
  });

  it('daysBefore shifts a date back', () => {
    expect(daysBefore('2026-07-12', 7)).toBe('2026-07-05');
    expect(daysBefore('2026-03-01', 1)).toBe('2026-02-28');
  });
});
