import type pg from 'pg';

/**
 * A learner's progress, for their data export (contract 4 §B2): every XP they
 * earned and what of it counted, their league tier and every league week,
 * their streaks, their badges and showcase, the old achievements, the rated
 * games the ranked badges were counted from, and the league seasons archived
 * before Game Ranks.
 *
 * Only their own rows, and nothing about anyone else in their groups or games.
 * The ratings themselves, every change with its reason and the Game Ranks
 * seasons are the export's `gameRanks` (ranks/gdpr.ts), read from the ranks
 * module's own tables.
 */
type Executor = Pick<pg.Pool, 'query'>;

export async function exportProgress(db: Executor, userId: string): Promise<Record<string, unknown>> {
  const q = async (sql: string) => (await db.query(sql, [userId])).rows;
  return {
    xpLedger: await q(
      `SELECT source, amount, counted, created_at FROM xp_ledger WHERE user_id = $1 ORDER BY created_at`,
    ),
    league: (await q(`SELECT tier, peak_tier, season_key, updated_at FROM user_league WHERE user_id = $1`))[0] ?? null,
    // each week as they raced it: their tier, place, XP and result — not who else was there
    leagueWeeks: await q(
      `SELECT week_key, mode, tier, tier_after, outcome, rank, group_size, weekly_xp, goal_xp, goal_met, trophy, gems
         FROM league_weeks WHERE user_id = $1 ORDER BY week_key`,
    ),
    leagueMemberships: await q(
      `SELECT week_key, tier, joined_at, left_at FROM league_members WHERE user_id = $1 ORDER BY week_key`,
    ),
    streak:
      (
        await q(
          `SELECT current_streak, longest_streak, last_active_on, freezes, days_learned, last_learned_on
             FROM user_streaks WHERE user_id = $1`,
        )
      )[0] ?? null,
    badges: await q(
      `SELECT badge_key, tier, progress, earned_at, tier_earned_at FROM user_badges WHERE user_id = $1 ORDER BY badge_key`,
    ),
    badgeShowcase: (await q(`SELECT badge_keys FROM badge_showcase WHERE user_id = $1`))[0] ?? null,
    achievements: await q(`SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = $1`),
    ratedGames: await q(
      `SELECT game, season_id, finished_at, place, players, left_game, tier_after FROM badge_rated_games
        WHERE user_id = $1 ORDER BY finished_at`,
    ),
    badgeRankSeasons: await q(
      `SELECT season_id, game, peak_tier, rated_games FROM badge_rank_seasons WHERE user_id = $1 ORDER BY season_id, game`,
    ),
    // the quarterly league archive the old season job wrote (its job is gone, the history stays theirs)
    leagueSeasons: await q(
      `SELECT season_key, peak_tier, final_rating, reward_gems, created_at FROM seasons WHERE user_id = $1 ORDER BY season_key`,
    ),
  };
}
