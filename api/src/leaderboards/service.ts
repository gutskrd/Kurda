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
  rankForScore,
  withRanks,
  type BoardScope,
  type BoardType,
  type RankedEntry,
  type ScoreRow,
} from './rank.js';

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
   * The caller's own score and place, always worked out live. The place is
   * null only on a Zêr or Gewher board that stops at `depth` before it reaches
   * them: their balance is still theirs to see, and "not in the top 1,000" is
   * the truth where a made-up 1,001st would not be.
   */
  me: { rank: number | null; score: number } | null;
  /** Zêr and Gewher only: the board lists the top this many, highest first, and no further. */
  depth?: number;
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

export interface LeaderboardOptions {
  /** where an uploaded profile photo is served from; without storage there are only the stock avatars */
  publicUrl?: PublicUrl;
  /** how deep a Zêr or Gewher board goes (BALANCE_BOARD_DEPTH); smaller only in tests */
  balanceDepth?: number;
}

/** One page of a board. Small enough to read, large enough to be worth loading. */
export const PAGE_SIZE = 25;
/** Never serve more than this in one request, however large a limit is asked for. */
const MAX_PAGE = 100;

/**
 * How many people a Zêr or Gewher board lists: forty pages of PAGE_SIZE.
 *
 * Nearly everybody holds some Zêr — the daily reward pays it from the first
 * day — so a balance board of everyone would be a board of every account
 * there has ever been, rebuilt every few minutes for the sake of its top
 * rows. A board of the top thousand is read in order off an index and stops
 * there (migration 1751000213000), and the sorted set stays the same small
 * size however many accounts there are. Whoever is below the cut still sees
 * their own balance, with no place beside it (`Board.me`).
 */
export const BALANCE_BOARD_DEPTH = 1000;

/**
 * How long an unread Zêr or Gewher sorted set is kept. It has no week to run
 * out with, so it is given a day: a board nobody has opened since yesterday is
 * memory for nothing, and building it again is one short indexed read.
 */
const BALANCE_BOARD_TTL_SECONDS = 24 * 60 * 60;

/**
 * Weekly board keys carry the week so a new week starts fresh. A balance board
 * is all-time, so it has one key, and a different prefix from the friends and
 * country caches (`cachedScores`) so the two can never meet.
 */
function keyFor(type: BoardType, now: Date): string {
  return isBalanceBoard(type) ? `lb:balance:${type}` : `lb:weekly:${weekStart(now)}`;
}

/**
 * How long a built global board is read before the next read builds it again.
 *
 * It was rebuilt every five minutes on a timer, on every instance, whether or
 * not anybody looked: an aggregate over the whole week of the XP ledger, nearly
 * three hundred times a day, and growing with the ledger. Now the first read
 * after this long builds it, once across every instance (whoever claims the
 * marker), and a quiet hour costs nothing. A reader sees a board no older than
 * the timer ever gave them.
 */
export const GLOBAL_BOARD_REBUILD_SECONDS = 5 * 60;

/** The marker that says a board was built within GLOBAL_BOARD_REBUILD_SECONDS. */
export function builtKeyFor(type: BoardType, now: Date): string {
  return `${keyFor(type, now)}:built`;
}

/**
 * The lowest balance on a global Zêr or Gewher board that was cut at its depth,
 * kept beside the sorted set. Without it a caller below the cut would be given
 * the place after the last name on the board, which is nobody's place.
 */
