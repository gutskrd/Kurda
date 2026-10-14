import type pg from 'pg';
import {
  FEW_PLAYERS,
  RANK_TIER_KEYS,
  RESTING_DAYS,
  SEASON_REWARD_GEMS,
  SEASON_REWARD_MIN_GAMES,
  STERK_RULE,
  isRankTier,
  previousSeasonId,
  seasonById,
  seasonDaysLeft,
  seasonFrameSku,
  seasonOf,
  sterkTitle,
  tierIndex,
  tierOf,
  type RankTier,
  type RankedGame,
  type SeasonEmblem,
  type SeasonOverview,
} from '@kurda/shared';
import { WalletService } from '../wallet/service.js';
import { RankEvents } from './events.js';
import { lockGameRatings, rollSeason, stateOf, type RatingRow } from './store.js';

export interface RankSeasonsDeps {
  wallet?: WalletService;
  events?: RankEvents;
  now?: () => Date;
  log?: { warn: (obj: unknown, msg: string) => void; info?: (obj: unknown, msg: string) => void };
}

/** One player's reward for a season, before it is handed out (the admin's preview). */
export interface PendingReward {
  userId: string;
  username: string;
  game: RankedGame;
  tier: RankTier;
  gems: number;
  frameSku: string;
  title: string | null;
}

/** Best tier first, then by name: how the admin reads a season's rewards. */
function byTierThenName(a: { tier: RankTier; username: string }, b: { tier: RankTier; username: string }): number {
  return tierIndex(b.tier) - tierIndex(a.tier) || a.username.localeCompare(b.username);
}

/**
 * Seasons (contract-4 §R5): quarterly, on the calendar quarters (UTC).
 *
 * Closing a season — a job that runs every six hours and at start-up, and
 * from the admin panel — does, for every season before the current one:
 * 1. rolls each rating still in it into the new season (its result recorded
 *    as the season's emblem, σ raised to at least 4, μ kept, the season's
 *    counters reset), the same roll a player's next game makes when it gets
 *    there first;
 * 2. marks the season's Stêrk players (Lûtke I, top 1% — at least 20 — of the
 *    active players, 30 rated games, one in the last 14 days of the season),
 *    when the game had enough active players for a top 1% to mean something;
 * 3. hands out the rewards to everyone with 10 or more rated games in a game:
 *    the profile frame of their best peak tier across games (a cosmetic they
 *    own for good; Lûtke and Stêrk animated), the title "Stêrkê <season>" for
 *    a Stêrk, and a few Gems by that tier — one payout per player per season,
 *    never to a closed or banned account.
 *
 * Every step is idempotent: a result is recorded once per player, season and
 * game; a reward once per player and season (its row, the frame, the title
 * and the Gems are one transaction); re-running a half-done close finishes it.
 * The old quarterly league-tier Gem payout (which paid dormant accounts) is gone.
 */
export class RankSeasons {
  private readonly wallet: WalletService;
  readonly events: RankEvents;
  private readonly now: () => Date;
  private readonly log: NonNullable<RankSeasonsDeps['log']>;

  constructor(
    private readonly pool: pg.Pool,
    deps: RankSeasonsDeps = {},
  ) {
    this.wallet = deps.wallet ?? new WalletService(pool);
    this.events = deps.events ?? new RankEvents(deps.log);
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log ?? { warn: () => undefined };
  }

