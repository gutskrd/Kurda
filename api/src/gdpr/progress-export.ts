import type pg from 'pg';

/**
 * A learner's progress for their data export: XP and what counted, league tier and weeks, streaks, repairs and
 * milestones, their Zêr and its ledger, members' boxes, the gift bag and their gift limit, badges, old achievements, the rated games behind ranked badges,
 * archived league seasons, shelved stories and reading progress, saved words, learning-game rounds and ladders, riddles,
 * and the village's levels. Stories and words are named by what the learner saw (slug, title, headword, dialect), not
 * row ids. Only their own rows; ratings and Game Ranks seasons are the export's `gameRanks` (ranks/gdpr.ts).
 */
type Executor = Pick<pg.Pool, 'query'>;

export async function exportProgress(db: Executor, userId: string): Promise<Record<string, unknown>> {
  const q = async (sql: string) => (await db.query(sql, [userId])).rows;
  return {
    xpLedger: await q(
      `SELECT source, amount, counted, created_at FROM xp_ledger WHERE user_id = $1 ORDER BY created_at`,
    ),
    league: (await q(`SELECT tier, peak_tier, season_key, updated_at FROM user_league WHERE user_id = $1`))[0] ?? null,
    // Each week as they raced it: tier, place, XP and result, not who else was there.
    leagueWeeks: await q(
      `SELECT week_key, mode, tier, tier_after, outcome, rank, group_size, weekly_xp, goal_xp, goal_met, trophy, zer
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
    // Each streak restored after it ended: which, how long, how (a free restore or won back by learning) and when.
    streakRepairs: await q(
      `SELECT ended_last_active_on, days, cost, free, won_back, repaired_on, created_at FROM streak_repairs WHERE user_id = $1 ORDER BY created_at`,
    ),
    // The streak milestones that paid, and what.
    streakMilestones: await q(`SELECT days, paid_on, zer FROM streak_milestones WHERE user_id = $1 ORDER BY paid_on, days`),
    // Their Zêr, and every movement of it, the retired Gewher's history included.
    wallet: {
      balance: (await q(`SELECT balance FROM wallet_balances WHERE user_id = $1 AND currency = 'zer'`))[0]?.balance ?? 0,
      ledger: await q(`SELECT currency, amount, reason, created_at FROM wallet_ledger WHERE user_id = $1 ORDER BY created_at`),
    },
    // A Hevalo+ member's monthly boxes: what each held, and the free gifts left.
    membersBoxes: await q(
      `SELECT to_char(month, 'YYYY-MM') AS month, zer, free_gifts, free_gifts_left, item_sku, granted_at FROM members_boxes WHERE user_id = $1 ORDER BY month`,
    ),
    // The gift bag: what it holds, every gift that landed in it and why, and their own limit on spending on gifts.
    giftBag: {
      items: await q(`SELECT sku, count, updated_at FROM gift_bag WHERE user_id = $1 ORDER BY sku`),
      landed: await q(`SELECT sku, source, ref, granted_on, created_at FROM gift_bag_grants WHERE user_id = $1 ORDER BY created_at`),
      spendingLimit:
        (await q(`SELECT period, zer, pending_period, pending_zer, pending_from, updated_at FROM gift_spend_limits WHERE user_id = $1`))[0] ?? null,
    },
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
    // The quarterly league archive the retired season job wrote; the history stays theirs.
    leagueSeasons: await q(
      `SELECT season_key, peak_tier, final_rating, reward_zer, created_at FROM seasons WHERE user_id = $1 ORDER BY season_key`,
    ),
    storyBookmarks: await q(
      `SELECT s.slug, s.title, b.created_at FROM story_bookmarks b JOIN stories s ON s.id = b.story_id WHERE b.user_id = $1 ORDER BY b.created_at`,
    ),
    // Reading progress per story: the paragraph, how far through, and when first finished.
    storyReading: await q(
      `SELECT s.slug, s.title, r.paragraph, r.share, r.finished_at, r.updated_at
         FROM story_reading r JOIN stories s ON s.id = r.story_id WHERE r.user_id = $1 ORDER BY r.updated_at`,
    ),
    savedWords: await q(
      `SELECT e.headword, e.dialect, w.saved_at FROM saved_words w JOIN dict_entries e ON e.id = w.entry_id WHERE w.user_id = $1 ORDER BY w.saved_at`,
    ),
    // Learning-game rounds as played (not item answers, which are content) and ladder heights.
    learningGames: await q(
      `SELECT game, dialect, difficulty, total_count, correct_count, first_try_count, xp_awarded, learning_counted, created_at, finished_at
         FROM game_sessions WHERE user_id = $1 ORDER BY created_at`,
    ),
    learningGameProgress: await q(`SELECT game, dialect, step, updated_at FROM game_progress WHERE user_id = $1 ORDER BY game, dialect`),
    // Riddles met: hints taken, guesses, when solved or revealed, and what a solve paid.
    riddles: await q(
      `SELECT c.payload->>'slug' AS slug, c.dialect, r.hints_used, r.guesses, r.solved_at, r.revealed_at, r.xp_awarded, r.created_at, r.updated_at
         FROM riddle_progress r JOIN game_content c ON c.id = r.content_id WHERE r.user_id = $1 ORDER BY r.created_at`,
    ),
    // Their village: when founded, and each level reached, when shown and the Zêr it paid.
    kingdomVillage: (await q(`SELECT founded_at, intro_seen_at FROM kingdom_villages WHERE user_id = $1`))[0] ?? null,
    kingdomLevels: await q(
      `SELECT building, level, reached_at, seen_at, zer FROM kingdom_levels WHERE user_id = $1 ORDER BY reached_at, building, level`,
    ),
  };
}
