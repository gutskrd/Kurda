import type pg from 'pg';
import {
  KINGDOM_LESSON_PASS,
  KINGDOM_STORY_PASS,
  NO_KINGDOM_LEVELS,
  isKingdomBuilding,
  kingdomBuildings,
  newLevels,
  type KingdomBuilding,
  type KingdomCounts,
  type KingdomLevel,
  type KingdomMeasure,
  type KingdomRecorded,
  type KingdomSeenBody,
  type KingdomUpgrade,
  type KingdomView,
} from '@kurda/shared';
import { MEASURES, MeasureContext } from '../badges/measures.js';
import { SKIPPABLE_TYPES } from '../content/exercises.js';
import { economyBlockedSql } from '../economy/standing.js';
import type { WalletService } from '../wallet/service.js';
import type { Cache } from '../cache/cache.js';

/**
 * Kurdish Kingdom on the server: the village's state, worked out from the
 * learner's own records, and each new level recorded — and paid for — once.
 *
 * What a building counts is read from where the learning happened (the badge
 * measures' tables and their `MeasureContext`), never from anything a client
 * sends: not time in the village, not game XP, nothing a learner can pile up
 * by doing the same thing again. Each measure counts distinct things — a
 * lesson place, a story, an exercise — or spaced reviews and learning days,
 * which repetition on one day cannot move (shared games/kingdom/buildings.ts
 * says what each building counts and why).
 *
 * A visit costs one statement when nothing has changed: the learner's
 * recorded levels, village and XP total together. The six counts come from a
 * second statement — one batched SELECT over the learner's own rows — and are
 * cached for a minute under the learner's XP total, which every learning step
 * that moves a count also moves, so a lesson just finished shows at once and a
 * village looked at twice in a row is counted once.
 *
 * A level the counts reach and nobody has recorded is written in one
 * transaction with its Zêr: the level row first, whose key (user, building,
 * level) a second visit at the same moment waits on and then finds taken, so
 * it pays nothing; then the credit through WalletService on the same
 * connection, with an idempotency key of the user, building and level besides.
 * The amount is one constant here, and it is paid only to an account the
 * economy may pay (economy/standing.ts: not closed, banned, a bot,
 * shadow-flagged or held) that is not a guest. A level reached while it may
 * not be paid is recorded with no Zêr and stays so.
 */

/** Zêr for each new level: small, fixed, and decided here alone. */
export const KINGDOM_ZER_PER_LEVEL = 20;
/** The wallet ledger's reason for it. */
export const KINGDOM_LEDGER_REASON = 'kingdom_level';
/** How long a learner's counts are kept, under their XP total. */
const COUNTS_TTL_SECONDS = 60;
const CACHE_DOMAIN = 'kingdom';

type Executor = Pick<pg.Pool, 'query'>;

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

/** The Zêr idempotency key for one level: global in the ledger, so it names the learner. */
export const kingdomGrantKey = (userId: string, building: KingdomBuilding, level: number): string => `kingdom:${userId}:${building}:${level}`;

/**
 * Exercises of one type answered right, each counted once: in a finished
 * lesson or in a review that counted, whichever came first, and the same item
 * once across a lesson's versions (by where it sits in the course).
 */
const itemsRight = (type: 'listening' | 'conversation') =>
  [
    `SELECT count(*) AS n FROM (
       SELECT l.skill_id, l.position, e.position AS item
         FROM session_answers a JOIN lesson_sessions s ON s.id = a.session_id
         JOIN exercises e ON e.id = a.exercise_id JOIN lessons l ON l.id = e.lesson_id
        WHERE s.user_id = $1 AND s.completed_at IS NOT NULL AND a.accepted AND e.type = $2
       UNION
       SELECT l.skill_id, l.position, e.position
         FROM practice_answers a JOIN practice_sessions s ON s.id = a.session_id
         JOIN exercises e ON e.id = a.exercise_id JOIN lessons l ON l.id = e.lesson_id
        WHERE s.user_id = $1 AND s.xp_awarded > 0 AND a.accepted AND e.type = $2
     ) x`,
    [type],
  ] as const;

/**
 * The SQL of the four counts the badges do not already have, each a single
 * value for `$1` the learner with its own parameters after it. The pass marks
 * are compared as numeric, so 80% of a five-item lesson is exactly four.
 */
