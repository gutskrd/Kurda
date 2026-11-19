import type { TodayDay } from '@kurda/shared';
import type { TodayView } from '../daily/today';
import type { DailyRewardStatus, StreakSummary } from '../lib/types';

/**
 * A GET /me/today answer for Wednesday 18 November 2026 with Monday weeks: last week from the 9th, this week from the
 * 16th. `days` gives some of the fourteen days (0 is last Monday, 9 is today) what they had.
 */
export function todayView({
  days = {},
  streak = {},
  daily = {},
  badge = null,
}: {
  days?: Record<number, Partial<TodayDay>>;
  streak?: Partial<StreakSummary>;
  daily?: Partial<DailyRewardStatus>;
  badge?: TodayView['badge'];
} = {}): TodayView {
  return {
    today: '2026-11-18',
    weekStart: 1,
    days: Array.from({ length: 14 }, (_, i) => ({
      date: `2026-11-${String(9 + i).padStart(2, '0')}`,
      learned: false,
      frozen: false,
      lessons: 0,
      practice: 0,
      xp: 0,
      ...days[i],
    })),
    streak: { current: 0, longest: 0, freezes: 0, lastActiveOn: null, daysLearned: 0, freezeProgress: 0, sessionsPerFreeze: 5, maxFreezes: 1, repair: null, ...streak },
    daily: { canClaim: false, claimableDay: 1, reward: 10, schedule: [10, 15, 20, 25, 30, 40, 100], alreadyClaimedToday: false, learnedToday: false, cycleDay: 0, plusGems: 0, ...daily },
    badge,
  };
}

/** Four days learned in a row up to today, with what each brought, and a quieter week before. */
export function fourDayView(overrides: Parameters<typeof todayView>[0] = {}): TodayView {
  return todayView({
    days: {
      1: { learned: true, lessons: 1, xp: 20 },
      2: { learned: true, lessons: 1, xp: 15 },
      6: { learned: true, lessons: 1, practice: 1, xp: 30 },
      7: { learned: true, lessons: 2, xp: 40 },
      8: { learned: true, lessons: 1, practice: 1, xp: 25 },
      9: { learned: true, lessons: 1, xp: 20 },
    },
    streak: { current: 4, longest: 9, freezes: 1, lastActiveOn: '2026-11-18', daysLearned: 20 },
    daily: { canClaim: true, learnedToday: true, claimableDay: 3, reward: 20, cycleDay: 2 },
    ...overrides,
  });
}