  /**
   * Close every season that has ended and is not closed and rewarded yet.
   * Returns how many it closed. Only one instance does it at a time (the
   * others find the lock taken and leave it).
   */
  async closeDue(): Promise<number> {
    const current = seasonOf(this.now()).id;
    const client = await this.pool.connect();
    let locked = false;
    try {
      locked = (await client.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtextextended('rank-seasons', 0)) AS ok`))
        .rows[0]!.ok;
      if (!locked) return 0;
      const due = await client.query<{ id: string }>(
        `SELECT DISTINCT season_id AS id FROM game_ratings WHERE season_id < $1
          UNION
         SELECT DISTINCT r.season_id FROM rank_season_results r
          WHERE r.season_id < $1
            AND NOT EXISTS (SELECT 1 FROM rank_seasons s WHERE s.id = r.season_id AND s.rewarded_at IS NOT NULL)
          ORDER BY id`,
        [current],
      );
      for (const { id } of due.rows) await this.closeSeason(id, current);
      return due.rows.length;
    } finally {
      if (locked) await client.query(`SELECT pg_advisory_unlock(hashtextextended('rank-seasons', 0))`).catch(() => undefined);
      client.release();
    }
  }

  /** Close one season (see the class): roll, mark Stêrk, reward, tell the badges. */
  async closeSeason(seasonId: string, nextSeasonId: string): Promise<{ rolled: number; rewarded: number }> {
    const season = seasonById(seasonId);
    await this.pool.query(
      `INSERT INTO rank_seasons (id, starts_at, ends_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [seasonId, season.startsAt, season.endsAt],
    );
    const rolled = await this.rollAll(seasonId, nextSeasonId);
    await this.markSterk(seasonId);
    await this.pool.query(`UPDATE rank_seasons SET closed_at = COALESCE(closed_at, now()) WHERE id = $1`, [seasonId]);
    const rewarded = await this.reward(seasonId);
    const done = await this.pool.query(
      `UPDATE rank_seasons SET rewarded_at = now() WHERE id = $1 AND rewarded_at IS NULL RETURNING id`,
      [seasonId],
    );
    if (done.rowCount) this.events.emitSeasonClosed({ seasonId, nextSeasonId, at: this.now() });
    this.log.info?.({ seasonId, rolled, rewarded }, 'rank season closed');
    return { rolled, rewarded };
  }

  /** Roll every rating still in `seasonId`, a row per transaction (and per lock), in batches. */
  private async rollAll(seasonId: string, nextSeasonId: string): Promise<number> {
    let rolled = 0;
    for (;;) {
      const batch = await this.pool.query<{ user_id: string; game: RankedGame }>(
        `SELECT user_id, game FROM game_ratings WHERE season_id = $1 ORDER BY user_id, game LIMIT 500`,
        [seasonId],
      );
      if (batch.rows.length === 0) return rolled;
      for (const r of batch.rows) {
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          await lockGameRatings(client, r.game);
          const row = (
            await client.query<RatingRow>(`SELECT * FROM game_ratings WHERE user_id = $1 AND game = $2 FOR UPDATE`, [r.user_id, r.game])
          ).rows[0];
          // a game may have rolled it meanwhile
          if (row && row.season_id === seasonId) {
            await rollSeason(client, r.user_id, r.game, stateOf(row), nextSeasonId);
            rolled++;
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        } finally {
          client.release();
        }
      }
    }
  }

  /** Stêrk, judged on the season's final standings (rank_season_results). */
  private async markSterk(seasonId: string): Promise<void> {
    const end = new Date(seasonById(seasonId).endsAt);
    const games = await this.pool.query<{ game: RankedGame; active: number }>(
      `SELECT game, count(*)::int AS active FROM rank_season_results
        WHERE season_id = $1 AND peak_tier IS NOT NULL AND last_rated_at > $2::timestamptz - make_interval(days => $3)
        GROUP BY game`,
      [seasonId, end, RESTING_DAYS],
    );
    for (const { game, active } of games.rows) {
      if (active < FEW_PLAYERS) continue;
      const top = Math.max(STERK_RULE.minTop, Math.ceil(active * STERK_RULE.topShare));
      await this.pool.query(
        `UPDATE rank_season_results r SET sterk = true, peak_tier = 'sterk'
          WHERE r.season_id = $1 AND r.game = $2 AND NOT r.sterk
            AND r.final_points >= $3 AND r.total_games >= $4
            AND r.last_rated_at > $5::timestamptz - make_interval(days => $6)
            AND (SELECT count(*) FROM rank_season_results o
                  WHERE o.season_id = r.season_id AND o.game = r.game AND o.peak_tier IS NOT NULL
                    AND o.last_rated_at > $5::timestamptz - make_interval(days => $7)
                    AND o.final_points > r.final_points) < $8`,
        [seasonId, game, STERK_RULE.minPoints, STERK_RULE.minGames, end, STERK_RULE.activeDays, RESTING_DAYS, top],
      );
    }
  }

  /** Everyone due a reward for `seasonId`, with what they would get (the admin preview; the job's list). */
  async pendingRewards(seasonId: string): Promise<PendingReward[]> {
    const rows = await this.pool.query<{ user_id: string; username: string; game: RankedGame; peak_tier: string }>(
      `SELECT r.user_id, u.username, r.game, r.peak_tier
         FROM rank_season_results r JOIN users u ON u.id = r.user_id
        WHERE r.season_id = $1 AND r.rated_games >= $2 AND r.peak_tier IS NOT NULL
          AND u.deleted_at IS NULL
          AND NOT (u.banned_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until > now()))
          AND NOT EXISTS (SELECT 1 FROM rank_season_rewards w WHERE w.user_id = r.user_id AND w.season_id = r.season_id)
        ORDER BY r.user_id, r.game`,
      [seasonId, SEASON_REWARD_MIN_GAMES],
    );
    // one reward per player: their best peak tier across games
    const best = new Map<string, PendingReward>();
    for (const r of rows.rows) {
      if (!isRankTier(r.peak_tier)) continue;
      const tier = r.peak_tier;
      const had = best.get(r.user_id);
      if (had && tierIndex(had.tier) >= tierIndex(tier)) continue;
      best.set(r.user_id, {
        userId: r.user_id,
        username: r.username,
        game: r.game,
        tier,
        gems: SEASON_REWARD_GEMS[tier],
        frameSku: seasonFrameSku(tier),
        title: tier === 'sterk' ? sterkTitle(seasonId) : null,
      });
    }
    return [...best.values()];
  }

  /**
   * The admin's preview of a season's rewards: everyone `pendingRewards` would
   * reward, plus the ratings still playing in it (an open season, or one not
   * closed yet) — "if it closed now". A live rating's peak tier is its points
   * tier; Stêrk is judged only at the close, so a preview never shows it for them.
   */
  async previewRewards(seasonId: string): Promise<PendingReward[]> {
    const recorded = await this.pendingRewards(seasonId);
    const live = await this.pool.query<{ user_id: string; username: string; game: RankedGame; peak_points: number }>(
      `SELECT r.user_id, u.username, r.game, r.peak_points
         FROM game_ratings r JOIN users u ON u.id = r.user_id
        WHERE r.season_id = $1 AND r.season_games >= $2 AND r.placement_done
          AND u.deleted_at IS NULL
          AND NOT (u.banned_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until > now()))
          AND NOT EXISTS (SELECT 1 FROM rank_season_rewards w WHERE w.user_id = r.user_id AND w.season_id = r.season_id)
        ORDER BY r.user_id, r.game`,
      [seasonId, SEASON_REWARD_MIN_GAMES],
    );
    const best = new Map(recorded.map((p) => [p.userId, p]));
    for (const r of live.rows) {
      const tier: RankTier = tierOf(r.peak_points);
      const had = best.get(r.user_id);
      if (had && tierIndex(had.tier) >= tierIndex(tier)) continue;
      best.set(r.user_id, {
        userId: r.user_id,
        username: r.username,
        game: r.game,
        tier,
        gems: SEASON_REWARD_GEMS[tier],
        frameSku: seasonFrameSku(tier),
        title: null,
      });
    }
    return [...best.values()].sort(byTierThenName);
  }

  /** What a season handed out, best tier first. */
  async givenRewards(seasonId: string, limit = 500): Promise<Array<Omit<PendingReward, 'frameSku'> & { frameSku: string | null; grantedAt: string }>> {
    const rows = await this.pool.query<{
      user_id: string;
      username: string;
      best_game: RankedGame;
      best_tier: RankTier;
      gems: number;
      frame_sku: string | null;
      title: string | null;
      granted_at: Date;
    }>(
      `SELECT w.user_id, u.username, w.best_game, w.best_tier, w.gems, w.frame_sku, w.title, w.granted_at
         FROM rank_season_rewards w JOIN users u ON u.id = w.user_id
        WHERE w.season_id = $1 ORDER BY w.granted_at, w.user_id LIMIT $2`,
      [seasonId, Math.min(Math.max(limit, 1), 2000)],
    );
    return rows.rows
      .map((r) => ({
        userId: r.user_id,
        username: r.username,
        game: r.best_game,
        tier: r.best_tier,
        gems: r.gems,
        frameSku: r.frame_sku,
        title: r.title,
        grantedAt: r.granted_at.toISOString(),
      }))
      .sort(byTierThenName);
  }

  private async reward(seasonId: string): Promise<number> {
    let rewarded = 0;
    for (const p of await this.pendingRewards(seasonId)) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const row = await client.query(
          `INSERT INTO rank_season_rewards (user_id, season_id, best_game, best_tier, gems, frame_sku, title)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (user_id, season_id) DO NOTHING`,
          [p.userId, seasonId, p.game, p.tier, p.gems, p.frameSku, p.title],
        );
        if (row.rowCount) {
          await client.query(
            `INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'reward') ON CONFLICT DO NOTHING`,
            [p.userId, p.frameSku],
          );
          if (p.title) {
            await client.query(
              `INSERT INTO user_tags (user_id, tag_id, source, value, displayed)
               SELECT $1, t.id, 'season_reward', $2, true FROM tags t WHERE t.key = 'season_title'
               ON CONFLICT (user_id, tag_id) DO UPDATE SET value = EXCLUDED.value, displayed = true, granted_at = now()`,
              [p.userId, p.title],
            );
          }
          if (p.gems > 0) {
            await this.wallet.creditWithin(client, {
              userId: p.userId,
              currency: 'gems',
              amount: p.gems,
              reason: 'season_reward',
              refId: seasonId,
              idempotencyKey: `season_reward:${seasonId}:${p.userId}`,
            });
          }
          rewarded++;
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        this.log.warn({ err, userId: p.userId, seasonId }, 'could not hand out a season reward; the next run will');
      } finally {
        client.release();
      }
    }
    return rewarded;
  }

