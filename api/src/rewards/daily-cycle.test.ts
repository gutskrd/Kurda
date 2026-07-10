import { describe, expect, it } from 'vitest';
import {
  CYCLE_REWARDS,
  nextCycleDay,
  rewardForDay,
  statusFor,
  type DailyRewardState,
} from './daily-cycle.js';

const state = (cycleDay: number, lastClaimOn: string | null): DailyRewardState => ({ cycleDay, lastClaimOn });

describe('rewardForDay', () => {
  it('escalates and pays the day-7 bonus', () => {
    expect(rewardForDay(1)).toBe(CYCLE_REWARDS[0]);
    expect(rewardForDay(7)).toBe(100);
    expect(rewardForDay(7)).toBeGreaterThan(rewardForDay(6));
  });
  it('clamps out-of-range days', () => {
    expect(rewardForDay(0)).toBe(CYCLE_REWARDS[0]);
    expect(rewardForDay(99)).toBe(CYCLE_REWARDS[6]);
  });
});

describe('nextCycleDay', () => {
  it('starts a fresh cycle at day 1', () => {
    expect(nextCycleDay(state(0, null), '2026-07-10')).toBe(1);
  });
  it('advances on a consecutive day', () => {
    expect(nextCycleDay(state(3, '2026-07-09'), '2026-07-10')).toBe(4);
  });
  it('wraps day 7 back to day 1', () => {
    expect(nextCycleDay(state(7, '2026-07-09'), '2026-07-10')).toBe(1);
  });
  it('resets to day 1 after a missed day', () => {
    expect(nextCycleDay(state(4, '2026-07-08'), '2026-07-10')).toBe(1);
  });
  it('holds when already claimed today', () => {
    expect(nextCycleDay(state(4, '2026-07-10'), '2026-07-10')).toBe(4);
  });
});

describe('statusFor', () => {
  it('is claimable on a new day and reports the escalated reward', () => {
    const s = statusFor(state(2, '2026-07-09'), '2026-07-10');
    expect(s).toMatchObject({ canClaim: true, claimableDay: 3, reward: rewardForDay(3), alreadyClaimedToday: false });
    expect(s.schedule).toEqual(CYCLE_REWARDS);
  });
  it('blocks a second claim on the same day', () => {
    const s = statusFor(state(3, '2026-07-10'), '2026-07-10');
    expect(s.canClaim).toBe(false);
    expect(s.alreadyClaimedToday).toBe(true);
  });
});
