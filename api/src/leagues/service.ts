import type pg from 'pg';
import {
  COHORT_SIZE,
  demote,
  isTier,
  previousWeek,
  promote,
  resolveStandings,
  TIERS,
  weekStart,
  type CohortMember,
  type Tier,
} from './league-logic.js';

/** Grants Gems for a rule/refId; injected so leagues stay decoupled (KUR-068). */
export interface GemGranter {
  grant(userId: string, ruleKey: string, refId: string): Promise<unknown>;
}

export interface StandingRow {
  userId: string;
  username: string;
  weeklyXp: number;
  rank: number;
  isSelf: boolean;
}

export interface LeagueView {
  tier: Tier;
  weekKey: string;
  rank: number;
  promoteCount: number;
  demoteCount: number;
  standings: StandingRow[];
}

/**
 * Weekly leagues (KUR-062). Players are lazily bucketed into 30-user cohorts on
 * their first XP of the (UTC) week, ranked by that week's XP (summed from the
 * ledger), and promoted/demoted when the week closes. Promotions pay the
 * config-driven league_promotion Gems (KUR-068).
 */
export class LeagueService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly gems?: GemGranter,
  ) {}

  private async currentTier(client: Pick<pg.Pool, 'query'>, userId: string): Promise<Tier> {
    const row = await client.query<{ tier: string }>(
      `INSERT INTO user_league (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING tier`,
      [userId],
    );
    const tier = row.rows[0]?.tier ?? 'bronze';
    return isTier(tier) ? tier : 'bronze';
  }

  /** XP earned → make sure the user is in a cohort for this week (lazy join). */
  async onXp(userId: string, now: Date = new Date()): Promise<void> {
    await this.ensureMembership(userId, now);
  }

  /** Assign the user to a cohort for the current week if not already in one. */
  async ensureMembership(userId: string, now: Date = new Date()): Promise<{ cohortId: string; tier: Tier }> {
    const weekKey = weekStart(now);
    const existing = await this.pool.query<{ cohort_id: string; tier: string }>(
      `SELECT cohort_id, tier FROM league_members WHERE week_key = $1 AND user_id = $2`,
      [weekKey, userId],
    );
    if (existing.rows[0]) {
      const t = existing.rows[0].tier;
      return { cohortId: existing.rows[0].cohort_id, tier: isTier(t) ? t : 'bronze' };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tier = await this.currentTier(client, userId);
      // re-check under the row lock (currentTier locked user_league)
      const recheck = await client.query<{ cohort_id: string }>(
        `SELECT cohort_id FROM league_members WHERE week_key = $1 AND user_id = $2`,
        [weekKey, userId],
      );
      if (recheck.rows[0]) {
        await client.query('COMMIT');
        return { cohortId: recheck.rows[0].cohort_id, tier };
      }

      // an open cohort in this tier/week, or a fresh one
      const open = await client.query<{ id: string }>(
        `SELECT c.id FROM league_cohorts c
          WHERE c.week_key = $1 AND c.tier = $2 AND c.settled = false
            AND (SELECT count(*) FROM league_members m WHERE m.cohort_id = c.id) < $3
          ORDER BY c.created_at LIMIT 1`,
        [weekKey, tier, COHORT_SIZE],
      );
      let cohortId = open.rows[0]?.id;
      if (!cohortId) {
        const created = await client.query<{ id: string }>(
          `INSERT INTO league_cohorts (week_key, tier) VALUES ($1, $2) RETURNING id`,
          [weekKey, tier],
        );
        cohortId = created.rows[0]!.id;
      }
      await client.query(
        `INSERT INTO league_members (cohort_id, user_id, week_key, tier)
         VALUES ($1, $2, $3, $4) ON CONFLICT (week_key, user_id) DO NOTHING`,
        [cohortId, userId, weekKey, tier],
      );
      await client.query('COMMIT');
      return { cohortId, tier };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Sum of a user's XP within a week window [weekKey, weekKey+7d). */
  private async weeklyXp(userId: string, weekKey: string): Promise<number> {
    const row = await this.pool.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(amount), 0)::text sum FROM xp_ledger
        WHERE user_id = $1
          AND created_at >= $2::date AND created_at < ($2::date + INTERVAL '7 days')`,
      [userId, weekKey],
    );
    return Number(row.rows[0]?.sum ?? 0);
  }

  /** The caller's current cohort standings (ensures membership first). */
  async standings(userId: string, now: Date = new Date()): Promise<LeagueView> {
    const { cohortId, tier } = await this.ensureMembership(userId, now);
    const weekKey = weekStart(now);
    const rows = await this.pool.query<{ user_id: string; username: string }>(
      `SELECT m.user_id, u.username FROM league_members m JOIN users u ON u.id = m.user_id
        WHERE m.cohort_id = $1`,
      [cohortId],
    );
    const members: Array<CohortMember & { username: string }> = await Promise.all(
      rows.rows.map(async (r) => ({
        userId: r.user_id,
        username: r.username,
        weeklyXp: await this.weeklyXp(r.user_id, weekKey),
      })),
    );
    const ranked = resolveStandings(members);
    const byId = new Map(members.map((m) => [m.userId, m.username]));
    const standings: StandingRow[] = ranked.map((s) => ({
      userId: s.userId,
      username: byId.get(s.userId) ?? '',
      weeklyXp: s.weeklyXp,
      rank: s.rank,
      isSelf: s.userId === userId,
    }));
    return {
      tier,
      weekKey,
      rank: standings.find((s) => s.isSelf)?.rank ?? standings.length,
      promoteCount: 10,
      demoteCount: 5,
      standings,
    };
  }

  /**
   * Settle every cohort from a closed week (idempotent via `settled`). Promotes
   * the top 10, demotes the bottom 5, updates each player's tier for next week,
   * and pays league-promotion Gems. Returns the number of cohorts settled.
   */
  async settleDueWeeks(now: Date = new Date()): Promise<number> {
    const currentWeek = weekStart(now);
    const due = await this.pool.query<{ id: string; week_key: string; tier: string }>(
      `SELECT id, week_key, tier FROM league_cohorts
        WHERE settled = false AND week_key < $1`,
      [currentWeek],
    );

    let settled = 0;
    for (const cohort of due.rows) {
      await this.settleCohort(cohort.id, cohort.week_key, isTier(cohort.tier) ? cohort.tier : 'bronze');
      settled += 1;
    }
    return settled;
  }

  private async settleCohort(cohortId: string, weekKey: string, tier: Tier): Promise<void> {
    const members = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM league_members WHERE cohort_id = $1`,
      [cohortId],
    );
    const withXp: CohortMember[] = await Promise.all(
      members.rows.map(async (m) => ({ userId: m.user_id, weeklyXp: await this.weeklyXp(m.user_id, weekKey) })),
    );
    const standings = resolveStandings(withXp);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // claim the cohort; a concurrent settle sees settled=true and skips
      const claim = await client.query(
        `UPDATE league_cohorts SET settled = true WHERE id = $1 AND settled = false`,
        [cohortId],
      );
      if ((claim.rowCount ?? 0) === 0) {
        await client.query('COMMIT');
        return;
      }
      for (const s of standings) {
        const nextTier = s.outcome === 'promoted' ? promote(tier) : s.outcome === 'demoted' ? demote(tier) : tier;
        if (nextTier !== tier) {
          // bump peak_tier only when the new tier is a season high (KUR-065)
          await client.query(
            `UPDATE user_league SET tier = $2, updated_at = now(),
               peak_tier = CASE
                 WHEN array_position($3::text[], peak_tier) IS NULL
                   OR array_position($3::text[], $2) > array_position($3::text[], peak_tier)
                 THEN $2 ELSE peak_tier END
             WHERE user_id = $1`,
            [s.userId, nextTier, TIERS as unknown as string[]],
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    // promotion Gems, after the tier writes commit (idempotent per week/user)
    if (this.gems) {
      for (const s of standings) {
        if (s.outcome === 'promoted') {
          await this.gems.grant(s.userId, 'league_promotion', `${weekKey}:${s.userId}`).catch(() => undefined);
        }
      }
    }
  }

  /** For diagnostics/tests: the previous week key relative to now. */
  lastWeek(now: Date = new Date()): string {
    return previousWeek(weekStart(now));
  }
}
