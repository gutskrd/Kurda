import type pg from 'pg';
import {
  BADGES,
  BADGE_FAMILIES,
  MULTI_GAMES,
  RARITY_MIN_ACTIVE_USERS,
  SHOWCASE_SIZE,
  badgeDef,
  badgeTierFor,
  badgeTierKey,
  resolveThresholds,
  type BadgeDef,
  type BadgeFamily,
  type BadgeUnlockedEvent,
  type BadgeView,
  type BadgesResponse,
  type ProfileBadge,
  type ShowcaseBadge,
  type UnseenBadge,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { Notification } from '../push/service.js';
import { isKnownAdultRow, areFriendsSql } from '../users/age.js';
import { MEASURES, MeasureContext, daysPerMonth, monthlyGoal, previousMonth, type Measured } from './measures.js';
import type { MilestoneRecorder } from '../achievements/service.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * Whether learner `$1` did anything before this first count: XP older than an hour, or more than one learning day.
 * The hour covers the lesson or game that triggered the count.
 */
const HAS_PAST_SQL = `(EXISTS (SELECT 1 FROM xp_ledger WHERE user_id = $1 AND created_at < now() - interval '1 hour')
   OR EXISTS (SELECT 1 FROM user_streaks WHERE user_id = $1 AND (days_learned > 1 OR longest_streak > 1)))`;

/**
 * What each kind of event can move. An event re-counts only these, so it costs a handful of queries; a learner's
 * first count does them all.
 */
export const BADGE_TRIGGERS = {
  learning: [
    'ders', 'peyven-min', 'bekemasi', 'dubare', 'cirokbej', 'rewi', 'ferheng', 'zengil', 'penus', 'belur',
    'agir', 'roj', 'vegera', 'cay', 'gula-hefte', 'heyva-cardehe',
    'newroz', 'roja-ziman', 'zimane-dayike', 'sersal', 'yelda', 'zivistan', 'bihar', 'havin', 'payiz', 'mehane',
    'kaniya-zanine', 'mevane-agir', 'perperok', 'mirari',
  ],
  // a story game's rewards can meet the day's goal (Çay)
  game: ['peyvzan', 'helbestvan', 'guhdar', 'hemereng', 'heval', 'mevandar', 'tire-rast', 'ji-nu-ve', 'mevane-agir', 'cirokbej', 'cay', 'dilgerm'],
  solo: ['hemereng', 'bilez', 'rastnivis', 'deste-zerin', 'mamik', 'bilbil', 'pisika-wane', 'elmas', 'sterka-siqiti'],
  gift: ['diyari'],
  letter: ['name'],
  saved: ['gencine'],
  league: ['hefte', 'pela'],
} as const satisfies Record<string, readonly string[]>;

/**
 * Badges added after the catalogue's first version, by version. A learner counted before a version gets its
 * badges counted quietly once, as on their first day (`badge_users.catalogue`).
 */
export const CATALOGUE_ADDITIONS: Readonly<Record<number, readonly string[]>> = {
  2: ['zengil', 'penus', 'cay', 'gula-hefte', 'mamik', 'bilbil', 'name', 'sersal', 'yelda', 'pisika-wane', 'perperok'],
  3: ['belur', 'gencine', 'heyva-cardehe', 'elmas', 'dilgerm', 'sterka-siqiti', 'mirari'],
};
/** The catalogue's current version: the last that added badges. */
export const CATALOGUE_VERSION = Math.max(1, ...Object.keys(CATALOGUE_ADDITIONS).map(Number));

/** The in-app list, the live celebration, and one push a day at most. */
export interface BadgeNotices {
  /** Writes one learner's notifications together. */
  recordAll(userId: string, notifications: readonly Notification[]): Promise<void>;
  realtime(userId: string, event: BadgeUnlockedEvent): Promise<void>;
  /**
   * Schedules the day's single push, a while after the first unlock so it can bundle the rest. Called at most once
   * per learner per day.
   */
  pushLater(userId: string, day: string): Promise<void>;
}

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

export interface BadgeDeps {
  notices?: BadgeNotices;
  log?: Log;
  now?: () => Date;
}

export interface Unlock {
  key: string;
  tier: number;
}

interface BadgeRow {
  badge_key: string;
  tier: number;
  progress: number;
  earned_at: Date | null;
  tier_earned_at: Date[];
  floor_tier: number;
  cap_tier: number | null;
  seen_tier: number;
}

/** Games the play layer reports as finished, mapped to their tables; the multiplayer games share the engine's. */
const PLAY_GAMES: Record<string, { players: string; key: string }> = {
  'wordle-battle': { players: 'wordle_battle_players', key: 'battle_id' },
  'rhyme-match': { players: 'rhyme_match_players', key: 'match_id' },
  stories: { players: 'story_game_players', key: 'game_id' },
  ...Object.fromEntries(MULTI_GAMES.map((g) => [g, { players: 'game_lobby_players', key: 'lobby_id' }])),
};

/**
 * Badges. Progress is always counted by the server from the tables (measures.ts) when something that could move
 * it happens. Counting is idempotent and runs one at a time per learner, so a tier unlocks once however many
 * events arrive together.
 *
 * Tiers only go up, except by an admin's revoke (`cap_tier`), which a re-count respects. An unlock is told by a
 * notification row, a realtime `badge_unlocked`, and at most one push a day if the learner allows progress news.
 * A learner's first count records what they did before badges existed quietly, as already seen; a newcomer with
 * no such past celebrates what the first count finds (`HAS_PAST_SQL`).
 */
export class BadgeService implements MilestoneRecorder {
  private readonly now: () => Date;
  /** games recently counted, so the several `play_changed` of one finish count it once */
  private readonly recentGames = new Map<string, number>();
  /** writer, friend and day of the letters already counted (Name moves once for each) */
  private readonly recentLetters = new Set<string>();

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: BadgeDeps = {},
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  // ---- events --------------------------------------------------------------------

  /** A lesson, practice or story counted for the streak: the learning and habit badges. */
  async recordStreak(userId: string, _currentStreak: number): Promise<void> {
    await this.evaluate(userId, BADGE_TRIGGERS.learning);
  }

  /** A lesson finished (the perfect-lesson count among them). */
  async recordLessonCompleted(userId: string, _accuracy: number): Promise<void> {
    await this.evaluate(userId, BADGE_TRIGGERS.learning);
  }

  /** A lesson finished and the streak it left: both move the same badges, so they are counted once. */
  async recordLesson(userId: string, _accuracy: number, _currentStreak: number): Promise<void> {
    await this.evaluate(userId, BADGE_TRIGGERS.learning);
  }

  /** A solo game finished: Peyvok, Rhyme training, the Typing Race. */
  async recordSoloGame(userId: string): Promise<void> {
    await this.evaluate(userId, BADGE_TRIGGERS.solo);
  }

  /** A multiplayer game finished (from the play layer): every player in it is counted. */
  async onGameFinished(game: string, lobbyId: string): Promise<void> {
    // its own keys only: a name like __proto__ finds nothing here either
    const table = Object.hasOwn(PLAY_GAMES, game) ? PLAY_GAMES[game] : undefined;
    if (!table) return;
    const key = `${game}:${lobbyId}`;
    const at = Date.now();
    for (const [k, t] of this.recentGames) if (at - t > 60_000) this.recentGames.delete(k);
    if (this.recentGames.has(key)) return;
    this.recentGames.set(key, at);
    // Table and column names come from the fixed map above, never from input. Computer seats earn no badges.
    const players = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM ${table.players} WHERE ${table.key} = $1 AND NOT removed AND user_id IS NOT NULL`,
      [lobbyId],
    );
    for (const p of players.rows) {
      await this.evaluate(p.user_id, [...BADGE_TRIGGERS.game, ...BADGE_TRIGGERS.solo]).catch((err) =>
        this.deps.log?.warn({ err, game, lobbyId }, 'game badges not counted'),
      );
    }
  }

  async onGiftSent(fromUserId: string): Promise<void> {
    await this.evaluate(fromUserId, BADGE_TRIGGERS.gift);
  }

  /** A message written to a friend (Name). Counts once per friend a day, so only the day's first one can move it. */
  async onLetterSent(fromUserId: string, toUserId: string): Promise<void> {
    const key = `${fromUserId}:${toUserId}:${this.now().toISOString().slice(0, 10)}`;
    if (this.recentLetters.has(key)) return;
    if (this.recentLetters.size >= 10_000) this.recentLetters.clear();
    this.recentLetters.add(key);
    await this.evaluate(fromUserId, BADGE_TRIGGERS.letter);
  }

  /** A word saved from the dictionary to the learner's list, new to it (Gencîne). */
  async onWordSaved(userId: string): Promise<void> {
    await this.evaluate(userId, BADGE_TRIGGERS.saved);
  }

  /** A league week was recorded for these learners (settled, or in personal mode). */
  async onLeagueWeek(userIds: string[]): Promise<void> {
    for (const id of userIds) {
      await this.evaluate(id, BADGE_TRIGGERS.league).catch((err) => this.deps.log?.warn({ err }, 'league badges not counted'));
    }
  }

  // ---- counting ------------------------------------------------------------------

  /**
   * Counts `keys` (every badge when omitted) for one learner, records any tier reached and returns the unlocks. A
   * learner's first count covers everything and is quiet when they learned before badges existed.
   */
  async evaluate(userId: string, keys?: readonly string[]): Promise<Unlock[]> {
    const { unlocks, quiet } = await this.tx(async (client) => {
      // one count at a time per learner: the same tier is never unlocked twice
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`badges:${userId}`]);
      // One statement: is the account live, is this its first count (recorded here if so), did it learn before, and
      // which catalogue it was last counted against (read before the insert, so a first count reads none).
      const state = await client.query<{ live: boolean; first: boolean; past: boolean | null; catalogue: number | null }>(
        `WITH live AS (SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL),
              fresh AS (INSERT INTO badge_users (user_id, catalogue) SELECT $1::uuid, $2::int FROM live ON CONFLICT DO NOTHING RETURNING 1)
         SELECT EXISTS (SELECT 1 FROM live) AS live, EXISTS (SELECT 1 FROM fresh) AS first,
                CASE WHEN EXISTS (SELECT 1 FROM fresh) THEN ${HAS_PAST_SQL} END AS past,
                (SELECT catalogue FROM badge_users WHERE user_id = $1) AS catalogue`,
        [userId, CATALOGUE_VERSION],
      );
      const s = state.rows[0]!;
      if (!s.live) return { unlocks: [] as Unlock[], quiet: true };
      const isFirst = s.first;
      const quietly = isFirst && s.past === true;
      if (!isFirst) await this.catchUp(client, userId, s.catalogue);
      const defs = isFirst || !keys ? BADGES : keys.map((k) => badgeDef(k)).filter((d): d is BadgeDef => !!d);
      const found = await this.count(client, userId, defs, quietly);
      return { unlocks: found, quiet: quietly };
    });
    if (!quiet) await this.announce(userId, unlocks);
    return unlocks;
  }

  /** Whether this learner was counted against the current catalogue, which leaves a count with no trigger nothing to do. */
  private async counted(userId: string): Promise<boolean> {
    const r = await this.pool.query<{ catalogue: number | null }>(`SELECT catalogue FROM badge_users WHERE user_id = $1`, [userId]);
    const row = r.rows[0];
    return row !== undefined && (row.catalogue ?? CATALOGUE_VERSION) >= CATALOGUE_VERSION;
  }

  /** Quietly counts the badges added to the catalogue since this learner was last counted. */
  private async catchUp(client: Executor, userId: string, catalogue: number | null): Promise<void> {
    const from = catalogue ?? CATALOGUE_VERSION;
    if (from >= CATALOGUE_VERSION) return;
    const added = Object.entries(CATALOGUE_ADDITIONS)
      .filter(([version]) => Number(version) > from)
      .flatMap(([, keys]) => keys.map((k) => badgeDef(k)).filter((d): d is BadgeDef => !!d));
    await this.count(client, userId, added, true);
    await client.query(`UPDATE badge_users SET catalogue = $2 WHERE user_id = $1`, [userId, CATALOGUE_VERSION]);
  }

  private async count(client: Executor, userId: string, asked: readonly BadgeDef[], quietly: boolean): Promise<Unlock[]> {
    // A badge two triggers share is counted, written and announced once.
    const defs = [...new Map(asked.map((d) => [d.key, d])).values()];
    if (defs.length === 0) return [];
    // Start every measure before awaiting any, so their counts share one statement.
    const ctx = new MeasureContext(client, userId);
    const measuring = new Map<string, Promise<Measured>>();
    for (const def of defs) {
      if (!measuring.has(def.measure)) {
        const measure = MEASURES[def.measure];
        measuring.set(def.measure, measure ? measure(ctx) : Promise.resolve({ progress: 0 }));
      }
    }
    const measured = new Map(await Promise.all([...measuring].map(async ([key, m]) => [key, await m] as const)));
    const rows = await client.query<BadgeRow>(
      `SELECT badge_key, tier, progress, earned_at, tier_earned_at, floor_tier, cap_tier, seen_tier
         FROM user_badges WHERE user_id = $1 AND badge_key = ANY($2::text[])`,
      [userId, defs.map((d) => d.key)],
    );
    const existing = new Map(rows.rows.map((r) => [r.badge_key, r]));
    const at = this.now();
    const unlocks: Unlock[] = [];
    const changed: Array<{ badge_key: string; tier: number; progress: number; earned_at: Date | null; tier_earned_at: Date[]; seen_tier: number }> = [];
    for (const def of defs) {
      const m = measured.get(def.measure)!;
      const row = existing.get(def.key);
      // progress counts never fall (a deleted session does not take a badge's bar back)
      const progress = Math.max(row?.progress ?? 0, Math.floor(m.progress));
      const counted = badgeTierFor(def, progress, m.allTarget);
      const tier = Math.min(row?.cap_tier ?? def.tiers.length, Math.max(row?.tier ?? 0, row?.floor_tier ?? 0, counted));
      if (row && tier === row.tier && progress === row.progress) continue;
      if (!row && tier === 0 && progress === 0) continue;
      const before = row?.tier ?? 0;
      const stamps = [...(row?.tier_earned_at ?? [])];
      while (stamps.length < tier) stamps.push(at);
      changed.push({
        badge_key: def.key,
        tier,
        progress,
        earned_at: row?.earned_at ?? (tier > 0 ? at : null),
        tier_earned_at: stamps,
        seen_tier: quietly ? tier : (row?.seen_tier ?? 0),
      });
      if (tier > before) unlocks.push({ key: def.key, tier });
    }
    // every badge that moved in one statement, not one each
    if (changed.length > 0) {
      await client.query(
        `INSERT INTO user_badges (user_id, badge_key, tier, progress, earned_at, tier_earned_at, seen_tier, updated_at)
         SELECT $1::uuid, b.badge_key, b.tier, b.progress, b.earned_at, b.tier_earned_at, b.seen_tier, now()
           FROM jsonb_to_recordset($2::jsonb)
             AS b(badge_key text, tier int, progress int, earned_at timestamptz, tier_earned_at timestamptz[], seen_tier int)
         ON CONFLICT (user_id, badge_key) DO UPDATE SET
           tier = EXCLUDED.tier, progress = EXCLUDED.progress, earned_at = EXCLUDED.earned_at,
           tier_earned_at = EXCLUDED.tier_earned_at, seen_tier = EXCLUDED.seen_tier, updated_at = now()`,
        [userId, JSON.stringify(changed)],
      );
    }
    return unlocks;
  }

  /** Tell the learner: the list, the celebration, and the day's push (once). */
  private async announce(userId: string, unlocks: Unlock[]): Promise<void> {
    const notices = this.deps.notices;
    if (!notices || unlocks.length === 0) return;
    const warn = (what: string) => (err: unknown) => this.deps.log?.warn({ err, userId }, what);
    const told: Notification[] = [];
    for (const u of unlocks) {
      const def = badgeDef(u.key)!;
      const event: BadgeUnlockedEvent = {
        type: 'badge_unlocked',
        key: u.key,
        family: def.family,
        tier: u.tier,
        tierKey: badgeTierKey(def, u.tier),
        secret: def.secret,
      };
      await notices.realtime(userId, event).catch(warn('badge_unlocked not sent'));
      // English for the list; the apps write their own words from `data`
      told.push({
        category: 'progress',
        title: 'A new badge',
        body: def.secret ? 'You found a secret badge.' : `You earned ${def.nameKu}.`,
        data: { kind: 'badge', key: u.key, tier: String(u.tier) },
      });
    }
    await notices.recordAll(userId, told).catch(warn('badge notification not recorded'));
    const day = this.now().toISOString().slice(0, 10);
    const claimed = await this.pool.query(
      `INSERT INTO badge_push_days (user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, day],
    );
    if ((claimed.rowCount ?? 0) > 0) await notices.pushLater(userId, day).catch(warn('badge push not scheduled'));
  }

  /** The day's one push bundling every badge earned that UTC day, or null when there is nothing to tell. */
  async dayPush(userId: string, day: string): Promise<Notification | null> {
    const r = await this.pool.query<{ badge_key: string; tiers: number }>(
      `SELECT badge_key, count(*)::int AS tiers FROM user_badges b, unnest(b.tier_earned_at) AS t(at)
        WHERE b.user_id = $1 AND (t.at AT TIME ZONE 'UTC')::date = $2::date
        GROUP BY badge_key`,
      [userId, day],
    );
    if (r.rows.length === 0) return null;
    const only = r.rows.length === 1 ? badgeDef(r.rows[0]!.badge_key) : undefined;
    return {
      category: 'progress',
      title: r.rows.length === 1 ? 'A new badge' : 'New badges',
      body:
        only && !only.secret
          ? `You earned ${only.nameKu} today.`
          : r.rows.length === 1
            ? 'You found a secret badge today.'
            : `You earned ${r.rows.length} badges today.`,
      data: { kind: 'badge', day },
    };
  }

  // ---- reading -------------------------------------------------------------------

  /** `GET /me/badges`: every badge, the learner's progress on it, the showcase, secrets and rarity. */
  async list(userId: string): Promise<BadgesResponse> {
    // make sure what they have done is counted (quietly, the first time); once counted there is nothing to count here
    if (!(await this.counted(userId))) await this.evaluate(userId, []);
    // The learner's own single values ride one statement together.
    const ctx = new MeasureContext(this.pool, userId);
    const [rows, rarity, days, units, showcase, legacyWin] = await Promise.all([
      this.pool.query<BadgeRow>(
        `SELECT badge_key, tier, progress, earned_at, tier_earned_at, floor_tier, cap_tier, seen_tier
           FROM user_badges WHERE user_id = $1`,
        [userId],
      ),
      this.rarity(),
      ctx.learningDays(),
      MEASURES.units_completed!(ctx),
      ctx.value<string[] | null>(`SELECT badge_keys FROM badge_showcase WHERE user_id = $1`),
      ctx.value<Date | null>(`SELECT earned_at FROM user_achievements WHERE user_id = $1 AND achievement_id = 'tournament-win'`),
    ]);
    const byKey = new Map(rows.rows.map((r) => [r.badge_key, r]));
    const secretsFound = BADGES.filter((b) => b.secret && (byKey.get(b.key)?.tier ?? 0) > 0).length;
    const allTarget = units.allTarget;
    const badges: BadgeView[] = BADGES.flatMap((def) => {
      const row = byKey.get(def.key);
      const tier = row?.tier ?? 0;
      // A retired badge is no longer to win: shown only to those who earned it, its ladder ending where they got to.
      if (def.retired && tier === 0) return [];
      const hidden = def.secret && tier === 0;
      const thresholds = resolveThresholds(def, def.tiers.includes('all') ? allTarget : undefined)
        .map((t) => (Number.isFinite(t) ? t : 0))
        .slice(0, def.retired ? tier : undefined);
      const next = tier < thresholds.length ? (thresholds[tier]! > 0 ? thresholds[tier]! : null) : null;
      return {
        key: def.key,
        family: def.family,
        tier,
        tierCount: thresholds.length,
        tierKey: badgeTierKey(def, tier),
        progress: hidden ? 0 : (row?.progress ?? 0),
        thresholds: hidden ? [] : thresholds,
        next: hidden ? null : next,
        unit: def.unit,
        earnedAt: row?.earned_at?.toISOString() ?? null,
        tierEarnedAt: (row?.tier_earned_at ?? []).map((d) => new Date(d).toISOString()),
        secret: def.secret,
        hidden,
        hintKey: hidden && secretsFound > 0 ? (def.hintKey ?? null) : null,
        rarity: rarity.get(def.key) ?? null,
      };
    });
    const month = this.now().toISOString().slice(0, 7);
    const per = daysPerMonth(days);
    return {
      badges,
      showcase: showcase ?? [],
      secretsFound,
      secretsTotal: badges.filter((b) => b.secret).length,
      legacy: legacyWin ? [{ key: 'tournament-win', earnedAt: legacyWin.toISOString() }] : [],
      monthlyChallenge: { month, days: per.get(month) ?? 0, goal: monthlyGoal(per.get(previousMonth(month)) ?? 0) },
    };
  }

  /** Unlocks not yet celebrated, oldest first (`GET /me/badges/unseen`). */
  async unseen(userId: string): Promise<UnseenBadge[]> {
    const r = await this.pool.query<{ badge_key: string; tier: number; tier_earned_at: Date[] }>(
      `SELECT badge_key, tier, tier_earned_at FROM user_badges WHERE user_id = $1 AND tier > seen_tier`,
      [userId],
    );
    return r.rows
      .map((row) => {
        const def = badgeDef(row.badge_key);
        if (!def) return null;
        const at = row.tier_earned_at[row.tier - 1] ?? row.tier_earned_at.at(-1) ?? new Date();
        return {
          key: def.key,
          family: def.family,
          tier: row.tier,
          tierKey: badgeTierKey(def, row.tier),
          secret: def.secret,
          earnedAt: new Date(at).toISOString(),
        };
      })
      .filter((b): b is UnseenBadge => b !== null)
      .sort((a, b) => a.earnedAt.localeCompare(b.earnedAt));
  }

  /** The celebration was shown: these (or all) unlocks are seen. */
  async markSeen(userId: string, keys?: string[]): Promise<void> {
    await this.pool.query(
      `UPDATE user_badges SET seen_tier = tier WHERE user_id = $1 AND tier > seen_tier
          AND ($2::text[] IS NULL OR badge_key = ANY($2::text[]))`,
      [userId, keys ?? null],
    );
  }

  // ---- the showcase --------------------------------------------------------------

  /** `PUT /me/badges/showcase`: up to three earned badges, in the order given. */
  async setShowcase(userId: string, keys: string[]): Promise<string[]> {
    const unique = [...new Set(keys)];
    if (unique.length > SHOWCASE_SIZE) throw new AppError('SHOWCASE_TOO_BIG', 400, `at most ${SHOWCASE_SIZE} badges`);
    if (unique.some((k) => !badgeDef(k))) throw new AppError('UNKNOWN_BADGE', 400, 'no such badge');
    const earned = await this.pool.query<{ badge_key: string }>(
      `SELECT badge_key FROM user_badges WHERE user_id = $1 AND badge_key = ANY($2::text[]) AND tier > 0`,
      [userId, unique],
    );
    if (earned.rows.length !== unique.length) throw new AppError('BADGE_NOT_EARNED', 400, 'only an earned badge can be shown');
    await this.pool.query(
      `INSERT INTO badge_showcase (user_id, badge_keys, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET badge_keys = EXCLUDED.badge_keys, updated_at = now()`,
      [userId, unique],
    );
    return unique;
  }

  /** The three badges a profile shows (see `profileShowcase`). */
  async showcaseFor(targetId: string, viewerId: string | null): Promise<ShowcaseBadge[]> {
    return profileShowcase(this.pool, targetId, viewerId);
  }

  /** Badges earned (a tier or more), for the profile's count. */
  async earnedCount(userId: string): Promise<number> {
    const r = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_badges WHERE user_id = $1 AND tier > 0`,
      [userId],
    );
    return r.rows[0]?.n ?? 0;
  }

  // ---- rarity --------------------------------------------------------------------

  /**
   * Nightly: the share of learners active in the last thirty days holding each badge at each tier or above. Shown
   * only from 500 learners; below that a percentage says more about the few than the badge.
   */
  async computeRarity(): Promise<{ activeUsers: number }> {
    const active = await this.pool.query<{ n: number }>(
      `SELECT count(DISTINCT a.user_id)::int AS n FROM user_activity_days a JOIN users u ON u.id = a.user_id
        WHERE a.day >= (now() AT TIME ZONE 'UTC')::date - 30 AND u.deleted_at IS NULL`,
    );
    const activeUsers = active.rows[0]?.n ?? 0;
    const holders = await this.pool.query<{ badge_key: string; tier: number; holders: number }>(
      `SELECT b.badge_key, t.tier, count(*)::int AS holders
         FROM user_badges b
         JOIN LATERAL generate_series(1, b.tier) AS t(tier) ON true
        WHERE b.tier > 0 AND EXISTS (
          SELECT 1 FROM user_activity_days a WHERE a.user_id = b.user_id AND a.day >= (now() AT TIME ZONE 'UTC')::date - 30)
        GROUP BY b.badge_key, t.tier`,
    );
    const counts = new Map(holders.rows.map((h) => [`${h.badge_key}:${h.tier}`, h.holders]));
    const keys: string[] = [];
    const tiers: number[] = [];
    const held: number[] = [];
    for (const def of BADGES) {
      for (let tier = 1; tier <= def.tiers.length; tier++) {
        keys.push(def.key);
        tiers.push(tier);
        held.push(counts.get(`${def.key}:${tier}`) ?? 0);
      }
    }
    await this.tx(async (client) => {
      await client.query(`DELETE FROM badge_rarity`);
      // every badge's every tier in one statement
      await client.query(
        `INSERT INTO badge_rarity (badge_key, tier, holders, active_users, computed_at)
         SELECT r.badge_key, r.tier, r.holders, $4, now() FROM unnest($1::text[], $2::int[], $3::int[]) AS r(badge_key, tier, holders)`,
        [keys, tiers, held, activeUsers],
      );
    });
    return { activeUsers };
  }

  /** Percent per tier, or nothing while too few are active. */
  private async rarity(): Promise<Map<string, number[]>> {
    const r = await this.pool.query<{ badge_key: string; tier: number; holders: number; active_users: number }>(
      `SELECT badge_key, tier, holders, active_users FROM badge_rarity WHERE active_users >= $1 ORDER BY badge_key, tier`,
      [RARITY_MIN_ACTIVE_USERS],
    );
    const out = new Map<string, number[]>();
    for (const row of r.rows) {
      const list = out.get(row.badge_key) ?? [];
      list[row.tier - 1] = Math.round((1000 * row.holders) / row.active_users) / 10;
      out.set(row.badge_key, list);
    }
    return out;
  }

  // ---- the admin -----------------------------------------------------------------

  /** The catalogue with how many hold each tier, and the rarity last computed. */
  async adminCatalogue(): Promise<{
    families: readonly BadgeFamily[];
    badges: Array<BadgeDef & { holders: number[]; rarity: number[] | null }>;
    rarityComputedAt: string | null;
    activeUsers: number | null;
  }> {
    const holders = await this.pool.query<{ badge_key: string; tier: number; n: number }>(
      `SELECT b.badge_key, t.tier, count(*)::int AS n FROM user_badges b
         JOIN LATERAL generate_series(1, b.tier) AS t(tier) ON true
         JOIN users u ON u.id = b.user_id AND u.deleted_at IS NULL
        GROUP BY b.badge_key, t.tier`,
    );
    const counts = new Map(holders.rows.map((h) => [`${h.badge_key}:${h.tier}`, h.n]));
    const last = await this.pool.query<{ computed_at: Date; active_users: number }>(
      `SELECT computed_at, active_users FROM badge_rarity ORDER BY computed_at DESC LIMIT 1`,
    );
    const all = await this.pool.query<{ badge_key: string; tier: number; holders: number; active_users: number }>(
      `SELECT badge_key, tier, holders, active_users FROM badge_rarity WHERE active_users > 0`,
    );
    const pct = new Map<string, number[]>();
    for (const row of all.rows) {
      const list = pct.get(row.badge_key) ?? [];
      list[row.tier - 1] = Math.round((1000 * row.holders) / row.active_users) / 10;
      pct.set(row.badge_key, list);
    }
    return {
      families: BADGE_FAMILIES,
      badges: BADGES.map((def) => ({
        ...def,
        holders: def.tiers.map((_, i) => counts.get(`${def.key}:${i + 1}`) ?? 0),
        rarity: pct.get(def.key) ?? null,
      })),
      rarityComputedAt: last.rows[0]?.computed_at.toISOString() ?? null,
      activeUsers: last.rows[0]?.active_users ?? null,
    };
  }

  /** One learner's badges and the admin actions on them. */
  async adminUser(userId: string): Promise<{
    badges: Array<{ key: string; tier: number; progress: number; floorTier: number; capTier: number | null; earnedAt: string | null }>;
    actions: Array<{ key: string; action: 'award' | 'revoke'; tier: number; reason: string; adminId: string | null; at: string }>;
  }> {
    const rows = await this.pool.query<BadgeRow>(
      `SELECT badge_key, tier, progress, earned_at, tier_earned_at, floor_tier, cap_tier, seen_tier
         FROM user_badges WHERE user_id = $1 ORDER BY badge_key`,
      [userId],
    );
    const actions = await this.pool.query<{
      badge_key: string;
      action: 'award' | 'revoke';
      tier: number;
      reason: string;
      admin_id: string | null;
      created_at: Date;
    }>(`SELECT badge_key, action, tier, reason, admin_id, created_at FROM badge_admin_actions WHERE user_id = $1 ORDER BY created_at DESC`, [
      userId,
    ]);
    return {
      badges: rows.rows.map((r) => ({
        key: r.badge_key,
        tier: r.tier,
        progress: r.progress,
        floorTier: r.floor_tier,
        capTier: r.cap_tier,
        earnedAt: r.earned_at?.toISOString() ?? null,
      })),
      actions: actions.rows.map((a) => ({
        key: a.badge_key,
        action: a.action,
        tier: a.tier,
        reason: a.reason,
        adminId: a.admin_id,
        at: a.created_at.toISOString(),
      })),
    };
  }

  /**
   * An admin awards a badge up to a tier (a floor) or revokes it down to one (a cap a re-count never exceeds), with
   * a reason. An award is celebrated like any unlock; a revoke is quiet and takes the badge off the showcase when
   * nothing of it is left.
   */
  async adminSet(
    userId: string,
    key: string,
    action: 'award' | 'revoke',
    tier: number,
    reason: string,
    adminId: string | null,
  ): Promise<{ key: string; tier: number }> {
    const def = badgeDef(key);
    if (!def) throw new AppError('UNKNOWN_BADGE', 400, 'no such badge');
    if (!Number.isInteger(tier) || tier < 0 || tier > def.tiers.length || (action === 'award' && tier < 1)) {
      throw new AppError('BAD_TIER', 400, `tier must be ${action === 'award' ? 1 : 0}–${def.tiers.length}`);
    }
    const exists = await this.pool.query(`SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
    if (!exists.rowCount) throw new AppError('USER_NOT_FOUND', 404, 'no such user');
    const result = await this.tx(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`badges:${userId}`]);
      const row = await client.query<{ tier: number; tier_earned_at: Date[] }>(
        `SELECT tier, tier_earned_at FROM user_badges WHERE user_id = $1 AND badge_key = $2`,
        [userId, key],
      );
      const before = row.rows[0]?.tier ?? 0;
      const at = this.now();
      if (action === 'award') {
        const next = Math.max(before, tier);
        const stamps = [...(row.rows[0]?.tier_earned_at ?? [])];
        while (stamps.length < next) stamps.push(at);
        await client.query(
          `INSERT INTO user_badges (user_id, badge_key, tier, floor_tier, cap_tier, earned_at, tier_earned_at)
           VALUES ($1, $2, $3, $4, NULL, $5, $6)
           ON CONFLICT (user_id, badge_key) DO UPDATE SET
             tier = EXCLUDED.tier, floor_tier = GREATEST(user_badges.floor_tier, EXCLUDED.floor_tier),
             cap_tier = CASE WHEN user_badges.cap_tier IS NOT NULL AND user_badges.cap_tier < EXCLUDED.tier THEN NULL ELSE user_badges.cap_tier END,
             earned_at = COALESCE(user_badges.earned_at, EXCLUDED.earned_at),
             tier_earned_at = EXCLUDED.tier_earned_at, updated_at = now()`,
          [userId, key, next, tier, at, stamps],
        );
        await client.query(
          `INSERT INTO badge_admin_actions (user_id, badge_key, action, tier, reason, admin_id) VALUES ($1, $2, 'award', $3, $4, $5)`,
          [userId, key, tier, reason, adminId],
        );
        return { tier: next, unlocked: next > before };
      }
      const next = Math.min(before, tier);
      await client.query(
        `INSERT INTO user_badges (user_id, badge_key, tier, cap_tier, seen_tier)
         VALUES ($1, $2, $3, $3, $3)
         ON CONFLICT (user_id, badge_key) DO UPDATE SET
           tier = LEAST(user_badges.tier, EXCLUDED.tier), cap_tier = EXCLUDED.cap_tier,
           floor_tier = LEAST(user_badges.floor_tier, EXCLUDED.cap_tier),
           seen_tier = LEAST(user_badges.seen_tier, EXCLUDED.cap_tier),
           tier_earned_at = user_badges.tier_earned_at[1:EXCLUDED.cap_tier],
           earned_at = CASE WHEN EXCLUDED.cap_tier = 0 THEN NULL ELSE user_badges.earned_at END,
           updated_at = now()`,
        [userId, key, tier],
      );
      if (next === 0) {
        await client.query(
          `UPDATE badge_showcase SET badge_keys = array_remove(badge_keys, $2), updated_at = now() WHERE user_id = $1`,
          [userId, key],
        );
      }
      await client.query(
        `INSERT INTO badge_admin_actions (user_id, badge_key, action, tier, reason, admin_id) VALUES ($1, $2, 'revoke', $3, $4, $5)`,
        [userId, key, tier, reason, adminId],
      );
      return { tier: next, unlocked: false };
    });
    if (result.unlocked) await this.announce(userId, [{ key, tier: result.tier }]);
    return { key, tier: result.tier };
  }

  private async tx<R>(fn: (client: pg.PoolClient) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * The three badges a profile shows (see `profileBadges`). Separate so the badge service can read it without the rest.
 */
export async function profileShowcase(db: Executor, targetId: string, viewerId: string | null): Promise<ShowcaseBadge[]> {
  return (await profileBadges(db, targetId, viewerId)).showcase;
}

/**
 * The badges a profile shows: the three chosen, and every one earned, newest first, with how rare its tier is once
 * enough people are active. A minor's, or one with no age on record, only to themselves and their friends, like the
 * rest of their profile; a revoked badge drops out. Separate so the profile can read it without the badge service.
 */
export async function profileBadges(
  db: Executor,
  targetId: string,
  viewerId: string | null,
): Promise<{ showcase: ShowcaseBadge[]; earned: ProfileBadge[] }> {
  // who may see them, the showcase, and every earned tier with its date and rarity, in one read
  const r = await db.query<{
    badge_keys: string[] | null;
    birth_year: number | null;
    birth_month: number | null;
    friends: boolean;
    earned: Array<{ key: string; tier: number; at: string | null; rarity: number | null }> | null;
  }>(
    `SELECT s.badge_keys, u.birth_year, u.birth_month, ${areFriendsSql('u.id', '$2::uuid')} AS friends,
            (SELECT jsonb_agg(jsonb_build_object('key', b.badge_key, 'tier', b.tier, 'at', COALESCE(b.tier_earned_at[b.tier], b.earned_at),
                                                 'rarity', round(1000.0 * br.holders / br.active_users) / 10)
                              ORDER BY COALESCE(b.tier_earned_at[b.tier], b.earned_at) DESC NULLS LAST, b.badge_key)
               FROM user_badges b
               LEFT JOIN badge_rarity br ON br.badge_key = b.badge_key AND br.tier = b.tier AND br.active_users >= $3
              WHERE b.user_id = u.id AND b.tier > 0) AS earned
       FROM users u LEFT JOIN badge_showcase s ON s.user_id = u.id WHERE u.id = $1`,
    [targetId, viewerId, RARITY_MIN_ACTIVE_USERS],
  );
  const row = r.rows[0];
  const none = { showcase: [], earned: [] };
  if (!row?.earned?.length) return none;
  const self = viewerId !== null && viewerId === targetId;
  if (!self && !row.friends && !isKnownAdultRow(row)) return none;
  const earned = row.earned.flatMap((b): ProfileBadge[] => {
    const def = badgeDef(b.key);
    if (!def) return [];
    const at = b.at ? new Date(b.at) : null;
    return [
      {
        key: b.key,
        family: def.family,
        tier: b.tier,
        tierKey: badgeTierKey(def, b.tier),
        earnedAt: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
        rarity: b.rarity === null ? null : Number(b.rarity),
      },
    ];
  });
  const byKey = new Map(earned.map((b) => [b.key, b]));
  const showcase = (row.badge_keys ?? []).flatMap((key) => {
    const b = byKey.get(key);
    return b ? [{ key, family: b.family, tier: b.tier, tierKey: b.tierKey }] : [];
  });
  return { showcase, earned };
}