function floorKeyFor(type: BoardType, now: Date): string {
  return `${keyFor(type, now)}:floor`;
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
 *
 * A guest (auth/guest.ts) is on no board of any scope: a guest has no
 * profile for the name to lead to, and no friends to be listed for.
 *
 * The Zêr and Gewher boards keep every one of these rules: "don't rank me" is
 * about being ranked, not about XP.
 */
function listedSql(alias: string, scope: 'public' | 'friends'): string {
  const shown =
    scope === 'public'
      ? `${alias}.profile_visibility IN ('everyone', 'members')`
      : `${alias}.profile_visibility <> 'nobody'`;
  return `(${shown} AND ${alias}.leagues_enabled IS DISTINCT FROM false AND NOT ${alias}.guest)`;
}

/**
 * SQL: the user behind `alias` holds no staff role (admin/roles.ts). Staff are
 * left off the public Zêr and Gewher boards: a staff wallet is where the shop
 * and the rewards are tried out and can be topped up by hand, so its balance
 * is not one anybody earned, and a board led by the team would tell everyone
 * else nothing. The weekly board is XP from lessons and games like anybody's.
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
 * Leaderboards (KUR-063). Redis sorted sets give O(log n) rank lookups for the
 * global boards; Postgres is the source of truth and there's a rebuild path
 * (and a pure fallback when Redis is absent). Shadow-flagged cheaters (KUR-058)
 * are excluded from every board — silently, so they still see a plausible
 * own-rank and are never told.
 *
 * Three boards: this week's XP, and the Zêr and Gewher each person holds now
 * (rank.ts). The balance boards go through the same paths as the weekly one,
 * with the same rules about who is listed, and differ in where a score comes
 * from (`wallet_balances` rather than a week of the XP ledger), in having no
 * week, and in stopping at the top BALANCE_BOARD_DEPTH.
 *
 * Friends and country boards come from Postgres: a sorted set cannot be
 * filtered by who you know or where you live without reading it all back, which
 * would cost more than the query it replaces. Each is kept in Redis for a
 * minute or two once worked out (`cachedScores`), since every visit to the
 * rankings asked for it again.
 *
 * Nobody is listed who hid their profile from the people reading the board, and
 * nobody is on a board who opted out of the leagues (`listedSql`).
 *
 * The global and country boards are readable by anyone, signed in or not, so
 * they name only people known to be adults: a minor, or an account whose age
 * is not on record yet, is never on them (users/age.ts). They still see their
 * own score and place, worked out against everyone else, as a shadow-flagged
 * player does. The friends board is about people you know, and shows them all.
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
    this.depth = options.balanceDepth ?? BALANCE_BOARD_DEPTH;
  }

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
    const balance = isBalanceBoard(type);
    // the public boards (everything but a friends list) name adults only, and
    // the balance boards among them leave the staff out
    const notFlagged = `NOT EXISTS (SELECT 1 FROM cheat_reviews cr WHERE cr.user_id = u.id AND cr.shadow_flagged = true)${
      filter?.ids ? '' : ` AND NOT ${notKnownAdultSql('u')}${balance ? ` AND ${notStaffSql('u')}` : ''}`
    }`;
    // an empty allow-list means "no such people", not "everyone"
    if (filter?.ids && filter.ids.length === 0) return [];

    // what is ranked first — the week's start, or the currency — so the scope
    // parameter is appended after it and numbered from whatever the array holds
    const params: unknown[] = [balance ? BALANCE_BOARDS[type] : weekStart(now)];
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
      // the top of the board only, read in order off the index of positive
      // balances (migration 1751000213000), so a build stops once it has them;
      // ties are broken by id the way a sorted set breaks them, so the cut and
      // the pages fall in the same place whichever of the two is read
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

    // the XP that counts for the league (xp/rules.ts), so the weekly board and
    // the league table agree on what a week's XP is
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
   * A friends or country board, from Redis when it was worked out in the last
   * minute or two (`FRIENDS_BOARD_TTL_SECONDS`), else from Postgres and kept.
   * A weekly key carries the week, so a new week never reads the last one's
   * board; a balance board has no week to carry.
   */
  private async cachedScores(
    type: BoardType,
    now: Date,
    key: string,
    ttlSeconds: number,
    load: () => Promise<ScoreRow[]>,
  ): Promise<ScoreRow[]> {
    if (!this.redis) return load();
    const full = isBalanceBoard(type) ? `lb:${type}:${key}` : `lb:${type}:${weekStart(now)}:${key}`;
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

  /** The lowest score on a balance board that its depth cut short, or null when nobody was left out. */
  private floorOf(type: BoardType, rows: ScoreRow[]): number | null {
    return isBalanceBoard(type) && rows.length >= this.depth ? rows[rows.length - 1]!.score : null;
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
      if (isBalanceBoard(type)) {
        pipeline.expire(key, BALANCE_BOARD_TTL_SECONDS);
        const floor = this.floorOf(type, rows);
        if (floor === null) pipeline.del(floorKeyFor(type, now));
        else pipeline.set(floorKeyFor(type, now), String(floor), 'EX', BALANCE_BOARD_TTL_SECONDS);
      } else {
        pipeline.expire(key, 14 * 24 * 60 * 60); // fortnight TTL
      }
      // fresh now, so the reads of the next few minutes use it as it is
      pipeline.set(builtKeyFor(type, now), '1', 'EX', GLOBAL_BOARD_REBUILD_SECONDS);
      await pipeline.exec();
    }
    return rows.length;
  }

  /**
   * Build the global board if it has not been built in the last few minutes
   * (GLOBAL_BOARD_REBUILD_SECONDS), or has nothing in it. One read claims the
   * rebuild; a failed one gives the claim back, so the next read tries again.
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
    return isBalanceBoard(type) ? { depth: this.depth } : {};
  }

  /**
   * A leaderboard: one page of it, plus the caller's own rank within that same board.
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
      if (userId === null) return { type, scope, top: [], total: 0, me: null, ...this.depthOf(type) };
      // you belong on your own friends board — a ranking you are absent from
      // gives you nothing to measure against
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

    // The sorted set was built at some moment and is read for up to five
    // minutes after. Somebody on it then may not be listable now — an account
    // found since to be a minor's, gone, out of the leagues or hidden —
    // so each page is checked as it is read, and anyone who may not be shown
    // is taken off the set for good, which keeps the ranks without gaps.
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
    // a page that opens in the middle of a tie gives its first row the tie's place
    const firstRank = rows.length > 0 ? (await this.redis!.zcount(key, `(${rows[0]!.score}`, '+inf')) + 1 : offset + 1;
    const top = withRanks(rows, offset, firstRank).map((e) => ({ ...e, avatarUrl: names.get(e.userId)?.avatarUrl ?? null }));

    const total = await this.redis!.zcard(key);
    const myScore = userId === null ? null : await this.myScore(type, userId, now);
    let me: Board['me'] = null;
    if (myScore !== null) {
      // below the cut of a board that stops at its depth there is no place to give
      const floor = isBalanceBoard(type) ? await this.redis!.get(floorKeyFor(type, now)) : null;
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

  /**
   * The caller's raw score (independent of flag status, so they aren't tipped
   * off): the week's XP, or what they hold now, read by its key.
   */
  private async myScore(type: BoardType, userId: string, now: Date): Promise<number | null> {
    if (isBalanceBoard(type)) {
      const held = await this.pool.query<{ balance: number }>(
        `SELECT balance FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
        [userId, BALANCE_BOARDS[type]],
      );
      const balance = held.rows[0]?.balance ?? 0;
      return balance > 0 ? balance : null;
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
   * A face for a row. A photo is the person's own face, so a reader who is not
   * signed in sees it only for a profile shown to everyone, as the profile page
   * itself would show it; the chosen avatar is a drawing and is shown either way.
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
   * Usernames and faces of those among `ids` who may be on a public board
   * right now: a live account known to be an adult, still in the leagues, with
   * a profile shown to everyone or to members (`listedSql`), and on a balance
   * board no staff. Anyone missing from the map may not be.
   */
  private async listable(type: BoardType, ids: string[], signedIn: boolean): Promise<Map<string, { username: string; avatarUrl: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.pool.query<FaceRow & { username: string }>(
      `SELECT u.id, u.username, u.profile_photo_key, u.selected_avatar_key, u.profile_visibility FROM users u
        WHERE u.id = ANY($1) AND u.deleted_at IS NULL AND NOT ${notKnownAdultSql('u')}
          AND ${listedSql('u', 'public')}${isBalanceBoard(type) ? ` AND ${notStaffSql('u')}` : ''}`,
      [ids],
    );
    return new Map(rows.rows.map((r) => [r.id, { username: r.username, avatarUrl: this.avatarOf(r, signedIn) }]));
  }
}
