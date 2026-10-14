/**
 * Seasons against real Postgres (contract-4 §R5): closing a season rolls every
 * rating into the next one (σ ≥ 4, μ kept), records each player's emblem,
 * marks the Stêrk players, and hands out the rewards — once, however many
 * times the job runs — to active accounts in good standing only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { pointsOf, previousSeasonId, seasonById, seasonOf, sterkTitle } from '@kurda/shared';
import { deleteUsers, rankedUser } from '../test/ranks.js';
import { RankSeasons } from './seasons.js';
import { RankEvents, type SeasonClosed } from './events.js';
import { RankService } from './service.js';
import { lockStates } from './store.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('rank seasons (integration)', () => {
  let pool: pg.Pool;
  let seasons: RankSeasons;
  const events = new RankEvents();
  const closed: SeasonClosed[] = [];
  const userIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);
  let n = 0;
  // seasons relative to today, so the suite reads the same whenever it runs
  const current = seasonOf(new Date()).id;
  const last = previousSeasonId(current);
  const before = previousSeasonId(last);

  const user = async (opts: Parameters<typeof rankedUser>[2] = {}) => {
    const id = await rankedUser(pool, `rs_${++n}_${suffix}`, opts);
    userIds.push(id);
    return id;
  };
  /** A standing in `season` with `games` rated games that season and a peak of `peak` points. */
  const standing = async (
    userId: string,
    season: string,
    o: { game?: string; games: number; peak: number; mu?: number; sigma?: number; total?: number; lastAt?: Date },
  ) => {
    const end = new Date(seasonById(season).endsAt);
    const mu = o.mu ?? 30;
    const sigma = o.sigma ?? 2;
    await pool.query(
      `INSERT INTO game_ratings (user_id, game, mu, sigma, points, rated_games, wins, placement_done, season_id,
                                 season_games, season_wins, peak_points, best_points, last_rated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, true, $7, $8, 0, $9, $9, $10)`,
      [userId, o.game ?? 'wordle-battle', mu, sigma, pointsOf(mu, sigma), o.total ?? o.games, season, o.games, o.peak, o.lastAt ?? new Date(end.getTime() - 86_400_000)],
    );
  };
  const gems = async (userId: string) =>
    (await pool.query<{ n: number; sum: number }>(
      `SELECT count(*)::int AS n, COALESCE(sum(amount), 0)::int AS sum FROM wallet_ledger WHERE user_id = $1 AND reason = 'season_reward'`,
      [userId],
    )).rows[0]!;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    seasons = new RankSeasons(pool, { events });
    events.onSeasonClosed((e) => void closed.push(e));
  });

  afterAll(async () => {
    await deleteUsers(pool, userIds);
    await pool.query(`DELETE FROM rank_seasons WHERE id = ANY($1)`, [[last, before]]);
    await pool.end();
  });

  it('rolls the season, records emblems, and rewards once — never twice, never the closed or banned', async () => {
    const summit = await user(); // Lûtke peak in one game, Gir in another: rewarded by the best
    const casual = await user(); // three games: an emblem-less season, no reward
    const gone = await user();
    const banned = await user();
    await standing(summit, last, { games: 12, peak: 1250, mu: 33, sigma: 2.5 });
    await standing(summit, last, { game: 'rhyme-match', games: 15, peak: 400 });
    await standing(casual, last, { games: 3, peak: 200 });
    await standing(gone, last, { games: 20, peak: 950 });
    await standing(banned, last, { games: 20, peak: 950 });
    await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [gone]);
    await pool.query(`UPDATE users SET banned_at = now() WHERE id = $1`, [banned]);

    const first = await seasons.closeSeason(last, current);
    expect(first.rolled).toBeGreaterThanOrEqual(5);
    const again = await seasons.closeSeason(last, current);
    expect(again).toEqual({ rolled: 0, rewarded: 0 });

    // the roll: σ raised to 4, μ kept, the season's counters reset, recorded as an event
    const row = (
      await pool.query<{ mu: number; sigma: number; season_id: string; season_games: number; peak_points: number }>(
        `SELECT mu, sigma, season_id, season_games, peak_points FROM game_ratings WHERE user_id = $1 AND game = 'wordle-battle'`,
        [summit],
      )
    ).rows[0]!;
    expect(row).toMatchObject({ season_id: current, season_games: 0, peak_points: pointsOf(33, 4) });
    expect(Number(row.mu)).toBe(33);
    expect(Number(row.sigma)).toBe(4);
    const reset = await pool.query(`SELECT 1 FROM rating_events WHERE user_id = $1 AND kind = 'season-reset'`, [summit]);
    expect(reset.rowCount).toBe(2);

    // the emblems, kept: one per game with ten or more games
    expect((await seasons.emblems(summit)).map((e) => [e.game, e.peakTier])).toEqual([
      ['rhyme-match', 'gir'],
      ['wordle-battle', 'lutke'],
    ]);
    expect(await seasons.emblems(casual)).toEqual([]);

    // one reward per player: the best tier across games — the animated Lûtke frame and 75 Gems
    const reward = await pool.query(`SELECT best_tier, gems, frame_sku, title FROM rank_season_rewards WHERE user_id = $1`, [summit]);
    expect(reward.rows).toEqual([{ best_tier: 'lutke', gems: 75, frame_sku: 'frame_rank_lutke_animated', title: null }]);
    expect(await gems(summit)).toEqual({ n: 1, sum: 75 });
    const frame = await pool.query(`SELECT source FROM user_entitlements WHERE user_id = $1 AND sku = 'frame_rank_lutke_animated'`, [summit]);
    expect(frame.rows).toEqual([{ source: 'reward' }]);
    for (const nobody of [casual, gone, banned]) {
      expect(await gems(nobody)).toEqual({ n: 0, sum: 0 });
      expect((await pool.query(`SELECT 1 FROM rank_season_rewards WHERE user_id = $1`, [nobody])).rowCount).toBe(0);
    }
    // the badges heard of it once
    expect(closed.filter((e) => e.seasonId === last)).toHaveLength(1);

    // and the player sees last season on the season page
    const overview = await seasons.overview(summit);
    expect(overview.lastSeason).toMatchObject({ id: last, reward: { tier: 'lutke', gems: 75 } });
    expect(overview.rewards.map((r) => r.gems)).toEqual([10, 20, 35, 50, 75, 100]);
  });

  it('rolls a rating its owner plays before the job, the same way', async () => {
    const early = await user();
    const other = await user();
    await standing(early, before, { games: 11, peak: 700, mu: 28, sigma: 1.5 });
    const ranks = new RankService(pool);
    // the card shows the new season already, before anything was written
    const card = await ranks.card(early, 'wordle-battle');
    expect(card.season).toMatchObject({ id: current, ratedGames: 0 });
    expect(card.points).toBe(pointsOf(28, 4));
    // a game rolls it for real: the result is recorded, then the job finds nothing left to roll for them
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const states = await lockStates(client, 'wordle-battle', [early, other], new Date());
      expect(states.get(early)!.seasonId).toBe(current);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const result = await pool.query(`SELECT peak_tier, rated_games FROM rank_season_results WHERE user_id = $1 AND season_id = $2`, [early, before]);
    expect(result.rows).toEqual([{ peak_tier: 'zozan', rated_games: 11 }]);
  });

  it('crowns the season’s Stêrk only with enough players, with the title and the top reward', async () => {
    // fifty active players in the game: the top one is Lûtke I with 30 games and played late in the season
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) ids.push(await user());
    const end = new Date(seasonById(before).endsAt);
    for (const [i, id] of ids.entries()) {
      await pool.query(
        `INSERT INTO rank_season_results (user_id, season_id, game, rated_games, wins, peak_points, final_points, peak_tier, total_games, last_rated_at)
         VALUES ($1, $2, 'stories', 12, 6, $3, $3, $4, $5, $6)`,
        [id, before, i === 0 ? 1500 : 1000 - i, i === 0 ? 'lutke' : 'ciya', i === 0 ? 30 : 12, new Date(end.getTime() - 2 * 86_400_000)],
      );
    }
    await seasons.closeSeason(before, current);
    const top = await pool.query(`SELECT sterk, peak_tier FROM rank_season_results WHERE user_id = $1 AND season_id = $2`, [ids[0], before]);
    expect(top.rows[0]).toEqual({ sterk: true, peak_tier: 'sterk' });
    const runner = await pool.query(`SELECT sterk FROM rank_season_results WHERE user_id = $1 AND season_id = $2`, [ids[1], before]);
    expect(runner.rows[0]).toEqual({ sterk: false });
    expect(await gems(ids[0]!)).toEqual({ n: 1, sum: 100 });
    const tag = await pool.query(
      `SELECT ut.value FROM user_tags ut JOIN tags t ON t.id = ut.tag_id WHERE ut.user_id = $1 AND t.key = 'season_title'`,
      [ids[0]],
    );
    expect(tag.rows).toEqual([{ value: sterkTitle(before) }]);
    const frame = await pool.query(`SELECT 1 FROM user_entitlements WHERE user_id = $1 AND sku = 'frame_rank_sterk_animated'`, [ids[0]]);
    expect(frame.rowCount).toBe(1);
  });

  it('previews who a close would reward before it is handed out', async () => {
    const a = await user();
    const s = previousSeasonId(before);
    await pool.query(
      `INSERT INTO rank_season_results (user_id, season_id, game, rated_games, wins, peak_points, final_points, peak_tier, total_games)
       VALUES ($1, $2, 'rhyme-match', 10, 5, 650, 600, 'zozan', 10)`,
      [a, s],
    );
    const preview = await seasons.pendingRewards(s);
    expect(preview.find((p) => p.userId === a)).toMatchObject({ tier: 'zozan', gems: 35, frameSku: 'frame_rank_zozan' });
    await pool.query(`DELETE FROM rank_season_results WHERE season_id = $1`, [s]);
  });
});
