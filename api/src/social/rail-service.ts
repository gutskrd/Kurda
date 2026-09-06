import type pg from 'pg';
import { resolveSections } from './profile-activity.js';

/**
 * What is happening with your people, in one read.
 *
 * The social rail shows friends, who is online, what they are playing, waiting
 * invites and requests, and unread counts — and it polls. Five endpoints polled
 * separately would be five round trips and five chances to render a rail whose
 * halves disagree with each other, so this assembles one answer.
 */

/**
 * How long a game may have been running before it stops counting as "playing".
 *
 * A row that says `status = 'playing'` is only evidence that a game was started
 * and never finished — a closed tab leaves one behind forever. Without a cap the
 * rail would cheerfully report that someone has been in a Wordle game since
 * Tuesday.
 */
export const LIVE_GAME_MAX_MINUTES = 120;

export interface LiveActivity {
  /** the game's display name */
  game: string;
  /** when it started, so the client can count up from it */
  since: string;
}

export interface RailFriend {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  online: boolean;
  /** null when they have never been seen, or are hiding it */
  lastSeenAt: string | null;
  /** what they are playing right now, when they are playing something */
  activity: LiveActivity | null;
}

interface ActivityRow {
  user_id: string;
  game: string;
  started_at: Date;
}

/**
 * Every in-progress game, per player.
 *
 * One UNION rather than a query per mode: the rail needs at most one line per
 * friend, and picking the newest across five tables is a job for the database
 * rather than five round trips and a sort in JavaScript.
 */
const LIVE_GAMES_SQL = `
  SELECT DISTINCT ON (user_id) user_id, game, started_at FROM (
    SELECT w.user_id, 'Wordle' AS game, w.started_at
      FROM wordle_games w
     WHERE w.user_id = ANY($1) AND w.status = 'playing' AND w.finished_at IS NULL
       AND w.started_at > now() - ($2 || ' minutes')::interval
    UNION ALL
    SELECT r.user_id, 'Rhyming Words', r.started_at
      FROM rhyme_games r
     WHERE r.user_id = ANY($1) AND r.status = 'active' AND r.ended_at IS NULL
       AND r.started_at > now() - ($2 || ' minutes')::interval
    UNION ALL
    SELECT g.user_id, 'Typing Race', g.started_at
      FROM race_games g
     WHERE g.user_id = ANY($1) AND g.finished_at IS NULL
       AND g.started_at > now() - ($2 || ' minutes')::interval
    UNION ALL
    SELECT p.user_id, 'Wordle Battle', COALESCE(b.started_at, b.created_at)
      FROM wordle_battle_players p
      JOIN wordle_battles b ON b.id = p.battle_id
     WHERE p.user_id = ANY($1) AND p.status = 'playing' AND p.finished_at IS NULL
       AND b.finished_at IS NULL
       AND COALESCE(b.started_at, b.created_at) > now() - ($2 || ' minutes')::interval
    UNION ALL
    SELECT p.user_id, 'Rhyme Match', COALESCE(m.started_at, m.created_at)
      FROM rhyme_match_players p
      JOIN rhyme_matches m ON m.id = p.match_id
     WHERE p.user_id = ANY($1) AND m.finished_at IS NULL
       AND COALESCE(m.started_at, m.created_at) > now() - ($2 || ' minutes')::interval
  ) AS live
  ORDER BY user_id, started_at DESC`;

export class SocialRailService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * What each of these people is playing right now.
   *
   * Someone who has turned the Games section off on their profile is left out:
   * hiding your results while broadcasting the match you are in the middle of
   * would make that switch a lie.
   */
  async liveActivity(userIds: readonly string[]): Promise<Map<string, LiveActivity>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();

    const [games, prefs] = await Promise.all([
      this.pool.query<ActivityRow>(LIVE_GAMES_SQL, [ids, String(LIVE_GAME_MAX_MINUTES)]),
      this.pool.query<{ id: string; profile_sections: unknown }>(
        `SELECT id, profile_sections FROM users WHERE id = ANY($1)`,
        [ids],
      ),
    ]);

    const shows = new Map(prefs.rows.map((r) => [r.id, resolveSections(r.profile_sections).games]));
    const out = new Map<string, LiveActivity>();
    for (const row of games.rows) {
      if (shows.get(row.user_id) === false) continue;
      out.set(row.user_id, { game: row.game, since: row.started_at.toISOString() });
    }
    return out;
  }
}
