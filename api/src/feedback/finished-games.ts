/**
 * Every game a player has finished, from the games' own tables — what the
 * rating box and the store prompt count (eligibility.ts).
 *
 * "Finished" is each game's own end, read where the game records it, never
 * the XP ledger (a game that paid nothing wrote nothing there):
 *   Wordle, daily and practice    — won or lost, never left playing
 *   Rhyming Words (training)      — the round ended
 *   Typing Race                   — finished (giving up finishes it too; the
 *                                   apps do not show the box after that)
 *   Wordle Battle                 — the player's own board finished
 *   Rhyme Match                   — the match finished with them in it
 *
 * Each source is one SELECT of (user_id, finished_at), so a new game is one
 * line here — on a table with an index that starts with user_id, because this
 * runs after every game (migration 156 added the two the multiplayer player
 * tables lacked). Stories, once its games are merged (contract §A, migration
 * 147), with the index its players table has on user_id:
 *   `SELECT p.user_id, g.finished_at FROM story_game_players p
 *      JOIN story_games g ON g.id = p.game_id
 *     WHERE g.status = 'finished' AND p.left_at IS NULL AND NOT p.removed`
 * (a player the host removed is marked `removed` and may never have left),
 * and once play's lobbies are (migration 149, which gives match players
 * `left_at` and `removed`), the Rhyme Match line gains
 * `AND p.left_at IS NULL AND NOT p.removed`: leaving a match is not finishing it.
 */
import type pg from 'pg';
import { safeTimeZone } from '../streaks/streak-logic.js';

export const FINISHED_GAME_SOURCES: readonly string[] = [
  `SELECT user_id, finished_at FROM wordle_games WHERE status IN ('won', 'lost') AND finished_at IS NOT NULL`,
  `SELECT user_id, ended_at AS finished_at FROM rhyme_games WHERE status = 'ended' AND ended_at IS NOT NULL`,
  `SELECT user_id, finished_at FROM race_games WHERE finished_at IS NOT NULL`,
  `SELECT user_id, finished_at FROM wordle_battle_players WHERE finished_at IS NOT NULL`,
  `SELECT p.user_id, m.finished_at FROM rhyme_match_players p
     JOIN rhyme_matches m ON m.id = p.match_id WHERE m.status = 'finished' AND m.finished_at IS NOT NULL`,
];

export interface FinishedGames {
  /** games finished, of every kind */
  games: number;
  /** different calendar days they were finished on, in the player's time zone */
  days: number;
}

/**
 * How many games a player has finished, and on how many days.
 *
 * The user filter is applied to the union as a whole; Postgres pushes it into
 * every branch, where each table's index on the player answers it.
 */
export async function countFinishedGames(
  executor: Pick<pg.Pool, 'query'>,
  userId: string,
  timeZone: string | null,
): Promise<FinishedGames> {
  const res = await executor.query<{ games: number; days: number }>(
    `SELECT count(*)::int AS games,
            count(DISTINCT (g.finished_at AT TIME ZONE $2)::date)::int AS days
       FROM (${FINISHED_GAME_SOURCES.join('\n UNION ALL ')}) AS g
      WHERE g.user_id = $1`,
    [userId, safeTimeZone(timeZone)],
  );
  return { games: res.rows[0]?.games ?? 0, days: res.rows[0]?.days ?? 0 };
}
