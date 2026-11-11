import type pg from 'pg';

/**
 * A learner's progress, for their data export (contract 4 §B2): every XP they
 * earned and what of it counted, their league tier and every league week,
 * their streaks and the ones they restored, their badges and showcase, the
 * old achievements, the rated games the ranked badges were counted from, the
 * league seasons archived
 * before Game Ranks, the stories they kept on their shelf and how far they
 * read each one, the dictionary words they saved, their rounds of the
 * learning games with how far up each ladder they climbed, and the levels
 * buildings in The Village reached.
 *
 * A story or a word is named by what they saw (its slug and title, its
 * headword and dialect) rather than by the row ids that join them, which
 * would mean nothing to them.
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
          `SELECT current_streak, longest_streak, last_active_on, freezes, days_learned, last_learned_on,
                  freeze_used_on, ended_streak, ended_last_active_on, ended_restored_on
             FROM user_streaks WHERE user_id = $1`,
        )
      )[0] ?? null,
    // each streak they restored after it ended: which, how long it was, what it cost and when
    streakRepairs: await q(
      `SELECT ended_last_active_on, days, cost_gems, free, repaired_on, created_at FROM streak_repairs WHERE user_id = $1 ORDER BY created_at`,
    ),
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
    storyBookmarks: await q(
      `SELECT s.slug, s.title, b.created_at FROM story_bookmarks b JOIN stories s ON s.id = b.story_id WHERE b.user_id = $1 ORDER BY b.created_at`,
    ),
    // where they got to in each story: the paragraph, how far through it that is, and when they first finished it
    storyReading: await q(
      `SELECT s.slug, s.title, r.paragraph, r.share, r.finished_at, r.updated_at
         FROM story_reading r JOIN stories s ON s.id = r.story_id WHERE r.user_id = $1 ORDER BY r.updated_at`,
    ),
    savedWords: await q(
      `SELECT e.headword, e.dialect, w.saved_at FROM saved_words w JOIN dict_entries e ON e.id = w.entry_id WHERE w.user_id = $1 ORDER BY w.saved_at`,
    ),
    // the learning games: each round as it went (not its items' answers, which are the content's), and how far up each ladder
    learningGames: await q(
      `SELECT game, dialect, difficulty, total_count, correct_count, first_try_count, xp_awarded, learning_counted, created_at, finished_at
         FROM game_sessions WHERE user_id = $1 ORDER BY created_at`,
    ),
    learningGameProgress: await q(`SELECT game, dialect, step, updated_at FROM game_progress WHERE user_id = $1 ORDER BY game, dialect`),
    // the village their learning built: when it was founded, and each level reached, when it was shown and the Zêr it paid
    kingdomVillage: (await q(`SELECT founded_at, intro_seen_at FROM kingdom_villages WHERE user_id = $1`))[0] ?? null,
    kingdomLevels: await q(
      `SELECT building, level, reached_at, seen_at, zer FROM kingdom_levels WHERE user_id = $1 ORDER BY reached_at, building, level`,
    ),
  };
}