const KINGDOM_SQL: Readonly<Record<Exclude<KingdomMeasure, 'words_remembered' | 'learning_days'>, readonly [string, readonly unknown[]]>> = {
  // a lesson place (any version of the lesson there) finished at least once with KINGDOM_LESSON_PASS right, out of what
  // was scored: a listening or speaking item put off and never answered is left out, as the lesson's own score leaves it
  lessons_passed: [
    `SELECT count(*) AS n FROM (
       SELECT DISTINCT l.skill_id, l.position
         FROM lesson_sessions s JOIN lessons l ON l.id = s.lesson_id
         CROSS JOIN LATERAL (
           SELECT s.total_count - count(*) AS scored FROM exercises e
            WHERE e.lesson_id = s.lesson_id AND e.type = ANY($3::text[])
              AND NOT EXISTS (SELECT 1 FROM session_answers a WHERE a.session_id = s.id AND a.exercise_id = e.id)
         ) k
        WHERE s.user_id = $1 AND s.completed_at IS NOT NULL AND k.scored > 0 AND s.correct_count >= $2::numeric * k.scored
     ) x`,
    [KINGDOM_LESSON_PASS, SKIPPABLE_TYPES],
  ],
  // a story whose questions were answered with KINGDOM_STORY_PASS right, in a game that counted as learning
  stories_passed: [
    `SELECT count(DISTINCT g.story_id) AS n FROM story_game_players p JOIN story_games g ON g.id = p.game_id
      WHERE p.user_id = $1 AND p.learning_counted AND NOT p.removed AND g.status = 'finished'
        AND g.question_count > 0 AND p.correct >= $2::numeric * g.question_count`,
    [KINGDOM_STORY_PASS],
  ],
  listening_right: itemsRight('listening'),
  conversations_right: itemsRight('conversation'),
};

const countOf = (ctx: MeasureContext, key: keyof typeof KINGDOM_SQL): Promise<number> => ctx.count(KINGDOM_SQL[key][0], [...KINGDOM_SQL[key][1]]);

/** Each building's count, from one learner's rows, in one statement (MeasureContext batches them). */
export async function measureKingdom(db: Executor, userId: string): Promise<KingdomCounts> {
  const ctx = new MeasureContext(db, userId);
  const [houses, school, teahouse, spring, market, orchard] = await Promise.all([
    MEASURES.review_items_remembered!(ctx).then((m) => m.progress),
    countOf(ctx, 'lessons_passed'),
    countOf(ctx, 'stories_passed'),
    countOf(ctx, 'listening_right'),
    countOf(ctx, 'conversations_right'),
    MEASURES.learning_days!(ctx).then((m) => m.progress),
  ]);
  return { houses, school, teahouse, spring, market, orchard };
}

interface LevelRow {
  b: string;
  l: number;
  z: number;
  at: string;
  seen: boolean;
}

/** What is stored for a learner, read in one statement. */
interface Stored {
  xp: number;
  village: { founded: string; intro: boolean } | null;
  levels: LevelRow[];
}

