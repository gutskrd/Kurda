import type pg from 'pg';
import type { Redis } from 'ioredis';
import { weekStart } from '../leagues/league-logic.js';
import { rankForScore, withRanks, type BoardType, type RankedEntry, type ScoreRow } from './rank.js';

export interface Board {
  type: BoardType;
  top: RankedEntry[];
  me: { rank: number; score: number } | null;
}

const TOP_N = 50;
/** Weekly board keys carry the week so a new week starts fresh. */
function keyFor(type: BoardType, now: Date): string {
  return type === 'rating' ? 'lb:rating' : `lb:weekly:${weekStart(now)}`;
}

/**
 * Leaderboards (KUR-063). Redis sorted sets give O(log n) rank lookups for the
 * rating and weekly-XP boards; Postgres is the source of truth and there's a
 * rebuild path (and a pure fallback when Redis is absent). Shadow-flagged
 * cheaters (KUR-058) are excluded from every board — silently, so they still
 * see a plausible own-rank and are never told.
 */
export class LeaderboardService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly redis?: Redis,
  ) {}

  /** Source-of-truth scores (excluding shadow-flagged users), highest first. */
  private async scoresFromDb(type: BoardType, now: Date): Promise<ScoreRow[]> {
    const notFlagged = `NOT EXISTS (SELECT 1 FROM cheat_reviews cr WHERE cr.user_id = u.id AND cr.shadow_flagged = true)`;
    if (type === 'rating') {
      const rows = await this.pool.query<{ user_id: string; username: string; score: number }>(
        `SELECT r.user_id, u.username, r.rating AS score
           FROM player_ratings r JOIN users u ON u.id = r.user_id
          WHERE ${notFlagged} AND u.deleted_at IS NULL
          ORDER BY r.rating DESC`,
      );
      return rows.rows.map((r) => ({ userId: r.user_id, username: r.username, score: Number(r.score) }));
    }
    const rows = await this.pool.query<{ user_id: string; username: string; score: string }>(
      `SELECT l.user_id, u.username, SUM(l.amount) AS score
         FROM xp_ledger l JOIN users u ON u.id = l.user_id
        WHERE l.amount > 0 AND l.created_at >= $1::date AND ${notFlagged} AND u.deleted_at IS NULL
        GROUP BY l.user_id, u.username
        HAVING SUM(l.amount) > 0
        ORDER BY SUM(l.amount) DESC`,
      [weekStart(now)],
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

  /** Top N + the caller's own rank (rebuilds lazily if the set is missing). */
  async board(type: BoardType, userId: string, now: Date = new Date()): Promise<Board> {
    if (this.redis) return this.boardFromRedis(type, userId, now);
    return this.boardFromDb(type, userId, now);
  }

  private async boardFromRedis(type: BoardType, userId: string, now: Date): Promise<Board> {
    const key = keyFor(type, now);
    if ((await this.redis!.zcard(key)) === 0) await this.rebuild(type, now);

    const flat = await this.redis!.zrevrange(key, 0, TOP_N - 1, 'WITHSCORES');
    const ids: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      ids.push(flat[i]!);
      scores.push(Number(flat[i + 1]));
    }
    const names = await this.usernames(ids);
    const top = withRanks(ids.map((id, i) => ({ userId: id, username: names.get(id) ?? '', score: scores[i]! })));

    const myScore = await this.myScore(type, userId, now);
    const me =
      myScore === null
        ? null
        : { score: myScore, rank: (await this.redis!.zcount(key, `(${myScore}`, '+inf')) + 1 };
    return { type, top, me };
  }

  private async boardFromDb(type: BoardType, userId: string, now: Date): Promise<Board> {
    const all = await this.scoresFromDb(type, now);
    const top = withRanks(all.slice(0, TOP_N));
    const myScore = await this.myScore(type, userId, now);
    const me =
      myScore === null ? null : { score: myScore, rank: rankForScore(all.map((r) => r.score), myScore) };
    return { type, top, me };
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
