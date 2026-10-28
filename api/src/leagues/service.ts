import type pg from 'pg';
import {
  DEFAULT_WEEKLY_GOAL_XP,
  FIRST_LEAGUE_TIER,
  LEAGUE_GROUP_MIN,
  LEAGUE_GROUP_TARGET,
  LEAGUE_TIERS,
  SEASON_TIER_DROP,
  TIMEZONE_WINDOW_MIN,
  demotionPlaces,
  leagueTierIndex,
  nextWeek,
  previousWeek,
  promotionPlaces,
  resolveGroup,
  seasonDrop,
  seasonsBetween,
  timezoneDistance,
  toLeagueTier,
  weekEndsAt,
  weekMergeAt,
  weekSeason,
  weekStart,
  xpBand,
  type GroupStanding,
  type LeagueStandingRow,
  type LeagueTier,
  type LeagueView,
  type LeagueWeekResult,
  type LeagueWeekXp,
} from '@kurda/shared';
import { utcOffsetMinutes } from './league-logic.js';
import { notKnownAdultSql, shownToSql } from '../users/age.js';
import { countedXpSql, isLearningSource } from '../xp/rules.js';
import type { AwardedXp } from '../xp/service.js';
import type { Notification } from '../push/service.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * SQL: the user behind `alias` takes part in leagues right now — their own
 * choice if they made one, otherwise in for adults and out for minors (and for
 * an account whose age is not on record yet). Read from age at the moment it
 * is asked, so a minor who never chose joins in on their own once they are 18.
 */
export function inLeaguesSql(alias: string): string {
  return `COALESCE(${alias}.leagues_enabled, NOT ${notKnownAdultSql(alias)})`;
}

/**
 * Take a user out of this week's league table.
 *
 * Leaving is immediate rather than at the week's end: somebody who has said
 * they do not want to be ranked should not stay on twenty other people's
 * screens until Sunday. Earlier weeks are history and stay as they were.
 *
 * Their place is kept, marked as left (`left_at`), rather than deleted: coming
 * back the same week returns them to the same group (`ensureMembership`). A
 * fresh placement would let two taps swap a strong group for an empty one
 * late in the week, and a top finish there pays a promotion.
 */
export async function leaveThisWeek(executor: Executor, userId: string, now: Date = new Date()): Promise<void> {
  await executor.query(
    `UPDATE league_members SET left_at = now() WHERE user_id = $1 AND week_key = $2 AND left_at IS NULL`,
    [userId, weekStart(now)],
  );
}

/**
 * Back into this week's group, for someone who left it and has opted in again:
 * the same place, not a new draw (see `leaveThisWeek`). Somebody who had no
 * group this week gets one with their next learning XP.
 */
export async function returnThisWeek(executor: Executor, userId: string, now: Date = new Date()): Promise<void> {
  await executor.query(
    `UPDATE league_members SET left_at = NULL WHERE user_id = $1 AND week_key = $2 AND left_at IS NOT NULL`,
    [userId, weekStart(now)],
  );
}

/**
 * SQL: a ledger row of `alias` inside the week starting at the date in
 * placeholder `week` — Monday 00:00 UTC to the next, whatever the session's
 * own time zone is.
 */
function inWeekSql(alias: string, week: string): string {
  return `${alias}.created_at >= (${week}::date::timestamp AT TIME ZONE 'UTC')
          AND ${alias}.created_at < ((${week}::date + 7)::timestamp AT TIME ZONE 'UTC')`;
}

/** Grants Gems for a rule/refId; injected so leagues stay decoupled (KUR-068). */
export interface GemGranter {
  grant(userId: string, ruleKey: string, refId: string): Promise<{ granted: number }>;
}

/** Publishes a friend-feed milestone; injected so leagues stay decoupled (KUR-087). */
export interface ActivityPublisher {
  publish(actorId: string, type: 'league_promotion', payload: Record<string, unknown>): Promise<unknown>;
}

/** The notification list and push, as the leagues use them: calm, and never more than one push a week. */
export interface LeagueNotices {
  record(userId: string, notification: Notification): Promise<void>;
  push(userId: string, notification: Notification): Promise<void>;
}

/** What a finished league week tells the badges (Hefte, Pêla). */
export interface LeagueWeekListener {
  onLeagueWeek(userIds: string[]): Promise<void>;
}

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

export interface LeagueDeps {
  gems?: GemGranter;
  activity?: ActivityPublisher;
  notices?: LeagueNotices;
  badges?: LeagueWeekListener;
  /** XP a week for promotion to count and for nobody to be demoted (`DEFAULT_WEEKLY_GOAL_XP`) */
  weeklyGoalXp?: number;
  log?: Log;
}

/** One run of the weekly settle or the Wednesday merge, as the admin sees it. */
export interface LeagueRunStatus {
  kind: 'settle' | 'merge';
  weekKey: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  lastError: string | null;
  result: Record<string, unknown>;
}

interface MemberRow {
  user_id: string;
  tier: string;
  username: string;
  shown: boolean;
  xp: number;
}

interface CohortRow {
  id: string;
  tier: string;
  xp_band: number;
  tz_offset_min: number;
  member_count: number;
  created_at: Date;
}

/** A learner's place in a week's league, as `ensureMembership` reads it. */
interface MembershipRow {
  cohort_id: string;
  tier: string;
  left: boolean;
}

