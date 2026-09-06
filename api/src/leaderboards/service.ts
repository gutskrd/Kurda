import type pg from 'pg';
import type { Redis } from 'ioredis';
import { weekStart } from '../leagues/league-logic.js';
import {
  rankForScore,
  withRanks,
  type BoardScope,
  type BoardType,
  type RankedEntry,
  type ScoreRow,
} from './rank.js';

export interface Board {
  type: BoardType;
  scope: BoardScope;
  top: RankedEntry[];
  /** how many people are on this board altogether, so a client knows when to stop paging */
  total: number;
  me: { rank: number; score: number } | null;
  /**
   * Country scope only: the country the board covers, or null when the caller
   * has not set one — the difference between "nobody here yet" and "we do not
   * know where you are" matters to what the UI should say.
   */
  country?: string | null;
}

export interface BoardOptions {
  scope?: BoardScope;
  limit?: number;
  offset?: number;
  now?: Date;
}

/** One page of a board. Small enough to read, large enough to be worth loading. */
export const PAGE_SIZE = 25;
/** Never serve more than this in one request, however large a limit is asked for. */
const MAX_PAGE = 100;

/** Weekly board keys carry the week so a new week starts fresh. */
function keyFor(type: BoardType, now: Date): string {
  return type === 'rating' ? 'lb:rating' : `lb:weekly:${weekStart(now)}`;
}

/**
 * Leaderboards (KUR-063). Redis sorted sets give O(log n) rank lookups for the
 * global rating and weekly-XP boards; Postgres is the source of truth and there's
 * a rebuild path (and a pure fallback when Redis is absent). Shadow-flagged
 * cheaters (KUR-058) are excluded from every board — silently, so they still see
 * a plausible own-rank and are never told.
 *
 * Friends and country boards always come from Postgres: a sorted set cannot be
 * filtered by who you know or where you live without reading it all back, which
 * would cost more than the query it replaces.
 */
