import type pg from 'pg';
import type { Redis } from 'ioredis';
import { weekStart } from '../leagues/league-logic.js';
import { notKnownAdultSql } from '../users/age.js';
import { countedXpSql } from '../xp/rules.js';
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
function keyFor(_type: BoardType, now: Date): string {
  return `lb:weekly:${weekStart(now)}`;
}

/**
 * How long a friends or country board is kept in Redis. They are read on every
 * visit to the rankings and each is an aggregate over a week of the ledger —
 * the country one over everyone in a country — so a minute or two of
 * staleness buys a lot. The caller's own score and place are always live.
 */
export const FRIENDS_BOARD_TTL_SECONDS = 60;
export const COUNTRY_BOARD_TTL_SECONDS = 120;

/**
 * SQL: the user behind `alias` may be listed on a weekly board of this scope
 * (contract-4 §R6: the weekly boards keep their safety rules and stop listing
 * people who left the leagues or hid their profile).
 *
 * Somebody who has hidden their profile is on no board a stranger reads: the
 * public boards (global, country) list 'everyone' and 'members' profiles only,
 * so a friends-only profile is listed only on a friends board, and a friends
 * board leaves out a profile hidden even from friends ('nobody'). Somebody who
 * opted out of the leagues ("don't rank me") is on no weekly board at all. An
 * account whose leagues setting was never chosen (a teen in personal mode) is
 * not "out": a friends board still shows them to their friends, as before.
 * Whoever is left out still sees their own score and place.
 */
function listedSql(alias: string, scope: 'public' | 'friends'): string {
  const shown =
    scope === 'public'
      ? `${alias}.profile_visibility IN ('everyone', 'members')`
      : `${alias}.profile_visibility <> 'nobody'`;
  return `(${shown} AND ${alias}.leagues_enabled IS DISTINCT FROM false)`;
}

