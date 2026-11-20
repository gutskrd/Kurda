import type pg from 'pg';
import type { Redis } from 'ioredis';
import { PRIVILEGED_ROLES } from '../admin/roles.js';
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { weekStart } from '../leagues/league-logic.js';
import { notKnownAdultSql } from '../users/age.js';
import { countedXpSql } from '../xp/rules.js';
import {
  BALANCE_BOARDS,
  isBalanceBoard,
  isWeeklyBoard,
  rankForScore,
  withRanks,
  type BoardScope,
  type BoardType,
  type RankedEntry,
  type ScoreRow,
} from './rank.js';
import { economyBlockedSql } from '../economy/standing.js';
import { availableSql } from '../moderation/availability.js';

export interface BoardEntry extends RankedEntry {
  /** already resolved: an uploaded photo, else the chosen avatar */
  avatarUrl: string | null;
}

export interface Board {
  type: BoardType;
  scope: BoardScope;
  top: BoardEntry[];
  /** how many people are on this board altogether, so a client knows when to stop paging */
  total: number;
  /**
   * The caller's own score and place, always live. The place is null only on a balance board cut at `depth` above
   * them: they still see their balance, without an invented place.
   */
  me: { rank: number | null; score: number } | null;
  /** Every board but the weekly one: it lists the top this many, highest first, and no further. */
  depth?: number;
  /** Country scope only: the board's country, or null when the caller has not set one, which the UI words differently. */
  country?: string | null;
}

export interface BoardOptions {
  scope?: BoardScope;
  limit?: number;
  offset?: number;
  now?: Date;
}

export interface LeaderboardOptions {
  /** Where uploaded profile photos are served from; without storage there are only stock avatars. */
  publicUrl?: PublicUrl;
  /** how deep a board with no week goes (BOARD_DEPTH); smaller only in tests */
  depth?: number;
}

/** One page of a board. Small enough to read, large enough to be worth loading. */
export const PAGE_SIZE = 25;
/** Never serve more than this in one request, however large a limit is asked for. */
const MAX_PAGE = 100;

/**
 * How many people a board with no week lists: forty pages. Nearly everyone has some XP and holds some Zêr, so a full
 * board would list every account; the top thousand is read in order off an index (migrations 1751000213000 and
 * 1751000742000) and the sorted set stays small. Anyone below the cut still sees their own score, without a place.
 */
export const BOARD_DEPTH = 1000;

/** How long an unread sorted set of a board with no week is kept; rebuilding it is one indexed read. */
const STANDING_BOARD_TTL_SECONDS = 24 * 60 * 60;

/**
 * Weekly board keys carry the week, so a new week starts fresh. The other boards have one key each, with a prefix
 * distinct from the friends and country caches.
 */
function keyFor(type: BoardType, now: Date): string {
  if (isWeeklyBoard(type)) return `lb:weekly:${weekStart(now)}`;
  return isBalanceBoard(type) ? `lb:balance:${type}` : `lb:total:${type}`;
}

/**
 * How long a built global board is read before the next read rebuilds it, once across all instances (whoever claims
 * the marker), so a quiet hour costs nothing.
 */
export const GLOBAL_BOARD_REBUILD_SECONDS = 5 * 60;

/** The marker that says a board was built within GLOBAL_BOARD_REBUILD_SECONDS. */
export function builtKeyFor(type: BoardType, now: Date): string {
  return `${keyFor(type, now)}:built`;
}

/**
 * The lowest score on a global board cut at its depth, kept beside the sorted set, so a caller below the cut is not
 * given the place after the last name.
 */
function floorKeyFor(type: BoardType, now: Date): string {
  return `${keyFor(type, now)}:floor`;
}

/**
 * How long a friends or country board is cached. Each is an aggregate read on every rankings visit, so a minute of
 * staleness is worth it; the caller's own score and place stay live.
 */
export const FRIENDS_BOARD_TTL_SECONDS = 60;
export const COUNTRY_BOARD_TTL_SECONDS = 120;