/**
 * Learning Leagues (KUR-062, rebuilt by contract 4 §L).
 *
 * A learner joins the week's league the first time they earn *learning* XP in
 * it — a lesson, a practice session, a story — and never by opening a page.
 * They are placed in a group of their tier, near their own last four weeks of
 * XP and within six hours of their clock, filling open groups before starting
 * new ones; a group locks at twenty. Joins of one tier in one week take turns
 * under a lock, so two at once can no longer push a group past its size.
 *
 * The table is ranked by the XP that counts for the league (xp/rules.ts), in
 * one query per table rather than one per member. On Wednesday, groups still
 * under eight are merged into the nearest open group (`mergeSmallGroups`). On
 * Monday the week is settled (`settleDue`) from the job queue, once: the top
 * quarter with the goal met move up, those at the bottom who missed it move
 * down, and every week's result is recorded in `league_weeks`. The first
 * settle of a quarter then moves everyone two tiers down, so the top stays
 * reachable.
 *
 * Somebody whose first XP of a new week arrives before the settle has run is
 * not placed by last week's tier: their own last group is settled first, and
 * the season reset applied, before they join (`ensureMembership`). That was
 * the Monday race — joining at the old tier and then having the settle's
 * promotion overwritten.
 *
 * Only those taking part (`inLeaguesSql`) are placed, shown or moved: someone
 * who opts out (and every teen who has not chosen) is in personal mode — the
 * same weekly goal against their own last weeks — and keeps their tier for
 * when they come back.
 */
