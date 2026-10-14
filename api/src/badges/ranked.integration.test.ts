/**
 * The ranked badges earned from real rated games (contract 4 §R → §B2): Wordle
 * Battles and Rhyme Matches played through their services, rated by Game
 * Ranks, told on `ranks.events`, and heard by the badges the way the API
 * wires them (`createProgression` given the RankService's events). Then a
 * season closed by the season job, and the season's badges it hands out.
 *
 * Only what a game cannot produce in a test's time is seeded: a rating that is
 * already high (to beat a stronger player, or to finish a season at the top),
 * and the other players of a season, so that a top 1% means something.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import {
  RANK_TIER_KEYS,
  dictionaryKey,
  letterKey,
  pointsOf,
  previousSeasonId,
  seasonById,
  seasonOf,
  tierIndex,
  tierOf,
  type RankedGame,
} from '@kurda/shared';
import { WordleBattleService } from '../game/wordle-battle-service.js';
import { RhymeMatchService } from '../game/rhyme-match-service.js';
import { RankService } from '../ranks/service.js';
import { RankSeasons } from '../ranks/seasons.js';
import { WalletService } from '../wallet/service.js';
import { befriend } from '../test/social.js';
import { deleteUsers, rankedUser } from '../test/ranks.js';
import { createProgression } from './progression.js';
import type { BadgeService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// five-letter words for the medium pool, so a battle always has a target to guess
const WORDS = ['xanim', 'dilan', 'berfe', 'serok', 'kitab', 'zerdk'];
const RHYMES = ['gul', 'kul', 'pul', 'bul'];

describe.skipIf(!DATABASE_URL)('ranked badges from rated games (integration)', () => {
  let pool: pg.Pool;
  let ranks: RankService;
  let badges: BadgeService;
  let battles: WordleBattleService;
  let matches: RhymeMatchService;
  const userIds: string[] = [];
  const entryIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);
  let n = 0;
  let clock = new Date();
  const tick = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };

  /**
   * The badges hear of a game after its commit, on their own: everything they
   * were told is waited for here before anything is checked (the listeners
   * are the ones `createProgression` subscribed; this only keeps their promises).
   */
  const pending = new Set<Promise<unknown>>();
  const settle = async () => {
    while (pending.size) await Promise.all([...pending]);
  };

  const user = async () => {
    const id = await rankedUser(pool, `rb_${++n}_${suffix}`);
    userIds.push(id);
    return id;
  };
  const tierOfBadge = async (userId: string, key: string) =>
    (await pool.query<{ tier: number }>(`SELECT tier FROM user_badges WHERE user_id = $1 AND badge_key = $2`, [userId, key])).rows[0]
      ?.tier ?? 0;
  const progressOf = async (userId: string, key: string) =>
    (await pool.query<{ progress: number }>(`SELECT progress FROM user_badges WHERE user_id = $1 AND badge_key = $2`, [userId, key]))
      .rows[0]?.progress ?? 0;
  const rating = async (userId: string, game: RankedGame) =>
    (await pool.query<{ peak_points: number; points: number; placement_done: boolean; rated_games: number }>(
      `SELECT peak_points, points, placement_done, rated_games FROM game_ratings WHERE user_id = $1 AND game = $2`,
      [userId, game],
    )).rows[0]!;
  /** A rating already earned, written straight to the table (games cannot climb this far in a test's time). */
  const seedRating = async (
    userId: string,
    game: RankedGame,
    o: { mu: number; sigma: number; season: string; games?: number; seasonGames?: number; lastAt?: Date },
  ) => {
    const points = pointsOf(o.mu, o.sigma);
    await pool.query(
      `INSERT INTO game_ratings (user_id, game, mu, sigma, points, rated_games, wins, placement_done, season_id,
                                 season_games, season_wins, peak_points, best_points, last_rated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, true, $7, $8, 0, $5, $5, $9)`,
      [userId, game, o.mu, o.sigma, points, o.games ?? 20, o.season, o.seasonGames ?? 0, o.lastAt ?? clock],
    );
  };

  const target = async (battleId: string) =>
    (await pool.query<{ target: string }>(`SELECT target FROM wordle_battles WHERE id = $1`, [battleId])).rows[0]!.target;
  /** A whole rated battle between friends: `winner` solves it, the other runs out of time. */
  const battle = async (host: string, guest: string, winner: string): Promise<string> => {
    const created = await battles.create(host, { difficulty: 'medium', rated: true });
    if (!created.ok) throw new Error(created.reason);
    const id = created.battle.id;
    expect((await battles.join(id, guest)).ok).toBe(true);
    const started = await battles.start(id, host);
    if (!started.ok) throw new Error(started.reason);
    expect((await battles.guess(id, winner, await target(id))).ok).toBe(true);
    tick(11 * 60_000);
    await battles.sweep();
    const row = await pool.query<{ status: string; rated_state: string }>(`SELECT status, rated_state FROM wordle_battles WHERE id = $1`, [id]);
    expect(row.rows[0]).toEqual({ status: 'finished', rated_state: 'rated' });
    await settle();
    return id;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });
    ranks = new RankService(pool, { now: () => clock });
    // as app.ts wires them: the badges listen to this RankService's events
    ({ badges } = createProgression(pool, { ranks: ranks.events }));
    const told = badges.onRatedGameFinished.bind(badges);
    badges.onRatedGameFinished = (e) => {
      const p = told(e);
      pending.add(p);
      return p.finally(() => pending.delete(p));
    };
    const closed = badges.onSeasonClosed.bind(badges);
    badges.onSeasonClosed = (e) => {
      const p = closed(e);
      pending.add(p);
      return p.finally(() => pending.delete(p));
    };
    battles = new WordleBattleService(pool, { now: () => clock, ranks });
    matches = new RhymeMatchService(pool, { now: () => clock, ranks });
  });

  afterAll(async () => {
    await settle();
    await deleteUsers(pool, userIds);
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
  });

  describe('Wordle Battle', () => {
    beforeAll(async () => {
      for (const w of WORDS) {
        const r = await pool.query<{ id: string }>(
          `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
           VALUES ($1, $2, $3, 'kurmanji', true) RETURNING id`,
          [w, letterKey(w), dictionaryKey(w)],
        );
        entryIds.push(r.rows[0]!.id);
      }
      // fifty games, a little over six hours apart, all in one season: start
      // now, or at the next season's start when this one ends too soon
      const now = new Date();
      const season = seasonOf(now);
      clock = new Date(season.endsAt).getTime() - now.getTime() > 20 * DAY ? now : new Date(new Date(season.endsAt).getTime() + HOUR);
    });

    it('Cîhgirtî after placement, the season’s tier emblems, Hilkişer at ten games and Dilpak at fifty fair ones', async () => {
      const me = await user();
      // four opponents in turn, each pair a day apart: no game is damped as a repeat
      const others = [await user(), await user(), await user(), await user()];
      for (const o of others) await befriend(pool, me, o);

      for (let i = 0; i < 50; i++) {
        const other = others[i % others.length]!;
        await battle(i % 2 === 0 ? me : other, i % 2 === 0 ? other : me, me);
        if (i === 3) {
          // four games in, still placing: no tier, so no emblem and no Cîhgirtî yet
          expect(await tierOfBadge(me, 'cihgirti')).toBe(0);
          expect(await tierOfBadge(me, 'rank-dest')).toBe(0);
        }
        if (i === 4) {
          expect((await rating(me, 'wordle-battle')).placement_done).toBe(true);
          expect(await tierOfBadge(me, 'cihgirti')).toBe(1);
          expect(await tierOfBadge(me, 'rank-dest')).toBe(1);
        }
        if (i === 8) expect(await tierOfBadge(me, 'hilkiser')).toBe(0);
        if (i === 9) expect(await tierOfBadge(me, 'hilkiser')).toBe(1);
        if (i === 48) expect(await tierOfBadge(me, 'dilpak')).toBe(0);
        tick(6 * HOUR + 10 * 60_000);
      }

      expect(await tierOfBadge(me, 'dilpak')).toBe(1);
      expect(await progressOf(me, 'dilpak')).toBe(50);
      const rows = await pool.query(`SELECT 1 FROM badge_rated_games WHERE user_id = $1 AND game = 'wordle-battle'`, [me]);
      expect(rows.rowCount).toBe(50);
      // the emblems are the tiers this season's peak reached, and no higher
      const peak = tierIndex(tierOf((await rating(me, 'wordle-battle')).peak_points));
      for (const [i, key] of RANK_TIER_KEYS.entries()) {
        expect(await tierOfBadge(me, `rank-${key}`)).toBe(i <= peak ? 1 : 0);
      }
      const season = await pool.query<{ peak_tier: number }>(
        `SELECT peak_tier FROM badge_rank_seasons WHERE user_id = $1 AND game = 'wordle-battle'`,
        [me],
      );
      expect(season.rows).toEqual([{ peak_tier: peak }]);
      // the opponents placed too (twelve or thirteen games each), and nobody beat anyone two tiers up
      for (const o of others) expect(await tierOfBadge(o, 'cihgirti')).toBe(1);
      expect(await tierOfBadge(me, 'kewe-ciye')).toBe(0);
    }, 120_000);
  });

  describe('Rhyme Match', () => {
    beforeAll(async () => {
      // the match prompt is drawn from the whole dictionary: own it, as the rhyme suites do
      await pool.query(`DELETE FROM dict_entries`);
      entryIds.length = 0;
      for (const w of RHYMES) {
        const r = await pool.query<{ id: string }>(
          `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
           VALUES ($1, $2, $3, 'kurmanji', true) RETURNING id`,
          [w, letterKey(w), dictionaryKey(w)],
        );
        entryIds.push(r.rows[0]!.id);
      }
      tick(DAY);
    });

    /** A rated match between friends; `scorer` submits a rhyme, `leaver` leaves while the window is open. */
    const match = async (host: string, guest: string, o: { scorer: string; leaver?: string }): Promise<string> => {
      await befriend(pool, host, guest);
      const created = await matches.create(host, { dialect: 'kurmanci', windowMs: 60_000, rated: true });
      if (!created.ok) throw new Error(created.reason);
      const id = created.match.id;
      expect((await matches.join(id, guest)).ok).toBe(true);
      expect((await matches.start(id, host)).ok).toBe(true);
      const prompt = (await pool.query<{ prompt: string }>(`SELECT prompt FROM rhyme_matches WHERE id = $1`, [id])).rows[0]!.prompt;
      expect((await matches.submit(id, o.scorer, RHYMES.find((w) => w !== prompt)!)).ok).toBe(true);
      if (o.leaver) expect((await matches.leave(id, o.leaver)).ok).toBe(true);
      tick(61_000);
      await matches.sweep();
      const row = await pool.query<{ status: string; rated_state: string }>(`SELECT status, rated_state FROM rhyme_matches WHERE id = $1`, [id]);
      expect(row.rows[0]).toEqual({ status: 'finished', rated_state: 'rated' });
      await settle();
      tick(HOUR);
      return id;
    };

    it('Kewê çiyê for beating a player two or more tiers up — and none over one who walked out', async () => {
      const season = seasonOf(clock).id;
      const plain = await user();
      const mountain = await user();
      const quitter = await user();
      // Deşt (280) against Çiya (1080): three tiers up
      await seedRating(plain, 'rhyme-match', { mu: 16, sigma: 3, season });
      await seedRating(mountain, 'rhyme-match', { mu: 30, sigma: 1, season });
      await seedRating(quitter, 'rhyme-match', { mu: 30, sigma: 1, season });
      expect(tierOf(pointsOf(16, 3))).toBe('dest');
      expect(tierOf(pointsOf(30, 1))).toBe('ciya');

      await match(plain, mountain, { scorer: plain });
      expect(await tierOfBadge(plain, 'kewe-ciye')).toBe(1);
      expect(await tierOfBadge(mountain, 'kewe-ciye')).toBe(0);
      // placed already, so the game is a placed one, with this season's emblem for the tier it ended on
      expect(await tierOfBadge(plain, 'cihgirti')).toBe(1);
      const after = tierIndex(tierOf((await rating(plain, 'rhyme-match')).points));
      expect(await tierOfBadge(plain, `rank-${RANK_TIER_KEYS[after]}`)).toBe(1);
      expect(await tierOfBadge(mountain, 'rank-ciya')).toBe(1);

      // finishing ahead of a Çiya player who left is no climb, and the leaver's game is not a fair one
      const other = await user();
      await seedRating(other, 'rhyme-match', { mu: 16, sigma: 3, season });
      await match(other, quitter, { scorer: other, leaver: quitter });
      expect((await pool.query(`SELECT 1 FROM rated_leaves WHERE user_id = $1`, [quitter])).rowCount).toBe(1);
      expect(await tierOfBadge(other, 'kewe-ciye')).toBe(0);
      expect(await progressOf(other, 'dilpak')).toBe(1);
      expect(await progressOf(quitter, 'dilpak')).toBe(0);
      const left = await pool.query(`SELECT left_game, beat_higher_by FROM badge_rated_games WHERE user_id = $1`, [quitter]);
      expect(left.rows).toEqual([{ left_game: true, beat_higher_by: 0 }]);
    });
  });

  describe('a season’s close', () => {
    const current = seasonOf(new Date()).id;
    const last = previousSeasonId(current);
    const end = new Date(seasonById(last).endsAt);

    beforeAll(async () => {
      // a season the other suites may have closed (and left closed) is opened again here
      await pool.query(`DELETE FROM rank_seasons WHERE id = $1`, [last]);
      await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
      entryIds.length = 0;
      for (const w of WORDS) {
        const r = await pool.query<{ id: string }>(
          `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
           VALUES ($1, $2, $3, 'kurmanji', true) RETURNING id`,
          [w, letterKey(w), dictionaryKey(w)],
        );
        entryIds.push(r.rows[0]!.id);
      }
    });

    afterAll(async () => {
      await pool.query(`DELETE FROM rank_seasons WHERE id = $1`, [last]);
    });

    it('hands the season’s top player the Stêrk emblem badge, and Hilkişer for the season’s ten games', async () => {
      // last season, two days before its end: the top player plays one more rated game
      clock = new Date(end.getTime() - 2 * DAY);
      const star = await user();
      const rival = await user();
      await befriend(pool, star, rival);
      await seedRating(star, 'wordle-battle', { mu: 50, sigma: 2, season: last, games: 40, seasonGames: 9, lastAt: clock });
      await seedRating(rival, 'wordle-battle', { mu: 30, sigma: 1, season: last, games: 20, seasonGames: 9, lastAt: clock });
      // the rest of the game's active players that season, so a top 1% means something
      for (let i = 0; i < 50; i++) {
        await seedRating(await user(), 'wordle-battle', { mu: 25, sigma: 2, season: last, seasonGames: 3, lastAt: clock });
      }
      await battle(star, rival, star);

      // in the season: Lûtke reached, but Stêrk is decided only by the close, and one game is not ten
      expect(await tierOfBadge(star, 'rank-lutke')).toBe(1);
      expect(await tierOfBadge(star, 'rank-sterk')).toBe(0);
      expect(await tierOfBadge(star, 'hilkiser')).toBe(0);

      const seasons = new RankSeasons(pool, { wallet: new WalletService(pool), events: ranks.events, now: () => new Date() });
      await seasons.closeSeason(last, current);
      // the badges read the season's results before they count, so wait for the count itself
      await vi.waitFor(async () => expect(await tierOfBadge(star, 'rank-sterk')).toBe(1), { timeout: 10_000, interval: 50 });
      await settle();

      const result = await pool.query(`SELECT peak_tier, sterk, rated_games FROM rank_season_results WHERE user_id = $1 AND season_id = $2`, [
        star,
        last,
      ]);
      expect(result.rows).toEqual([{ peak_tier: 'sterk', sterk: true, rated_games: 10 }]);
      expect((await seasons.emblems(star)).map((e) => [e.seasonId, e.peakTier])).toEqual([[last, 'sterk']]);
      expect(await tierOfBadge(star, 'rank-sterk')).toBe(1);
      expect(await tierOfBadge(star, 'hilkiser')).toBe(1);
      expect(await tierOfBadge(rival, 'rank-sterk')).toBe(0);

      // a second close changes nothing and tells nobody again
      await seasons.closeSeason(last, current);
      await settle();
      expect(await progressOf(star, 'rank-sterk')).toBe(1);
    }, 60_000);
  });
});