/**
 * SQL: the user behind `alias` may be listed on a board of this scope. Public boards (global, country) list only
 * 'everyone' and 'members' profiles, and a friends board leaves out profiles hidden even from friends. Anyone who
 * opted out of the leagues is on no board; an account that never chose (a teen in personal mode) still shows on a
 * friends board. Guests are on no board, having no profile and no friends. Every board keeps the same rules.
 * Whoever is left out still sees their own score and place.
 */
function listedSql(alias: string, scope: 'public' | 'friends'): string {
  const shown =
    scope === 'public'
      ? `${alias}.profile_visibility IN ('everyone', 'members')`
      : `${alias}.profile_visibility <> 'nobody'`;
  return `(${shown} AND ${alias}.leagues_enabled IS DISTINCT FROM false AND NOT ${alias}.guest)`;
}

/**
 * SQL: the user behind `alias` holds no staff role. Staff wallets test the shop and rewards and can be topped up by
 * hand, so they are left off the public balance boards; the XP boards are earned XP like anyone's.
 */
const STAFF_ROLES_SQL = `'{${PRIVILEGED_ROLES.join(',')}}'::text[]`;
function notStaffSql(alias: string): string {
  return `NOT (${alias}.roles && ${STAFF_ROLES_SQL})`;
}

/** What a face on a board is drawn from. */
interface FaceRow {
  id: string;
  profile_photo_key: string | null;
  selected_avatar_key: string | null;
  profile_visibility: string;
}

/**
 * Leaderboards: this week's XP, all the XP ever earned, and the Zêr and Gewher each person holds now. Redis sorted
 * sets give fast rank lookups for the global boards; Postgres is the source of truth, with a rebuild path and a pure
 * fallback without Redis. Shadow-flagged cheaters are excluded silently, still seeing a plausible own rank. The boards
 * with no week take the same paths, scored from `users.xp` or `wallet_balances`, and are cut at BOARD_DEPTH.
 *
 * Friends and country boards come from Postgres, since a sorted set cannot be filtered by friendship or country
 * cheaply, and are cached briefly (`cachedScores`). Who is listed follows `listedSql`. Global and country boards are
 * public, so they name only known adults (users/age.ts); minors still see their own score and place. The friends
 * board shows everyone you know.
 */
export class LeaderboardService {
  private readonly publicUrl: PublicUrl;
  private readonly depth: number;

  constructor(
    private readonly pool: pg.Pool,
    private readonly redis?: Redis,
    options: LeaderboardOptions = {},
  ) {
    this.publicUrl = options.publicUrl ?? (() => null);
    this.depth = options.depth ?? BOARD_DEPTH;
  }

