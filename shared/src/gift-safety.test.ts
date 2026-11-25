import { describe, expect, it } from 'vitest';
import {
  BIG_GIFT_CONFIRM_ZER,
  MINOR_GIFT_MAX_PRICE,
  MINOR_GIFT_MONTHLY_ZER,
  SPEND_LIMIT_MAX_ZER,
  SPEND_LIMIT_MIN_ZER,
  TO_MINOR_GIFT_MAX_PRICE,
  isValidSpendLimit,
  limitAppliesAtOnce,
} from './gift-safety.js';
import { formatZerValue } from './zer.js';

describe('the gift safeguards', () => {
  it('hold under-18s to five euros a gift and twenty a month, and adults to five euros for them', () => {
    expect(formatZerValue(MINOR_GIFT_MAX_PRICE, 'en')).toBe('≈ €5');
    expect(formatZerValue(MINOR_GIFT_MONTHLY_ZER, 'en')).toBe('≈ €20');
    expect(TO_MINOR_GIFT_MAX_PRICE).toBe(MINOR_GIFT_MAX_PRICE);
  });

  it('ask a second time from twenty euros', () => {
    expect(formatZerValue(BIG_GIFT_CONFIRM_ZER, 'en')).toBe('≈ €20');
  });
});

describe('an adult’s own spending limit', () => {
  const day = (zer: number) => ({ period: 'day' as const, zer });
  const week = (zer: number) => ({ period: 'week' as const, zer });
  const month = (zer: number) => ({ period: 'month' as const, zer });

  it('applies at once where there was none', () => {
    expect(limitAppliesAtOnce(null, day(100_000))).toBe(true);
  });

  it('applies at once when lowered, or moved to a longer window for no more', () => {
    expect(limitAppliesAtOnce(day(5_000), day(1_000))).toBe(true);
    expect(limitAppliesAtOnce(day(5_000), day(5_000))).toBe(true);
    expect(limitAppliesAtOnce(day(5_000), week(5_000))).toBe(true);
    expect(limitAppliesAtOnce(week(5_000), month(2_000))).toBe(true);
  });

  it('waits a day when raised, removed, or moved to a shorter window', () => {
    expect(limitAppliesAtOnce(day(1_000), day(1_001))).toBe(false);
    expect(limitAppliesAtOnce(day(1_000), null)).toBe(false);
    expect(limitAppliesAtOnce(month(1_000), week(1_000))).toBe(false);
    expect(limitAppliesAtOnce(week(1_000), day(100))).toBe(false);
  });

  it('takes whole Zêr from one euro to ten thousand, in a known window', () => {
    expect(isValidSpendLimit(day(SPEND_LIMIT_MIN_ZER))).toBe(true);
    expect(isValidSpendLimit(month(SPEND_LIMIT_MAX_ZER))).toBe(true);
    expect(isValidSpendLimit(day(SPEND_LIMIT_MIN_ZER - 1))).toBe(false);
    expect(isValidSpendLimit(day(SPEND_LIMIT_MAX_ZER + 1))).toBe(false);
    expect(isValidSpendLimit(day(150.5))).toBe(false);
    expect(isValidSpendLimit({ period: 'year' as never, zer: 1_000 })).toBe(false);
  });
});
