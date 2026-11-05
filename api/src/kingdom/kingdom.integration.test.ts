/**
 * Kurdish Kingdom against real Postgres: what each building counts and what
 * it does not, the levels at their thresholds, each level recorded and paid
 * for once — under a burst of visits too — no Zêr for the accounts the
 * economy does not pay, the first visit, and the village over HTTP.
 *
 * Learning is written straight into the tables it is read from (as the badge
 * suites do): what is under test is how the village reads them, and the
 * lessons, reviews and story games that write them have suites of their own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { KINGDOM, type KingdomBuilding } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { WalletService } from '../wallet/service.js';
import { Cache } from '../cache/cache.js';
import { addXp, makeLearner, removeLearners, type TestLearner } from '../test/progress.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { countQueries } from '../test/query-count.js';
import { KINGDOM_LEDGER_REASON, KINGDOM_ZER_PER_LEVEL, KingdomService, measureKingdom } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const BURST = 12;

describe.skipIf(!DATABASE_URL)('Kurdish Kingdom (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let pool: pg.Pool;
  let wallet: WalletService;
  let kingdom: KingdomService;
  const suffix = Date.now().toString(36);
  let n = 0;
  const learner = async (tag: string) => makeLearner(pool, `kgd${tag}${suffix}`);

  /** A published lesson at its own place in a fresh course, holding one exercise of each of these kinds. */
  const lesson = async (types: readonly string[]) => {
    const c = await pool.query<{ id: string }>(
      `INSERT INTO courses (slug, dialect, title_ku, title_en) VALUES ($1, 'kurmanji', 'K', 'K') RETURNING id`,
      [`kgd-${suffix}-${++n}`],
    );
    const unit = await pool.query<{ id: string }>(`INSERT INTO units (course_id, position, title_ku, title_en) VALUES ($1, 1, 'U', 'U') RETURNING id`, [
      c.rows[0]!.id,
    ]);
    const skill = await pool.query<{ id: string }>(`INSERT INTO skills (unit_id, position, title_ku, title_en) VALUES ($1, 1, 'S', 'S') RETURNING id`, [
      unit.rows[0]!.id,
    ]);
    const id = (
      await pool.query<{ id: string }>(
        `INSERT INTO lessons (skill_id, position, title_ku, title_en, status) VALUES ($1, 1, 'L', 'L', 'draft') RETURNING id`,
        [skill.rows[0]!.id],
      )
    ).rows[0]!.id;
    const exercises: string[] = [];
    for (const [i, type] of types.entries()) {
      const ex = await pool.query<{ id: string }>(
        `INSERT INTO exercises (lesson_id, position, type, payload) VALUES ($1, $2, $3, '{"prompt":"a","accepted":["a"]}') RETURNING id`,
        [id, i + 1, type],
      );
      exercises.push(ex.rows[0]!.id);
    }
    await pool.query(`UPDATE lessons SET status = 'published', published_at = now() WHERE id = $1`, [id]);
    return { id, exercises };
  };

  /** A session of a lesson with these answers (true = right; null = never answered), finished unless said. */
  const session = async (userId: string, l: { id: string; exercises: string[] }, answers: readonly (boolean | null)[], finished = true) => {
    const right = answers.filter((a) => a === true).length;
    const s = await pool.query<{ id: string }>(
      `INSERT INTO lesson_sessions (user_id, lesson_id, total_count, correct_count, expires_at, completed_at)
       VALUES ($1, $2, $3, $4, now() + interval '1 hour', $5) RETURNING id`,
      [userId, l.id, l.exercises.length, right, finished ? new Date() : null],
    );
    for (const [i, a] of answers.entries()) {
      if (a === null) continue;
      await pool.query(`INSERT INTO session_answers (session_id, exercise_id, verdict, accepted) VALUES ($1, $2, $3, $4)`, [
        s.rows[0]!.id,
        l.exercises[i],
        a ? 'correct' : 'wrong',
        a,
      ]);
    }
    if (finished) await addXp(pool, userId, 20, new Date(), { source: 'lesson_complete', ref: s.rows[0]!.id });
  };

  /** A review session with these exercises answered right; `counted` false is one that paid nothing (and so is not learning). */
  const review = async (userId: string, exercises: readonly string[], counted = true) => {
    const s = await pool.query<{ id: string }>(
      `INSERT INTO practice_sessions (user_id, item_ids, total_count, correct_count, xp_awarded, completed_at)
       VALUES ($1, $2::uuid[], $3, $3, $4, now()) RETURNING id`,
      [userId, exercises, exercises.length, counted ? 5 : 0],
    );
    for (const e of exercises) {
      await pool.query(`INSERT INTO practice_answers (session_id, exercise_id, verdict, accepted) VALUES ($1, $2, 'correct', true)`, [s.rows[0]!.id, e]);
    }
    if (counted) await addXp(pool, userId, 5, new Date(), { source: 'practice_complete', ref: s.rows[0]!.id });
  };

  const story = async () =>
    (
      await pool.query<{ id: string }>(`INSERT INTO stories (slug, dialect, level, title, body) VALUES ($1, 'kurmanci', 1, 'Çîrok', 'x') RETURNING id`, [
        `kgd-${suffix}-${++n}`,
      ])
    ).rows[0]!.id;

  /** A finished solo story game on `storyId`, `correct` of `questions` right; `counted` whether it counted as learning. */
  const storyGame = async (userId: string, storyId: string, correct: number, questions: 3 | 5 | 10 = 5, counted = true) => {
    const g = await pool.query<{ id: string }>(
      `INSERT INTO story_games (story_id, mode, host_id, dialect, level, length, question_count, timer_seconds, status, finished_at)
       VALUES ($1, 'solo', $2, 'kurmanci', 1, 'short', $3, 0, 'finished', now()) RETURNING id`,
      [storyId, userId, questions],
    );
    await pool.query(
      `INSERT INTO story_game_players (game_id, user_id, seat, score, correct, answered, learning_counted, xp_awarded)
       VALUES ($1, $2, 0, $3, $3, $4, $5, $6)`,
      [g.rows[0]!.id, userId, correct, questions, counted, counted ? 20 : 0],
    );
  };

  const remembered = async (userId: string, count: number, opts: { repetitions?: number; interval?: number } = {}) => {
    for (let i = 0; i < count; i++) {
      await pool.query(
        `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at, last_reviewed_at)
         VALUES ($1, $2, $3, $4, 2.5, now() + interval '6 days', now())`,
        [userId, `kgd-${++n}`, opts.repetitions ?? 2, opts.interval ?? 6],
      );
    }
  };

  const daysLearned = async (userId: string, days: number) =>
    pool.query(
      `INSERT INTO user_streaks (user_id, current_streak, longest_streak, days_learned, last_learned_on)
       VALUES ($1, 1, 1, $2, CURRENT_DATE) ON CONFLICT (user_id) DO UPDATE SET days_learned = EXCLUDED.days_learned`,
      [userId, days],
    );

  const ledger = async (userId: string) =>
    (
      await pool.query<{ amount: number; ref_id: string }>(`SELECT amount, ref_id FROM wallet_ledger WHERE user_id = $1 AND reason = $2 ORDER BY ref_id`, [
        userId,
        KINGDOM_LEDGER_REASON,
      ])
    ).rows;
  const levelsOf = async (userId: string) =>
    (
      await pool.query<{ building: KingdomBuilding; level: number; zer: number }>(
        `SELECT building, level, zer FROM kingdom_levels WHERE user_id = $1 ORDER BY building, level`,
        [userId],
      )
    ).rows;
  const levelIn = (view: Awaited<ReturnType<KingdomService['view']>>, b: KingdomBuilding) => view.buildings.find((x) => x.id === b)!;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 20 });
    wallet = new WalletService(pool);
    kingdom = new KingdomService(pool, wallet);
  });

  afterAll(async () => {
    await removeLearners(pool, `kgd%${suffix}@it.kurda.app`);
    await pool.query(`DELETE FROM story_games WHERE story_id IN (SELECT id FROM stories WHERE slug LIKE $1)`, [`kgd-${suffix}-%`]).catch(() => undefined);
    await pool.query(`DELETE FROM stories WHERE slug LIKE $1`, [`kgd-${suffix}-%`]).catch(() => undefined);
    await pool.query(`DELETE FROM courses WHERE slug LIKE $1`, [`kgd-${suffix}-%`]).catch(() => undefined);
    await pool.end();
  });

  describe('what the buildings count', () => {
    it('counts a lesson passed with 80% right once, however often it is repeated, and never a lesson below it or unfinished', async () => {
      const me = await learner('lessons');
      const five = ['translate', 'translate', 'translate', 'translate', 'multiple_choice'];
      const a = await lesson(five);
      const b = await lesson(five);
      const c = await lesson(five);
      await session(me.id, a, [true, true, true, true, false]); // 80%: passed
      await session(me.id, a, [true, true, true, true, true]); // the same lesson again: still one
      await session(me.id, b, [true, true, true, false, false]); // 60%: not passed
      await session(me.id, c, [true, true, true, true, true], false); // never finished
      expect((await measureKingdom(pool, me.id)).school).toBe(1);
    });

    it('leaves a listening item put off out of a lesson’s score, as the lesson itself does', async () => {
      const me = await learner('putoff');
      const l = await lesson(['translate', 'translate', 'translate', 'translate', 'listening']);
      // four of four answered right, the listening item put off: 100% of what was scored
      await session(me.id, l, [true, true, true, true, null]);
      expect((await measureKingdom(pool, me.id)).school).toBe(1);
    });

    it('counts each listening and conversation item answered right once, in lessons or in reviews that counted', async () => {
      const me = await learner('items');
      const l = await lesson(['listening', 'listening', 'listening', 'conversation', 'conversation', 'translate']);
      await session(me.id, l, [true, false, true, true, false, true]);
      // the same lesson again, and the items right again: nothing new
      await session(me.id, l, [true, false, true, true, false, true]);
      let counts = await measureKingdom(pool, me.id);
      expect(counts.spring).toBe(2);
      expect(counts.market).toBe(1);
      // the missed ones right in a review that counted; one in a review that paid nothing is not learning
      await review(me.id, [l.exercises[1]!]);
      await review(me.id, [l.exercises[4]!], false);
      counts = await measureKingdom(pool, me.id);
      expect(counts.spring).toBe(3);
      expect(counts.market).toBe(1);
    });

    it('counts each story passed with 60% right once, in a game that counted as learning', async () => {
      const me = await learner('stories');
      const [s1, s2, s3, s4] = [await story(), await story(), await story(), await story()];
      await storyGame(me.id, s1, 3, 5); // 60%: passed
      await storyGame(me.id, s1, 5, 5); // the same story again: still one
      await storyGame(me.id, s2, 2, 5); // 40%: not passed
      await storyGame(me.id, s3, 5, 5, false); // did not count as learning
      await storyGame(me.id, s4, 2, 3); // 67%: passed
      expect((await measureKingdom(pool, me.id)).teahouse).toBe(2);
    });

    it('counts words still remembered after spaced review, and days learned', async () => {
      const me = await learner('words');
      await remembered(me.id, 12);
      await remembered(me.id, 5, { repetitions: 1, interval: 1 }); // seen once, not yet held a week
      await daysLearned(me.id, 3);
      const counts = await measureKingdom(pool, me.id);
      expect(counts.houses).toBe(12);
      expect(counts.orchard).toBe(3);
    });

    it('grows nothing from games, game XP, time in the village or a review that paid nothing', async () => {
      const me = await learner('idle');
      // game XP from every game source, and plenty of it
      for (const source of ['wordle', 'wordle_battle', 'rhyme', 'rhyme_match', 'race']) {
        await addXp(pool, me.id, 500, new Date(), { source });
      }
      await pool.query(
        `INSERT INTO wordle_games (user_id, mode, difficulty, day_index, target, target_length, guesses, status, finished_at)
         VALUES ($1, 'daily', 'easy', 1, 'av', 2, '["av"]'::jsonb, 'won', now())`,
        [me.id],
      );
      // a streak kept by play alone is not a day learned
      await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_on) VALUES ($1, 9, 9, CURRENT_DATE)`, [me.id]);
      const l = await lesson(['listening', 'conversation']);
      await review(me.id, l.exercises, false);
      // visiting the village again and again
      for (let i = 0; i < 5; i++) await kingdom.view(me.id);
      expect(await measureKingdom(pool, me.id)).toEqual({ houses: 0, school: 0, teahouse: 0, spring: 0, market: 0, orchard: 0 });
      const view = await kingdom.view(me.id);
      expect(view.buildings.every((b) => b.level === 0)).toBe(true);
      expect(await levelsOf(me.id)).toEqual([]);
      expect(await ledger(me.id)).toEqual([]);
    });
  });

  describe('levels and their Zêr', () => {
    it('reaches each level at its threshold, records it once and pays for it once', async () => {
      const me = await learner('thresholds');
      await kingdom.view(me.id); // founds the village before any learning, so what follows is celebrated
      await daysLearned(me.id, KINGDOM.orchard.thresholds[0] - 1);
      expect(levelIn(await kingdom.view(me.id), 'orchard')).toMatchObject({ level: 0, remaining: 1 });
      await daysLearned(me.id, KINGDOM.orchard.thresholds[1]);
      const view = await kingdom.view(me.id);
      expect(levelIn(view, 'orchard')).toMatchObject({ level: 2, count: KINGDOM.orchard.thresholds[1], next: KINGDOM.orchard.thresholds[2] });
      expect(view.celebrate.map((c) => [c.building, c.level, c.zer])).toEqual([
        ['orchard', 1, KINGDOM_ZER_PER_LEVEL],
        ['orchard', 2, KINGDOM_ZER_PER_LEVEL],
      ]);
      // looked at again, and again: the same two levels, paid once each
      await kingdom.view(me.id);
      await kingdom.view(me.id);
      expect(await ledger(me.id)).toEqual([
        { amount: KINGDOM_ZER_PER_LEVEL, ref_id: 'orchard:1' },
        { amount: KINGDOM_ZER_PER_LEVEL, ref_id: 'orchard:2' },
      ]);
      expect((await wallet.balances(me.id)).zer).toBe(2 * KINGDOM_ZER_PER_LEVEL);
      expect(await wallet.verifyConsistency(me.id, 'zer')).toBe(true);
    });

    it('celebrates a level until it is marked seen, and never again after', async () => {
      const me = await learner('seen');
      await kingdom.view(me.id);
      await daysLearned(me.id, KINGDOM.orchard.thresholds[0]);
      expect((await kingdom.view(me.id)).celebrate).toHaveLength(1);
      expect((await kingdom.view(me.id)).celebrate).toHaveLength(1);
      await kingdom.markSeen(me.id, { levels: [{ building: 'orchard', level: 1 }] });
      expect((await kingdom.view(me.id)).celebrate).toEqual([]);
    });

    it('keeps a level once reached, when what built it is gone', async () => {
      const me = await learner('keep');
      await daysLearned(me.id, KINGDOM.orchard.thresholds[2]);
      await kingdom.view(me.id);
      await daysLearned(me.id, 0);
      expect(levelIn(await kingdom.view(me.id), 'orchard').level).toBe(3);
      expect((await levelsOf(me.id)).length).toBe(3);
    });

    it('pays exactly once when a burst of visits arrives at a threshold together', async () => {
      const me = await learner('burst');
      await kingdom.view(me.id);
      await remembered(me.id, KINGDOM.houses.thresholds[0]);
      const views = await Promise.all(Array.from({ length: BURST }, () => kingdom.view(me.id)));
      for (const v of views) expect(levelIn(v, 'houses').level).toBe(1);
      expect(await ledger(me.id)).toEqual([{ amount: KINGDOM_ZER_PER_LEVEL, ref_id: 'houses:1' }]);
      expect(await levelsOf(me.id)).toEqual([{ building: 'houses', level: 1, zer: KINGDOM_ZER_PER_LEVEL }]);
      expect((await wallet.balances(me.id)).zer).toBe(KINGDOM_ZER_PER_LEVEL);
      expect(await wallet.verifyConsistency(me.id, 'zer')).toBe(true);
    });

    it('records the level and pays no Zêr to a guest or an account the economy does not pay', async () => {
      const who: Record<string, TestLearner> = {};
      for (const tag of ['guest', 'banned', 'closed', 'bot', 'cheat', 'held', 'fine']) who[tag] = await learner(`st${tag}`);
      await pool.query(`UPDATE users SET guest = true WHERE id = $1`, [who.guest!.id]);
      await pool.query(`UPDATE users SET banned_at = now(), banned_until = now() + interval '1 day' WHERE id = $1`, [who.banned!.id]);
      await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [who.closed!.id]);
      await pool.query(`INSERT INTO bot_scores (user_id, score, tier, flagged, status) VALUES ($1, 0.99, 'flagged', true, 'confirmed')`, [who.bot!.id]);
      await pool.query(
        `INSERT INTO cheat_reviews (user_id, room_id, flags, evidence, confidence, shadow_flagged) VALUES ($1, 'test', '[]'::jsonb, '{}'::jsonb, 1.0, true)`,
        [who.cheat!.id],
      );
      await pool.query(`INSERT INTO account_holds (user_id, reason) VALUES ($1, 'VELOCITY')`, [who.held!.id]);
      for (const [tag, p] of Object.entries(who)) {
        await kingdom.view(p.id);
        await daysLearned(p.id, KINGDOM.orchard.thresholds[0]);
        const view = await kingdom.view(p.id);
        expect(levelIn(view, 'orchard').level, tag).toBe(1);
        const paid = tag === 'fine' ? KINGDOM_ZER_PER_LEVEL : 0;
        expect(view.celebrate.map((c) => c.zer), tag).toEqual([paid]);
        expect((await wallet.balances(p.id)).zer, tag).toBe(paid);
      }
    });
  });

  describe('the first visit', () => {
    it('records what earlier learning built without celebrating each level, and says it once', async () => {
      const me = await learner('first');
      await daysLearned(me.id, KINGDOM.orchard.thresholds[1]);
      await remembered(me.id, KINGDOM.houses.thresholds[0]);
      const first = await kingdom.view(me.id);
      expect(first.celebrate).toEqual([]);
      expect(first.intro).toEqual({ levels: 3, zer: 3 * KINGDOM_ZER_PER_LEVEL });
      expect((await kingdom.view(me.id)).intro).toEqual({ levels: 3, zer: 3 * KINGDOM_ZER_PER_LEVEL });
      await kingdom.markSeen(me.id, { intro: true });
      expect((await kingdom.view(me.id)).intro).toBeNull();
    });

    it('greets an empty village too', async () => {
      const me = await learner('empty');
      expect((await kingdom.view(me.id)).intro).toEqual({ levels: 0, zer: 0 });
    });
  });

  describe('cost', () => {
    it('reads a village that has not changed in one statement once its counts are cached, two when they are not', async () => {
      const store = new Map<string, string>();
      const cache = new Cache({
        get: async (k) => store.get(k) ?? null,
        set: async (k, v) => void store.set(k, v),
        del: async (k) => void store.delete(k),
      });
      const cached = new KingdomService(pool, wallet, { cache });
      const me = await learner('budget');
      await daysLearned(me.id, 1);
      await cached.view(me.id);
      let log = countQueries(pool);
      await cached.view(me.id);
      log.stop();
      expect(log.count, log.statements.join('\n')).toBe(1);
      // learning that pays XP moves the counts' key: counted again, once
      await addXp(pool, me.id, 20, new Date(), { source: 'lesson_complete' });
      log = countQueries(pool);
      await cached.view(me.id);
      log.stop();
      expect(log.count, log.statements.join('\n')).toBe(2);
    });
  });

  describe('over HTTP', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      app = buildApp(config);
      await app.ready();
    });
    afterAll(async () => {
      await app.close();
    });

    it('serves the caller’s village, takes no counts or amounts from them, and marks what was shown', async () => {
      expect((await app.inject({ method: 'GET', url: '/kingdom', remoteAddress: '10.188.0.1' })).statusCode).toBe(401);
      const reg = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `kgdhttp${suffix}@it.kurda.app`,
          username: `kgdhttp${suffix}`.slice(0, 30),
          password: 'a-strong-password1',
          acceptTerms: true,
          ...bornYearsAgo(30),
        },
        remoteAddress: '10.188.1.1',
      });
      expect(reg.statusCode, reg.body).toBe(201);
      await activate(app, pool, reg);
      const headers = { authorization: `Bearer ${reg.json().tokens.accessToken as string}` };
      const village = await app.inject({ method: 'GET', url: '/kingdom', headers, remoteAddress: '10.188.1.1' });
      expect(village.statusCode).toBe(200);
      expect(village.json().buildings.map((b: { id: string; level: number }) => [b.id, b.level])).toEqual(
        ['houses', 'school', 'teahouse', 'spring', 'market', 'orchard'].map((id) => [id, 0]),
      );
      expect(village.json().intro).toEqual({ levels: 0, zer: 0 });
      const bad = await app.inject({ method: 'POST', url: '/kingdom/seen', headers, payload: { levels: [{ building: 'castle', level: 9 }] }, remoteAddress: '10.188.1.1' });
      expect(bad.statusCode).toBe(400);
      const seen = await app.inject({ method: 'POST', url: '/kingdom/seen', headers, payload: { intro: true }, remoteAddress: '10.188.1.1' });
      expect(seen.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/kingdom', headers, remoteAddress: '10.188.1.1' })).json().intro).toBeNull();
    });
  });
});