  /**
   * Source-of-truth scores, highest first, excluding shadow-flagged users. A filter narrows the board to friends or a
   * country; the country is filtered in SQL rather than by collecting an unbounded list of ids.
   */
  private async scoresFromDb(
    type: BoardType,
    now: Date,
    filter?: { ids?: string[]; self?: string; country?: string },
  ): Promise<ScoreRow[]> {
    const balance = isBalanceBoard(type);
    // Public boards name adults only and balance boards leave out staff; in every scope a balance board also leaves out
    // anyone the economy does not pay (economy/standing.ts), whose holdings are under review.
    // a suspended or banned account is off every board while it lasts (moderation/availability.ts)
    const notFlagged = `${availableSql('u')} AND NOT EXISTS (SELECT 1 FROM cheat_reviews cr WHERE cr.user_id = u.id AND cr.shadow_flagged = true)${
      balance ? ` AND NOT ${economyBlockedSql('u')}` : ''
    }${filter?.ids ? '' : ` AND NOT ${notKnownAdultSql('u')}${balance ? ` AND ${notStaffSql('u')}` : ''}`}`;
    // an empty allow-list means "no such people", not "everyone"
    if (filter?.ids && filter.ids.length === 0) return [];

    // The currency or the week's start comes first where the board has one, so the scope parameters are numbered after it.
    const params: unknown[] = [];
    if (balance) params.push(BALANCE_BOARDS[type]);
    else if (isWeeklyBoard(type)) params.push(weekStart(now));
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

    if (balance) {
      // Only the top of the board, read in order off the index of positive balances, with ties broken by id as the
      // sorted set breaks them, so cuts and pages agree whichever is read.
      const rows = await this.pool.query<{ user_id: string; username: string; score: number }>(
        `SELECT b.user_id, u.username, b.balance AS score
           FROM wallet_balances b JOIN users u ON u.id = b.user_id
          WHERE b.currency = $1 AND b.balance > 0
            AND ${notFlagged} AND u.deleted_at IS NULL ${scoped}
          ORDER BY b.balance DESC, b.user_id DESC
          LIMIT ${this.depth}`,
        params,
      );
      return rows.rows.map((r) => ({ userId: r.user_id, username: r.username, score: Number(r.score) }));
    }

    if (!isWeeklyBoard(type)) {
      // All the XP ever earned, the total the profile shows, read in order off the index of positive totals.
      const rows = await this.pool.query<{ user_id: string; username: string; score: number }>(
        `SELECT u.id AS user_id, u.username, u.xp AS score FROM users u
          WHERE u.xp > 0 AND ${notFlagged} AND u.deleted_at IS NULL ${scoped}
          ORDER BY u.xp DESC, u.id DESC
          LIMIT ${this.depth}`,
        params,
      );
      return rows.rows.map((r) => ({ userId: r.user_id, username: r.username, score: Number(r.score) }));
    }

    // League-counted XP (xp/rules.ts), so the weekly board and the league table agree.
    const rows = await this.pool.query<{ user_id: string; username: string; score: string }>(
      `SELECT l.user_id, u.username, SUM(${countedXpSql('l')}) AS score
         FROM xp_ledger l JOIN users u ON u.id = l.user_id
        WHERE l.amount > 0 AND l.created_at >= ($1::date::timestamp AT TIME ZONE 'UTC')
          AND ${notFlagged} AND u.deleted_at IS NULL ${scoped}
        GROUP BY l.user_id, u.username
        HAVING SUM(${countedXpSql('l')}) > 0
        ORDER BY SUM(${countedXpSql('l')}) DESC, l.user_id DESC`,
      params,
    );
    return rows.rows.map((r) => ({ userId: r.user_id, username: r.username, score: Number(r.score) }));
  }

  /**
   * A friends or country board from Redis when built in the last minute or two, else from Postgres and cached. Weekly
   * keys carry the week; the other boards have none.
   */
  private async cachedScores(
    type: BoardType,
    now: Date,
    key: string,
    ttlSeconds: number,
    load: () => Promise<ScoreRow[]>,
  ): Promise<ScoreRow[]> {
    if (!this.redis) return load();
    const full = isWeeklyBoard(type) ? `lb:${type}:${weekStart(now)}:${key}` : `lb:${type}:${key}`;
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

  /** The lowest score on a board its depth cut short, or null when nobody was left out. */
  private floorOf(type: BoardType, rows: ScoreRow[]): number | null {
    return !isWeeklyBoard(type) && rows.length >= this.depth ? rows[rows.length - 1]!.score : null;
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
      if (isWeeklyBoard(type)) {
        pipeline.expire(key, 14 * 24 * 60 * 60); // fortnight TTL
      } else {
        pipeline.expire(key, STANDING_BOARD_TTL_SECONDS);
        const floor = this.floorOf(type, rows);
        if (floor === null) pipeline.del(floorKeyFor(type, now));
        else pipeline.set(floorKeyFor(type, now), String(floor), 'EX', STANDING_BOARD_TTL_SECONDS);
      }
      // Fresh now, so the next few minutes of reads use it as is.
      pipeline.set(builtKeyFor(type, now), '1', 'EX', GLOBAL_BOARD_REBUILD_SECONDS);
      await pipeline.exec();
    }
    return rows.length;
  }

