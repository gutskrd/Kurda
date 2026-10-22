import { describe, expect, it } from 'vitest';
import { DEFAULT_FEED_PERIOD, DEFAULT_FEED_SORT, FEED_PERIODS, FEED_PERIOD_DAYS, FEED_SORTS, isFeedPeriod, isFeedSort, sortRanks } from './feed-sort.js';

describe('feed sort', () => {
  it('opens on the newest, looking back over everything', () => {
    expect(DEFAULT_FEED_SORT).toBe('newest');
    expect(DEFAULT_FEED_PERIOD).toBe('all');
  });

  it('knows its own orders and ranges, and nothing else', () => {
    for (const s of FEED_SORTS) expect(isFeedSort(s)).toBe(true);
    for (const p of FEED_PERIODS) expect(isFeedPeriod(p)).toBe(true);
    expect(isFeedSort('random')).toBe(false);
    expect(isFeedSort(undefined)).toBe(false);
    expect(isFeedPeriod('decade')).toBe(false);
  });

  it('looks back over a range only when it ranks', () => {
    expect(FEED_SORTS.filter(sortRanks)).toEqual(['popular', 'discussed']);
    expect(Object.keys(FEED_PERIOD_DAYS)).toEqual(FEED_PERIODS.filter((p) => p !== 'all'));
  });
});
