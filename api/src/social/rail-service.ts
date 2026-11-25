import type pg from 'pg';
import { GAME_NAMES } from '@kurda/shared';
import { resolveSections } from './profile-activity.js';
import { levelInfo, resolveAvatarUrl, type LevelInfo, type PublicUrl } from '../cosmetics/access.js';
import { unseenGiftsSql } from '../shop/service.js';
import { multiTitleSql, playedGamesSql } from '../mp/titles.js';

/**
 * What is happening with your people, in one read: friends, who is online, what they play, waiting invites and
 * requests, and unread counts. The rail polls, so separate endpoints would cost round trips and disagree.
 */

/**
 * How long a game may run before it stops counting as "playing": a `status = 'playing'` row only shows a game was
 * started and not finished, and a closed tab leaves one forever.
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
  /** What they are playing now, if anything. */
  activity: LiveActivity | null;
}

interface ActivityRow {
  user_id: string;
  game: string;
  started_at: Date;
}

/** Every in-progress game per player in one UNION, the newest picked by the database; multiplayer learning games share one branch. */
const LIVE_GAMES_SQL = `
  SELECT DISTINCT ON (user_id) user_id, game, started_at FROM (
    SELECT w.user_id, '${GAME_NAMES.peyvok}' AS game, w.started_at
      FROM wordle_games w
     WHERE w.user_id = ANY($1) AND w.status = 'playing' AND w.finished_at IS NULL
       AND w.started_at > now() - ($2 || ' minutes')::interval
    UNION ALL
    SELECT r.user_id, '${GAME_NAMES.rhyme}', r.started_at
      FROM rhyme_games r
     WHERE r.user_id = ANY($1) AND r.status = 'active' AND r.ended_at IS NULL
       AND r.started_at > now() - ($2 || ' minutes')::interval
    UNION ALL
    SELECT g.user_id, '${GAME_NAMES.race}', g.started_at
      FROM race_games g
     WHERE g.user_id = ANY($1) AND g.finished_at IS NULL
       AND g.started_at > now() - ($2 || ' minutes')::interval
    UNION ALL
    SELECT p.user_id, '${GAME_NAMES['wordle-battle']}', COALESCE(b.started_at, b.created_at)
      FROM wordle_battle_players p
      JOIN wordle_battles b ON b.id = p.battle_id
     WHERE p.user_id = ANY($1) AND p.status = 'playing' AND p.finished_at IS NULL AND NOT p.removed
       AND b.finished_at IS NULL
       AND COALESCE(b.started_at, b.created_at) > now() - ($2 || ' minutes')::interval
    UNION ALL
    SELECT p.user_id, '${GAME_NAMES['rhyme-match']}', COALESCE(m.started_at, m.created_at)
      FROM rhyme_match_players p
      JOIN rhyme_matches m ON m.id = p.match_id
     WHERE p.user_id = ANY($1) AND m.finished_at IS NULL AND NOT p.removed AND p.left_at IS NULL
       AND COALESCE(m.started_at, m.created_at) > now() - ($2 || ' minutes')::interval
    UNION ALL
    SELECT p.user_id, ${multiTitleSql('l.game')}, COALESCE(l.started_at, l.created_at)
      FROM game_lobby_players p
      JOIN game_lobbies l ON l.id = p.lobby_id
     WHERE p.user_id = ANY($1) AND l.finished_at IS NULL AND NOT p.removed AND p.left_at IS NULL
       AND ${playedGamesSql('l.game')}
       AND COALESCE(l.started_at, l.created_at) > now() - ($2 || ' minutes')::interval
  ) AS live
  ORDER BY user_id, started_at DESC`;

/** You, as the rail needs you: a face, a level, and what you can spend. */
export interface RailSelf {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: LevelInfo;
  balances: { zer: number };
}

/** `self`, and the gifts you have not opened yet, which ride along on the same read. */
export interface RailSelfRead {
  you: RailSelf | null;
  unseenGifts: number;
}

export class SocialRailService {
  constructor(private readonly pool: pg.Pool) {}

  /** What each of these people is playing now, leaving out anyone who hides the Games section on their profile. */
  async liveActivity(userIds: readonly string[]): Promise<Map<string, LiveActivity>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();

    // each player's newest game, with their profile's sections beside it: one read
    const games = await this.pool.query<ActivityRow & { profile_sections: unknown }>(
      `SELECT live.user_id, live.game, live.started_at, u.profile_sections
         FROM (${LIVE_GAMES_SQL}) live LEFT JOIN users u ON u.id = live.user_id`,
      [ids, String(LIVE_GAME_MAX_MINUTES)],
    );

    const out = new Map<string, LiveActivity>();
    for (const row of games.rows) {
      if (resolveSections(row.profile_sections).games === false) continue;
      out.set(row.user_id, { game: row.game, since: row.started_at.toISOString() });
    }
    return out;
  }

  /** You: face, level and purse in the same read, so the rail polls once and level and balance never arrive separately. */
  async self(userId: string, publicUrl: PublicUrl): Promise<RailSelfRead> {
    const rows = await this.pool.query<{
      username: string;
      display_name: string | null;
      profile_photo_key: string | null;
      selected_avatar_key: string | null;
      xp: number;
      zer: string | null;
      unseen_gifts: string;
    }>(
      `SELECT u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.xp,
              max(w.balance) FILTER (WHERE w.currency = 'zer') AS zer,
              ${unseenGiftsSql('u.id')} AS unseen_gifts
         FROM users u
         LEFT JOIN wallet_balances w ON w.user_id = u.id
        WHERE u.id = $1
        GROUP BY u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.xp`,
      [userId],
    );
    const row = rows.rows[0];
    if (!row) return { you: null, unseenGifts: 0 };

    return {
      you: {
        username: row.username,
        displayName: row.display_name,
        avatarUrl: resolveAvatarUrl(row.profile_photo_key, row.selected_avatar_key, publicUrl),
        // Computed on the server only, so level has one formula.
        level: levelInfo(row.xp),
        // a missing wallet row is a zero balance, not a missing balance
        balances: { zer: Number(row.zer ?? 0) },
      },
      unseenGifts: Number(row.unseen_gifts ?? 0),
    };
  }
}
