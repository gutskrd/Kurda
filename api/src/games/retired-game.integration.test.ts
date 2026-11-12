/**
 * What Would You Say?, which is no longer part of Hevalo, against real
 * Postgres and Redis.
 *
 * Two promises are kept here, the same two as for the games with friends
 * that were retired before it (mp/retired-games.integration.test.ts). Nothing
 * starts it: no round of it can be made or looked for, it is not among what
 * can be played, and no scene can be written or imported for it. And what was
 * stored while it was played is never in the way: a round, a scene and the XP
 * it paid stay in the database, a round or a scene is answered as something
 * that is not there, and the XP still counts as game XP under the league's
 * daily cap. The migration that gives the open rounds up is run here as it is
 * written.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { GamesAvailability } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { exportProgress } from '../gdpr/progress-export.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { bornYearsAgo } from '../test/age.js';
import { GAME_XP_LEAGUE_CAP, GAME_XP_SOURCES, isGameSource, isLearningSource } from '../xp/rules.js';
import { XpService } from '../xp/service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface User {
  id: string;
  token: string;
}

const RETIRED = 'what-would-you-say';
const RETIRED_XP = 'game_what_would_you_say';

describe.skipIf(!DATABASE_URL || !REDIS_URL)('What Would You Say?, no longer part of Hevalo (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  // a word of letters only, unique to this run, that every row of this suite's content is made of
  const tag = `zw${suffix.replace(/[^a-z]/g, '')}`;
  let ip = 0;
  let learner: User;

  const register = async (name: string, roles = '{}'): Promise<User> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `ws_${name}_${suffix}@it.kurda.app`,
        username: `ws_${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(30),
      },
      remoteAddress: `10.159.${Math.floor(ip / 200)}.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode).toBe(201);
    await activate(app, pool, res);
    const user = { id: res.json().user.id as string, token: res.json().tokens.accessToken as string };
    if (roles !== '{}') {
      await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [user.id, roles]);
      await pass2fa(app, user.token, '10.159.250.2');
    }
    return user;
  };
  const call = async (who: User | null, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: who ? { authorization: `Bearer ${who.token}` } : {},
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: '10.159.251.1',
    });
    return { status: res.statusCode, body: res.body ? res.json() : null, raw: res.body };
  };

  /** A round as one was stored while a game was played: open, long expired, or finished and paid. */
  const stored = async (who: User, game: string, state: 'open' | 'expired' | 'finished'): Promise<string> => {
    const items = [{ key: `gc:${tag}:0`, level: 1 }, { key: `gc:${tag}:1`, level: 1 }];
    const row = await pool.query<{ id: string }>(
      `INSERT INTO game_sessions (user_id, game, dialect, difficulty, items, total_count, expires_at, finished_at, results, xp_awarded)
       VALUES ($1, $2, 'kmr', 'beginner', $3::jsonb, 2,
               CASE WHEN $4::text = 'expired' THEN now() - interval '3 hours' ELSE now() + interval '20 hours' END,
               CASE WHEN $4::text = 'finished' THEN now() - interval '1 hour' END,
               CASE WHEN $4::text = 'finished' THEN '{"xp": 2, "correct": 2, "total": 2}'::jsonb END,
               CASE WHEN $4::text = 'finished' THEN 2 ELSE 0 END)
       RETURNING id`,
      [who.id, game, JSON.stringify(items), state],
    );
    const id = row.rows[0]!.id;
    await pool.query(`INSERT INTO game_session_answers (session_id, item_index, attempt, answer, correct) VALUES ($1, 0, 1, '{"choice": 0}', true)`, [id]);
    return id;
  };
  const round = async (id: string) =>
    (
      await pool.query<{ expires_at: Date; finished_at: Date | null; meta: Record<string, unknown>; xp_awarded: number; open: boolean }>(
        `SELECT expires_at, finished_at, meta, xp_awarded, (finished_at IS NULL AND expires_at > now()) AS open FROM game_sessions WHERE id = $1`,
        [id],
      )
    ).rows[0]!;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    learner = await register('learner');
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      // the rounds go with their learners (the cascade)
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM game_content WHERE payload::text LIKE $1`, [`%${tag}%`]);
    await pool.end();
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // nothing starts it

  describe('starting it', () => {
    it('makes no round of it at any difficulty, and looks for none left open', async () => {
      for (const dialect of ['kmr', 'ckb']) {
        for (const difficulty of ['beginner', 'intermediate', 'advanced']) {
          const made = await call(learner, 'POST', '/games/solo/sessions', { game: RETIRED, dialect, difficulty });
          expect(made.status, made.raw).toBe(400);
        }
        expect((await call(learner, 'GET', `/games/solo/open?game=${RETIRED}&dialect=${dialect}`)).status).toBe(400);
      }
      const rows = await pool.query(`SELECT 1 FROM game_sessions WHERE user_id = $1`, [learner.id]);
      expect(rows.rowCount).toBe(0);
    });

    it('is not among what can be played in either variety, and the games there are still are', async () => {
      for (const dialect of ['kmr', 'ckb']) {
        // asked without an account too: the games page of a visitor reads the same list
        for (const who of [learner, null]) {
          const res = await call(who, 'GET', `/games/availability?dialect=${dialect}`);
          expect(res.status, res.raw).toBe(200);
          const ids = (res.body as GamesAvailability).games.map((g) => g.id as string);
          expect(ids).not.toContain(RETIRED);
          expect(ids).toEqual(['build-sentence', 'memory-thief', 'hear-it', 'detective', 'last-letter', 'impostor', 'who-am-i']);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // what was stored while it was played

  describe('a round stored while it was played', () => {
    it('is not opened, answered, begun, hinted or finished, and stays as it was', async () => {
      const player = await register('player');
      const id = await stored(player, RETIRED, 'open');
      const before = await round(id);
      expect((await call(player, 'GET', `/games/solo/sessions/${id}`)).status).toBe(404);
      expect((await call(player, 'POST', `/games/solo/sessions/${id}/answers`, { index: 1, answer: { choice: 0 } })).status).toBe(404);
      expect((await call(player, 'POST', `/games/solo/sessions/${id}/begin`, { index: 1 })).status).toBe(404);
      expect((await call(player, 'POST', `/games/solo/sessions/${id}/hints`, {})).status).toBe(404);
      expect((await call(player, 'POST', `/games/solo/sessions/${id}/finish`)).status).toBe(404);
      expect(await round(id)).toEqual(before);
      const answers = await pool.query(`SELECT 1 FROM game_session_answers WHERE session_id = $1`, [id]);
      expect(answers.rowCount).toBe(1);
      const paid = await pool.query(`SELECT 1 FROM xp_ledger WHERE user_id = $1`, [player.id]);
      expect(paid.rowCount).toBe(0);
    });

    it('stays in what an account is given of its own data', async () => {
      const player = await register('keeper');
      await stored(player, RETIRED, 'finished');
      const progress = await exportProgress(pool, player.id);
      expect(progress.learningGames).toMatchObject([{ game: RETIRED, dialect: 'kmr', difficulty: 'beginner', total_count: 2, xp_awarded: 2 }]);
    });

    it('keeps the XP it paid counting as game XP, under the league’s daily cap', async () => {
      expect(GAME_XP_SOURCES).toContain(RETIRED_XP);
      expect(isGameSource(RETIRED_XP)).toBe(true);
      expect(isLearningSource(RETIRED_XP)).toBe(false);

      // a day's game XP from the retired game, as its rounds wrote it: it fills the cap every game shares
      const player = await register('earner');
      const xp = new XpService(pool);
      const had = await xp.total(player.id);
      expect(await xp.award({ userId: player.id, source: RETIRED_XP, amount: GAME_XP_LEAGUE_CAP, refId: `${tag}:old-round:${player.id}` })).toBe(GAME_XP_LEAGUE_CAP);
      // so a game played the same day is earned in full and counts nothing more for the league
      expect(await xp.award({ userId: player.id, source: 'game_detective', amount: 10, refId: `${tag}:new-round:${player.id}` })).toBe(10);
      // while learning still counts
      expect(await xp.award({ userId: player.id, source: 'lesson_complete', amount: 10, refId: `${tag}:lesson:${player.id}` })).toBe(10);
      const ledger = await pool.query<{ source: string; amount: number; counted: number }>(
        `SELECT source, amount, counted FROM xp_ledger WHERE user_id = $1 AND ref_id LIKE $2 ORDER BY amount DESC, source`,
        [player.id, `${tag}:%`],
      );
      expect(ledger.rows).toEqual([
        { source: RETIRED_XP, amount: GAME_XP_LEAGUE_CAP, counted: GAME_XP_LEAGUE_CAP },
        { source: 'game_detective', amount: 10, counted: 0 },
        { source: 'lesson_complete', amount: 10, counted: 10 },
      ]);
      // all of it is still the learner's own XP
      expect(await xp.total(player.id)).toBe(had + GAME_XP_LEAGUE_CAP + 20);
      expect(await xp.verifyConsistency(player.id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // the scenes written for it

  describe('a scene written for it', () => {
    it('is not listed, opened, changed, counted or imported in the admin, which goes on reading the rest', async () => {
      const editor = await register('editor', '{content_editor}');
      const made = async (kind: string, payload: unknown): Promise<string> =>
        (
          await pool.query<{ id: string }>(
            `INSERT INTO game_content (kind, dialect, level, payload, status, review_status) VALUES ($1, 'kmr', 1, $2, 'published', 'approved') RETURNING id`,
            [kind, JSON.stringify(payload)],
          )
        ).rows[0]!.id;
      const line = (n: number) => ({ ku: `${tag} ${n}`, meanings: { en: `line ${n}` } });
      const scene = await made('scenario', { situation: { en: 'Someone says this to you.' }, line: line(0), reply: line(1), others: [line(2), line(3)] });
      const kept = await made('question_template', { ku: `Ma ew ${tag} ye?`, meanings: { en: 'Is it one?' }, fact: 'alive' });

      const list = await call(editor, 'GET', `/admin/game-content?q=${tag}`);
      expect(list.status, list.raw).toBe(200);
      expect((list.body.rows as Array<{ id: string }>).map((r) => r.id)).toEqual([kept]);
      expect(list.body.total).toBe(1);

      expect((await call(editor, 'GET', `/admin/game-content/${scene}`)).status).toBe(404);
      expect((await call(editor, 'PUT', `/admin/game-content/${scene}`, { level: 1, payload: {}, lockVersion: 0 })).status).toBe(404);
      expect((await call(editor, 'POST', `/admin/game-content/${scene}/unpublish`, { lockVersion: 0 })).status).toBe(404);
      expect((await call(editor, 'DELETE', `/admin/game-content/${scene}?lockVersion=0`)).status).toBe(404);
      expect((await call(editor, 'GET', '/admin/game-content?kind=scenario')).status).toBe(400);
      expect((await call(editor, 'GET', `/admin/game-content?game=${RETIRED}`)).status).toBe(400);
      expect((await call(editor, 'POST', '/admin/game-content', { kind: 'scenario', dialect: 'kmr', level: 1, payload: {} })).status).toBe(400);
      // the importer that made scenes of conversations is gone with them
      expect((await call(editor, 'POST', '/admin/game-content/import', { from: 'conversations', dialect: 'kmr' })).status).toBe(400);

      const readiness = await call(editor, 'GET', '/admin/game-content/readiness');
      expect(readiness.status, readiness.raw).toBe(200);
      expect((readiness.body.counts as Array<{ kind: string }>).some((c) => c.kind === 'scenario')).toBe(false);
      for (const a of readiness.body.availability as GamesAvailability[]) expect(a.games.map((g) => g.id as string)).not.toContain(RETIRED);
      // and the scene is still where it was, as it was
      const still = await pool.query<{ status: string }>(`SELECT status FROM game_content WHERE id = $1`, [scene]);
      expect(still.rows).toEqual([{ status: 'published' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // the migration

  describe('the migration that gives the open rounds up', () => {
    it('ends every open round of it, pays nobody, and touches nothing else', async () => {
      const player = await register('midround');
      const open = await stored(player, RETIRED, 'open');
      const lapsed = await stored(player, RETIRED, 'expired');
      const over = await stored(player, RETIRED, 'finished');
      const other = await stored(player, 'detective', 'open');
      const before = { lapsed: await round(lapsed), over: await round(over), other: await round(other) };
      expect((await round(open)).open).toBe(true);

      const path = '../../migrations/1751000460000_what-would-you-say-ends.js';
      const migration = (await import(/* @vite-ignore */ path)) as { up: (pgm: unknown) => void; down: (pgm: unknown) => void };
      const statements: string[] = [];
      migration.up({ sql: (s: string) => statements.push(s) });
      expect(statements).toHaveLength(1);
      for (const statement of statements) await pool.query(statement);

      // given up as the solo round gives up a round that is replaced: expired at once and marked, never finished
      const ended = await round(open);
      expect(ended).toMatchObject({ open: false, finished_at: null, meta: { abandoned: true }, xp_awarded: 0 });
      expect(ended.expires_at.getTime()).toBeLessThanOrEqual(Date.now());
      expect((await call(player, 'POST', `/games/solo/sessions/${open}/finish`)).status).toBe(410);
      // a round that had already run out, one that was finished, and another game's open round are as they were
      expect(await round(lapsed)).toEqual(before.lapsed);
      expect(await round(over)).toEqual(before.over);
      expect(await round(other)).toEqual(before.other);
      expect((await call(player, 'GET', `/games/solo/open?game=detective&dialect=kmr`)).body).toEqual({ id: other });
      // nothing was deleted, and nobody was paid by it
      const kept = await pool.query(`SELECT 1 FROM game_session_answers WHERE session_id = ANY($1::uuid[])`, [[open, lapsed, over, other]]);
      expect(kept.rowCount).toBe(4);
      const paid = await pool.query(`SELECT 1 FROM xp_ledger WHERE user_id = $1`, [player.id]);
      expect(paid.rowCount).toBe(0);

      // run again it finds nothing to end, and there is nothing to take back
      for (const statement of statements) expect((await pool.query(statement)).rowCount).toBe(0);
      const undone: string[] = [];
      migration.down({ sql: (s: string) => undone.push(s) });
      expect(undone).toEqual([]);
    });
  });
});
