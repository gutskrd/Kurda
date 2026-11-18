/**
 * Every game a player has finished, read from each game's own table (never the XP ledger, since a game that paid
 * nothing wrote nothing there), for the rating box and the store prompt:
 *   Peyvok, daily and practice    — won or lost
 *   Rhyming Words training        — the round ended
 *   Typing Race                   — finished with something typed right; a race given up before that was never
 *                                   played, and the apps show no box after a give-up
 *   Peyvok Battle                 — the player's own board finished
 *   Rhyme Match                   — finished with them in it, not left or removed
 *   Stories (duo, group and solo) — finished with them in it, not left or removed by the host
 *   Multiplayer learning games    — the same, from the engine's tables; games against Hevalo count
 *
 * Each source is one SELECT of (user_id, finished_at) on a table with an index starting with user_id, because this
 * runs after every game.
 */
import type pg from 'pg';
import { safeTimeZone } from '../streaks/streak-logic.js';

export const FINISHED_GAME_SOURCES: readonly string[] = [
  `SELECT user_id, finished_at FROM wordle_games WHERE status IN ('won', 'lost') AND finished_at IS NOT NULL`,
  `SELECT user_id, ended_at AS finished_at FROM rhyme_games WHERE status = 'ended' AND ended_at IS NOT NULL`,
  `SELECT user_id, finished_at FROM race_games WHERE finished_at IS NOT NULL AND wpm > 0`,
  `SELECT user_id, finished_at FROM wordle_battle_players WHERE finished_at IS NOT NULL`,
  `SELECT p.user_id, m.finished_at FROM rhyme_match_players p
     JOIN rhyme_matches m ON m.id = p.match_id
    WHERE m.status = 'finished' AND m.finished_at IS NOT NULL AND p.left_at IS NULL AND NOT p.removed`,
  `SELECT p.user_id, g.finished_at FROM story_game_players p
     JOIN story_games g ON g.id = p.game_id
    WHERE g.status = 'finished' AND g.finished_at IS NOT NULL AND p.left_at IS NULL AND NOT p.removed`,
  `SELECT p.user_id, l.finished_at FROM game_lobby_players p
     JOIN game_lobbies l ON l.id = p.lobby_id
    WHERE l.status = 'finished' AND l.finished_at IS NOT NULL AND p.left_at IS NULL AND NOT p.removed AND p.user_id IS NOT NULL`,
];

export interface FinishedGames {
  /** games finished, of every kind */
  games: number;
  /** different calendar days they were finished on, in the player's time zone */
  days: number;
}

/**
 * How many games a player has finished, and on how many days. The user filter on the union is pushed into every
 * branch, where each table's player index answers it.
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