  // -------------------------------------------------------------------------
  // reading

  /** A player's season emblems (10+ rated games in a game that season), newest first. */
  async emblems(userId: string): Promise<SeasonEmblem[]> {
    const rows = await this.pool.query<{ season_id: string; game: RankedGame; peak_tier: string; peak_points: number; rated_games: number }>(
      `SELECT season_id, game, peak_tier, peak_points, rated_games FROM rank_season_results
        WHERE user_id = $1 AND rated_games >= $2 AND peak_tier IS NOT NULL
        ORDER BY season_id DESC, game`,
      [userId, SEASON_REWARD_MIN_GAMES],
    );
    return rows.rows
      .filter((r) => isRankTier(r.peak_tier))
      .map((r) => ({
        seasonId: r.season_id,
        game: r.game,
        peakTier: r.peak_tier as RankTier,
        peakPoints: r.peak_points,
        ratedGames: r.rated_games,
      }));
  }

  /** `GET /ranks/seasons/current`: the season, its calm days-left, the rewards, and your last season. */
  async overview(userId: string): Promise<SeasonOverview> {
    const at = this.now();
    const season = seasonOf(at);
    const lastId = previousSeasonId(season.id);
    const closed = await this.pool.query(`SELECT 1 FROM rank_seasons WHERE id = $1 AND closed_at IS NOT NULL`, [lastId]);
    let lastSeason: SeasonOverview['lastSeason'] = null;
    if (closed.rowCount) {
      const reward = (
        await this.pool.query<{ best_tier: string; gems: number; frame_sku: string | null; title: string | null }>(
          `SELECT best_tier, gems, frame_sku, title FROM rank_season_rewards WHERE user_id = $1 AND season_id = $2`,
          [userId, lastId],
        )
      ).rows[0];
      lastSeason = {
        id: lastId,
        emblems: (await this.emblems(userId)).filter((e) => e.seasonId === lastId),
        reward:
          reward && isRankTier(reward.best_tier)
            ? { tier: reward.best_tier, gems: reward.gems, frameSku: reward.frame_sku, title: reward.title }
            : null,
      };
    }
    return {
      season: { ...season, daysLeft: seasonDaysLeft(season, at) },
      rewards: RANK_TIER_KEYS.map((tier) => ({ tier, gems: SEASON_REWARD_GEMS[tier], frameSku: seasonFrameSku(tier) })),
      minGames: SEASON_REWARD_MIN_GAMES,
      lastSeason,
    };
  }

  /** The admin's view of the seasons: the current one and every one recorded, newest first. */
  async adminList(): Promise<{
    current: string;
    seasons: Array<{ id: string; closedAt: string | null; rewardedAt: string | null; rewards: number; gems: number }>;
  }> {
    const rows = await this.pool.query<{ id: string; closed_at: Date | null; rewarded_at: Date | null; rewards: number; gems: number }>(
      `SELECT s.id, s.closed_at, s.rewarded_at,
              (SELECT count(*)::int FROM rank_season_rewards w WHERE w.season_id = s.id) AS rewards,
              (SELECT COALESCE(sum(gems), 0)::int FROM rank_season_rewards w WHERE w.season_id = s.id) AS gems
         FROM rank_seasons s ORDER BY s.id DESC`,
    );
    return {
      current: seasonOf(this.now()).id,
      seasons: rows.rows.map((r) => ({
        id: r.id,
        closedAt: r.closed_at ? r.closed_at.toISOString() : null,
        rewardedAt: r.rewarded_at ? r.rewarded_at.toISOString() : null,
        rewards: r.rewards,
        gems: r.gems,
      })),
    };
  }
}
