import { describe, expect, it } from 'vitest';
import { MIN_FOR_DEMOTION, TIERS, countdown, tierMeta, weekEnd, zoneDestination, zoneFor } from './format';
import { en } from '../i18n/en';

describe('tierMeta', () => {
  it('names every tier on the ladder with a key English has', () => {
    for (const tier of TIERS) {
      const meta = tierMeta(tier);
      expect(meta.labelKey, tier).not.toBeNull();
      expect(en[meta.labelKey!], `${tier} → ${meta.labelKey}`).toBeTruthy();
    }
  });

  /*
   * A tier the server adds before the browser hears about it still has to draw.
   * The raw key as its own label is readable; a blank medal is not.
   */
  it('falls back to the server word for a tier it does not know', () => {
    const meta = tierMeta('platinum');
    expect(meta.labelKey).toBeNull();
    expect(meta.label).toBe('platinum');
    expect(meta.emoji).toBeTruthy();
  });
});

describe('zoneFor', () => {
  it('promotes the top however-many', () => {
    expect(zoneFor(1, 30, 10, 5)).toBe('promotion');
    expect(zoneFor(10, 30, 10, 5)).toBe('promotion');
    expect(zoneFor(11, 30, 10, 5)).toBe('safe');
  });

  it('demotes the bottom however-many', () => {
    expect(zoneFor(26, 30, 10, 5)).toBe('demotion');
    expect(zoneFor(30, 30, 10, 5)).toBe('demotion');
    expect(zoneFor(25, 30, 10, 5)).toBe('safe');
  });

  /* the server's rule: too small a cohort demotes nobody */
  it('demotes nobody in a cohort under the minimum', () => {
    const total = MIN_FOR_DEMOTION - 1;
    expect(zoneFor(total, total, 3, 2)).toBe('safe');
  });
});

describe('zoneDestination', () => {
  it('names the tier above for a promotion and below for a demotion', () => {
    expect(zoneDestination('silver', 'promotion')).toBe('gold');
    expect(zoneDestination('silver', 'demotion')).toBe('bronze');
  });

  it('names nothing for a safe rank', () => {
    expect(zoneDestination('silver', 'safe')).toBeNull();
  });

  /*
   * The ends of the ladder, where the server clamps. A Bronze row saying it is
   * about to drop to Bronze, or a Diamond row promising Diamond, is a promise
   * about a move that cannot happen — worse than saying nothing.
   */
  it('names nothing where the ladder runs out', () => {
    expect(zoneDestination('bronze', 'demotion')).toBeNull();
    expect(zoneDestination('diamond', 'promotion')).toBeNull();
  });

  it('still climbs and falls at the ends in the direction that exists', () => {
    expect(zoneDestination('bronze', 'promotion')).toBe('silver');
    expect(zoneDestination('diamond', 'demotion')).toBe('obsidian');
  });

  it('names nothing for a tier off the ladder', () => {
    expect(zoneDestination('platinum', 'promotion')).toBeNull();
  });

  /* every destination is itself a tier we can name, or the row says a raw word */
  it('only ever names a tier the catalogue has', () => {
    for (const tier of TIERS) {
      for (const zone of ['promotion', 'demotion'] as const) {
        const dest = zoneDestination(tier, zone);
        if (dest !== null) expect(tierMeta(dest).labelKey, `${tier} ${zone}`).not.toBeNull();
      }
    }
  });
});

describe('the week', () => {
  it('ends the Monday after the week it names, at midnight UTC', () => {
    expect(new Date(weekEnd('2026-09-28')).toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });

  it('counts down in the largest two units that matter', () => {
    const start = Date.parse('2026-09-28T00:00:00Z');
    expect(countdown('2026-09-28', start + 0)).toBe('7d 0h');
    expect(countdown('2026-09-28', weekEnd('2026-09-28') - 3 * 3_600_000 - 12 * 60_000)).toBe('3h 12m');
    expect(countdown('2026-09-28', weekEnd('2026-09-28') - 5 * 60_000)).toBe('5m');
  });

  /*
   * Null, not "Ended". A word here would be English in nine languages, which is
   * exactly how the phone's copy of this file leaks one.
   */
  it('says nothing at all once the week is over', () => {
    expect(countdown('2026-09-28', weekEnd('2026-09-28'))).toBeNull();
    expect(countdown('2026-09-28', weekEnd('2026-09-28') + 1)).toBeNull();
  });
});
