import type { Executor } from './store.js';

/**
 * Game Ranks in a data export (Art. 15): everything stored about the player —
 * their ratings, every change with its reason, their leaves and cooldowns,
 * their Rated/Friendly choices, season results and rewards. Nothing about the
 * other players in their games: game ids only.
 */
export async function exportRanks(db: Executor, userId: string): Promise<Record<string, unknown>> {
  const q = async (sql: string) => (await db.query(sql, [userId])).rows;
  return {
    ratings: await q(
      `SELECT game, mu, sigma, points, rated_games, wins, placement_done, shield_games, last_rated_at, season_id,
              season_games, season_wins, peak_points, best_points, created_at, updated_at
         FROM game_ratings WHERE user_id = $1 ORDER BY game`,
    ),
    history: await q(
      `SELECT game, game_ref, kind, season_id, mu_before, sigma_before, mu_after, sigma_after, points_before, points_after,
              reason, place, weight, voided_at, created_at
         FROM rating_events WHERE user_id = $1 ORDER BY id`,
    ),
    leaves: await q(`SELECT game, game_ref, step, cooldown_until, left_at FROM rated_leaves WHERE user_id = $1 ORDER BY id`),
    preferences: await q(`SELECT game, rated, updated_at FROM rank_preferences WHERE user_id = $1 ORDER BY game`),
    seasons: await q(
      `SELECT season_id, game, rated_games, wins, peak_points, final_points, peak_tier, sterk, created_at
         FROM rank_season_results WHERE user_id = $1 ORDER BY season_id, game`,
    ),
    seasonRewards: await q(
      `SELECT season_id, best_game, best_tier, gems, frame_sku, title, granted_at
         FROM rank_season_rewards WHERE user_id = $1 ORDER BY season_id`,
    ),
  };
}

/**
 * Erasing a child's account takes their Game Ranks with it, as it takes their
 * games and their social data. The seats they held in other people's rated
 * games stay, with no name (`user_id` NULL) — the numbers the other players'
 * replays need, and nothing that points at them. An adult's anonymised
 * account keeps its numbers, tied to no name, like the rest of its learning
 * history; no board lists a closed account.
 */
export async function eraseRanks(db: Executor, userId: string): Promise<void> {
  await db.query(`UPDATE rated_game_players SET user_id = NULL WHERE user_id = $1`, [userId]);
  await db.query(`DELETE FROM rating_events WHERE user_id = $1`, [userId]);
  await db.query(`DELETE FROM game_ratings WHERE user_id = $1`, [userId]);
  await db.query(`DELETE FROM rated_leaves WHERE user_id = $1`, [userId]);
  await db.query(`DELETE FROM rank_preferences WHERE user_id = $1`, [userId]);
  await db.query(`DELETE FROM rank_season_results WHERE user_id = $1`, [userId]);
  await db.query(`DELETE FROM rank_season_rewards WHERE user_id = $1`, [userId]);
  await db.query(`DELETE FROM rating_pair_signals WHERE user_lo = $1 OR user_hi = $1`, [userId]);
}