  /**
   * Builds the global board if not built within GLOBAL_BOARD_REBUILD_SECONDS or empty. One read claims the rebuild;
   * a failed one releases the claim for the next read.
   */
  private async ensureFresh(type: BoardType, now: Date): Promise<void> {
    const redis = this.redis!;
    const built = builtKeyFor(type, now);
    const claimed = await redis.set(built, '1', 'EX', GLOBAL_BOARD_REBUILD_SECONDS, 'NX');
    if (claimed !== 'OK') {
      if ((await redis.zcard(keyFor(type, now))) === 0) await this.rebuild(type, now);
      return;
    }
    try {
      await this.rebuild(type, now);
    } catch (err) {
      await redis.del(built).catch(() => undefined);
      throw err;
    }
  }

  /** How deep a board goes, for the boards that stop somewhere. */
  private depthOf(type: BoardType): { depth?: number } {
    return isWeeklyBoard(type) ? {} : { depth: this.depth };
  }

  /**
   * One page of a leaderboard plus the caller's rank within it. A signed-out reader (`userId` null) gets the global
   * board without `me`; the friends and country scopes come back empty for them.
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
      if (userId === null) return { type, scope, top: [], total: 0, me: null, ...this.depthOf(type) };
      // You are on your own friends board, so you have something to measure against.
      const rows = await this.cachedScores(type, now, `friends:${userId}`, FRIENDS_BOARD_TTL_SECONDS, async () =>
        this.scoresFromDb(type, now, { ids: [...(await this.friendIds(userId)), userId], self: userId }),
      );
      return this.fromRows(type, scope, userId, rows, now, limit, offset);
    }

    if (userId === null) return { type, scope, top: [], total: 0, me: null, country: null, ...this.depthOf(type) };
    const country = await this.countryOf(userId);
    // no country set is different from an empty board, and the UI says so
    if (!country) return { type, scope, top: [], total: 0, me: null, country: null, ...this.depthOf(type) };
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
    const scores = all.map((r) => r.score);
    const page = all.slice(offset, offset + limit);
    // a page that opens in the middle of a tie gives its first row the tie's place
    const ranked = withRanks(page, offset, page.length > 0 ? rankForScore(scores, page[0]!.score) : offset + 1);
    const faces = await this.faces(page.map((r) => r.userId), userId !== null);
    const top = ranked.map((e) => ({ ...e, avatarUrl: faces.get(e.userId) ?? null }));
    // a signed-out reader has no place on the board to find
    const myScore = userId === null ? null : await this.myScore(type, userId, now);
    const floor = this.floorOf(type, all);
    const me =
      myScore === null
        ? null
        : { score: myScore, rank: floor !== null && myScore < floor ? null : rankForScore(scores, myScore) };
    return { type, scope, top, total: all.length, me, ...this.depthOf(type) };
  }

  private async globalFromRedis(
    type: BoardType,
    userId: string | null,
    now: Date,
    limit: number,
    offset: number,
  ): Promise<Board> {
    const key = keyFor(type, now);
    await this.ensureFresh(type, now);

    // The sorted set is read for up to five minutes after it was built, so each page is rechecked and anyone no longer
    // listable is removed from the set for good, keeping ranks without gaps.
    let ids: string[] = [];
    let scores: number[] = [];
    let names = new Map<string, { username: string; avatarUrl: string }>();
    for (let attempt = 0; attempt < 5; attempt++) {
      const flat = await this.redis!.zrevrange(key, offset, offset + limit - 1, 'WITHSCORES');
      ids = [];
      scores = [];
      for (let i = 0; i < flat.length; i += 2) {
        ids.push(flat[i]!);
        scores.push(Number(flat[i + 1]));
      }
      names = await this.listable(type, ids, userId !== null);
      const gone = ids.filter((id) => !names.has(id));
      if (gone.length === 0) break;
      await this.redis!.zrem(key, ...gone);
    }
    const rows = ids.flatMap((id, i) => {
      const who = names.get(id);
      return who === undefined ? [] : [{ userId: id, username: who.username, score: scores[i]! }];
    });
    // Read side by side: the place of the page's first row (a page that opens in the middle of a tie gives it the tie's
    // place), the board's size, the caller's score, and for a board cut at its depth, where it stops.
    const [above, total, myScore, floor] = await Promise.all([
      rows.length > 0 ? this.redis!.zcount(key, `(${rows[0]!.score}`, '+inf') : null,
      this.redis!.zcard(key),
      userId === null ? null : this.myScore(type, userId, now),
      userId !== null && !isWeeklyBoard(type) ? this.redis!.get(floorKeyFor(type, now)) : null,
    ]);
    const firstRank = above === null ? offset + 1 : above + 1;
    const top = withRanks(rows, offset, firstRank).map((e) => ({ ...e, avatarUrl: names.get(e.userId)?.avatarUrl ?? null }));

    let me: Board['me'] = null;
    if (myScore !== null) {
      // below the cut of a board that stops at its depth there is no place to give
      const below = floor !== null && myScore < Number(floor);
      me = { score: myScore, rank: below ? null : (await this.redis!.zcount(key, `(${myScore}`, '+inf')) + 1 };
    }
    return { type, scope: 'global', top, total, me, ...this.depthOf(type) };
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

  /** The caller's raw score, read regardless of flags so they are not tipped off: current holdings, all XP or the week's. */
  private async myScore(type: BoardType, userId: string, now: Date): Promise<number | null> {
    if (isBalanceBoard(type)) {
      const held = await this.pool.query<{ balance: number }>(
        `SELECT balance FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
        [userId, BALANCE_BOARDS[type]],
      );
      const balance = held.rows[0]?.balance ?? 0;
      return balance > 0 ? balance : null;
    }
    if (!isWeeklyBoard(type)) {
      const total = await this.pool.query<{ xp: number }>(`SELECT xp FROM users WHERE id = $1`, [userId]);
      const xp = total.rows[0]?.xp ?? 0;
      return xp > 0 ? xp : null;
    }
    const row = await this.pool.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(${countedXpSql('l')}), 0)::text sum FROM xp_ledger l
        WHERE l.user_id = $1 AND l.amount > 0 AND l.created_at >= ($2::date::timestamp AT TIME ZONE 'UTC')`,
      [userId, weekStart(now)],
    );
    const sum = Number(row.rows[0]?.sum ?? 0);
    return sum > 0 ? sum : null;
  }

  /**
   * A face for a row. A photo is shown to signed-out readers only for profiles shown to everyone, as the profile page
   * would; a chosen avatar is a drawing and always shown.
   */
  private avatarOf(row: FaceRow, signedIn: boolean): string {
    const photo = signedIn || row.profile_visibility === 'everyone' ? row.profile_photo_key : null;
    return resolveAvatarUrl(photo, row.selected_avatar_key, this.publicUrl);
  }

  /** The faces of one page of a friends or country board (or a global one without Redis). */
  private async faces(ids: string[], signedIn: boolean): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.pool.query<FaceRow>(
      `SELECT id, profile_photo_key, selected_avatar_key, profile_visibility FROM users WHERE id = ANY($1)`,
      [ids],
    );
    return new Map(rows.rows.map((r) => [r.id, this.avatarOf(r, signedIn)]));
  }

  /**
   * Usernames and faces of those among `ids` who may be on a public board now: live, known adults, in the leagues,
   * with a public or members profile (`listedSql`), and on a balance board no staff and nobody the economy does not
   * pay. Anyone missing from the map may not be listed.
   */
  private async listable(type: BoardType, ids: string[], signedIn: boolean): Promise<Map<string, { username: string; avatarUrl: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.pool.query<FaceRow & { username: string }>(
      `SELECT u.id, u.username, u.profile_photo_key, u.selected_avatar_key, u.profile_visibility FROM users u
        WHERE u.id = ANY($1) AND u.deleted_at IS NULL AND NOT ${notKnownAdultSql('u')}
          AND ${listedSql('u', 'public')}${isBalanceBoard(type) ? ` AND ${notStaffSql('u')} AND NOT ${economyBlockedSql('u')}` : ''}`,
      [ids],
    );
    return new Map(rows.rows.map((r) => [r.id, { username: r.username, avatarUrl: this.avatarOf(r, signedIn) }]));
  }
}