/**
 * Leaderboards (KUR-063). Redis sorted sets give O(log n) rank lookups for the
 * global weekly-XP board; Postgres is the source of truth and there's
 * a rebuild path (and a pure fallback when Redis is absent). Shadow-flagged
 * cheaters (KUR-058) are excluded from every board — silently, so they still see
 * a plausible own-rank and are never told.
 *
 * Friends and country boards come from Postgres: a sorted set cannot be
 * filtered by who you know or where you live without reading it all back, which
 * would cost more than the query it replaces. Each is kept in Redis for a
 * minute or two once worked out (`cachedScores`), since every visit to the
 * rankings asked for it again.
 *
 * Nobody is listed who hid their profile from the people reading the board, and
 * nobody is on a weekly board who opted out of the leagues (`listedSql`).
 *
 * The global and country boards are readable by anyone, signed in or not, so
 * they name only people known to be adults: a minor, or an account whose age
 * is not on record yet, is never on them (users/age.ts). They still see their
 * own score and place, worked out against everyone else, as a shadow-flagged
 * player does. The friends board is about people you know, and shows them all.
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
    filter?: { ids?: string[]; self?: string; country?: string },
  ): Promise<ScoreRow[]> {
    // the public boards (everything but a friends list) name adults only
    const notFlagged = `NOT EXISTS (SELECT 1 FROM cheat_reviews cr WHERE cr.user_id = u.id AND cr.shadow_flagged = true)${
      filter?.ids ? '' : ` AND NOT ${notKnownAdultSql('u')}`
    }`;
    // an empty allow-list means "no such people", not "everyone"
    if (filter?.ids && filter.ids.length === 0) return [];

    // the week start first, so the scope parameter is appended after it and
    // numbered from whatever the array already holds
    const params: unknown[] = [weekStart(now)];
    let scoped = '';
    if (filter?.ids) {
      params.push(filter.ids);
      // the viewer is always on their own friends board, whatever they hid
      params.push(filter.self ?? null);
      scoped = `AND u.id = ANY($${params.length - 1}) AND (u.id = $${params.length}::uuid OR ${listedSql('u', 'friends')})`;
    } else if (filter?.country) {
      params.push(filter.country);
      scoped = `AND u.country = $${params.length} AND ${listedSql('u', 'public')}`;
    } else {
      scoped = `AND ${listedSql('u', 'public')}`;
    }

    // the XP that counts for the league (xp/rules.ts), so the weekly board and
    // the league table agree on what a week's XP is
    const rows = await this.pool.query<{ user_id: string; username: string; score: string }>(
      `SELECT l.user_id, u.username, SUM(${countedXpSql('l')}) AS score
         FROM xp_ledger l JOIN users u ON u.id = l.user_id
        WHERE l.amount > 0 AND l.created_at >= ($1::date::timestamp AT TIME ZONE 'UTC')
          AND ${notFlagged} AND u.deleted_at IS NULL ${scoped}
        GROUP BY l.user_id, u.username
        HAVING SUM(${countedXpSql('l')}) > 0
        ORDER BY SUM(${countedXpSql('l')}) DESC`,
      params,
    );
    return rows.rows.map((r) => ({ userId: r.user_id, username: r.username, score: Number(r.score) }));
  }

  /**
   * A friends or country board, from Redis when it was worked out in the last
   * minute or two (`FRIENDS_BOARD_TTL_SECONDS`), else from Postgres and kept.
   * The key carries the week, so a new week never reads the last one's board.
   */
  private async cachedScores(
    type: BoardType,
    now: Date,
    key: string,
    ttlSeconds: number,
    load: () => Promise<ScoreRow[]>,
  ): Promise<ScoreRow[]> {
    if (!this.redis) return load();
    const full = `lb:${type}:${weekStart(now)}:${key}`;
    const hit = await this.redis.get(full).catch(() => null);
    if (hit) {
      try {
        return JSON.parse(hit) as ScoreRow[];
      } catch {
        // a damaged entry is worked out again below
      }
    }
    const rows = await load();
    await this.redis.set(full, JSON.stringify(rows), 'EX', ttlSeconds).catch(() => undefined);
    return rows;
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
      pipeline.expire(key, 14 * 24 * 60 * 60); // fortnight TTL
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
      // you belong on your own friends board — a ranking you are absent from
      // gives you nothing to measure against
      const rows = await this.cachedScores(type, now, `friends:${userId}`, FRIENDS_BOARD_TTL_SECONDS, async () =>
        this.scoresFromDb(type, now, { ids: [...(await this.friendIds(userId)), userId], self: userId }),
      );
      return this.fromRows(type, scope, userId, rows, now, limit, offset);
    }

    if (userId === null) return { type, scope, top: [], total: 0, me: null, country: null };
    const country = await this.countryOf(userId);
    // no country set is different from an empty board, and the UI says so
    if (!country) return { type, scope, top: [], total: 0, me: null, country: null };
    const rows = await this.cachedScores(type, now, `country:${country}`, COUNTRY_BOARD_TTL_SECONDS, () =>
      this.scoresFromDb(type, now, { country }),
    );
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

    // The sorted set was built at some moment and is read for up to five
    // minutes after. Somebody on it then may not be listable now — an account
    // found since to be a minor's, gone, out of the leagues or hidden —
    // so each page is checked as it is read, and anyone who may not be shown
    // is taken off the set for good, which keeps the ranks without gaps.
    let ids: string[] = [];
    let scores: number[] = [];
    let names = new Map<string, string>();
    for (let attempt = 0; attempt < 5; attempt++) {
      const flat = await this.redis!.zrevrange(key, offset, offset + limit - 1, 'WITHSCORES');
      ids = [];
      scores = [];
      for (let i = 0; i < flat.length; i += 2) {
        ids.push(flat[i]!);
        scores.push(Number(flat[i + 1]));
      }
      names = await this.listable(ids);
      const gone = ids.filter((id) => !names.has(id));
      if (gone.length === 0) break;
      await this.redis!.zrem(key, ...gone);
    }
    const top = withRanks(
      ids.flatMap((id, i) => {
        const username = names.get(id);
        return username === undefined ? [] : [{ userId: id, username, score: scores[i]! }];
      }),
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
  private async myScore(_type: BoardType, userId: string, now: Date): Promise<number | null> {
    const row = await this.pool.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(${countedXpSql('l')}), 0)::text sum FROM xp_ledger l
        WHERE l.user_id = $1 AND l.amount > 0 AND l.created_at >= ($2::date::timestamp AT TIME ZONE 'UTC')`,
      [userId, weekStart(now)],
    );
    const sum = Number(row.rows[0]?.sum ?? 0);
    return sum > 0 ? sum : null;
  }

  /**
   * Usernames of those among `ids` who may be on a public board right now: a
   * live account known to be an adult, still in the leagues, with a profile
   * shown to everyone or to members (`listedSql`). Anyone missing from the
   * map may not be.
   */
  private async listable(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.pool.query<{ id: string; username: string }>(
      `SELECT u.id, u.username FROM users u
        WHERE u.id = ANY($1) AND u.deleted_at IS NULL AND NOT ${notKnownAdultSql('u')}
          AND ${listedSql('u', 'public')}`,
      [ids],
    );
    return new Map(rows.rows.map((r) => [r.id, r.username]));
  }
}
