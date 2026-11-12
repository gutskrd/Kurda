/**
 * The Who Am I? race on the multiplayer engine, through the routes, against
 * real Postgres: what each player's view may hold (nobody's identity before
 * it may be seen), a race that runs on its own clock and waits on nobody,
 * scoring and placement XP, where the game is offered, and what a view costs
 * to read.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { MultiView, WhoAmIRaceBoard } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend } from '../test/social.js';
import { countQueries } from '../test/query-count.js';
import { bustAvailability } from '../games/availability.js';
import { bustGamePools } from '../games/sources.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface User {
  id: string;
  token: string;
}

const FACTS = ['alive', 'animal', 'person', 'edible', 'place', 'can-fly', 'lives-in-water', 'four-legs', 'bigger-than-person', 'at-home', 'sweet', 'uses-electricity'];

describe.skipIf(!DATABASE_URL || !REDIS_URL)('the Who Am I? race (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  // letters only, unique to this run: this suite's words are told from any other suite's
  const tag = `zw${suffix.replace(/[^a-z]/g, '')}`;
  const contentIds: string[] = [];
  let ip = 0;

  const register = async (name: string): Promise<User> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `wr_${name}_${suffix}@it.kurda.app`,
        username: `wr_${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(30),
      },
      remoteAddress: `10.158.${Math.floor(ip / 200)}.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode, res.body).toBe(201);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  const call = async (who: User, method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: '10.158.250.1',
    });
    return { status: res.statusCode, body: res.body ? res.json() : null, raw: res.body };
  };
  /** A lobby of `game` with the host and `guests` friends of the host in it, started. */
  const started = async (game: 'who-am-i', settings: Record<string, unknown>, name: string, guests = 2) => {
    const host = await register(`${name}h`);
    const others: User[] = [];
    for (let i = 0; i < guests; i++) {
      const g = await register(`${name}g${i}`);
      await befriend(pool, host.id, g.id);
      others.push(g);
    }
    const made = await call(host, 'POST', '/play/lobbies', { game, settings: { dialect: 'kmr', ...settings } });
    expect(made.status, made.raw).toBe(201);
    const id = made.body.lobbyId as string;
    const code = (await call(host, 'GET', `/mp/${game}/${id}`)).body.code as string;
    for (const g of others) expect((await call(g, 'POST', '/play/join', { code })).status).toBe(200);
    const start = await call(host, 'POST', `/mp/${game}/${id}/start`);
    expect(start.status, start.raw).toBe(200);
    return { host, guests: others, id };
  };
  const state = async <T>(id: string): Promise<T> => (await pool.query<{ state: T }>(`SELECT state FROM game_lobbies WHERE id = $1`, [id])).rows[0]!.state;
  const seatOf = async (id: string, who: User): Promise<number> =>
    (await pool.query<{ seat: number }>(`SELECT seat FROM game_lobby_players WHERE lobby_id = $1 AND user_id = $2`, [id, who.id])).rows[0]!.seat;
  /** The phase's time has run out, as the database's clock sees it, and the engine has settled it. */
  const expire = async (id: string, field: string) => {
    await pool.query(
      `UPDATE game_lobbies SET state = jsonb_set(state, $2::text[], to_jsonb((extract(epoch FROM now()) * 1000)::bigint - 1000)), due_at = now() - interval '1 second'
        WHERE id = $1`,
      [id, `{${field}}`],
    );
    await app.multiplayer.advance(id);
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // a dozen identities at the first level, each with a full table in its own pattern, and a question per fact
    for (let i = 0; i < 12; i++) {
      const facts = Object.fromEntries(FACTS.map((f, j) => [f, ((i >> (j % 4)) & 1) === 1]));
      const r = await pool.query<{ id: string }>(
        `INSERT INTO game_content (kind, dialect, level, payload, status, review_status) VALUES ('identity', 'kmr', 1, $1::jsonb, 'published', 'approved') RETURNING id`,
        [JSON.stringify({ word: `${tag}id${letters(i)}`, meanings: { en: `identity ${i}` }, category: 'animal', facts })],
      );
      contentIds.push(r.rows[0]!.id);
    }
    for (const [j, fact] of FACTS.entries()) {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO game_content (kind, dialect, level, payload, status, review_status) VALUES ('question_template', 'kmr', 1, $1::jsonb, 'published', 'approved') RETURNING id`,
        [JSON.stringify({ ku: `${tag} pirs ${letters(j)}?`, meanings: { en: `Question about ${fact}?` }, fact })],
      );
      contentIds.push(r.rows[0]!.id);
    }
    await bustGamePools(app.cache);
    await bustAvailability(app.cache);
    for (const k of ['who-am-i:kmr', 'who-am-i:ckb']) await app.cache.del('mp-availability', k);
    vi.spyOn(app.realtime, 'notifyUser').mockImplementation(async () => undefined);
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(
        `DELETE FROM game_lobbies WHERE id IN (SELECT lobby_id FROM game_lobby_players p JOIN users u ON u.id = p.user_id WHERE u.email LIKE '%_${suffix}@it.kurda.app')`,
      );
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    if (contentIds.length) await pool.query(`DELETE FROM game_content WHERE id = ANY($1::uuid[])`, [contentIds]);
    await bustGamePools(app.cache);
    await bustAvailability(app.cache);
    for (const k of ['who-am-i:kmr', 'who-am-i:ckb']) await app.cache.del('mp-availability', k);
    await pool.end();
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('the Who Am I? race', () => {
    type View = MultiView<WhoAmIRaceBoard | null>;
    interface Dealt {
      seats: Array<{ seat: number; deal: { identity: { id: string; word: string; facts: Record<string, boolean> }; candidates: Array<{ id: string }>; questions: Array<{ id: string; fact: string }> } }>;
      firstSolver: number | null;
    }

    it('deals everyone an identity of their own and shows nobody theirs, or anyone else’s, before it may be seen', async () => {
      const { host, guests, id } = await started('who-am-i', { minutes: 3, difficulty: 'beginner' }, 'race', 1);
      const guest = guests[0]!;
      const dealt = await state<Dealt>(id);
      expect(dealt.seats.every((s) => s.deal !== null)).toBe(true);
      expect(new Set(dealt.seats.map((s) => s.deal.identity.id)).size).toBe(dealt.seats.length);
      const [hs, gs] = [await seatOf(id, host), await seatOf(id, guest)];
      const mine = dealt.seats.find((s) => s.seat === hs)!.deal;
      const theirs = dealt.seats.find((s) => s.seat === gs)!.deal;

      const v = (await call(host, 'GET', `/mp/who-am-i/${id}`)).body as View;
      expect(v.board!.mine).toMatchObject({ identity: null, solved: false, guessesLeft: 2 });
      expect(v.board!.reveal).toBeNull();
      const raw = JSON.stringify(v.board);
      expect(raw).not.toContain('"facts"');
      expect(raw).not.toContain('"fact"');
      // the other player's identity is nowhere in my view, unless it is one of my tiles too
      if (!mine.candidates.some((c) => c.id === theirs.identity.id)) expect(raw).not.toContain(theirs.identity.word);

      // a question is answered from the facts table, and the others see only that one was asked
      const q = mine.questions[0]!;
      const asked = await call(host, 'POST', `/mp/who-am-i/${id}/moves`, { kind: 'ask', question: q.id });
      expect(asked.status, asked.raw).toBe(200);
      expect(asked.body.outcome).toEqual({ kind: 'ask', answer: mine.identity.facts[q.fact] === true, correct: null });
      const seen = (await call(guest, 'GET', `/mp/who-am-i/${id}`)).body as View;
      expect(seen.board!.seats.find((s) => s.seat === hs)).toMatchObject({ asked: 1, solved: false });

      // the guest has it first and wins; the host finishes theirs for their own score
      const wrong = theirs.candidates.find((c) => c.id !== theirs.identity.id)!;
      expect((await call(guest, 'POST', `/mp/who-am-i/${id}/moves`, { kind: 'guess', tile: wrong.id })).body.outcome).toMatchObject({ correct: false });
      expect((await call(guest, 'POST', `/mp/who-am-i/${id}/moves`, { kind: 'guess', tile: theirs.identity.id })).body.outcome).toMatchObject({ correct: true });
      expect((await state<Dealt>(id)).firstSolver).toBe(gs);
      const own = ((await call(guest, 'GET', `/mp/who-am-i/${id}`)).body as View).board!.mine!;
      expect(own.identity).toMatchObject({ word: theirs.identity.word });
      expect((await call(guest, 'POST', `/mp/who-am-i/${id}/moves`, { kind: 'ask', question: theirs.questions[0]!.id })).status).toBe(409);

      expect((await call(host, 'POST', `/mp/who-am-i/${id}/moves`, { kind: 'guess', tile: mine.identity.id })).status).toBe(200);
      const done = (await call(host, 'GET', `/mp/who-am-i/${id}`)).body as View;
      expect(done.status).toBe('finished');
      expect(done.results!.find((r) => r.seat === gs)!.place).toBe(1);
      expect(done.results!.find((r) => r.seat === hs)!.place).toBe(2);
      expect(done.board!.reveal!.map((r) => r.word).sort()).toEqual([mine.identity.word, theirs.identity.word].sort());
      const paid = await pool.query(`SELECT 1 FROM xp_ledger WHERE source = 'game_who_am_i_place' AND ref_id LIKE $1`, [`mp:${id}:%`]);
      expect(paid.rowCount).toBe(2);
    });

    it('ends on its clock with nobody waited on, however long a player is away', async () => {
      const { host, id } = await started('who-am-i', { minutes: 3, difficulty: 'beginner' }, 'clock', 1);
      const before = (await call(host, 'GET', `/mp/who-am-i/${id}`)).body as View;
      expect(before.status).toBe('active');
      const skips = await pool.query(`SELECT 1 FROM game_moves WHERE lobby_id = $1 AND kind IN ('skip', 'timeout')`, [id]);
      expect(skips.rowCount).toBe(0);
      await expire(id, 'endsAt');
      const after = (await call(host, 'GET', `/mp/who-am-i/${id}`)).body as View;
      expect(after.status).toBe('finished');
      expect(after.board!.endedBy).toBe('time');
    });

    it('is offered at the difficulties its identities fill', async () => {
      const me = await register('wavail');
      const r = await call(me, 'GET', '/mp/who-am-i/availability?dialect=kmr');
      expect(r.body.dialects[0]).toMatchObject({ dialect: 'kmr', group: true, solo: false });
      expect(r.body.dialects[0].difficulties).toContain('beginner');
    });

    it('pays placement only to the players still in it when the clock ends it', async () => {
      const { host, guests, id } = await started('who-am-i', { minutes: 3, difficulty: 'beginner' }, 'paid', 2);
      const dealt = await state<Dealt>(id);
      // everyone plays: a question each
      for (const who of [host, ...guests]) {
        const seat = await seatOf(id, who);
        const question = dealt.seats.find((s) => s.seat === seat)!.deal.questions[0]!;
        expect((await call(who, 'POST', `/mp/who-am-i/${id}/moves`, { kind: 'ask', question: question.id })).status).toBe(200);
      }
      // one of the three walks away before the end: no pay for a game they did not stay in
      expect((await call(guests[1]!, 'POST', `/mp/who-am-i/${id}/leave`)).status).toBe(200);
      await expire(id, 'endsAt');
      const done = (await call(host, 'GET', `/mp/who-am-i/${id}`)).body as View;
      expect(done.status).toBe('finished');
      const paid = await pool.query<{ ref_id: string }>(`SELECT ref_id FROM xp_ledger WHERE source = 'game_who_am_i_place' AND ref_id LIKE $1`, [`mp:${id}:%`]);
      expect(paid.rows.map((r) => r.ref_id).sort()).toEqual([`mp:${id}:${host.id}`, `mp:${id}:${guests[0]!.id}`].sort());
    });

    it('reads a race in a fixed number of statements', async () => {
      const { host, id } = await started('who-am-i', { minutes: 3, difficulty: 'beginner' }, 'budget', 2);
      await call(host, 'GET', `/mp/who-am-i/${id}`);
      const log = countQueries(app.db);
      try {
        await call(host, 'GET', `/mp/who-am-i/${id}`);
      } finally {
        log.stop();
      }
      // the lobby, its seats and the names
      expect(log.count, log.statements.join('\n')).toBeLessThanOrEqual(7);
    });

    it('lets nobody outside the race look in', async () => {
      const { id } = await started('who-am-i', { minutes: 3, difficulty: 'beginner' }, 'look', 1);
      const stranger = await register('stranger');
      expect((await call(stranger, 'GET', `/mp/who-am-i/${id}`)).status).toBe(404);
      expect((await call(stranger, 'POST', `/mp/who-am-i/${id}/moves`, { kind: 'ask', question: 'x' })).status).toBe(404);
    });
  });
});

/** A short letters-only suffix for the i-th item: a, b, … z, ba, bb, … */
function letters(i: number): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz';
  return i < 26 ? abc[i]! : abc[Math.floor(i / 26)]! + abc[i % 26]!;
}
