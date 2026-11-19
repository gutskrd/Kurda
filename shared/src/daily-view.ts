/**
 * The daily view's week (GET /me/today): fourteen days in the learner's zone, from the first day of last week, with
 * what was learned on each, and what both apps read from them, so the week row, the stats and the insights say the
 * same on the phone and the website. Counts come from the server; nothing here estimates.
 */
import type { RecentDay } from './streak-week.js';

/** One day of the fourteen. */
export interface TodayDay {
  /** 'YYYY-MM-DD' in the learner's zone */
  date: string;
  /** a lesson, practice session or learning game counted for the streak that day */
  learned: boolean;
  /** kept by a freeze or a restore and not learned */
  frozen: boolean;
  /** lessons worked through, at least half of their items answered that day */
  lessons: number;
  /** practice sessions that paid XP */
  practice: number;
  /** XP earned that day, as the daily goal counts it, never below 0 */
  xp: number;
}

/** The badge level earned most recently. */
export interface TodayBadge {
  key: string;
  tier: number;
  earnedAt: string;
}

/** The week part of GET /me/today; the route adds the streak and the daily Zêr status. */
export interface TodayWeek {
  /** the learner's today, 'YYYY-MM-DD' */
  today: string;
  /** the weekday the weeks start on, 0 Sunday to 6 Saturday, as asked */
  weekStart: number;
  /** last week's seven days, then this week's, days to come included */
  days: TodayDay[];
  badge: TodayBadge | null;
}

/** How many days the view reads: last week and this one. */
export const TODAY_DAYS = 14;

/** The two weeks apart, and today's place in this one (0 to 6). */
export interface TodayWeeks {
  last: TodayDay[];
  current: TodayDay[];
  at: number;
}

export function splitWeeks(week: Pick<TodayWeek, 'days' | 'today'>): TodayWeeks {
  const last = week.days.slice(0, 7);
  const current = week.days.slice(7, 14);
  return { last, current, at: Math.max(0, current.findIndex((d) => d.date === week.today)) };
}

/** The four numbers of "Your stats", for one week. */
export interface WeekStats {
  days: number;
  lessons: number;
  practice: number;
  xp: number;
}

export function weekStats(days: readonly TodayDay[]): WeekStats {
  return days.reduce<WeekStats>(
    (sum, d) => ({ days: sum.days + (d.learned ? 1 : 0), lessons: sum.lessons + d.lessons, practice: sum.practice + d.practice, xp: sum.xp + d.xp }),
    { days: 0, lessons: 0, practice: 0, xp: 0 },
  );
}

/** The days as the streak's week row reads them (`streakWeek`). */
export function recentDays(days: readonly TodayDay[]): RecentDay[] {
  return days.flatMap((d): RecentDay[] => (d.learned ? [{ date: d.date, kind: 'learned' }] : d.frozen ? [{ date: d.date, kind: 'frozen' }] : []));
}

/**
 * One thing the insights say. `now` is this week up to today, `then` last week up to the same weekday, so a week
 * under way is never set against a whole one.
 */
export type Insight = { kind: 'firstWeek' } | { kind: 'xp' | 'lessons'; now: number; then: number };

/**
 * What there is to say about this week against last week: the XP and the lessons, each only when either week has
 * some. A learner whose every day learned is this week's is in their first week, said as that rather than as a gain
 * on nothing. Empty when there is nothing real to say, and the apps then show no insights row.
 */
export function weekInsights(weeks: TodayWeeks, daysLearned: number): Insight[] {
  const now = weekStats(weeks.current.slice(0, weeks.at + 1));
  const then = weekStats(weeks.last.slice(0, weeks.at + 1));
  const lastWeek = weekStats(weeks.last);
  if (lastWeek.xp === 0 && lastWeek.days === 0 && now.xp + now.days > 0 && daysLearned <= now.days) return [{ kind: 'firstWeek' }];
  const said: Insight[] = [];
  if (now.xp > 0 || then.xp > 0) said.push({ kind: 'xp', now: now.xp, then: then.xp });
  if (now.lessons > 0 || then.lessons > 0) said.push({ kind: 'lessons', now: now.lessons, then: then.lessons });
  return said;
}

/** Where a comparison stands, for choosing its words: ahead of last week, level with it, or not yet. */
export function insightTrend(insight: { now: number; then: number }): 'more' | 'same' | 'behind' {
  return insight.now > insight.then ? 'more' : insight.now === insight.then ? 'same' : 'behind';
}

/** Round gridline steps for a day's XP: the top of the axis and its halfway line, never less than 10. */
export function xpAxis(values: readonly number[]): { top: number; mid: number } {
  const most = Math.max(10, ...values);
  const step = most <= 50 ? 10 : most <= 200 ? 50 : most <= 1000 ? 100 : 500;
  const top = Math.ceil(most / step) * step;
  return { top, mid: top / 2 };
}
