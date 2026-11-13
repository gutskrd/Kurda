/**
 * Ez kî me? with friends on the multiplayer engine, through the routes,
 * against real Postgres: what each player's payload holds (everybody's card
 * but their own), a turn in which the others answer and the card decides,
 * the clocks, scoring and placement XP, where the game is offered, and what
 * a view costs to read.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { MultiView, WhoAmITableBoard } from '@kurda/shared';
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

describe.skipIf(!DATABASE_URL || !REDIS_URL)('Ez kî me? with friends (integration)', () => {
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
  describe('the table', () => {
    type View = MultiView<WhoAmITableBoard | null>;
    interface Dealt {
      seats: Array<{ seat: number; deal: { identity: { id: string; word: string; facts: Record<string, boolean> }; candidates: Array<{ id: string }>; questions: Array<{ id: string; fact: string }> } }>;
      turn: number | null;
      phase: string;
    }
    const view = async (who: User, id: string): Promise<View> => (await call(who, 'GET', `/mp/who-am-i/${id}`)).body as View;
    const moveOf = (who: User, id: string, move: Record<string, unknown>) => call(who, 'POST', `/mp/who-am-i/${id}/moves`, move);
    /** Everyone at a table by their seat. */
    const seated = async (id: string, players: readonly User[]): Promise<Map<number, User>> => new Map(await Promise.all(players.map(async (p) => [await seatOf(id, p), p] as const)));

    it('puts everybody’s card in a player’s payload but their own, and deals no tile that is a card somebody else wears', async () => {
      const { host, guests, id } = await started('who-am-i', { minutes: 5, difficulty: 'beginner' }, 'cards', 2);
      const dealt = await state<Dealt>(id);
      expect(dealt.seats.every((s) => s.deal !== null)).toBe(true);
      expect(new Set(dealt.seats.map((s) => s.deal.identity.id)).size).toBe(3);
      for (const s of dealt.seats) {
        const others = dealt.seats.filter((x) => x.seat !== s.seat).map((x) => x.deal.identity.id);
        expect(s.deal.candidates.some((c) => others.includes(c.id))).toBe(false);
      }
      for (const who of [host, ...guests]) {
        const seat = await seatOf(id, who);
        const board = (await view(who, id)).board!;
        const mine = dealt.seats.find((s) => s.seat === seat)!.deal.identity;
        expect(board.mine).toMatchObject({ identity: null, solved: false, guessesLeft: 2 });
        expect(board.reveal).toBeNull();
        for (const s of board.seats) {
          if (s.seat === seat) expect(s.card).toBeNull();
          else expect(s.card!.word).toBe(dealt.seats.find((x) => x.seat === s.seat)!.deal.identity.word);
        }
        // their own word is in their payload once, as one tile among the others; and no fact of anything is in it at all
        const raw = JSON.stringify(board);
        expect(raw.split(mine.word)).toHaveLength(2);
        expect(raw).not.toContain('"facts"');
        expect(raw).not.toContain('"fact"');
      }
    });

    it('plays a turn: the others answer, the card decides, and a right answer scores', async () => {
      const { host, guests, id } = await started('who-am-i', { minutes: 5, difficulty: 'beginner' }, 'turn', 2);
      const players = await seated(id, [host, ...guests]);
      const dealt = await state<Dealt>(id);
      const asker = players.get(dealt.turn!)!;
      const [first, second] = [...players].filter(([seat]) => seat !== dealt.turn).map(([, who]) => who) as [User, User];
      const deal = dealt.seats.find((s) => s.seat === dealt.turn)!.deal;
      const q = deal.questions[0]!;
      const truth = deal.identity.facts[q.fact] === true;

      // only the player on turn asks, and nobody answers before there is a question
      expect((await moveOf(first, id, { kind: 'ask', question: q.id })).status).toBe(409);
      expect((await moveOf(first, id, { kind: 'answer', yes: true })).status).toBe(409);
      expect((await moveOf(asker, id, { kind: 'ask', question: q.id })).status).toBe(200);
      expect((await moveOf(asker, id, { kind: 'answer', yes: true })).status).toBe(409);
      expect((await moveOf(asker, id, { kind: 'guess', tile: deal.identity.id })).status).toBe(409);

      // one answers right; until the other has, nobody is told which way, and the asker is told nothing
      expect((await moveOf(first, id, { kind: 'answer', yes: truth })).status).toBe(200);
      expect((await moveOf(first, id, { kind: 'answer', yes: !truth })).status).toBe(409);
      const waiting = (await view(asker, id)).board!;
      expect(waiting).toMatchObject({ phase: 'answer', told: null, pending: { answered: [await seatOf(id, first)], mine: null } });
      expect(waiting.mine!.asked).toEqual([]);
      expect(JSON.stringify((await view(second, id)).board!.pending)).not.toContain('"yes"');

      // the other answers wrong: the asker is told what the card says, not what the table said
      expect((await moveOf(second, id, { kind: 'answer', yes: !truth })).status).toBe(200);
      const told = (await view(asker, id)).board!;
      expect(told).toMatchObject({ phase: 'decide', pending: null, told: { truth } });
      expect(told.mine!.asked).toEqual([{ question: q.id, answer: truth }]);
      expect(told.seats.find((s) => s.seat === dealt.turn)!.asked).toBe(1);
      const firstSeat = await seatOf(id, first);
      const secondSeat = await seatOf(id, second);
      expect(told.told!.answers.find((a) => a.seat === firstSeat)).toMatchObject({ yes: truth, right: true });
      expect(told.told!.answers.find((a) => a.seat === secondSeat)).toMatchObject({ yes: !truth, right: false });
      expect(told.seats.find((s) => s.seat === firstSeat)).toMatchObject({ helped: 1, points: 1 });
      expect(told.seats.find((s) => s.seat === secondSeat)).toMatchObject({ helped: 0, points: 0 });

      // with the answer in hand the asker guesses right: their card comes off, and the turn goes on
      const guessed = await moveOf(asker, id, { kind: 'guess', tile: deal.identity.id });
      expect(guessed.body.outcome).toEqual({ kind: 'guess', correct: true });
      const after = (await view(asker, id)).board!;
      expect(after.mine).toMatchObject({ solved: true, identity: { word: deal.identity.word }, points: 9 });
      expect(after.turn).not.toBe(dealt.turn);

      // everyone else guesses theirs: the game is over, everyone is revealed, and all three are paid for a game they played
      for (let i = 0; i < 2; i++) {
        const now = await state<Dealt>(id);
        const who = players.get(now.turn!)!;
        expect((await moveOf(who, id, { kind: 'guess', tile: now.seats.find((s) => s.seat === now.turn)!.deal.identity.id })).status).toBe(200);
      }
      const done = await view(asker, id);
      expect(done.status).toBe('finished');
      expect(done.board!.endedBy).toBe('all-done');
      expect(done.board!.reveal).toHaveLength(3);
      // ten points for a card found with no question asked beats nine, and the helper's extra point beats the other
      expect(done.results!.find((r) => r.seat === firstSeat)!.place).toBe(1);
      expect(done.results!.find((r) => r.seat === secondSeat)!.place).toBe(2);
      expect(done.results!.find((r) => r.seat === dealt.turn)!.place).toBe(3);
      const paid = await pool.query(`SELECT 1 FROM xp_ledger WHERE source = 'game_who_am_i_place' AND ref_id LIKE $1`, [`mp:${id}:%`]);
      expect(paid.rowCount).toBe(3);
    });

    it('does not wait for a friend who does not answer: the card answers when their time is up', async () => {
      const { host, guests, id } = await started('who-am-i', { minutes: 5, difficulty: 'beginner' }, 'slow', 1);
      const players = await seated(id, [host, ...guests]);
      const dealt = await state<Dealt>(id);
      const asker = players.get(dealt.turn!)!;
      const deal = dealt.seats.find((s) => s.seat === dealt.turn)!.deal;
      const q = deal.questions[0]!;
      expect((await moveOf(asker, id, { kind: 'ask', question: q.id })).status).toBe(200);
      await expire(id, 'phaseEndsAt');
      const board = (await view(asker, id)).board!;
      expect(board.phase).toBe('decide');
      expect(board.mine!.asked).toEqual([{ question: q.id, answer: deal.identity.facts[q.fact] === true }]);
      expect(board.told!.answers).toEqual([{ seat: [...players.keys()].find((s) => s !== dealt.turn), yes: null, right: false }]);
    });

    it('passes the turn on when its player lets it run out, and ends on its clock', async () => {
      const { host, id } = await started('who-am-i', { minutes: 5, difficulty: 'beginner' }, 'clock', 1);
      const before = await state<Dealt>(id);
      await expire(id, 'phaseEndsAt');
      const passed = await state<Dealt>(id);
      expect(passed.turn).not.toBe(before.turn);
      expect(passed.phase).toBe('ask');
      await expire(id, 'endsAt');
      const after = await view(host, id);
      expect(after.status).toBe('finished');
      expect(after.board!.endedBy).toBe('time');
    });

    it('is offered with friends at the difficulties its identities fill, and never alone', async () => {
      const me = await register('wavail');
      const r = await call(me, 'GET', '/mp/who-am-i/availability?dialect=kmr');
      expect(r.body.dialects[0]).toMatchObject({ dialect: 'kmr', group: true, solo: false });
      expect(r.body.dialects[0].difficulties).toContain('beginner');
      // no round alone can be made of it any more
      const alone = await call(me, 'POST', '/games/solo/sessions', { game: 'who-am-i', dialect: 'kmr', difficulty: 'beginner' });
      expect(alone.status).toBe(404);
      expect(alone.raw).toContain('GAME_NOT_FOUND');
    });

    it('pays nobody for a table only one seat played at', async () => {
      const { host, guests, id } = await started('who-am-i', { minutes: 5, difficulty: 'beginner' }, 'lone', 1);
      const players = await seated(id, [host, ...guests]);
      const dealt = await state<Dealt>(id);
      const first = players.get(dealt.turn!)!;
      // one player finds their card at once; the other seat never asks, answers or guesses
      expect((await moveOf(first, id, { kind: 'guess', tile: dealt.seats.find((s) => s.seat === dealt.turn)!.deal.identity.id })).status).toBe(200);
      await expire(id, 'endsAt');
      expect((await view(host, id)).status).toBe('finished');
      const paid = await pool.query(`SELECT 1 FROM xp_ledger WHERE source = 'game_who_am_i_place' AND ref_id LIKE $1`, [`mp:${id}:%`]);
      expect(paid.rowCount).toBe(0);
    });

    it('goes on without a player who leaves, and ends when one is left alone', async () => {
      const { host, guests, id } = await started('who-am-i', { minutes: 5, difficulty: 'beginner' }, 'leave', 2);
      expect((await call(guests[1]!, 'POST', `/mp/who-am-i/${id}/leave`)).status).toBe(200);
      expect((await view(host, id)).status).toBe('active');
      expect((await call(guests[0]!, 'POST', `/mp/who-am-i/${id}/leave`)).status).toBe(200);
      const done = await view(host, id);
      expect(done.status).toBe('finished');
      expect(done.board!.endedBy).toBe('too-few');
    });

    it('reads a table in a fixed number of statements', async () => {
      const { host, id } = await started('who-am-i', { minutes: 5, difficulty: 'beginner' }, 'budget', 2);
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

    it('lets nobody outside the table look in', async () => {
      const { id } = await started('who-am-i', { minutes: 5, difficulty: 'beginner' }, 'look', 1);
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
