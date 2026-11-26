/**
 * The learner's tree through the real routes against real Postgres: planted once, watered by finished lessons and
 * practice, growing and bearing, suffering when dry and revived by water, another kind bought and planted, and shown
 * on the profile.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { TREE_FIRST_WATER, TREE_FULL, TREE_GROWTH, TREE_HARVEST_EVERY, TREE_HARVEST_ZER, TREE_KINDS, TREE_SPECIES, TREE_WATER_PER_LESSON, treeStage, treeView } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { PracticeService } from '../practice/service.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { removeLearners } from '../test/progress.js';
import { localDate, shiftDate } from '../streaks/streak-logic.js';
import { WalletService } from '../wallet/service.js';
import { TREE_HARVEST_REASON, TREE_PURCHASE_REASON, TreeService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Learner {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('the learner’s tree (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  // a network of its own per run: sign-up caps accounts per network
  const net = 30 + Math.floor(Math.random() * 200);
  let registered = 0;
  let courseId = '';
  const lessons: Array<{ id: string; exercises: string[] }> = [];

  async function learner(tag: string, timezone = 'UTC'): Promise<Learner> {
    registered += 1;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `tr_${tag}_${suffix}@it.kurda.app`, username: `tr_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, ...bornYearsAgo(30) },
      remoteAddress: `10.${net}.${registered}.1`,
    });
    expect(res.statusCode, res.body).toBe(201);
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    await pool.query(`UPDATE users SET timezone = $2 WHERE id = $1`, [id, timezone]);
    return { id, token: res.json().tokens.accessToken as string };
  }

  const call = (who: Learner | null, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: who ? { authorization: `Bearer ${who.token}` } : {}, remoteAddress: `10.${net}.200.1` });

  const today = (timezone = 'UTC') => localDate(new Date(), timezone);

  /** Start `lesson`, answer its first `answered` items right, and finish it. */
  async function playLesson(who: Learner, lesson: { id: string; exercises: string[] }, answered = lesson.exercises.length) {
    const start = await call(who, 'GET', `/lessons/${lesson.id}/session`);
    expect(start.statusCode, start.body).toBe(200);
    const sessionId = start.json().sessionId as string;
    for (const exerciseId of lesson.exercises.slice(0, answered)) {
      const res = await call(who, 'POST', `/sessions/${sessionId}/answers`, { exerciseId, answer: { text: 'sêv' } });
      expect(res.statusCode, res.body).toBe(200);
    }
    const done = await call(who, 'POST', `/sessions/${sessionId}/complete`);
    expect(done.statusCode, done.body).toBe(200);
    return { sessionId, body: done.json() };
  }

  /** The tree as it is kept. */
  const stored = async (who: Learner) =>
    (
      await pool.query<{ id: string; species: string; waterings: number; water: number; harvests: number; planted: number; planted_on: string; last_watered_on: string }>(
        `SELECT id, species, waterings, water, harvests, planted, to_char(planted_on, 'YYYY-MM-DD') AS planted_on, to_char(last_watered_on, 'YYYY-MM-DD') AS last_watered_on
           FROM user_trees WHERE user_id = $1`,
        [who.id],
      )
    ).rows[0];

  /** Sets the stored tree to what a test needs: waterings, water held, and days since last watered. */
  async function make(who: Learner, over: { waterings?: number; water?: number; dryDays?: number; harvests?: number }, timezone = 'UTC') {
    await pool.query(
      `UPDATE user_trees SET waterings = COALESCE($2, waterings), water = COALESCE($3, water), harvests = COALESCE($5, harvests),
              last_watered_on = COALESCE($4::date, last_watered_on) WHERE user_id = $1`,
      [who.id, over.waterings ?? null, over.water ?? null, over.dryDays === undefined ? null : shiftDate(today(timezone), -over.dryDays), over.harvests ?? null],
    );
  }

  const zer = async (who: Learner) => (await wallet.balances(who.id)).zer;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    const repo = new ContentRepository(pool);
    courseId = await repo.createCourse({ slug: `tr-${suffix}`, titleKu: 'K', titleEn: 'Trees' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    for (let position = 1; position <= 3; position++) {
      const id = await repo.createLesson(skillId, position, `D${position}`, `Lesson ${position}`);
      const exercises: string[] = [];
      for (let i = 1; i <= 4; i++) exercises.push(await repo.addExercise(id, i, 'translate', { prompt: `apple ${i}`, accepted: ['sêv'] }));
      await repo.publishLesson(id);
      lessons.push({ id, exercises });
    }
  });

  afterAll(async () => {
    await removeLearners(pool, `%_${suffix}@it.kurda.app`);
    await pool.query(`UPDATE lessons SET status = 'archived' WHERE skill_id IN (SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`, [courseId]);
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  describe('planting', () => {
    it('shows nobody’s tree before one is planted, with every kind and which are free', async () => {
      const ana = await learner('none');
      const res = await call(ana, 'GET', '/me/tree');
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json();
      expect(body.tree).toBeNull();
      expect(body.planted).toBe(0);
      expect(body.kinds.map((k: { species: string }) => k.species)).toEqual([...TREE_SPECIES]);
      for (const k of body.kinds) expect(k).toEqual({ ...TREE_KINDS[k.species as keyof typeof TREE_KINDS], owned: TREE_KINDS[k.species as keyof typeof TREE_KINDS].starter });
      expect(body.zer).toBe(0);
      expect((await call(null, 'GET', '/me/tree')).statusCode).toBe(401);
    });

    it('plants a free kind as a seed, on the learner’s own day, with the water to bring it up', async () => {
      // A zone on a different day from UTC for part of every day: the day is the learner's, not the server's.
      const ana = await learner('plant', 'Pacific/Kiritimati');
      const res = await call(ana, 'POST', '/me/tree/plant', { species: 'hinar' });
      expect(res.statusCode, res.body).toBe(200);
      const day = today('Pacific/Kiritimati');
      expect(res.json().tree).toEqual({
        species: 'hinar',
        plantedOn: day,
        lastWateredOn: day,
        waterings: 0,
        water: TREE_FIRST_WATER,
        harvests: 0,
        stage: 0,
        health: 'fresh',
        dryDays: 0,
        age: 0,
        toward: { done: 0, of: TREE_GROWTH[1], next: 'stage' },
      });
      expect(res.json().planted).toBe(1);
      expect(await stored(ana)).toMatchObject({ species: 'hinar', planted_on: day, last_watered_on: day, water: TREE_FIRST_WATER });
      expect((await call(ana, 'GET', '/me/tree')).json().tree).toEqual(res.json().tree);
    });

    it('refuses a kind there is not, and one that has to be bought first', async () => {
      const ana = await learner('refuse');
      expect((await call(ana, 'POST', '/me/tree/plant', { species: 'cactus' })).json().code).toBe('TREE_NOT_FOUND');
      const paid = await call(ana, 'POST', '/me/tree/plant', { species: 'sev' });
      expect(paid.statusCode).toBe(403);
      expect(paid.json().code).toBe('TREE_NOT_OWNED');
      expect(await stored(ana)).toBeUndefined();
      expect((await call(ana, 'POST', '/me/tree/plant', {})).statusCode).toBe(400);
    });

    it('replaces the tree that stands with a seed of the new kind: what it had grown is gone, the water held is kept', async () => {
      const ana = await learner('replace');
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      await make(ana, { waterings: 20, water: 4, harvests: 0 });
      const first = await stored(ana);
      const res = await call(ana, 'POST', '/me/tree/plant', { species: 'bi' });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().tree).toMatchObject({ species: 'bi', stage: 0, waterings: 0, water: 4 });
      expect(res.json().planted).toBe(2);
      // a tree of its own: what the first paid is never mixed up with what this one pays
      expect((await stored(ana))!.id).not.toBe(first!.id);
      // Planting again never makes water: with none held it is planted with the first water, otherwise it keeps what there is.
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      expect((await stored(ana))!.water).toBe(4);
    });
  });

  describe('water', () => {
    it('is earned by a lesson worked through, once, and not by one barely touched or before a tree is planted', async () => {
      const ana = await learner('earn');
      const before = await playLesson(ana, lessons[0]!);
      expect(before.body.tree).toBeUndefined();
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      const first = await playLesson(ana, lessons[1]!);
      expect(first.body.tree).toEqual({ gained: TREE_WATER_PER_LESSON, water: TREE_FIRST_WATER + TREE_WATER_PER_LESSON });
      // asked again, the same session earns nothing more
      const again = await call(ana, 'POST', `/sessions/${first.sessionId}/complete`);
      expect(again.json().tree).toBeUndefined();
      expect((await stored(ana))!.water).toBe(TREE_FIRST_WATER + TREE_WATER_PER_LESSON);
      // finished with nothing answered: not learning, no water
      const idle = await playLesson(ana, lessons[2]!, 0);
      expect(idle.body.tree).toBeUndefined();
      expect((await stored(ana))!.water).toBe(TREE_FIRST_WATER + TREE_WATER_PER_LESSON);
    });

    it('is earned by a practice session too', async () => {
      const ana = await learner('practice');
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      const practice = new PracticeService(pool);
      const ids = lessons[0]!.exercises;
      const session = await practice.begin(ana.id, ids);
      for (const exerciseId of ids) await call(ana, 'POST', `/practice/sessions/${session!.sessionId}/answers`, { exerciseId, answer: { text: 'sêv' } });
      const done = await call(ana, 'POST', `/practice/sessions/${session!.sessionId}/complete`);
      expect(done.statusCode, done.body).toBe(200);
      expect(done.json().tree).toEqual({ gained: TREE_WATER_PER_LESSON, water: TREE_FIRST_WATER + TREE_WATER_PER_LESSON });
    });

    it('brings the seed up on its planting water, and grows the tree by what it is given', async () => {
      const ana = await learner('pour');
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      const drop = await call(ana, 'POST', '/me/tree/water', {});
      expect(drop.statusCode, drop.body).toBe(200);
      expect(drop.json()).toMatchObject({ poured: 1, grew: null });
      const first = await call(ana, 'POST', '/me/tree/water', { count: TREE_FIRST_WATER });
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json()).toMatchObject({ poured: TREE_FIRST_WATER - 1, grew: 1, harvests: 0, zer: 0, revived: false });
      expect(first.json().tree).toMatchObject({ stage: 1, waterings: TREE_FIRST_WATER, water: 0, health: 'fresh' });
      // none left
      const none = await call(ana, 'POST', '/me/tree/water', {});
      expect(none.statusCode).toBe(409);
      expect(none.json().code).toBe('TREE_NO_WATER');
      // several at once: no more than is held
      await make(ana, { water: 4 });
      const many = await call(ana, 'POST', '/me/tree/water', { count: 10 });
      expect(many.json()).toMatchObject({ poured: 4, grew: 2 });
      expect(await stored(ana)).toMatchObject({ waterings: 6, water: 0 });
      expect((await call(ana, 'POST', '/me/tree/water', { count: 0 })).statusCode).toBe(400);
      expect((await call(ana, 'POST', '/me/tree/water', { count: 1.5 })).statusCode).toBe(400);
    });

    it('cannot be poured before a tree is planted', async () => {
      const ana = await learner('unplanted');
      const res = await call(ana, 'POST', '/me/tree/water', {});
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('TREE_NOT_PLANTED');
    });

    it('pours what is held once when two pours arrive together', async () => {
      const ana = await learner('race');
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      await make(ana, { water: 1, waterings: 5 });
      const both = await Promise.all([call(ana, 'POST', '/me/tree/water', {}), call(ana, 'POST', '/me/tree/water', {})]);
      expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      expect(await stored(ana)).toMatchObject({ waterings: 6, water: 0 });
    });
  });

  describe('a tree left dry', () => {
    it('is thirsty, wilting, then withered by the learner’s own days, loses nothing it had grown, and is brought back by water', async () => {
      const ana = await learner('dry');
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      await make(ana, { waterings: 45, water: 1 });
      const health = async (dryDays: number) => {
        await make(ana, { dryDays });
        return (await call(ana, 'GET', '/me/tree')).json().tree.health as string;
      };
      expect(await health(1)).toBe('fresh');
      expect(await health(2)).toBe('thirsty');
      expect(await health(4)).toBe('wilting');
      expect(await health(30)).toBe('withered');
      expect((await call(ana, 'GET', '/me/tree')).json().tree).toMatchObject({ stage: 4, waterings: 45, dryDays: 30 });
      const back = await call(ana, 'POST', '/me/tree/water', {});
      expect(back.json()).toMatchObject({ revived: true, poured: 1 });
      expect(back.json().tree).toMatchObject({ health: 'fresh', stage: 4, waterings: 46, dryDays: 0, lastWateredOn: today() });
    });
  });

  describe('the great tree', () => {
    it('bears each time it has had its fill again, and pays a member Zêr for it once', async () => {
      const ana = await learner('bear');
      await pool.query(`UPDATE users SET premium_until = '2030-01-01T00:00:00Z' WHERE id = $1`, [ana.id]);
      await call(ana, 'POST', '/me/tree/plant', { species: 'tu' }).then((r) => expect(r.statusCode).toBe(403));
      await call(ana, 'POST', '/me/tree/plant', { species: 'hinar' });
      const full = TREE_GROWTH[TREE_FULL];
      await make(ana, { waterings: full + TREE_HARVEST_EVERY - 1, water: 2 });
      const res = await call(ana, 'POST', '/me/tree/water', {});
      expect(res.json()).toMatchObject({ harvests: 1, zer: TREE_HARVEST_ZER, grew: null });
      expect(res.json().tree).toMatchObject({ stage: TREE_FULL, harvests: 1, toward: { done: 0, of: TREE_HARVEST_EVERY, next: 'harvest' } });
      expect(await zer(ana)).toBe(TREE_HARVEST_ZER);
      const ledger = await pool.query(`SELECT amount, ref_id FROM wallet_ledger WHERE user_id = $1 AND reason = $2`, [ana.id, TREE_HARVEST_REASON]);
      expect(ledger.rows).toEqual([{ amount: TREE_HARVEST_ZER, ref_id: (await stored(ana))!.id }]);
      // the next pour is not another harvest
      const next = await call(ana, 'POST', '/me/tree/water', {});
      expect(next.json()).toMatchObject({ harvests: 0, zer: 0 });
      expect(await zer(ana)).toBe(TREE_HARVEST_ZER);
    });

    it('bears for someone who is not a member too, with no Zêr', async () => {
      const ana = await learner('free');
      await call(ana, 'POST', '/me/tree/plant', { species: 'hinar' });
      await make(ana, { waterings: TREE_GROWTH[TREE_FULL] + TREE_HARVEST_EVERY - 1, water: 1 });
      const res = await call(ana, 'POST', '/me/tree/water', {});
      expect(res.json()).toMatchObject({ harvests: 1, zer: 0 });
      expect(await zer(ana)).toBe(0);
    });

    it('still waters and bears for an account the economy does not pay, unpaid', async () => {
      const ana = await learner('held');
      await call(ana, 'POST', '/me/tree/plant', { species: 'hinar' });
      await make(ana, { waterings: TREE_GROWTH[TREE_FULL] + TREE_HARVEST_EVERY - 1, water: 1 });
      await pool.query(`UPDATE users SET banned_at = now() WHERE id = $1`, [ana.id]);
      const res = await new TreeService(pool, wallet).water(ana.id, 1);
      expect(res).toMatchObject({ harvests: 1, zer: 0 });
      expect(await zer(ana)).toBe(0);
    });
  });

  describe('another kind', () => {
    it('is bought with Zêr once, plants nothing by being bought, and can be planted from then on', async () => {
      const ana = await learner('buy');
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      await make(ana, { waterings: 9 });
      const price = TREE_KINDS.tu.price;
      // short of it
      const short = await call(ana, 'POST', '/me/tree/kinds/tu/buy');
      expect(short.statusCode).toBe(402);
      expect((await call(ana, 'GET', '/me/tree')).json().kinds.find((k: { species: string }) => k.species === 'tu').owned).toBe(false);
      await wallet.credit({ userId: ana.id, currency: 'zer', amount: price + 30, reason: 'test_grant', idempotencyKey: `tr-buy-${ana.id}` });
      const bought = await call(ana, 'POST', '/me/tree/kinds/tu/buy');
      expect(bought.statusCode, bought.body).toBe(200);
      expect(bought.json().zer).toBe(30);
      expect(bought.json().kinds.find((k: { species: string }) => k.species === 'tu').owned).toBe(true);
      // The standing tree is unchanged.
      expect(bought.json().tree).toMatchObject({ species: 'beru', waterings: 9 });
      const ledger = await pool.query(`SELECT amount, ref_id FROM wallet_ledger WHERE user_id = $1 AND reason = $2`, [ana.id, TREE_PURCHASE_REASON]);
      expect(ledger.rows).toEqual([{ amount: -price, ref_id: 'tu' }]);
      // not twice, nor a free one, nor one there is not
      const again = await call(ana, 'POST', '/me/tree/kinds/tu/buy');
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('TREE_OWNED');
      expect(await zer(ana)).toBe(30);
      expect((await call(ana, 'POST', '/me/tree/kinds/beru/buy')).json().code).toBe('TREE_OWNED');
      expect((await call(ana, 'POST', '/me/tree/kinds/cactus/buy')).json().code).toBe('TREE_NOT_FOUND');
      // Theirs to plant now, and again later for free.
      const planted = await call(ana, 'POST', '/me/tree/plant', { species: 'tu' });
      expect(planted.json().tree).toMatchObject({ species: 'tu', stage: 0 });
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      expect((await call(ana, 'POST', '/me/tree/plant', { species: 'tu' })).statusCode).toBe(200);
      expect(await zer(ana)).toBe(30);
    });

    it('is paid for once when two purchases arrive together', async () => {
      const ana = await learner('buyrace');
      const price = TREE_KINDS.spindar.price;
      await wallet.credit({ userId: ana.id, currency: 'zer', amount: price * 2, reason: 'test_grant', idempotencyKey: `tr-race-${ana.id}` });
      const both = await Promise.all([call(ana, 'POST', '/me/tree/kinds/spindar/buy'), call(ana, 'POST', '/me/tree/kinds/spindar/buy')]);
      expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      expect(await zer(ana)).toBe(price);
    });
  });

  describe('on a profile', () => {
    it('shows anybody the tree as it stands, and nothing of what its owner holds', async () => {
      const ana = await learner('shown');
      const ben = await learner('viewer');
      const none = await call(ben, 'GET', `/users/${ana.id}`);
      expect(none.statusCode, none.body).toBe(200);
      expect(none.json().tree).toBeNull();
      await call(ana, 'POST', '/me/tree/plant', { species: 'behiv' });
      await make(ana, { waterings: 80, water: 7, dryDays: 5 });
      const seen = await call(ben, 'GET', `/users/${ana.id}`);
      expect(seen.json().tree).toEqual({ species: 'behiv', stage: 5, health: 'wilting', age: 0, harvests: 0 });
      // signed out, a reader is shown the tree exactly where they are shown the profile
      const out = (await call(null, 'GET', `/users/${ana.id}`)).json();
      expect(out.tree).toEqual(out.private ? null : seen.json().tree);
    });

    it('keeps the tree to itself on a profile that shows a stranger nothing', async () => {
      const ana = await learner('private');
      const ben = await learner('stranger');
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      await pool.query(`UPDATE users SET profile_visibility = 'nobody' WHERE id = $1`, [ana.id]);
      const seen = await call(ben, 'GET', `/users/${ana.id}`);
      expect(seen.json().private).toBe(true);
      expect(seen.json().tree).toBeNull();
      // its owner still sees it
      expect((await call(ana, 'GET', `/users/${ana.id}`)).json().tree).toMatchObject({ species: 'beru' });
    });
  });

  describe('counted in drops', () => {
    /** Where each stage started when a lesson earned one water, and a full-grown tree's way to its next harvest then. */
    const BEFORE = [0, 1, 3, 7, 14, 24, 38];
    const stageOf = (waterings: number): number => BEFORE.filter((at, i) => i > 0 && waterings >= at).length;
    const share = (waterings: number): number => {
      if (waterings >= 38) return ((waterings - 38) % 10) / 10;
      const stage = stageOf(waterings);
      return (waterings - BEFORE[stage]!) / (BEFORE[stage + 1]! - BEFORE[stage]!);
    };

    it('keeps every tree at its stage with its bar no further back and its water worth what it was, and goes back exactly', async () => {
      const path = '../../migrations/1751000850000_tree-water-in-drops.js';
      const migration = (await import(/* @vite-ignore */ path)) as Record<'up' | 'down', (pgm: unknown) => void>;
      const statements = (step: 'up' | 'down'): string[] => {
        const found: string[] = [];
        migration[step]({ sql: (sql: string) => found.push(sql) });
        return found;
      };
      // Trees as they were counted: a sprout halfway, a young tree, two nearly at their next stage, and a great tree that has borne twice.
      const trees = [
        { waterings: 2, water: 0, harvests: 0 },
        { waterings: 9, water: 4, harvests: 0 },
        { waterings: 23, water: 1, harvests: 0 },
        { waterings: 37, water: 7, harvests: 0 },
        { waterings: 38 + 2 * 10 + 7, water: 3, harvests: 2 },
      ];
      const who: Learner[] = [];
      for (const [i, tree] of trees.entries()) {
        const one = await learner(`drops${i}`);
        await call(one, 'POST', '/me/tree/plant', { species: 'beru' });
        await make(one, tree);
        who.push(one);
      }
      const client = await pool.connect();
      try {
        // In a transaction it rolls back, so the trees of everyone else in this database stay as they are.
        await client.query('BEGIN');
        const read = async () => {
          const rows = (await client.query<{ user_id: string; waterings: number; water: number; harvests: number }>(`SELECT user_id, waterings, water, harvests FROM user_trees WHERE user_id = ANY($1::uuid[])`, [who.map((w) => w.id)])).rows;
          return who.map((w) => rows.find((r) => r.user_id === w.id)!);
        };
        for (const sql of statements('up')) await client.query(sql);
        const after = await read();
        trees.forEach((was, i) => {
          const now = treeView({ species: 'beru', plantedOn: today(), lastWateredOn: today(), ...after[i]! }, today());
          expect(now.stage, `${was.waterings}`).toBe(stageOf(was.waterings));
          expect(now.toward.done / now.toward.of, `${was.waterings}`).toBeGreaterThanOrEqual(share(was.waterings));
          expect(now.toward.done / now.toward.of, `${was.waterings}`).toBeLessThan(share(was.waterings) + 0.1);
          expect(after[i]!.water).toBe(was.water * 3);
          expect(after[i]!.harvests).toBe(was.harvests);
        });
        // the great tree is two harvests on, as it was, and the next comes at the same share of the way
        expect(after[4]!.waterings).toBe(TREE_GROWTH[TREE_FULL] + 2 * TREE_HARVEST_EVERY + 14);
        expect(treeStage(after[0]!.waterings)).toBe(1);
        for (const sql of statements('down')) await client.query(sql);
        expect((await read()).map(({ waterings, water, harvests }) => ({ waterings, water, harvests }))).toEqual(trees);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });

  describe('the learner’s data', () => {
    it('goes with the account when it is erased', async () => {
      const ana = await learner('erase');
      await call(ana, 'POST', '/me/tree/plant', { species: 'beru' });
      await pool.query(`INSERT INTO user_tree_kinds (user_id, species) VALUES ($1, 'tu')`, [ana.id]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [ana.id]);
      expect((await pool.query(`SELECT 1 FROM user_trees WHERE user_id = $1`, [ana.id])).rowCount).toBe(0);
      expect((await pool.query(`SELECT 1 FROM user_tree_kinds WHERE user_id = $1`, [ana.id])).rowCount).toBe(0);
    });
  });
});