export class KingdomService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
    private readonly deps: { cache?: Cache; log?: Log } = {},
  ) {}

  /** The village as GET /kingdom answers it, recording any level reached since it was last looked at. */
  async view(userId: string): Promise<KingdomView> {
    let stored = await this.stored(userId);
    const counts = await this.counts(userId, stored.xp);
    const pending = newLevels(counts, recordedOf(stored.levels));
    if (pending.length > 0 || stored.village === null) {
      await this.record(userId, pending);
      stored = await this.stored(userId);
    }
    return viewOf(counts, stored);
  }

  /** The celebrations shown (and the first visit's sentence, if said): marked seen, so they are not shown again. */
  async markSeen(userId: string, body: KingdomSeenBody): Promise<void> {
    const levels = (body.levels ?? []).filter((x) => isKingdomBuilding(x.building) && Number.isInteger(x.level));
    if (levels.length > 0) {
      await this.pool.query(
        `UPDATE kingdom_levels k SET seen_at = now()
           FROM unnest($2::text[], $3::int[]) AS s(building, level)
          WHERE k.user_id = $1 AND k.building = s.building AND k.level = s.level AND k.seen_at IS NULL`,
        [userId, levels.map((x) => x.building), levels.map((x) => x.level)],
      );
    }
    if (body.intro) {
      await this.pool.query(`UPDATE kingdom_villages SET intro_seen_at = now() WHERE user_id = $1 AND intro_seen_at IS NULL`, [userId]);
    }
  }

  private async stored(userId: string): Promise<Stored> {
    const r = await this.pool.query<{ xp: number; village: Stored['village']; levels: LevelRow[] }>(
      `SELECT u.xp,
              (SELECT jsonb_build_object('founded', v.founded_at, 'intro', v.intro_seen_at IS NOT NULL)
                 FROM kingdom_villages v WHERE v.user_id = u.id) AS village,
              (SELECT COALESCE(jsonb_agg(jsonb_build_object('b', k.building, 'l', k.level, 'z', k.zer, 'at', k.reached_at, 'seen', k.seen_at IS NOT NULL)
                                         ORDER BY k.reached_at, k.building, k.level), '[]'::jsonb)
                 FROM kingdom_levels k WHERE k.user_id = u.id) AS levels
         FROM users u WHERE u.id = $1`,
      [userId],
    );
    const row = r.rows[0];
    return { xp: row?.xp ?? 0, village: row?.village ?? null, levels: row?.levels ?? [] };
  }

  /** The counts, cached under the XP total: learning that moves a count pays XP in the same transaction. */
  private async counts(userId: string, xp: number): Promise<KingdomCounts> {
    const work = () => measureKingdom(this.pool, userId);
    return this.deps.cache ? this.deps.cache.withCache(CACHE_DOMAIN, `${userId}:${xp}`, COUNTS_TTL_SECONDS, work) : work();
  }

  /**
   * Record the village (on a first visit) and each new level, paying each
   * level's Zêr in the same transaction when the account may be paid.
   */
  private async record(userId: string, pending: readonly { building: KingdomBuilding; level: number }[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const village = await client.query(`INSERT INTO kingdom_villages (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
      // levels found on the first visit were built before the village existed: recorded as seen, and told in the first visit's line
      const founding = (village.rowCount ?? 0) > 0;
      if (pending.length > 0) {
        const standing = await client.query<{ paid: boolean }>(
          `SELECT NOT (u.guest OR ${economyBlockedSql('u')}) AS paid FROM users u WHERE u.id = $1`,
          [userId],
        );
        const paid = standing.rows[0]?.paid ?? false;
        for (const { building, level } of pending) {
          const inserted = await client.query(
            `INSERT INTO kingdom_levels (user_id, building, level, seen_at) VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN now() END)
             ON CONFLICT (user_id, building, level) DO NOTHING`,
            [userId, building, level, founding],
          );
          // another visit recorded it first, and paid for it if anyone did
          if ((inserted.rowCount ?? 0) === 0 || !paid) continue;
          await this.pay(client, userId, building, level);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * One level's Zêr, inside the transaction that recorded the level. A credit
   * the wallet refuses (a balance at its ceiling) leaves the level recorded
   * and unpaid rather than the village unable to grow.
   */
  private async pay(client: pg.PoolClient, userId: string, building: KingdomBuilding, level: number): Promise<void> {
    await client.query('SAVEPOINT kingdom_zer');
    try {
      const credit = await this.wallet.creditWithin(client, {
        userId,
        currency: 'zer',
        amount: KINGDOM_ZER_PER_LEVEL,
        reason: KINGDOM_LEDGER_REASON,
        refId: `${building}:${level}`,
        idempotencyKey: kingdomGrantKey(userId, building, level),
      });
      if (!credit.duplicate) {
        await client.query(`UPDATE kingdom_levels SET zer = $4 WHERE user_id = $1 AND building = $2 AND level = $3`, [
          userId,
          building,
          level,
          KINGDOM_ZER_PER_LEVEL,
        ]);
      }
      await client.query('RELEASE SAVEPOINT kingdom_zer');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT kingdom_zer');
      await client.query('RELEASE SAVEPOINT kingdom_zer');
      this.deps.log?.warn({ err, userId, building, level }, 'kingdom level recorded without its Zêr');
    }
  }
}

/** The highest level recorded for each building. */
function recordedOf(rows: readonly LevelRow[]): KingdomRecorded {
  const out = { ...NO_KINGDOM_LEVELS } as Record<KingdomBuilding, KingdomLevel>;
  for (const r of rows) {
    if (isKingdomBuilding(r.b) && r.l > out[r.b]) out[r.b] = r.l as KingdomLevel;
  }
  return out;
}

function viewOf(counts: KingdomCounts, stored: Stored): KingdomView {
  const celebrate: KingdomUpgrade[] = [];
  let introLevels = 0;
  let introZer = 0;
  const founded = stored.village?.founded ?? null;
  for (const r of stored.levels) {
    if (!isKingdomBuilding(r.b)) continue;
    // recorded in the transaction that founded the village: the same now(), written the same way
    if (r.at === founded) {
      introLevels += 1;
      introZer += r.z;
    }
    if (!r.seen) celebrate.push({ building: r.b, level: r.l as KingdomUpgrade['level'], zer: r.z, reachedAt: new Date(r.at).toISOString() });
  }
  return {
    buildings: kingdomBuildings(counts, recordedOf(stored.levels)),
    celebrate,
    intro: stored.village && !stored.village.intro ? { levels: introLevels, zer: introZer } : null,
  };
}
