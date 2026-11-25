import type pg from 'pg';
import { TODAY_DAYS, addDays, firstDayOfWeek, membersBoxMonth, type TodayBadge, type TodayDay, type TodayWeek } from '@kurda/shared';
import { isPremiumActive } from '../cosmetics/access.js';
import { dailyRewardView, type DailyRewardView } from '../rewards/daily-cycle.js';
import { MembersBoxService } from '../plus/members-box.js';
import { StreakService, type StreakSummary } from './service.js';
import { answeredTodaySql, countsAsLearningSql, localDate, safeTimeZone } from './streak-logic.js';

/** GET /me/today: the week part, the settled streak, and today's Zêr as GET /rewards/daily says it. */
export interface TodayView extends TodayWeek {
  streak: StreakSummary;
  daily: DailyRewardView;
}

interface AccountRow {
  timezone: string | null;
  premium_until: Date | null;
  cycle_day: number | null;
  last_claim_on: string | null;
  badge_key: string | null;
  badge_tier: number | null;
  badge_at: Date | null;
  /** this month's members' box has been given */
  boxed: boolean;
}

interface DayRow {
  date: string;
  lessons: number;
  practice: number;
  xp: number;
  learned: boolean;
  kept: boolean;
}

/**
 * The daily view in three statements after the session read: the account with its Zêr cycle, latest badge and whether
 * this month's members' box was given, the streak as GET /me settles it, and the fourteen days. It is the first thing the
 * apps read on a visit, so a member's box for a new month is given here (plus/members-box.ts), once a month. Days are
 * the learner's calendar days, bounded by their local midnights, so every count is credited to the day it happened
 * where they live. The days count what the streak counts: lessons worked through (`countsAsLearning`), practice that
 * paid XP and learning games, with the XP as the daily goal sums it.
 */
export class TodayService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly streaks: StreakService = new StreakService(pool),
    private readonly boxes: MembersBoxService = new MembersBoxService(pool),
  ) {}

  async view(userId: string, startsOn: number, now: Date = new Date()): Promise<TodayView> {
    const account = await this.pool.query<AccountRow>(
      `SELECT u.timezone, u.premium_until, d.cycle_day, d.last_claim_on, b.badge_key, b.tier AS badge_tier, b.at AS badge_at,
              EXISTS (SELECT 1 FROM members_boxes mb WHERE mb.user_id = u.id AND mb.month = $2::date) AS boxed
         FROM users u
         LEFT JOIN daily_rewards d ON d.user_id = u.id
         LEFT JOIN LATERAL (
           SELECT ub.badge_key, ub.tier, COALESCE((SELECT max(t) FROM unnest(ub.tier_earned_at) t), ub.earned_at) AS at
             FROM user_badges ub
            WHERE ub.user_id = u.id AND ub.tier > 0
            ORDER BY 3 DESC NULLS LAST
            LIMIT 1
         ) b ON true
        WHERE u.id = $1`,
      [userId, `${membersBoxMonth(now)}-01`],
    );
    const row = account.rows[0];
    const member = isPremiumActive(row?.premium_until ?? null, now);
    if (member && !row?.boxed) await this.boxes.ensure(userId, now);
    const tz = safeTimeZone(row?.timezone);
    const today = localDate(now, tz);
    const first = addDays(firstDayOfWeek(today, startsOn), -7);
    const [{ streak, lastLearnedOn }, days] = await Promise.all([this.streaks.current(userId, tz, now), this.days(userId, tz, first)]);
    const badge: TodayBadge | null =
      row?.badge_key && row.badge_tier && row.badge_at ? { key: row.badge_key, tier: row.badge_tier, earnedAt: new Date(row.badge_at).toISOString() } : null;
    return {
      today,
      weekStart: startsOn,
      days,
      badge,
      streak,
      daily: dailyRewardView(
        { cycleDay: row?.cycle_day ?? 0, lastClaimOn: row?.last_claim_on ?? null },
        today,
        lastLearnedOn === today,
        member,
      ),
    };
  }

  /** The fourteen days from `first`, in one statement over the learner's own rows. */
  private async days(userId: string, tz: string, first: string): Promise<TodayDay[]> {
    const answered = answeredTodaySql('session_answers', { session: 'ls.id', zone: '$2', day: '(ls.completed_at AT TIME ZONE $2)' });
    // The span's ends written out rather than joined from a CTE, so they bound each scan before the costlier tests.
    const since = '($3::date::timestamp AT TIME ZONE $2)';
    const until = '(($3::date + $4::int)::timestamp AT TIME ZONE $2)';
    const res = await this.pool.query<DayRow>(
      `WITH lessons AS (
         SELECT (ls.completed_at AT TIME ZONE $2)::date AS day, count(*)::int AS n
           FROM lesson_sessions ls
          WHERE ls.user_id = $1 AND ls.completed_at >= ${since} AND ls.completed_at < ${until}
            AND ${countsAsLearningSql(`(${answered})`, 'ls.total_count')}
          GROUP BY 1
       ), practice AS (
         SELECT (ps.completed_at AT TIME ZONE $2)::date AS day, count(*)::int AS n
           FROM practice_sessions ps
          WHERE ps.user_id = $1 AND ps.completed_at >= ${since} AND ps.completed_at < ${until} AND ps.xp_awarded > 0
          GROUP BY 1
       ), games AS (
         SELECT DISTINCT (gs.finished_at AT TIME ZONE $2)::date AS day
           FROM game_sessions gs
          WHERE gs.user_id = $1 AND gs.finished_at >= ${since} AND gs.finished_at < ${until} AND gs.learning_counted
       ), xp AS (
         SELECT (x.created_at AT TIME ZONE $2)::date AS day, sum(x.amount)::int AS n
           FROM xp_ledger x
          WHERE x.user_id = $1 AND x.created_at >= ${since} AND x.created_at < ${until}
          GROUP BY 1
       ), kept AS (
         SELECT s.freeze_used_on - n AS day
           FROM user_streaks s, generate_series(0, s.freeze_used_days - 1) n
          WHERE s.user_id = $1 AND s.freeze_used_on >= $3::date
         UNION
         SELECT r.repaired_on - n
           FROM streak_repairs r, generate_series(1, r.repaired_on - r.ended_last_active_on - 1) n
          WHERE r.user_id = $1 AND r.repaired_on > $3::date
       )
       SELECT g.day::text AS date, COALESCE(l.n, 0) AS lessons, COALESCE(p.n, 0) AS practice, GREATEST(COALESCE(x.n, 0), 0) AS xp,
              (l.n IS NOT NULL OR p.n IS NOT NULL OR EXISTS (SELECT 1 FROM games WHERE games.day = g.day)) AS learned,
              EXISTS (SELECT 1 FROM kept WHERE kept.day = g.day) AS kept
         FROM (SELECT ($3::date + i) AS day FROM generate_series(0, $4::int - 1) i) g
         LEFT JOIN lessons l ON l.day = g.day
         LEFT JOIN practice p ON p.day = g.day
         LEFT JOIN xp x ON x.day = g.day
        ORDER BY g.day`,
      [userId, tz, first, TODAY_DAYS],
    );
    return res.rows.map((d) => ({ date: d.date, learned: d.learned, frozen: d.kept && !d.learned, lessons: d.lessons, practice: d.practice, xp: d.xp }));
  }
}