export class LeaderboardService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly redis?: Redis,
  ) {}

  /**
   * Source-of-truth scores (excluding shadow-flagged users), highest first.
   *
   * A filter narrows the board to a set of people (friends) or a country. The
   * country is filtered in SQL rather than by collecting every id there first —
   * that list is unbounded, and the query can do it.
   */
  private async scoresFromDb(
    type: BoardType,
    now: Date,
    filter?: { ids?: string[]; country?: string },
  ): Promise<ScoreRow[]> {
    const notFlagged = `NOT EXISTS (SELECT 1 FROM cheat_reviews cr WHERE cr.user_id = u.id AND cr.shadow_flagged = true)`;
    // an empty allow-list means "no such people", not "everyone"
    if (filter?.ids && filter.ids.length === 0) return [];

    // weekly_xp needs the week start first, so the scope parameter is appended
    // after it and numbered from whatever the array already holds
    const params: unknown[] = type === 'rating' ? [] : [weekStart(now)];
    let scoped = '';
    if (filter?.ids) {
      params.push(filter.ids);
      scoped = `AND u.id = ANY($${params.length})`;
    } else if (filter?.country) {
      params.push(filter.country);
      scoped = `AND u.country = $${params.length}`;
    }

    if (type === 'rating') {
      const rows = await this.pool.query<{ user_id: string; username: string; score: number }>(
        `SELECT r.user_id, u.username, r.rating AS score
           FROM player_ratings r JOIN users u ON u.id = r.user_id
          WHERE ${notFlagged} AND u.deleted_at IS NULL ${scoped}
          ORDER BY r.rating DESC`,
        params,
      );
      return rows.rows.map((r) => ({ userId: r.user_id, username: r.username, score: Number(r.score) }));
    }

    const rows = await this.pool.query<{ user_id: string; username: string; score: string }>(
      `SELECT l.user_id, u.username, SUM(l.amount) AS score
         FROM xp_ledger l JOIN users u ON u.id = l.user_id
        WHERE l.amount > 0 AND l.created_at >= $1::date AND ${notFlagged} AND u.deleted_at IS NULL ${scoped}
        GROUP BY l.user_id, u.username
        HAVING SUM(l.amount) > 0
        ORDER BY SUM(l.amount) DESC`,
      params,
    );
    return rows.rows.map((r) => ({ userId: r.user_id, username: r.username, score: Number(r.score) }));
  }

  /** Rebuild a board's sorted set from Postgres (Redis is a cache). */
  async rebuild(type: BoardType, now: Date = new Date()): Promise<number> {
    const rows = await this.scoresFromDb(type, now);
    if (this.redis) {
      const key = keyFor(type, now);
      const pipeline = this.redis.multi();
      pipeline.del(key);
      if (rows.length > 0) {
        const args: (string | number)[] = [];
        for (const r of rows) args.push(r.score, r.userId);
        pipeline.zadd(key, ...(args as [number, string]));
      }
      if (type !== 'rating') pipeline.expire(key, 14 * 24 * 60 * 60); // fortnight TTL
      await pipeline.exec();
    }
    return rows.length;
  }

  /** One page of a board, plus the caller's own rank within that same board. */
  /**
   * A leaderboard.
   *
   * `userId` is null for a signed-out reader, who gets the global board with no
   * `me` on it. The friends and country scopes are about a particular person, so
   * they come back empty rather than inventing an answer.
   */
  async board(type: BoardType, userId: string | null, opts: BoardOptions = {}): Promise<Board> {
    const now = opts.now ?? new Date();
    const scope = opts.scope ?? 'global';
    const limit = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), MAX_PAGE);
    const offset = Math.max(opts.offset ?? 0, 0);

    if (scope === 'global') {
      if (this.redis) return this.globalFromRedis(type, userId, now, limit, offset);
      return this.fromRows(type, scope, userId, await this.scoresFromDb(type, now), now, limit, offset);
    }

    if (scope === 'friends') {
      if (userId === null) return { type, scope, top: [], total: 0, me: null };
      const ids = await this.friendIds(userId);
      // you belong on your own friends board — a ranking you are absent from
      // gives you nothing to measure against
      const rows = await this.scoresFromDb(type, now, { ids: [...ids, userId] });
      return this.fromRows(type, scope, userId, rows, now, limit, offset);
    }

    if (userId === null) return { type, scope, top: [], total: 0, me: null, country: null };
    const country = await this.countryOf(userId);
    // no country set is different from an empty board, and the UI says so
    if (!country) return { type, scope, top: [], total: 0, me: null, country: null };
    const rows = await this.scoresFromDb(type, now, { country });
    return { ...(await this.fromRows(type, scope, userId, rows, now, limit, offset)), country };
  }

  /** Page a set of already-ranked rows and work out the caller's place in them. */
  private async fromRows(
    type: BoardType,
    scope: BoardScope,
    userId: string | null,
    all: ScoreRow[],
    now: Date,
    limit: number,
    offset: number,
  ): Promise<Board> {
    const top = withRanks(all.slice(offset, offset + limit), offset);
    // a signed-out reader has no place on the board to find
    const myScore = userId === null ? null : await this.myScore(type, userId, now);
    const me =
      myScore === null ? null : { score: myScore, rank: rankForScore(all.map((r) => r.score), myScore) };
    return { type, scope, top, total: all.length, me };
  }

  private async globalFromRedis(
    type: BoardType,
    userId: string | null,
    now: Date,
    limit: number,
    offset: number,
  ): Promise<Board> {
    const key = keyFor(type, now);
    if ((await this.redis!.zcard(key)) === 0) await this.rebuild(type, now);

    const flat = await this.redis!.zrevrange(key, offset, offset + limit - 1, 'WITHSCORES');
    const ids: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      ids.push(flat[i]!);
      scores.push(Number(flat[i + 1]));
    }
    const names = await this.usernames(ids);
    const top = withRanks(
      ids.map((id, i) => ({ userId: id, username: names.get(id) ?? '', score: scores[i]! })),
      offset,
    );

    const total = await this.redis!.zcard(key);
    const myScore = userId === null ? null : await this.myScore(type, userId, now);
    const me =
      myScore === null
        ? null
        : { score: myScore, rank: (await this.redis!.zcount(key, `(${myScore}`, '+inf')) + 1 };
    return { type, scope: 'global', top, total, me };
  }

  /** Accepted friends only; the pair is stored canonically, so check both sides. */
  private async friendIds(userId: string): Promise<string[]> {
    const rows = await this.pool.query<{ id: string }>(
      `SELECT CASE WHEN user_lo = $1 THEN user_hi ELSE user_lo END AS id
         FROM friendships
        WHERE status = 'accepted' AND $1 IN (user_lo, user_hi)`,
      [userId],
    );
    return rows.rows.map((r) => r.id);
  }

  private async countryOf(userId: string): Promise<string | null> {
    const rows = await this.pool.query<{ country: string | null }>(
      `SELECT country FROM users WHERE id = $1`,
      [userId],
    );
    return rows.rows[0]?.country ?? null;
  }

  /** The caller's raw score (independent of flag status, so they aren't tipped off). */
  private async myScore(type: BoardType, userId: string, now: Date): Promise<number | null> {
    if (type === 'rating') {
      const row = await this.pool.query<{ rating: number }>(
        `SELECT rating FROM player_ratings WHERE user_id = $1`,
        [userId],
      );
      return row.rows[0] ? Number(row.rows[0].rating) : null;
    }
    const row = await this.pool.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(amount), 0)::text sum FROM xp_ledger
        WHERE user_id = $1 AND amount > 0 AND created_at >= $2::date`,
      [userId, weekStart(now)],
    );
    const sum = Number(row.rows[0]?.sum ?? 0);
    return sum > 0 ? sum : null;
  }

  private async usernames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.pool.query<{ id: string; username: string }>(
      `SELECT id, username FROM users WHERE id = ANY($1)`,
      [ids],
    );
    return new Map(rows.rows.map((r) => [r.id, r.username]));
  }
}