export class LeagueService {
  private readonly goalXp: number;

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: LeagueDeps = {},
  ) {
    this.goalXp = deps.weeklyGoalXp ?? DEFAULT_WEEKLY_GOAL_XP;
  }

  get weeklyGoalXp(): number {
    return this.goalXp;
  }

  /** Whether the user is in the leagues at all right now (see `inLeaguesSql`). */
  async takesPart(userId: string): Promise<boolean> {
    const r = await this.pool.query<{ taking_part: boolean }>(
      `SELECT ${inLeaguesSql('u')} AS taking_part FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );
    return r.rows[0]?.taking_part ?? false;
  }

  /**
   * An award landed. Learning XP joins this week's league; any XP that takes a
   * member past the weekly goal tells them, once, that they are safe.
   *
   * Called from the XP service's hook, which can fire inside the award's own
   * transaction: the award may not be visible to this connection yet, or it may
   * — so this week's XP is read without it and its counted amount added.
   */
  async onXp(award: AwardedXp, now: Date = new Date()): Promise<void> {
    const weekKey = weekStart(now);
    // Every award asks the same three things, so they are one read: whether
    // they take part (`takesPart`), their place in this week's league if they
    // have one (`ensureMembership`'s first look), and the week's XP before this
    // award (`noteSafe`).
    const facts = await this.pool.query<{ taking_part: boolean; xp: number } & Partial<MembershipRow> & { safe_noted: boolean | null }>(
      `SELECT ${inLeaguesSql('u')} AS taking_part,
              m.cohort_id, m.tier, m.left_at IS NOT NULL AS left, m.safe_notified_at IS NOT NULL AS safe_noted,
              (SELECT COALESCE(SUM(${countedXpSql('l')}), 0)::int FROM xp_ledger l
                WHERE l.user_id = u.id AND ${inWeekSql('l', '$3')}
                  AND NOT (l.source = $4 AND l.ref_id IS NOT DISTINCT FROM $5)) AS xp
         FROM users u LEFT JOIN league_members m ON m.week_key = $2 AND m.user_id = u.id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [award.userId, weekKey, weekKey, award.source, award.refId ?? null],
    );
    const row = facts.rows[0];
    if (!row?.taking_part) return;
    const member = row.cohort_id ? { cohort_id: row.cohort_id, tier: row.tier!, left: row.left! } : null;
    if (isLearningSource(award.source)) await this.ensureMembership(award.userId, now, member);
    // a member already told this week has nothing more to hear
    if (row.safe_noted) return;
    await this.noteSafe(award, weekKey, row.xp);
  }

  private async noteSafe(award: AwardedXp, weekKey: string, xpBefore: number): Promise<void> {
    if (award.counted <= 0) return;
    const xp = xpBefore + award.counted;
    if (xp < this.goalXp) return;
    const claimed = await this.pool.query<{ tier: string }>(
      `UPDATE league_members SET safe_notified_at = now()
        WHERE user_id = $1 AND week_key = $2 AND left_at IS NULL AND safe_notified_at IS NULL
        RETURNING tier`,
      [award.userId, weekKey],
    );
    const tier = toLeagueTier(claimed.rows[0]?.tier);
    if (!tier || !this.deps.notices) return;
    // English for the list; the apps write their own words from `data`
    await this.deps.notices
      .record(award.userId, {
        category: 'progress',
        title: 'Safe this week',
        body: 'You met your weekly goal, so your league place is safe.',
        data: { kind: 'league_safe', weekKey, tier },
      })
      .catch((err) => this.deps.log?.warn({ err }, 'league safe notice not recorded'));
  }

  /**
   * Put the user in a group for the current week if they are not in one — or,
   * for one who left this week and is back, return them to the one they left
   * (see `leaveThisWeek`). Their earlier weeks are settled first and the
   * season reset applied, so the tier they join at is the one they earned.
   */
  async ensureMembership(
    userId: string,
    now: Date = new Date(),
    /** their row in this week's league, or null for none, when the caller has just read it (`onXp`) */
    known?: MembershipRow | null,
  ): Promise<{ cohortId: string; tier: LeagueTier }> {
    const weekKey = weekStart(now);
    const existing =
      known !== undefined
        ? known
        : (
            await this.pool.query<MembershipRow>(
              `SELECT cohort_id, tier, left_at IS NOT NULL AS left FROM league_members WHERE week_key = $1 AND user_id = $2`,
              [weekKey, userId],
            )
          ).rows[0] ?? null;
    if (existing) {
      if (existing.left) {
        await this.pool.query(`UPDATE league_members SET left_at = NULL WHERE week_key = $1 AND user_id = $2`, [
          weekKey,
          userId,
        ]);
      }
      return { cohortId: existing.cohort_id, tier: toLeagueTier(existing.tier) ?? FIRST_LEAGUE_TIER };
    }

    // outside the join's transaction: settling takes the group's lock and then
    // its members' rows, and holding this user's row meanwhile could cross
    // another member doing the same
    await this.settleOwnPastWeeks(userId, weekKey);

    const facts = await this.pool.query<{ timezone: string | null; band_xp: number }>(
      `SELECT u.timezone,
              (SELECT COALESCE(SUM(${countedXpSql('l')}), 0)::int FROM xp_ledger l
                WHERE l.user_id = u.id
                  AND l.created_at >= (($2::date - 28)::timestamp AT TIME ZONE 'UTC')
                  AND l.created_at < ($2::date::timestamp AT TIME ZONE 'UTC')) AS band_xp
         FROM users u WHERE u.id = $1`,
      [userId, weekKey],
    );
    const offset = utcOffsetMinutes(facts.rows[0]?.timezone ?? 'UTC', now);
    const band = xpBand(facts.rows[0]?.band_xp ?? 0);

    return this.tx(async (client) => {
      const tier = await this.currentTier(client, userId, weekKey);
      // joins to one tier's groups take turns: the count read below is the
      // count the insert lands on
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`league-join:${weekKey}:${tier}`]);
      const recheck = await client.query<{ cohort_id: string; tier: string }>(
        `SELECT cohort_id, tier FROM league_members WHERE week_key = $1 AND user_id = $2`,
        [weekKey, userId],
      );
      if (recheck.rows[0]) {
        return { cohortId: recheck.rows[0].cohort_id, tier: toLeagueTier(recheck.rows[0].tier) ?? tier };
      }
      const cohortId =
        (await this.openGroupFor(client, weekKey, tier, band, offset, now)) ??
        (
          await client.query<{ id: string }>(
            `INSERT INTO league_cohorts (week_key, tier, xp_band, tz_offset_min) VALUES ($1, $2, $3, $4) RETURNING id`,
            [weekKey, tier, band, offset],
          )
        ).rows[0]!.id;
      await client.query(
        `INSERT INTO league_members (cohort_id, user_id, week_key, tier) VALUES ($1, $2, $3, $4)`,
        [cohortId, userId, weekKey, tier],
      );
      await client.query(`UPDATE league_cohorts SET member_count = member_count + 1 WHERE id = $1`, [cohortId]);
      return { cohortId, tier };
    });
  }

  /**
   * The best open group for a joiner: same tier and week, room left, within six
   * hours of their clock and one XP band of theirs — the closest band first,
   * then the closest clock, then the fullest, so open groups fill before new
   * ones start. After Wednesday's merge any open group of the tier will do: a
   * late joiner is better in a group than alone in a new one.
   */
  private async openGroupFor(
    client: Executor,
    weekKey: string,
    tier: LeagueTier,
    band: number,
    offset: number,
    now: Date,
  ): Promise<string | null> {
    const open = await client.query<CohortRow>(
      `SELECT id, tier, xp_band, tz_offset_min, member_count, created_at FROM league_cohorts
        WHERE week_key = $1 AND tier = $2 AND NOT settled AND merged_into IS NULL AND member_count < $3`,
      [weekKey, tier, LEAGUE_GROUP_TARGET],
    );
    const lateInWeek = now.getTime() >= weekMergeAt(weekKey).getTime();
    const ranked = open.rows
      .map((c) => ({
        c,
        bandGap: Math.abs(c.xp_band - band),
        tzGap: timezoneDistance(c.tz_offset_min, offset),
      }))
      .filter((x) => lateInWeek || (x.bandGap <= 1 && x.tzGap <= TIMEZONE_WINDOW_MIN))
      .sort(
        (a, b) =>
          a.bandGap - b.bandGap ||
          a.tzGap - b.tzGap ||
          b.c.member_count - a.c.member_count ||
          a.c.created_at.getTime() - b.c.created_at.getTime(),
      );
    return ranked[0]?.c.id ?? null;
  }

  /**
   * The learner's tier for `weekKey`, their row locked for the join. A first
   * league starts in Dilop, in the current season; a learner last seen in an
   * earlier season moves down two tiers for each one that has begun since.
   */
  private async currentTier(client: Executor, userId: string, weekKey: string): Promise<LeagueTier> {
    const season = weekSeason(weekKey);
    await client.query(
      `INSERT INTO user_league (user_id, tier, season_key) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`,
      [userId, FIRST_LEAGUE_TIER, season],
    );
    const row = await client.query<{ tier: string; season_key: string }>(
      `SELECT tier, season_key FROM user_league WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const stored = toLeagueTier(row.rows[0]?.tier) ?? FIRST_LEAGUE_TIER;
    const missed = seasonsBetween(row.rows[0]?.season_key ?? season, season);
    if (missed === 0) return stored;
    const dropped = seasonDrop(stored, missed);
    await client.query(`UPDATE user_league SET tier = $2, season_key = $3, updated_at = now() WHERE user_id = $1`, [
      userId,
      dropped,
      season,
    ]);
    return dropped;
  }

  /** Settle any group of an earlier week the user is in that has not been settled yet. */
  private async settleOwnPastWeeks(userId: string, weekKey: string): Promise<void> {
    const due = await this.pool.query<{ cohort_id: string }>(
      `SELECT m.cohort_id FROM league_members m JOIN league_cohorts c ON c.id = m.cohort_id
        WHERE m.user_id = $1 AND m.week_key < $2 AND NOT c.settled
        ORDER BY m.week_key`,
      [userId, weekKey],
    );
    for (const row of due.rows) await this.settleCohort(row.cohort_id);
  }

  /** A group's members still in it, with this week's counted XP: one query for the whole table. */
  private async groupMembers(executor: Executor, cohortId: string, weekKey: string, viewer: string | null): Promise<MemberRow[]> {
    // somebody who left mid-week (leaveThisWeek), whose default changed under
    // them (an adult account found to be a minor's) or whose account is gone
    // is not in the table: nobody is shown who is not taking part
    const rows = await executor.query<MemberRow>(
      `SELECT m.user_id, m.tier, u.username, ${shownToSql('u', '$3::uuid')} AS shown,
              COALESCE((SELECT SUM(${countedXpSql('l')}) FROM xp_ledger l
                         WHERE l.user_id = m.user_id AND ${inWeekSql('l', '$2')}), 0)::int AS xp
         FROM league_members m JOIN users u ON u.id = m.user_id
        WHERE m.cohort_id = $1 AND m.left_at IS NULL AND u.deleted_at IS NULL AND ${inLeaguesSql('u')}`,
      [cohortId, weekKey, viewer],
    );
    return rows.rows;
  }

  private standingsOf(members: MemberRow[]): GroupStanding[] {
    return resolveGroup(
      members.map((m) => ({ userId: m.user_id, tier: toLeagueTier(m.tier) ?? FIRST_LEAGUE_TIER, weeklyXp: m.xp })),
      this.goalXp,
    );
  }

  /** This week's counted XP for one learner. */
  private async weeklyXp(userId: string, weekKey: string): Promise<number> {
    const r = await this.pool.query<{ xp: number }>(
      `SELECT COALESCE(SUM(${countedXpSql('l')}), 0)::int AS xp FROM xp_ledger l WHERE l.user_id = $1 AND ${inWeekSql('l', '$2')}`,
      [userId, weekKey],
    );
    return r.rows[0]?.xp ?? 0;
  }

  /**
   * `GET /me/league`: the learner's week, in whichever mode they are in.
   * Reading it never joins anyone. It does settle the learner's own last group
   * if the Monday settle has not reached it yet, so the result card and the
   * tier shown are the ones they earned.
   */
  async standings(userId: string, now: Date = new Date()): Promise<LeagueView> {
    const weekKey = weekStart(now);
    await this.settleOwnPastWeeks(userId, weekKey);
    const takesPart = await this.takesPart(userId);
    const weeklyXp = await this.weeklyXp(userId, weekKey);
    const goalMet = weeklyXp >= this.goalXp;
    const [lastWeek, recentWeeks] = await Promise.all([this.lastWeek(userId, weekKey), this.recentWeeks(userId, weekKey)]);
    const base = {
      weekKey,
      endsAt: weekEndsAt(weekKey).toISOString(),
      weeklyXp,
      goalXp: this.goalXp,
      goalMet,
      lastWeek,
      recentWeeks,
    };
    const empty = { rank: 0, groupSize: 0, promoteCount: 0, demoteCount: 0, standings: [] as LeagueStandingRow[] };

    const kept = await this.pool.query<{ tier: string; season_key: string }>(
      `SELECT tier, season_key FROM user_league WHERE user_id = $1`,
      [userId],
    );
    // the tier they will race at: kept while away, less any season reset since
    const keptTier = toLeagueTier(kept.rows[0]?.tier);
    const tier = keptTier ? seasonDrop(keptTier, seasonsBetween(kept.rows[0]!.season_key, weekSeason(weekKey))) : null;

    if (!takesPart) {
      return { mode: 'personal', optedOut: true, joined: false, tier, safe: false, ...base, ...empty };
    }
    const member = await this.pool.query<{ cohort_id: string; tier: string }>(
      `SELECT cohort_id, tier FROM league_members WHERE week_key = $1 AND user_id = $2 AND left_at IS NULL`,
      [weekKey, userId],
    );
    if (!member.rows[0]) {
      return { mode: 'league', optedOut: false, joined: false, tier, safe: false, ...base, ...empty };
    }
    const myTier = toLeagueTier(member.rows[0].tier) ?? FIRST_LEAGUE_TIER;
    const rows = await this.groupMembers(this.pool, member.rows[0].cohort_id, weekKey, userId);
    const byId = new Map(rows.map((r) => [r.user_id, r]));
    const ranked = this.standingsOf(rows);
    const standings: LeagueStandingRow[] = ranked.map((s) => {
      const row = byId.get(s.userId)!;
      return {
        userId: row.shown ? s.userId : null,
        username: row.shown ? row.username : null,
        weeklyXp: s.weeklyXp,
        rank: s.rank,
        isSelf: s.userId === userId,
        tier: s.tier,
        zone: s.zone,
      };
    });
    const mine = ranked.find((s) => s.userId === userId);
    const tierMembers = ranked.filter((s) => s.tier === myTier).length;
    return {
      mode: 'league',
      optedOut: false,
      joined: true,
      tier: myTier,
      ...base,
      // met the goal in a league: demotion is no longer possible this week
      safe: goalMet,
      rank: mine?.rank ?? standings.length,
      groupSize: standings.length,
      promoteCount: promotionPlaces(tierMembers, standings.length, myTier),
      demoteCount: demotionPlaces(tierMembers, standings.length, myTier),
      standings,
    };
  }

  private async lastWeek(userId: string, weekKey: string): Promise<LeagueWeekResult | null> {
    const r = await this.pool.query<{
      week_key: string;
      mode: 'league' | 'personal';
      tier: string | null;
      tier_after: string | null;
      outcome: 'promoted' | 'demoted' | 'stayed' | null;
      rank: number | null;
      group_size: number | null;
      weekly_xp: number;
      goal_xp: number;
      goal_met: boolean;
      trophy: boolean;
      gems: number;
    }>(`SELECT * FROM league_weeks WHERE user_id = $1 AND week_key = $2`, [userId, previousWeek(weekKey)]);
    const w = r.rows[0];
    if (!w) return null;
    return {
      weekKey: w.week_key,
      mode: w.mode,
      tier: toLeagueTier(w.tier),
      tierAfter: toLeagueTier(w.tier_after),
      outcome: w.outcome,
      rank: w.rank,
      groupSize: w.group_size,
      weeklyXp: w.weekly_xp,
      goalXp: w.goal_xp,
      goalMet: w.goal_met,
      trophy: w.trophy,
      gems: w.gems,
    };
  }

  /** The four weeks before this one and this one, oldest first: "you vs last week". */
  private async recentWeeks(userId: string, weekKey: string): Promise<LeagueWeekXp[]> {
    const weeks = [weekKey];
    for (let i = 0; i < 4; i++) weeks.unshift(previousWeek(weeks[0]!));
    const r = await this.pool.query<{ week: string; xp: number }>(
      `SELECT to_char(date_trunc('week', l.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week,
              SUM(${countedXpSql('l')})::int AS xp
         FROM xp_ledger l
        WHERE l.user_id = $1
          AND l.created_at >= ($2::date::timestamp AT TIME ZONE 'UTC')
          AND l.created_at < (($3::date + 7)::timestamp AT TIME ZONE 'UTC')
        GROUP BY 1`,
      [userId, weeks[0], weekKey],
    );
    const byWeek = new Map(r.rows.map((x) => [x.week, x.xp]));
    return weeks.map((w) => {
      const xp = byWeek.get(w) ?? 0;
      return { weekKey: w, xp, goalMet: xp >= this.goalXp };
    });
  }

  // ---- the weekly settle -------------------------------------------------------

  /**
   * Settle one group (idempotent: the group's row is locked and claimed, and a
   * settled group is left alone). Each member's next tier is written and their
   * week recorded; then, after the commit, promotion Gems are paid — once per
   * tier per season, which the grant's key enforces — and the badges hear of it.
   * Returns the standings it settled (empty when it had been settled already).
   */
  async settleCohort(cohortId: string): Promise<GroupStanding[]> {
    const settled = await this.tx(async (client) => {
      const cohort = await client.query<{ week_key: string; settled: boolean }>(
        `SELECT week_key, settled FROM league_cohorts WHERE id = $1 FOR UPDATE`,
        [cohortId],
      );
      const c = cohort.rows[0];
      if (!c || c.settled) return null;
      const members = await this.groupMembers(client, cohortId, c.week_key, null);
      const standings = this.standingsOf(members);
      const season = weekSeason(c.week_key);
      // Three statements for the whole group rather than three per member.
      // Members' rows in one order everywhere (the insert takes them in the
      // order given), so two settles never wait on each other in a circle.
      const ordered = [...standings].sort((a, b) => (a.userId < b.userId ? -1 : 1));
      if (ordered.length > 0) {
        const kept = await client.query<{ user_id: string; season_key: string }>(
          `INSERT INTO user_league (user_id, tier, season_key)
           SELECT m.user_id, m.tier, $3::text FROM unnest($1::uuid[], $2::text[]) WITH ORDINALITY AS m(user_id, tier, n) ORDER BY m.n
           ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
           RETURNING user_id, season_key`,
          [ordered.map((s) => s.userId), ordered.map((s) => s.tier), season],
        );
        const seasonOf = new Map(kept.rows.map((r) => [r.user_id, r.season_key]));
        // a reset that already reached this learner (a later season's join)
        // applies to this result too, so a late settle cannot undo it
        const after = ordered.map((s) => seasonDrop(s.tierAfter, seasonsBetween(season, seasonOf.get(s.userId)!)));
        await client.query(
          `UPDATE user_league ul SET tier = m.tier, updated_at = now(),
             peak_tier = CASE
               WHEN ul.peak_tier IS NULL OR array_position($3::text[], m.tier) > array_position($3::text[], ul.peak_tier)
               THEN m.tier ELSE ul.peak_tier END
             FROM unnest($1::uuid[], $2::text[]) AS m(user_id, tier)
            WHERE ul.user_id = m.user_id`,
          [ordered.map((s) => s.userId), after, LEAGUE_TIERS],
        );
        await client.query(
          `INSERT INTO league_weeks
             (user_id, week_key, mode, cohort_id, tier, tier_after, outcome, rank, group_size, weekly_xp, goal_xp, goal_met, trophy)
           SELECT w.user_id, $1::text, 'league', $2::uuid, w.tier, w.tier_after, w.outcome, w.rank, $3::int, w.weekly_xp, $4::int, w.goal_met, w.trophy
             FROM unnest($5::uuid[], $6::text[], $7::text[], $8::text[], $9::int[], $10::int[], $11::boolean[], $12::boolean[])
               AS w(user_id, tier, tier_after, outcome, rank, weekly_xp, goal_met, trophy)
           ON CONFLICT (user_id, week_key) DO NOTHING`,
          [
            c.week_key,
            cohortId,
            standings.length,
            this.goalXp,
            ordered.map((s) => s.userId),
            ordered.map((s) => s.tier),
            after,
            ordered.map((s) => s.outcome),
            ordered.map((s) => s.rank),
            ordered.map((s) => s.weeklyXp),
            ordered.map((s) => s.goalMet),
            ordered.map((s) => s.trophy),
          ],
        );
      }
      await client.query(`UPDATE league_cohorts SET settled = true, settled_at = now() WHERE id = $1`, [cohortId]);
      return { weekKey: c.week_key, standings };
    });
    if (!settled) return [];

    // promotion Gems + feed events, after the tier writes commit
    const season = weekSeason(settled.weekKey);
    for (const s of settled.standings) {
      if (s.outcome !== 'promoted') continue;
      if (this.deps.gems) {
        const result = await this.deps.gems
          .grant(s.userId, 'league_promotion', `${season}:${s.tierAfter}:${s.userId}`)
          .catch(() => null);
        const granted = result?.granted ?? 0;
        if (granted > 0) {
          await this.pool.query(`UPDATE league_weeks SET gems = $3 WHERE user_id = $1 AND week_key = $2`, [
            s.userId,
            settled.weekKey,
            granted,
          ]);
        }
      }
      await this.deps.activity?.publish(s.userId, 'league_promotion', { tier: s.tierAfter }).catch(() => undefined);
    }
    await this.deps.badges
      ?.onLeagueWeek(settled.standings.map((s) => s.userId))
      .catch((err) => this.deps.log?.warn({ err }, 'league week not passed to the badges'));
    return settled.standings;
  }

  /**
   * The weekly settle (the `league-settle` job: Monday 00:00 UTC, and at
   * startup to catch up). Settles every group of a closed week, records the
   * week of everyone in personal mode, applies the season reset when a new
   * quarter has begun, and tells the promoted. Every step is idempotent, and
   * the run is recorded per week, so starting it twice — two processes, a
   * retry, the admin's "re-run" — changes nothing the first did not.
   */
  async settleDue(now: Date = new Date(), opts: { force?: boolean } = {}): Promise<LeagueRunStatus> {
    const weekKey = weekStart(now);
    const run = await this.claimRun('settle', weekKey, opts.force ?? false);
    if (!run) return (await this.runStatus('settle', weekKey))!;
    try {
      // a group merged away has nobody left in it to settle
      await this.pool.query(
        `UPDATE league_cohorts SET settled = true, settled_at = now()
          WHERE NOT settled AND merged_into IS NOT NULL AND week_key < $1`,
        [weekKey],
      );
      const due = await this.pool.query<{ id: string; week_key: string }>(
        `SELECT id, week_key FROM league_cohorts WHERE NOT settled AND week_key < $1 ORDER BY week_key, created_at`,
        [weekKey],
      );
      for (const cohort of due.rows) await this.settleCohort(cohort.id);

      // personal mode, and anyone who earned XP last week outside a group: their
      // week is recorded too (the weekly-goal badge, the result card, the export)
      const personalWeeks = [previousWeek(weekKey)];
      for (let i = 0; i < 3; i++) personalWeeks.push(previousWeek(personalWeeks[personalWeeks.length - 1]!));
      let personal = 0;
      for (const week of personalWeeks) {
        const inserted = await this.pool.query<{ user_id: string }>(
          `INSERT INTO league_weeks (user_id, week_key, mode, weekly_xp, goal_xp, goal_met)
           SELECT l.user_id, $1::text, 'personal', SUM(${countedXpSql('l')})::int, $2::int, SUM(${countedXpSql('l')}) >= $2
             FROM xp_ledger l JOIN users u ON u.id = l.user_id
            WHERE ${inWeekSql('l', '$1')} AND u.deleted_at IS NULL
            GROUP BY l.user_id
           HAVING SUM(${countedXpSql('l')}) > 0
           ON CONFLICT (user_id, week_key) DO NOTHING
           RETURNING user_id`,
          [week, this.goalXp],
        );
        personal += inserted.rowCount ?? 0;
        if (inserted.rows.length > 0) {
          await this.deps.badges
            ?.onLeagueWeek(inserted.rows.map((r) => r.user_id))
            .catch((err) => this.deps.log?.warn({ err }, 'personal weeks not passed to the badges'));
        }
      }

      const reset = await this.applySeasonReset(weekSeason(weekKey));
      const notified = await this.notifyResults(personalWeeks[0]!);
      const result = { cohorts: due.rows.length, personal, reset, notified };
      await this.pool.query(
        `UPDATE league_runs SET finished_at = now(), last_error = NULL, result = $3::jsonb WHERE kind = $1 AND week_key = $2`,
        ['settle', weekKey, JSON.stringify(result)],
      );
      return (await this.runStatus('settle', weekKey))!;
    } catch (err) {
      await this.pool
        .query(`UPDATE league_runs SET last_error = $3 WHERE kind = $1 AND week_key = $2`, [
          'settle',
          weekKey,
          err instanceof Error ? err.message : String(err),
        ])
        .catch(() => undefined);
      throw err;
    }
  }

  /**
   * Everyone moves down two tiers when a season begins (never below Dilop), so
   * the top stays reachable. Applied once per learner per season: their row
   * says which season's reset it already reflects, and a join that got there
   * first has applied it already (`currentTier`).
   */
  async applySeasonReset(season: string): Promise<number> {
    // seasons are 'YYYY-Qn': year*4+n orders them, and the difference is how
    // many resets a row has missed (somebody away a whole year missed four)
    const ordinal = (k: string) => `(split_part(${k}, '-Q', 1)::int * 4 + split_part(${k}, '-Q', 2)::int)`;
    const moved = await this.pool.query(
      `UPDATE user_league
          SET tier = ($2::text[])[GREATEST(
                array_position($2::text[], tier) - $3::int * GREATEST(${ordinal('$1')} - ${ordinal('season_key')}, 0), 1)],
              season_key = $1, updated_at = now()
        WHERE season_key <> $1 AND season_key ~ '^[0-9]{4}-Q[1-4]$'
          AND ${ordinal('season_key')} < ${ordinal('$1')}`,
      [season, LEAGUE_TIERS, SEASON_TIER_DROP],
    );
    return moved.rowCount ?? 0;
  }

  /**
   * Tell the promoted and the trophy winners of a week, once each: the row is
   * claimed before the notification goes. A week where somebody stayed or
   * moved down sends nothing — their result card says it calmly when they next
   * look, and nobody is pushed a message about going down.
   */
  private async notifyResults(weekKey: string): Promise<number> {
    const claimed = await this.pool.query<{ user_id: string; tier_after: string; outcome: string; trophy: boolean }>(
      `UPDATE league_weeks SET notified_at = now()
        WHERE week_key = $1 AND mode = 'league' AND notified_at IS NULL AND (outcome = 'promoted' OR trophy)
        RETURNING user_id, tier_after, outcome, trophy`,
      [weekKey],
    );
    if (!this.deps.notices) return claimed.rows.length;
    for (const row of claimed.rows) {
      const promoted = row.outcome === 'promoted';
      const notification: Notification = {
        category: 'progress',
        title: promoted ? 'You moved up a league' : 'A Pêla week',
        body: promoted
          ? 'Last week took you up a league. Well done.'
          : 'You finished in the top three of your Okyanûs group last week.',
        data: { kind: promoted ? 'league_promotion' : 'league_trophy', weekKey, tier: row.tier_after },
      };
      await this.deps.notices
        .push(row.user_id, notification)
        .catch((err) => this.deps.log?.warn({ err }, 'league result not sent'));
    }
    return claimed.rows.length;
  }

  // ---- Wednesday's merge -------------------------------------------------------

  /**
   * Merge groups still under eight on Wednesday 00:00 UTC into the nearest open
   * group (the `league-merge` job), so nobody spends a week in a league of two.
   * The nearest is a group of the same tier first, by clock, then a group of a
   * neighbouring tier — whose members keep racing in their own tier, scored on
   * their own (`resolveGroup`). A merge never takes a group past twenty. Joins
   * to the week wait while it runs (it holds every tier's join lock, in tier
   * order, so it cannot cross a join).
   */
  async mergeSmallGroups(now: Date = new Date(), opts: { force?: boolean } = {}): Promise<LeagueRunStatus | null> {
    const weekKey = weekStart(now);
    if (now.getTime() < weekMergeAt(weekKey).getTime()) return null;
    const run = await this.claimRun('merge', weekKey, opts.force ?? false);
    if (!run) return this.runStatus('merge', weekKey);
    try {
      const merges = await this.tx(async (client) => {
        for (const tier of LEAGUE_TIERS) {
          await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`league-join:${weekKey}:${tier}`]);
        }
        const groups = await client.query<CohortRow & { active: number }>(
          `SELECT c.id, c.tier, c.xp_band, c.tz_offset_min, c.member_count, c.created_at,
                  (SELECT count(*)::int FROM league_members m WHERE m.cohort_id = c.id AND m.left_at IS NULL) AS active
             FROM league_cohorts c
            WHERE c.week_key = $1 AND NOT c.settled AND c.merged_into IS NULL
            FOR UPDATE`,
          [weekKey],
        );
        const live = new Map(groups.rows.map((g) => [g.id, { ...g }]));
        let count = 0;
        for (;;) {
          const small = [...live.values()].filter((g) => g.active < LEAGUE_GROUP_MIN).sort((a, b) => a.active - b.active);
          let merged = false;
          for (const from of small) {
            const target = this.mergeTarget(from, [...live.values()]);
            if (!target) continue;
            await client.query(`UPDATE league_members SET cohort_id = $2 WHERE cohort_id = $1`, [from.id, target.id]);
            await client.query(`UPDATE league_cohorts SET member_count = member_count + $2 WHERE id = $1`, [
              target.id,
              from.member_count,
            ]);
            await client.query(
              `UPDATE league_cohorts SET member_count = 0, merged_into = $2, settled = true, settled_at = now() WHERE id = $1`,
              [from.id, target.id],
            );
            target.member_count += from.member_count;
            target.active += from.active;
            live.delete(from.id);
            count += 1;
            merged = true;
            break;
          }
          if (!merged) break;
        }
        return count;
      });
      await this.pool.query(
        `UPDATE league_runs SET finished_at = now(), last_error = NULL, result = $3::jsonb WHERE kind = $1 AND week_key = $2`,
        ['merge', weekKey, JSON.stringify({ merged: merges })],
      );
      return this.runStatus('merge', weekKey);
    } catch (err) {
      await this.pool
        .query(`UPDATE league_runs SET last_error = $3 WHERE kind = $1 AND week_key = $2`, [
          'merge',
          weekKey,
          err instanceof Error ? err.message : String(err),
        ])
        .catch(() => undefined);
      throw err;
    }
  }

  /** The group a small one goes into: same tier first, then a neighbouring tier; the closest clock; room for all of it. */
  private mergeTarget<G extends CohortRow & { active: number }>(from: G, groups: G[]): G | null {
    const fromTier = toLeagueTier(from.tier) ?? FIRST_LEAGUE_TIER;
    const candidates = groups
      .filter((g) => g.id !== from.id && g.member_count + from.member_count <= LEAGUE_GROUP_TARGET)
      .map((g) => ({
        g,
        tierGap: Math.abs(leagueTierIndex(toLeagueTier(g.tier) ?? FIRST_LEAGUE_TIER) - leagueTierIndex(fromTier)),
        tzGap: timezoneDistance(g.tz_offset_min, from.tz_offset_min),
      }))
      .filter((x) => x.tierGap <= 1)
      // into the bigger of two small groups, so the merge moves the fewest people
      .sort((a, b) => a.tierGap - b.tierGap || a.tzGap - b.tzGap || b.g.active - a.g.active || (a.g.id < b.g.id ? -1 : 1));
    return candidates[0]?.g ?? null;
  }

  // ---- runs, for the job and the admin -----------------------------------------

  /** Start a run unless this week's already finished (or `force`); null when there is nothing to do. */
  private async claimRun(kind: 'settle' | 'merge', weekKey: string, force: boolean): Promise<boolean> {
    const r = await this.pool.query(
      `INSERT INTO league_runs (kind, week_key) VALUES ($1, $2)
       ON CONFLICT (kind, week_key) DO UPDATE
         SET attempts = league_runs.attempts + 1, started_at = now(),
             finished_at = CASE WHEN $3 THEN NULL ELSE league_runs.finished_at END
       WHERE league_runs.finished_at IS NULL OR $3
       RETURNING kind`,
      [kind, weekKey, force],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async runStatus(kind: 'settle' | 'merge', weekKey: string): Promise<LeagueRunStatus | null> {
    const r = await this.pool.query<{
      started_at: Date;
      finished_at: Date | null;
      attempts: number;
      last_error: string | null;
      result: Record<string, unknown>;
    }>(`SELECT started_at, finished_at, attempts, last_error, result FROM league_runs WHERE kind = $1 AND week_key = $2`, [
      kind,
      weekKey,
    ]);
    const row = r.rows[0];
    if (!row) return null;
    return {
      kind,
      weekKey,
      startedAt: row.started_at.toISOString(),
      finishedAt: row.finished_at?.toISOString() ?? null,
      attempts: row.attempts,
      lastError: row.last_error,
      result: row.result,
    };
  }

  /** Admin: a week's groups (sizes, tiers, bands, clocks, whether settled or merged) and its runs. */
  async adminOverview(weekKey: string): Promise<{
    weekKey: string;
    goalXp: number;
    /** the settle that ran as this week began (it closed the week before) */
    settle: LeagueRunStatus | null;
    /** the settle that closed this week; null until it has run */
    closedBy: LeagueRunStatus | null;
    merge: LeagueRunStatus | null;
    groups: Array<{
      id: string;
      tier: LeagueTier;
      members: number;
      active: number;
      xpBand: number;
      tzOffsetMin: number;
      settled: boolean;
      mergedInto: string | null;
    }>;
    tiers: Record<LeagueTier, number>;
  }> {
    const groups = await this.pool.query<{
      id: string;
      tier: string;
      member_count: number;
      active: number;
      xp_band: number;
      tz_offset_min: number;
      settled: boolean;
      merged_into: string | null;
    }>(
      `SELECT c.id, c.tier, c.member_count, c.xp_band, c.tz_offset_min, c.settled, c.merged_into,
              (SELECT count(*)::int FROM league_members m WHERE m.cohort_id = c.id AND m.left_at IS NULL) AS active
         FROM league_cohorts c WHERE c.week_key = $1 ORDER BY c.tier, c.created_at`,
      [weekKey],
    );
    const tiers = await this.pool.query<{ tier: string; n: number }>(
      `SELECT tier, count(*)::int AS n FROM user_league GROUP BY tier`,
    );
    const tierCounts = Object.fromEntries(LEAGUE_TIERS.map((t) => [t, 0])) as Record<LeagueTier, number>;
    for (const row of tiers.rows) {
      const t = toLeagueTier(row.tier);
      if (t) tierCounts[t] += row.n;
    }
    return {
      weekKey,
      goalXp: this.goalXp,
      settle: await this.runStatus('settle', weekKey),
      closedBy: await this.runStatus('settle', nextWeek(weekKey)),
      merge: await this.runStatus('merge', weekKey),
      groups: groups.rows.map((g) => ({
        id: g.id,
        tier: toLeagueTier(g.tier) ?? FIRST_LEAGUE_TIER,
        members: g.member_count,
        active: g.active,
        xpBand: g.xp_band,
        tzOffsetMin: g.tz_offset_min,
        settled: g.settled,
        mergedInto: g.merged_into,
      })),
      tiers: tierCounts,
    };
  }

  /** Admin: one group's table, with names (staff see who is in it) and each member's projected result. */
  async adminGroup(cohortId: string): Promise<{
    id: string;
    weekKey: string;
    tier: LeagueTier;
    settled: boolean;
    standings: Array<GroupStanding & { username: string }>;
  } | null> {
    const c = await this.pool.query<{ week_key: string; tier: string; settled: boolean }>(
      `SELECT week_key, tier, settled FROM league_cohorts WHERE id = $1`,
      [cohortId],
    );
    const cohort = c.rows[0];
    if (!cohort) return null;
    const rows = await this.groupMembers(this.pool, cohortId, cohort.week_key, null);
    const names = new Map(rows.map((r) => [r.user_id, r.username]));
    return {
      id: cohortId,
      weekKey: cohort.week_key,
      tier: toLeagueTier(cohort.tier) ?? FIRST_LEAGUE_TIER,
      settled: cohort.settled,
      standings: this.standingsOf(rows).map((s) => ({ ...s, username: names.get(s.userId) ?? '' })),
    };
  }

  private async tx<R>(fn: (client: pg.PoolClient) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
