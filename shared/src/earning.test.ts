import { describe, expect, it } from 'vitest';
import {
  DAILY_EARNED_ZER_CAP,
  PAID_WINS_PER_DAY,
  QUIZ_PODIUM_MIN_ACCOUNTS,
  STREAK_MILESTONES,
  STREAK_MILESTONE_REPEAT_DAYS,
  nextStreakMilestone,
  onlineWinZer,
  quizPodiumZer,
  streakMilestonesBetween,
} from './earning.js';
import { MEMBERS_BOX_FREE_GIFTS, MEMBERS_BOX_ITEMS, MEMBERS_BOX_ZER, PLUS_ON_SALE, memberPay, membersBoxItem, membersBoxMonth } from './plus.js';

describe('earning Zêr', () => {
  it('pays only members, and never takes anything from anyone else', () => {
    expect(memberPay(40, true)).toBe(40);
    expect(memberPay(40, false)).toBe(0);
  });

  it('pays a member the streak milestones the money model lists', () => {
    expect(STREAK_MILESTONES.map((m) => [m.days, m.zer])).toEqual([
      [7, 40],
      [14, 60],
      [30, 120],
      [60, 150],
      [100, 250],
      [200, 400],
      [365, 800],
    ]);
    expect(STREAK_MILESTONE_REPEAT_DAYS).toBe(60);
  });

  it('finds the milestones a streak passes, even several at once after a restore', () => {
    expect(streakMilestonesBetween(6, 7).map((m) => m.days)).toEqual([7]);
    expect(streakMilestonesBetween(7, 8)).toEqual([]);
    expect(streakMilestonesBetween(3, 31).map((m) => m.days)).toEqual([7, 14, 30]);
    expect(nextStreakMilestone(14)).toEqual({ days: 30, zer: 120 });
    expect(nextStreakMilestone(365)).toBeNull();
  });

  it('pays a member’s win against other people, three a day', () => {
    expect(onlineWinZer(true)).toBe(10);
    expect(onlineWinZer(false)).toBe(0);
    expect(PAID_WINS_PER_DAY).toBe(3);
  });

  it('pays a quiz night’s podium only to members, in a room of four accounts or more', () => {
    expect([1, 2, 3, 4].map((place) => quizPodiumZer(place, 4, true))).toEqual([30, 20, 10, 0]);
    expect([1, 2, 3].map((place) => quizPodiumZer(place, 12, false))).toEqual([0, 0, 0]);
    expect(quizPodiumZer(1, QUIZ_PODIUM_MIN_ACCOUNTS - 1, true)).toBe(0);
    expect(quizPodiumZer(0, 8, true)).toBe(0);
    expect(quizPodiumZer(1.5, 8, true)).toBe(0);
  });

  it('caps a day just above an honest member’s best day', () => {
    // the 365-day milestone, the cycle’s day 7, a full day’s three chests, a harvest, three wins and a podium
    const chests = 10 + 20 + 35;
    const best = 800 + 50 + chests + 15 + PAID_WINS_PER_DAY * onlineWinZer(true) + quizPodiumZer(1, 4, true);
    expect(DAILY_EARNED_ZER_CAP).toBeGreaterThanOrEqual(best);
    expect(DAILY_EARNED_ZER_CAP).toBeLessThanOrEqual(1250);
  });
});

describe('the members’ box', () => {
  it('holds what the money model promises', () => {
    expect(MEMBERS_BOX_ZER).toBe(250);
    expect(MEMBERS_BOX_FREE_GIFTS).toBe(3);
  });

  it('has a different members-only item each month of the year, icons and backgrounds in turn', () => {
    expect(MEMBERS_BOX_ITEMS).toHaveLength(12);
    expect(new Set(MEMBERS_BOX_ITEMS).size).toBe(12);
    MEMBERS_BOX_ITEMS.forEach((sku, i) => expect(sku.startsWith(i % 2 === 0 ? 'bg-made-' : 'icon-made-')).toBe(true));
    expect(membersBoxItem('2027-03')).toBe('bg-made-agire-newroze');
    expect(membersBoxItem('2026-12')).toBe('icon-made-heyv');
  });

  it('counts months by the calendar', () => {
    expect(membersBoxMonth('2026-11-30')).toBe('2026-11');
    expect(membersBoxMonth(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01');
  });

  it('is not offered to anyone who is not a member until it can be bought', () => {
    expect(PLUS_ON_SALE).toBe(false);
  });
});
