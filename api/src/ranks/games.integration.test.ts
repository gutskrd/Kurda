/**
 * Game Ranks in Rhyme Match and Stories, against real Postgres: each decides
 * Rated or Friendly when it starts (Stories: when its questions start), rates
 * the finish by its own result, and counts a leave during the game.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { dictionaryKey, letterKey, type StoryGameView } from '@kurda/shared';
import { RhymeMatchService } from '../game/rhyme-match-service.js';
import { StoryGamesService, type CreateGameInput } from '../story-games/service.js';
import { befriend } from '../test/social.js';
import { deleteUsers, rankedUser } from '../test/ranks.js';
import { deleteStories, insertStory } from '../test/story-fixtures.js';
import { RankService } from './service.js';
import { RankEvents, type RatedGameFinished } from './events.js';

const DATABASE_URL = process.env.DATABASE_URL;
const RHYMES = ['gul', 'kul', 'pul', 'bul'];

describe.skipIf(!DATABASE_URL)('game ranks in Rhyme Match and Stories (integration)', () => {
  let pool: pg.Pool;
  let ranks: RankService;
  let matches: RhymeMatchService;
  let stories: StoryGamesService;
  const events = new RankEvents();
  const finished: RatedGameFinished[] = [];
  const userIds: string[] = [];
  const entryIds: string[] = [];
  const storyIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);
  let n = 0;
  let clock = new Date();

  const user = async () => {
    const id = await rankedUser(pool, `rg_${++n}_${suffix}`);
    userIds.push(id);
    return id;
  };
  const rating = async (userId: string, game: string) =>
    (await pool.query<{ points: number; rated_games: number }>(`SELECT points, rated_games FROM game_ratings WHERE user_id = $1 AND game = $2`, [
      userId,
      game,
    ])).rows[0];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });
    ranks = new RankService(pool, { now: () => clock, events });
    matches = new RhymeMatchService(pool, { now: () => clock, ranks });
    stories = new StoryGamesService(pool, { ranks, timers: false });
    events.onRatedGameFinished((e) => void finished.push(e));
    // the match prompt is drawn from the whole dictionary: own it, as the rhyme suite does
    await pool.query(`DELETE FROM dict_entries`);
    for (const w of RHYMES) {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
         VALUES ($1, $2, $3, 'kurmanji', true) RETURNING id`,
        [w, letterKey(w), dictionaryKey(w)],
      );
      entryIds.push(r.rows[0]!.id);
    }
  });

  afterAll(async () => {
    stories.close();
    await deleteStories(pool, storyIds);
    await deleteUsers(pool, userIds);
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
  });

  describe('Rhyme Match', () => {
    const match = async (rated: boolean, players: string[]) => {
      const [host, ...rest] = players;
      for (const p of rest) await befriend(pool, host!, p);
      const created = await matches.create(host!, { dialect: 'kurmanci', windowMs: 60_000, rated });
      if (!created.ok) throw new Error(created.reason);
      for (const p of rest) expect((await matches.join(created.match.id, p)).ok).toBe(true);
      expect((await matches.start(created.match.id, host!)).ok).toBe(true);
      return created.match.id;
    };
    const prompt = async (id: string) => (await pool.query<{ prompt: string }>(`SELECT prompt FROM rhyme_matches WHERE id = $1`, [id])).rows[0]!.prompt;
    const end = async (id: string) => {
      clock = new Date(clock.getTime() + 61_000);
      await matches.sweep();
      expect((await pool.query<{ status: string }>(`SELECT status FROM rhyme_matches WHERE id = $1`, [id])).rows[0]!.status).toBe('finished');
      clock = new Date(clock.getTime() + 60_000);
    };

    it('rates the match by score at the window’s end, and shows the badge in the view and the banner', async () => {
      const a = await user();
      const b = await user();
      const id = await match(true, [a, b]);
      const view = await matches.state(id, b);
      expect(view.rated).toEqual({ rated: true, counts: true, friendlyReason: null, damped: false });
      expect(await matches.summary(id)).toMatchObject({ rated: true });
      const p = await prompt(id);
      const rhyme = RHYMES.find((w) => w !== p)!;
      expect((await matches.submit(id, a, rhyme)).ok).toBe(true);
      await end(id);
      expect((await rating(a, 'rhyme-match'))!.points).toBeGreaterThan(0);
      expect((await rating(b, 'rhyme-match'))!.points).toBe(0);
      const told = finished.find((e) => e.gameRef === id);
      expect(told!.players.find((x) => x.userId === a)).toMatchObject({ won: true, place: 1 });
    });

    it('counts a leave while the window is open, and a Friendly match not at all', async () => {
      const a = await user();
      const b = await user();
      const id = await match(true, [a, b]);
      await matches.leave(id, b);
      await end(id);
      const ev = await pool.query<{ user_id: string; reason: string }>(`SELECT user_id, reason FROM rating_events WHERE game_ref = $1`, [id]);
      expect(ev.rows.find((r) => r.user_id === b)!.reason).toBe('left');
      expect((await pool.query(`SELECT 1 FROM rated_leaves WHERE user_id = $1 AND game_ref = $2`, [b, id])).rowCount).toBe(1);

      const friendly = await match(false, [a, b]);
      await end(friendly);
      expect((await matches.state(friendly, a)).rated).toMatchObject({ counts: false, friendlyReason: 'chosen' });
      expect((await rating(a, 'rhyme-match'))!.rated_games).toBe(1);
    });
  });

  describe('Stories', () => {
    const base = (storyId: string, over: Partial<CreateGameInput> = {}): CreateGameInput => ({
      mode: 'duo',
      storyId,
      questionCount: 3,
      timerSeconds: 0,
      textDuring: 'visible',
      access: 'friends',
      ...over,
    });
    const rightOf = (v: StoryGameView) => v.question!.options.findIndex((o) => o.startsWith('rast'));
    const duo = async (rated: boolean) => {
      const host = await user();
      const mate = await user();
      await befriend(pool, host, mate);
      const s = await insertStory(pool, { slug: `rg-${++n}-${suffix}`, questions: 8 });
      storyIds.push(s.id);
      const v = await stories.create(host, base(s.id, { rated }));
      await stories.join(mate, { id: v.id });
      return { gameId: v.id, host, mate };
    };

    it('is decided when the questions start, and rates the finish by score', async () => {
      const { gameId, host, mate } = await duo(true);
      expect((await stories.view(gameId, mate)).rated).toEqual({ rated: true, counts: null, friendlyReason: null, damped: false });
      expect(await stories.summary(gameId)).toMatchObject({ rated: true });
      await stories.start(gameId, host);
      // reading: still undecided, so someone may still join
      expect((await stories.view(gameId, host)).rated!.counts).toBeNull();
      await stories.doneReading(gameId, host);
      let v = await stories.doneReading(gameId, mate);
      expect(v.rated!.counts).toBe(true);
      for (let i = 0; i < 3; i++) {
        await stories.answer(gameId, host, i, rightOf(v), Date.now());
        const wrong = (rightOf(v) + 1) % v.question!.options.length;
        v = await stories.answer(gameId, mate, i, wrong, Date.now());
        if (i < 2) {
          await stories.continueAfter(gameId, host, i);
          v = await stories.continueAfter(gameId, mate, i);
        }
      }
      expect(v.results).not.toBeNull();
      expect((await rating(host, 'stories'))!.points).toBeGreaterThan(0);
      const r = await ranks.result(mate, 'stories', gameId);
      expect(r).toMatchObject({ counted: true, reason: 'placement' });
    });

    it('lets the host change the badge in the lobby, and keeps a solo quiz unrated', async () => {
      const { gameId, host, mate } = await duo(false);
      await expect(stories.setRated(mate, gameId, true)).rejects.toMatchObject({ code: 'NOT_HOST' });
      await stories.setRated(host, gameId, true);
      expect((await stories.view(gameId, mate)).rated!.rated).toBe(true);
      await stories.start(gameId, host);
      await expect(stories.setRated(host, gameId, false)).rejects.toMatchObject({ code: 'GAME_STARTED' });

      const s = await insertStory(pool, { slug: `rg-solo-${++n}-${suffix}`, questions: 8 });
      storyIds.push(s.id);
      const solo = await stories.create(host, base(s.id, { mode: 'solo', rated: true }));
      expect(solo.rated).toMatchObject({ rated: false, counts: null });
    });

    it('a player who leaves during the questions is last and on the ladder', async () => {
      const { gameId, host, mate } = await duo(true);
      await stories.start(gameId, host);
      await stories.doneReading(gameId, host);
      let v = await stories.doneReading(gameId, mate);
      await stories.leave(gameId, mate);
      for (let i = 0; i < 3; i++) {
        v = await stories.answer(gameId, host, i, 0, Date.now());
        if (i < 2) v = await stories.continueAfter(gameId, host, i);
      }
      expect(v.results).not.toBeNull();
      const ev = await pool.query<{ user_id: string; reason: string; place: number }>(
        `SELECT user_id, reason, place FROM rating_events WHERE game_ref = $1`,
        [gameId],
      );
      expect(ev.rows.find((r) => r.user_id === mate)).toMatchObject({ reason: 'left', place: 2 });
      expect(ev.rows.find((r) => r.user_id === host)).toMatchObject({ place: 1 });
    });
  });
});
