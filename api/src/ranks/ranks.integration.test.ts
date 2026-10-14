/**
 * Game Ranks against real Postgres, through the games that use it (Wordle
 * Battle here; Rhyme Match and Stories in games.integration.test.ts): Rated or
 * Friendly and why, the decision at the start, the result and its reason,
 * repeat-opponent damping, the new-account limit, leaving and its cooldown,
 * placement and the shield, the lobby's expected gains, the boards' safety
 * rules, an admin's void (with replay) and reset, and the data export.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { dictionaryKey, letterKey, pointsOf, seasonOf, type RankResult } from '@kurda/shared';
import { WordleBattleService } from '../game/wordle-battle-service.js';
import { befriend } from '../test/social.js';
import { deleteUsers, rankedUser } from '../test/ranks.js';
import { RankService } from './service.js';
import { RankAdmin } from './admin.js';
import { RankEvents, type RatedGameFinished } from './events.js';
import { freshState, rateGame, type PlayerState } from './engine.js';
import { exportRanks, eraseRanks } from './gdpr.js';

const DATABASE_URL = process.env.DATABASE_URL;
const MINUTE = 60_000;
// five-letter words for the medium pool, so a battle always has a target to guess
const WORDS = ['xanim', 'dilan', 'berfe', 'serok', 'kitab', 'zerdk'];

describe.skipIf(!DATABASE_URL)('game ranks (integration)', () => {
  let pool: pg.Pool;
  let ranks: RankService;
  let battles: WordleBattleService;
  let admin: RankAdmin;
  const events = new RankEvents();
  const finished: RatedGameFinished[] = [];
  const userIds: string[] = [];
  const entryIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);
  let n = 0;
  // one clock for the games and the ranks, moved on between games
  let clock = new Date();
  const tick = (minutes: number) => {
    clock = new Date(clock.getTime() + minutes * MINUTE);
  };

  const user = async (opts: Parameters<typeof rankedUser>[2] = {}): Promise<string> => {
    const id = await rankedUser(pool, `rk_${++n}_${suffix}`, opts);
    userIds.push(id);
    return id;
  };
  const target = async (battleId: string) =>
    (await pool.query<{ target: string }>(`SELECT target FROM wordle_battles WHERE id = $1`, [battleId])).rows[0]!.target;
  const battleRow = async (battleId: string) =>
    (await pool.query<{ rated: boolean; rated_state: string | null; status: string }>(
      `SELECT rated, rated_state, status FROM wordle_battles WHERE id = $1`,
      [battleId],
    )).rows[0]!;
  const rating = async (userId: string, game = 'wordle-battle') =>
    (await pool.query<{ mu: number; sigma: number; points: number; rated_games: number; shield_games: number; placement_done: boolean }>(
      `SELECT mu, sigma, points, rated_games, shield_games, placement_done FROM game_ratings WHERE user_id = $1 AND game = $2`,
      [userId, game],
    )).rows[0];

  /** A lobby with everyone in it, started; returns its id. */
  const lobby = async (players: string[], rated: boolean | undefined = true): Promise<string> => {
    const [host, ...rest] = players;
    for (const p of rest) await befriend(pool, host!, p);
    const created = await battles.create(host!, { difficulty: 'medium', rated });
    if (!created.ok) throw new Error(created.reason);
    for (const p of rest) expect((await battles.join(created.battle.id, p)).ok).toBe(true);
    return created.battle.id;
  };
  /** A whole battle: `winner` solves it, everyone else runs out of time; `leaver` leaves mid-race. */
  const play = async (players: string[], opts: { rated?: boolean; winner?: string; leaver?: string } = {}): Promise<string> => {
    const id = await lobby(players, opts.rated ?? true);
    const started = await battles.start(id, players[0]!);
    if (!started.ok) throw new Error(started.reason);
    if (opts.leaver) expect((await battles.leave(id, opts.leaver)).ok).toBe(true);
    if (opts.winner) expect((await battles.guess(id, opts.winner, await target(id))).ok).toBe(true);
    tick(11);
    await battles.sweep();
    expect((await battleRow(id)).status).toBe('finished');
    tick(1);
    return id;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    ranks = new RankService(pool, { now: () => clock, events });
    battles = new WordleBattleService(pool, { now: () => clock, ranks });
    admin = new RankAdmin(pool, () => clock);
    events.onRatedGameFinished((e) => void finished.push(e));
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
    await deleteUsers(pool, userIds);
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
  });

  describe('rated or friendly', () => {
    it('counts a rated battle between eligible players, moves both, explains it, and tells the badges after the commit', async () => {
      const a = await user();
      const b = await user();
      const id = await play([a, b], { winner: a });
      expect(await battleRow(id)).toMatchObject({ rated: true, rated_state: 'rated' });
      // the openskill reference numbers for a first win from the start
      const ra = await rating(a);
      expect(Number(ra!.mu)).toBeCloseTo(27.635389493140497, 9);
      expect(ra).toMatchObject({ points: 138, rated_games: 1, placement_done: false });
      expect((await rating(b))!.points).toBe(0);

      const result = (await ranks.result(a, 'wordle-battle', id)) as Extract<RankResult, { counted: true }>;
      expect(result).toMatchObject({
        counted: true,
        pointsBefore: 0,
        pointsAfter: 138,
        delta: 138,
        reason: 'placement',
        placement: { played: 1, of: 5 },
        tierAfter: null,
      });
      // a stranger to the game is told nothing
      expect(await ranks.result(await user(), 'wordle-battle', id)).toBeNull();

      const told = finished.find((e) => e.gameRef === id);
      expect(told).toBeDefined();
      expect(told!.players.find((p) => p.userId === a)).toMatchObject({ won: true, place: 1, pointsAfter: 138 });
      expect(told!.seasonId).toBe(seasonOf(clock).id);
    });

    it('plays a Friendly battle as friendly: no rating, and the reason is "chosen"', async () => {
      const a = await user();
      const b = await user();
      const id = await play([a, b], { rated: false, winner: a });
      expect(await battleRow(id)).toMatchObject({ rated: false, rated_state: 'chosen' });
      expect(await rating(a)).toBeUndefined();
      expect(await ranks.result(a, 'wordle-battle', id)).toEqual({
        game: 'wordle-battle',
        gameRef: id,
        counted: false,
        friendlyReason: 'chosen',
      });
    });

    it.each([
      ['unverified', { verified: false }],
      ['no-birth-month', { birthYear: null }],
    ] as const)('plays as friendly when a player is %s', async (reason, opts) => {
      const a = await user();
      const b = await user(opts);
      const id = await play([a, b], { winner: a });
      expect((await battleRow(id)).rated_state).toBe(reason);
      expect(await rating(a)).toBeUndefined();
    });

    it('plays as friendly when a player is restricted from games (banned, or a confirmed bot)', async () => {
      const a = await user();
      const b = await user();
      await pool.query(`UPDATE users SET banned_at = now(), banned_until = now() + interval '1 day' WHERE id = $1`, [b]);
      expect((await battleRow(await play([a, b], { winner: a }))).rated_state).toBe('restricted');
      const c = await user();
      await pool.query(
        `INSERT INTO bot_scores (user_id, score, tier, status) VALUES ($1, 0.99, 'flagged', 'confirmed')`,
        [c],
      );
      expect((await battleRow(await play([a, c], { winner: a }))).rated_state).toBe('restricted');
    });

    it('starts on the host’s last choice, Friendly the first time among friends or from a chat', async () => {
      const host = await user();
      const first = await battles.create(host, { difficulty: 'medium' });
      expect(first.ok && first.battle.rated).toMatchObject({ rated: false, counts: null });
      const chosen = await battles.create(host, { difficulty: 'medium', rated: true });
      expect(chosen.ok && chosen.battle.rated.rated).toBe(true);
      // remembered: the next one is Rated without asking
      const next = await battles.create(host, { difficulty: 'medium' });
      expect(next.ok && next.battle.rated.rated).toBe(true);
      // an adult's first game opened to everyone defaults to Rated, but not one from a chat
      const other = await user();
      const open = await battles.create(other, { difficulty: 'medium', access: 'open' });
      expect(open.ok && open.battle.rated.rated).toBe(true);
      const third = await user();
      const fromChat = await battles.create(third, { difficulty: 'medium', access: 'open', fromChat: true });
      expect(fromChat.ok && fromChat.battle.rated.rated).toBe(false);
    });

    it('lets the host change it in the lobby only; the banner shows it; rematches and next rounds keep it', async () => {
      const a = await user();
      const b = await user();
      const id = await lobby([a, b], false);
      expect(await battles.summary(id)).toMatchObject({ rated: false });
      expect(await battles.setRated(id, b, true)).toEqual({ ok: false, reason: 'forbidden' });
      const set = await battles.setRated(id, a, true);
      expect(set.ok && set.battle.rated.rated).toBe(true);
      expect(await battles.summary(id)).toMatchObject({ rated: true });
      expect((await battles.start(id, a)).ok).toBe(true);
      expect(await battles.setRated(id, a, false)).toEqual({ ok: false, reason: 'not-lobby' });
      await battles.guess(id, a, await target(id));
      tick(11);
      await battles.sweep();
      tick(1);
      const rematch = await battles.startPairRematch(id);
      expect(rematch.ok).toBe(true);
      if (!rematch.ok) return;
      // a pair rematch starts at once, so it is decided at once
      expect(await battleRow(rematch.id)).toMatchObject({ rated: true, rated_state: 'rated' });
      // more than two: the host's next round keeps it too
      const c = await user();
      const group = await play([a, b, c], { winner: a });
      const round = await battles.openNextRound(a, group);
      expect(round.ok && (await battleRow(round.id)).rated).toBe(true);
    });
  });

  describe('fairness', () => {
    it('damps the same pair’s rated games in 24 h: 1, 1, ½, ¼, then friendly from there', async () => {
      const a = await user();
      const b = await user();
      const states: string[] = [];
      const weights: number[] = [];
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = await play([a, b], { winner: i % 2 ? b : a });
        ids.push(id);
        states.push((await battleRow(id)).rated_state!);
        const w = await pool.query<{ weight: number }>(`SELECT weight FROM rated_games WHERE game = 'wordle-battle' AND game_ref = $1`, [id]);
        weights.push(w.rows[0] ? Number(w.rows[0].weight) : 0);
      }
      expect(states).toEqual(['rated', 'rated', 'damped', 'damped', 'repeat-opponent']);
      expect(weights).toEqual([1, 1, 0.5, 0.25, 0]);
      // the result says it was the repeat damping, and that nobody new was in it
      expect(await ranks.result(a, 'wordle-battle', ids[2]!)).toMatchObject({ counted: true, weight: 0.5, damping: 0.5, newAccountLimit: 1 });
      expect(await ranks.result(b, 'wordle-battle', ids[0]!)).toMatchObject({ counted: true, weight: 1, damping: 1, newAccountLimit: 1 });
      // a day later they count fully again
      tick(24 * 60);
      expect((await battleRow(await play([a, b], { winner: a }))).rated_state).toBe('rated');
    });

    it('lets a new account move its opponent by at most half', async () => {
      const a = await user();
      const fresh = await user({ isNew: true });
      const id = await play([a, fresh], { winner: fresh });
      const ev = await pool.query<{ user_id: string; weight: number }>(
        `SELECT user_id, weight FROM rating_events WHERE game_ref = $1`,
        [id],
      );
      const byUser = new Map(ev.rows.map((r) => [r.user_id, Number(r.weight)]));
      expect(byUser.get(a)).toBe(0.5);
      expect(byUser.get(fresh)).toBe(1);
      // the result names the new-account limit, not repeat play
      expect(await ranks.result(a, 'wordle-battle', id)).toMatchObject({ counted: true, weight: 0.5, damping: 1, newAccountLimit: 0.5 });
      expect(await ranks.result(fresh, 'wordle-battle', id)).toMatchObject({ counted: true, weight: 1, damping: 1, newAccountLimit: 1 });
      // half the move a plain loss would have been
      expect(Number((await rating(a))!.mu) - 25).toBeCloseTo((22.364610506859503 - 25) / 2, 9);
    });

    it('makes a leaver last, and a second leave within a day brings a cooldown that makes their games friendly', async () => {
      const a = await user();
      const b = await user();
      const c = await user();
      // b solves nothing, a solves nothing either — but b leaves, so a is first
      const first = await play([a, b], { leaver: b });
      const ev = await pool.query<{ user_id: string; place: number; reason: string }>(
        `SELECT user_id, place, reason FROM rating_events WHERE game_ref = $1`,
        [first],
      );
      expect(ev.rows.find((r) => r.user_id === b)).toMatchObject({ place: 2, reason: 'left' });
      expect(ev.rows.find((r) => r.user_id === a)).toMatchObject({ place: 1 });
      const leaves = async () =>
        (await pool.query<{ step: number; cooldown_until: Date | null }>(`SELECT step, cooldown_until FROM rated_leaves WHERE user_id = $1 ORDER BY id`, [b])).rows;
      expect(await leaves()).toEqual([{ step: 1, cooldown_until: null }]);

      // the second leave, and a game straight after it
      const second = await lobby([c, b]);
      await battles.start(second, c);
      await battles.leave(second, b);
      const ladder = await leaves();
      expect(ladder[1]!.step).toBe(2);
      expect(ladder[1]!.cooldown_until!.getTime() - clock.getTime()).toBe(10 * MINUTE);
      expect((await ranks.myRanks(b)).cooldownUntil).toBe(ladder[1]!.cooldown_until!.toISOString());
      // while it runs, a game with them in it plays as friendly
      const during = await lobby([c, b]);
      await battles.start(during, c);
      expect((await battleRow(during)).rated_state).toBe('cooldown');
      tick(11);
      await battles.sweep();
      expect((await ranks.myRanks(b)).cooldownUntil).toBeNull();
      expect((await battleRow(await play([c, b], { winner: c }))).rated_state).toBe('rated');
    });

    it('does not count leaving the waiting screen after finishing as a leave', async () => {
      const a = await user();
      const b = await user();
      const c = await user();
      const id = await lobby([a, b, c]);
      await battles.start(id, a);
      await battles.guess(id, a, await target(id));
      await battles.leave(id, a);
      expect((await pool.query(`SELECT 1 FROM rated_leaves WHERE user_id = $1`, [a])).rowCount).toBe(0);
    });
  });

  describe('placement and the shield', () => {
    it('places in five games, then shows a tier', async () => {
      const a = await user();
      const opponents = [await user(), await user(), await user(), await user(), await user()];
      for (const o of opponents) await play([a, o], { winner: a });
      const card = await ranks.card(a, 'wordle-battle');
      expect(card.placement).toBeNull();
      expect(card.tier).not.toBeNull();
      expect(card.ratedGames).toBe(5);
      expect(card.wins).toBe(5);
      const placing = await ranks.card(opponents[0]!, 'wordle-battle');
      expect(placing).toMatchObject({ tier: null, placement: { played: 1, of: 5 } });
    });

    it('holds a tier just reached at its floor for three games', async () => {
      const a = await user();
      const weak = await user();
      // a placed player just into Gir (328), shield fresh, loses to a much
      // weaker one — a loss that would take them well below 300
      await pool.query(
        `INSERT INTO game_ratings (user_id, game, mu, sigma, points, rated_games, placement_done, shield_games, season_id, last_rated_at)
         VALUES ($1, 'wordle-battle', 20.2, 4, $2, 12, true, 3, $3, $4),
                ($5, 'wordle-battle', 10, 2, $6, 60, true, 0, $3, $4)`,
        [a, pointsOf(20.2, 4), seasonOf(clock).id, clock, weak, pointsOf(10, 2)],
      );
      const id = await play([a, weak], { winner: weak });
      const r = (await ranks.result(a, 'wordle-battle', id)) as Extract<RankResult, { counted: true }>;
      expect(r).toMatchObject({ reason: 'shield', pointsAfter: 300, tierAfter: 'gir', shieldGames: 2 });
      expect((await rating(a))!.points).toBe(300);
    });
  });

  describe('the lobby', () => {
    it('shows each opponent by seat with what a win and a loss would do, and whether it would count', async () => {
      const a = await user();
      const b = await user();
      const id = await lobby([a, b]);
      const gains = await ranks.expected(a, 'wordle-battle', id);
      expect(gains).toMatchObject({ rated: true, wouldCount: true, friendlyReason: null });
      expect(gains!.opponents).toHaveLength(1);
      expect(gains!.opponents[0]!.seat).toBe(2);
      expect(gains!.opponents[0]!.win).toBeGreaterThan(0);
      expect(gains!.opponents[0]!.lose).toBeLessThanOrEqual(0);
      expect(JSON.stringify(gains)).not.toContain(b);
      // not a member: nothing
      expect(await ranks.expected(await user(), 'wordle-battle', id)).toBeNull();
      // Friendly: nothing to gain, and it says why
      await battles.setRated(id, a, false);
      expect(await ranks.expected(b, 'wordle-battle', id)).toMatchObject({ wouldCount: false, friendlyReason: 'chosen', opponents: [{ win: 0, lose: 0 }] });
      // the reason is about the viewer when it is theirs
      const unverified = await user({ verified: false });
      const other = await lobby([a, unverified]);
      expect(await ranks.expected(unverified, 'wordle-battle', other)).toMatchObject({ friendlyReason: 'unverified', self: true });
      expect(await ranks.expected(a, 'wordle-battle', other)).toMatchObject({ friendlyReason: 'unverified', self: false });
    });
  });

  describe('boards', () => {
    it('show friends — minors included — and keep the Top board to known adults, named only when public', async () => {
      const me = await user();
      const minor = await user({ birthYear: new Date().getUTCFullYear() - 15 });
      await befriend(pool, me, minor);
      const hidden = await user({ profileVisibility: 'nobody' });
      await befriend(pool, me, hidden);
      const season = seasonOf(clock).id;
      const seed = async (id: string, points: number) =>
        pool.query(
          `INSERT INTO game_ratings (user_id, game, mu, sigma, points, rated_games, placement_done, season_id, last_rated_at)
           VALUES ($1, 'rhyme-match', $2, 2, $3, 20, true, $4, $5)
           ON CONFLICT (user_id, game) DO UPDATE SET mu = EXCLUDED.mu, points = EXCLUDED.points, last_rated_at = EXCLUDED.last_rated_at`,
          [id, points / 40 + 6, points, season, clock],
        );
      await seed(me, 500);
      await seed(minor, 990_000);
      await seed(hidden, 800);

      const friends = await ranks.board(me, 'rhyme-match', 'friends');
      expect(friends.entries.map((e) => e.points)).toEqual([990_000, 500]);
      expect(friends.me).toEqual({ position: 2, points: 500 });

      // under 50 active players the Top board stays hidden
      const few = await ranks.board(me, 'rhyme-match', 'top');
      if (few.activePlayers! < 50) expect(few).toMatchObject({ hidden: true, entries: [], me: null });

      // with enough players: adults only, a name only for a public profile
      const crowd: string[] = [];
      for (let i = 0; i < 50; i++) crowd.push(await user({ profileVisibility: i === 0 ? 'everyone' : 'members', displayName: `Shown ${i}` }));
      for (const [i, id] of crowd.entries()) await seed(id, 900_000 - i);
      const top = await ranks.board(me, 'rhyme-match', 'top');
      expect(top.hidden).toBe(false);
      expect(top.entries).toHaveLength(50);
      expect(top.entries.some((e) => e.points === 990_000)).toBe(false); // the minor
      expect(top.entries[0]).toMatchObject({ points: 900_000, name: 'Shown 0' });
      expect(top.entries[1]).toMatchObject({ points: 899_999, name: null });
      // your own place, to you, whether or not it is in the 50
      expect(top.me!.position).toBeGreaterThan(50);
    });

    it('shows a rank as Resting to others after 28 days without a rated game, never to its owner', async () => {
      const a = await user();
      await pool.query(
        `INSERT INTO game_ratings (user_id, game, mu, sigma, points, rated_games, placement_done, season_id, last_rated_at)
         VALUES ($1, 'stories', 30, 2, 960, 20, true, $2, $3)`,
        [a, seasonOf(clock).id, new Date(clock.getTime() - 30 * 24 * 60 * MINUTE)],
      );
      expect((await ranks.profileRanks(a, false))[0]).toMatchObject({ resting: true, tier: null, points: null });
      expect((await ranks.profileRanks(a, true))[0]).toMatchObject({ resting: false, tier: 'ciya', points: 960 });
    });
  });

  describe('admin', () => {
    it('voids a game and replays everything after it, leaving untouched players as they were', async () => {
      const a = await user();
      const b = await user();
      const c = await user();
      const d = await user();
      const e = await user();
      const g1 = await play([a, b], { winner: a });
      const g2 = await play([b, c], { winner: b });
      const g3 = await play([a, c], { winner: a });
      const other = await play([d, e], { winner: d });
      const dBefore = await rating(d);

      const appliedAt = async (ref: string) =>
        (await pool.query<{ applied_at: Date }>(`SELECT applied_at FROM rated_games WHERE game_ref = $1`, [ref])).rows[0]!.applied_at;
      const out = await admin.voidGame('wordle-battle', g1, a, 'win trading');
      expect(out.replayedGames).toBe(2);

      // what the history would have been without g1
      const fresh = (): PlayerState => freshState(seasonOf(clock).id);
      const [b2, c2] = rateGame({
        entries: [
          { userId: b, state: fresh(), place: 1, left: false, newAccount: false },
          { userId: c, state: fresh(), place: 2, left: false, newAccount: false },
        ],
        weight: 1,
        at: await appliedAt(g2),
      });
      const [a3, c3] = rateGame({
        entries: [
          { userId: a, state: fresh(), place: 1, left: false, newAccount: false },
          { userId: c, state: c2!.after, place: 2, left: false, newAccount: false },
        ],
        weight: 1,
        at: await appliedAt(g3),
      });
      for (const [id, want] of [
        [a, a3!.after],
        [b, b2!.after],
        [c, c3!.after],
      ] as const) {
        const got = await rating(id);
        expect(Number(got!.mu)).toBeCloseTo(want.mu, 9);
        expect(Number(got!.sigma)).toBeCloseTo(want.sigma, 9);
        expect(got!.rated_games).toBe(want.ratedGames);
      }
      expect(await rating(d)).toEqual(dBefore);
      expect(await ranks.result(a, 'wordle-battle', g1)).toMatchObject({ counted: false, voided: true });
      // the replayed results read as they are now
      expect(await ranks.result(a, 'wordle-battle', g3)).toMatchObject({ counted: true, pointsBefore: 0 });
      // voiding twice does nothing more
      expect(await admin.voidGame('wordle-battle', g1, a, 'again')).toEqual({ replayedGames: 0, players: 0 });
      expect(other).toBeTruthy();
    });

    it('lists a player’s rated games and a pair’s games together, newest first, voided ones marked', async () => {
      const a = await user();
      const b = await user();
      const c = await user();
      const g1 = await play([a, b], { winner: a });
      const g2 = await play([a, c], { winner: c });
      const g3 = await play([b, a], { winner: b });
      await admin.voidGame('wordle-battle', g1, a, 'win trading');

      const games = (await admin.playerGames(a))!;
      expect(games.map((g) => g.gameRef)).toEqual([g3, g2, g1]);
      expect(games[0]).toMatchObject({ game: 'wordle-battle', players: 2, weight: 1, voided: false, place: 2, left: false });
      expect(games[2]).toMatchObject({ voided: true, voidReason: 'win trading', place: 1 });
      expect(games[1]!.pointsAfter).toEqual(expect.any(Number));
      expect(typeof games[1]!.reason).toBe('string');
      expect(await admin.playerGames('00000000-0000-4000-8000-000000000000')).toBeNull();

      const pair = await admin.pairGames('wordle-battle', a, b);
      expect(pair.map((g) => [g.gameRef, g.aPlace, g.bPlace, g.voided])).toEqual([
        [g3, 2, 1, false],
        [g1, 1, 2, true],
      ]);
      expect(await admin.pairGames('rhyme-match', a, b)).toEqual([]);
    });

    it('resets one player’s rating to the start', async () => {
      const a = await user();
      const b = await user();
      await play([a, b], { winner: a });
      await admin.reset(a, 'wordle-battle');
      expect(await rating(a)).toMatchObject({ points: 0, rated_games: 0, placement_done: false });
      expect(Number((await rating(a))!.mu)).toBe(25);
      const ev = await pool.query(`SELECT 1 FROM rating_events WHERE user_id = $1 AND kind = 'admin-reset'`, [a]);
      expect(ev.rowCount).toBe(1);
    });

    it('lists pairs that share a device and win-trade', async () => {
      const a = await user();
      const b = await user();
      for (const id of [a, b]) {
        await pool.query(
          `INSERT INTO risk_decisions (event, user_id, device_hash, ip_hash, score, band, action) VALUES ('login', $1, $2, $3, 0, 'low', 'proceed')`,
          [id, `dev-${suffix}`, `ip-${suffix}-${id}`],
        );
      }
      for (let i = 0; i < 4; i++) await play([a, b], { winner: a });
      const pairs = await admin.suspiciousPairs();
      const ours = pairs.find((p) => [p.a.userId, p.b.userId].sort().join() === [a, b].sort().join());
      expect(ours).toMatchObject({ sharedDevice: true, sharedIp: false, games: 4, peak24h: 4 });
      expect(ours!.score).toBeGreaterThanOrEqual(5);
    });

    it('shows how the active players spread over the tiers', async () => {
      const spread = await admin.spread();
      expect(spread.map((s) => s.game)).toEqual(['wordle-battle', 'rhyme-match', 'stories']);
      for (const s of spread) expect(s.tiers.map((t) => t.tier)).toEqual(['dest', 'gir', 'zozan', 'ciya', 'lutke', 'sterk']);
    });
  });

  describe('GDPR', () => {
    it('exports a player’s ranks, and erasing a child takes them, keeping the seat’s numbers for the others', async () => {
      const a = await user();
      const b = await user();
      const id = await play([a, b], { winner: a });
      const doc = await exportRanks(pool, a);
      expect(doc.ratings).toHaveLength(1);
      expect((doc.history as unknown[]).length).toBeGreaterThan(0);
      expect(JSON.stringify(doc)).not.toContain(b);

      await eraseRanks(pool, a);
      expect(await rating(a)).toBeUndefined();
      expect((await pool.query(`SELECT 1 FROM rating_events WHERE user_id = $1`, [a])).rowCount).toBe(0);
      const seat = await pool.query<{ user_id: string | null; mu_before: number }>(
        `SELECT user_id, mu_before FROM rated_game_players WHERE game_ref = $1 ORDER BY seat`,
        [id],
      );
      expect(seat.rows[0]).toMatchObject({ user_id: null });
      expect(Number(seat.rows[0]!.mu_before)).toBe(25);
      // the other player's numbers are untouched
      expect((await rating(b))!.rated_games).toBe(1);
    });
  });
});
