import { describe, expect, it } from 'vitest';
import {
  GIFT_TIERS,
  GIFT_UNWRAP_MS,
  GIFT_DAY_CAPS,
  GIFT_DAY_FEW,
  giftDayFull,
  giftDayLine,
  giftsPerFriendCap,
  giftsReceivedCap,
  giftsSentCap,
  GRAND_GIFT_PRICE,
  MAX_GIFT_RECIPIENTS,
  giftLockFor,
  giftTierFor,
  isGiftOnly,
  needsBigGiftConfirm,
} from './gifts.js';

describe('gift tiers', () => {
  it('makes a limited item legendary whatever it costs', () => {
    expect(giftTierFor({ price: 100, limited: true })).toBe('legendary');
  });

  it('makes dear items rare', () => {
    expect(giftTierFor({ price: 750, limited: false })).toBe('rare');
    expect(giftTierFor({ price: 1000, limited: false })).toBe('rare');
  });

  it('leaves the rest common', () => {
    expect(giftTierFor({ price: 700, limited: false })).toBe('common');
  });

  it('makes the moon, the sun and the galaxy grand, from two hundred euros up', () => {
    expect(GRAND_GIFT_PRICE).toBe(20_000);
    expect(giftTierFor({ price: 20_000, limited: false })).toBe('grand');
    expect(giftTierFor({ price: 100_000, limited: true })).toBe('grand');
    expect(giftTierFor({ price: 19_999, limited: false })).toBe('rare');
  });

  it('plays a bigger moment for a bigger gift, and never long', () => {
    const times = GIFT_TIERS.map((t) => GIFT_UNWRAP_MS[t]);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(Math.max(...times)).toBeLessThanOrEqual(3500);
  });

  it('caps a day’s gifts above what one send can use, for anyone', () => {
    for (const caps of Object.values(GIFT_DAY_CAPS)) {
      expect(caps.sent).toBeGreaterThanOrEqual(MAX_GIFT_RECIPIENTS);
      expect(caps.perFriend).toBeLessThan(caps.sent);
    }
  });

  it('caps what one person can be given in a day, whoever sends it', () => {
    for (const caps of Object.values(GIFT_DAY_CAPS)) {
      // more than one friend’s share, so a few friends can still all give on a birthday
      expect(caps.received).toBeGreaterThan(caps.perFriend);
      // and no more than one sender’s whole day, so many senders cannot multiply it
      expect(caps.received).toBeLessThanOrEqual(caps.sent);
    }
  });

  it('opens the caps only between two known adults, and keeps them narrow wherever a child is involved', () => {
    const { adult, young } = GIFT_DAY_CAPS;
    expect(adult.perFriend).toBeGreaterThan(young.perFriend);
    expect(giftsPerFriendCap(true, true)).toBe(adult.perFriend);
    expect(giftsPerFriendCap(true, false)).toBe(young.perFriend);
    expect(giftsPerFriendCap(false, true)).toBe(young.perFriend);
    expect(giftsPerFriendCap(false, false)).toBe(young.perFriend);
    expect(giftsSentCap(false)).toBe(young.sent);
    expect(giftsReceivedCap(false)).toBe(young.received);
    expect(giftsSentCap(true)).toBe(adult.sent);
    expect(giftsReceivedCap(true)).toBe(adult.received);
  });
});

describe('gifts on the shelf', () => {
  it('are told apart from what is worn by their category, the retired stickers too', () => {
    expect(isGiftOnly('gift')).toBe(true);
    expect(isGiftOnly('sticker')).toBe(true);
    expect(isGiftOnly('icon')).toBe(false);
  });

  it('locks what is dearer than the send may cost, or more than is left to spend', () => {
    const limits = { maxPrice: 500, left: 1_000, confirmFrom: 2_000 };
    expect(giftLockFor({ price: 500 }, 1, limits)).toBeNull();
    expect(giftLockFor({ price: 501 }, 1, limits)).toBe('over_limit');
    expect(giftLockFor({ price: 400 }, 3, limits)).toBe('spend_limit');
    expect(giftLockFor({ price: 100_000 }, 1, { maxPrice: null, left: null, confirmFrom: 2_000 })).toBeNull();
    expect(giftLockFor({ price: 100_000 }, 1, undefined)).toBeNull();
  });

  it('asks a second time from the confirmation amount up', () => {
    expect(needsBigGiftConfirm(1_999, { confirmFrom: 2_000 })).toBe(false);
    expect(needsBigGiftConfirm(2_000, { confirmFrom: 2_000 })).toBe(true);
    expect(needsBigGiftConfirm(5_000, null)).toBe(false);
  });
});

describe('the gift sheet’s line on the day’s caps', () => {
  const day = (userId: string, left: number, moreAt: string | null = null) => ({ userId, left, moreAt });

  it('says how many are left for one friend only when few are, and from when once none are', () => {
    expect(giftDayLine([day('a', GIFT_DAY_FEW + 1)])).toBeNull();
    expect(giftDayLine([day('a', GIFT_DAY_FEW)])).toEqual({ kind: 'few', userId: 'a', left: GIFT_DAY_FEW });
    expect(giftDayLine([day('a', 0, '2026-11-28T09:00:00Z')])).toEqual({ kind: 'none', userId: 'a', moreAt: '2026-11-28T09:00:00Z' });
    expect(giftDayLine([day('a', 0)])).toEqual({ kind: 'none', userId: 'a', moreAt: null });
    expect(giftDayLine([])).toBeNull();
  });

  it('names who in a group can be given nothing more, and holds the send only when that is everyone', () => {
    const days = [day('a', 0, '2026-11-28T09:00:00Z'), day('b', 5), day('c', 0)];
    expect(giftDayLine(days)).toEqual({ kind: 'someFull', userIds: ['a', 'c'] });
    expect(giftDayLine([day('a', 1), day('b', 5)])).toBeNull();
    expect(giftDayFull(days, ['a', 'c'])).toBe(true);
    expect(giftDayFull(days, ['a', 'b'])).toBe(false);
    // nobody known to be full, or nobody to send to, holds nothing
    expect(giftDayFull([], ['a'])).toBe(false);
    expect(giftDayFull(days, [])).toBe(false);
  });
});
