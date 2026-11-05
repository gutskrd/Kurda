/**
 * Kurdish Bluff and the Who Am I? race on the multiplayer engine, through
 * the routes, against real Postgres: what each player's view may hold (never
 * the real meaning's place, nobody's vote before the vote closes, nobody's
 * identity before it may be seen), the free-text gate a fake goes through and
 * the copy kept for a report, scoring and placement XP, and where each game
 * is offered.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { BLUFF_FAKE_MAX, type BluffBoard, type MultiView, type WhoAmIRaceBoard } from '@kurda/shared';
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

describe.skipIf(!DATABASE_URL || !REDIS_URL)('Kurdish Bluff and the Who Am I? race (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  // letters only, unique to this run: this suite's words are told from any other suite's
  const tag = `zb${suffix.replace(/[^a-z]/g, '')}`;
  const contentIds: string[] = [];
  let ip = 0;

  const register = async (name: string): Promise<User> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `bw_${name}_${suffix}@it.kurda.app`,
        username: `bw_${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(30),
      },
      remoteAddress: `10.152.${Math.floor(ip / 200)}.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode).toBe(201);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  const call = async (who: User, method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: '10.152.250.1',
    });
    return { status: res.statusCode, body: res.body ? res.json() : null, raw: res.body };
  };
  /** A lobby of `game` with the host and `guests` friends of the host in it, started. */
  const started = async (game: 'bluff' | 'who-am-i', settings: Record<string, unknown>, name: string, guests = 2) => {
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
    // two dozen approved Bluff cards with an English meaning, half of them with a German one too
    for (let i = 0; i < 24; i++) {
      const definitions = i < 12 ? { en: `${tag} meaning ${i}`, de: `${tag} Bedeutung ${i}` } : { en: `${tag} meaning ${i}` };
      const payload = { word: `${tag}${letters(i)}`, definitions, ...(i === 0 ? { example: { ku: `Ev ${tag}a ye.`, meanings: { en: 'This is it.' } } } : {}) };
      const r = await pool.query<{ id: string }>(
        `INSERT INTO game_content (kind, dialect, level, payload, status, review_status) VALUES ('bluff_card', 'kmr', 4, $1::jsonb, 'published', 'approved') RETURNING id`,
        [JSON.stringify(payload)],
      );
      contentIds.push(r.rows[0]!.id);
    }
    // a draft that no game may deal
    const draft = await pool.query<{ id: string }>(
      `INSERT INTO game_content (kind, dialect, level, payload) VALUES ('bluff_card', 'kmr', 4, $1::jsonb) RETURNING id`,
      [JSON.stringify({ word: `${tag}draftonly`, definitions: { en: `${tag} never dealt` } })],
    );
    contentIds.push(draft.rows[0]!.id);
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
    for (const k of ['bluff:kmr', 'bluff:ckb', 'who-am-i:kmr', 'who-am-i:ckb']) await app.cache.del('mp-availability', k);
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
    for (const k of ['bluff:kmr', 'bluff:ckb', 'who-am-i:kmr', 'who-am-i:ckb']) await app.cache.del('mp-availability', k);
    await pool.end();
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('Kurdish Bluff', () => {
    type View = MultiView<BluffBoard | null>;
    interface Deck {
      deck: Array<{ id: string; word: string; real: string }>;
      round: number;
      current: { options: Array<{ id: string; text: string; real: boolean }> | null };
    }

    it('is offered where there are enough approved cards, in the languages they have', async () => {
      const me = await register('avail');
      const r = await call(me, 'GET', '/mp/bluff/availability?dialect=kmr');
      expect(r.status).toBe(200);
      const kmr = r.body.dialects[0];
      expect(kmr).toMatchObject({ dialect: 'kmr', group: true, solo: false });
      expect(kmr.languages.map((l: { language: string }) => l.language)).toEqual(expect.arrayContaining(['en', 'de']));
      // and listed among Learn’s games
      const learn = await app.inject({ method: 'GET', url: '/games/availability?dialect=kmr' });
      expect(learn.json().games.find((g: { id: string }) => g.id === 'bluff')).toMatchObject({ available: true });
    });

    it('deals only approved cards with a meaning in the host’s language, and keeps every meaning out of every view while writing', async () => {
      const { host, guests, id } = await started('bluff', { language: 'de', rounds: 3, writeSeconds: 60 }, 'deal');
      const dealt = await state<Deck>(id);
      expect(dealt.deck).toHaveLength(3);
      for (const c of dealt.deck) {
        expect(c.real).toContain('Bedeutung');
        expect(c.word).not.toContain('draftonly');
      }
      const v = (await call(guests[0]!, 'GET', `/mp/bluff/${id}`)).body as View;
      expect(v.board).toMatchObject({ phase: 'write', round: 1, rounds: 3, language: 'de', word: dealt.deck[0]!.word });
      const raw = (await call(host, 'GET', `/mp/bluff/${id}`)).raw;
      for (const c of dealt.deck) expect(raw).not.toContain(c.real);
      // the lobby's own settings never hold the deck
      const settings = await pool.query(`SELECT settings FROM game_lobbies WHERE id = $1`, [id]);
      expect(JSON.stringify(settings.rows[0].settings)).not.toContain('Bedeutung');
    });

    it('sends a fake through the free-text gate, keeps it with the move, and votes without one', async () => {
      const { host, guests, id } = await started('bluff', { language: 'en', rounds: 3, writeSeconds: 60 }, 'play');
      const [a, b] = guests as [User, User];
      const write = (who: User, text: string) => call(who, 'POST', `/mp/bluff/${id}/moves`, { kind: 'write', text });
      const vote = (who: User, option: string) => call(who, 'POST', `/mp/bluff/${id}/moves`, { kind: 'vote', option });

      expect((await write(a, 'you s.h.i.t')).body.code).toBe('TEXT_NOT_ALLOWED');
      expect((await write(a, 'x'.repeat(BLUFF_FAKE_MAX + 1))).body.code).toBe('TEXT_TOO_LONG');
      expect((await vote(a, 'A')).status).toBe(409);

      expect((await write(host, 'a small   grey bird')).status).toBe(200);
      // the others are told someone wrote, never what
      const meanwhile = await call(a, 'GET', `/mp/bluff/${id}`);
      expect(meanwhile.raw).not.toContain('grey bird');
      expect((meanwhile.body as View).board!.writtenBy).toEqual([await seatOf(id, host)]);
      expect((await write(a, 'a heavy wooden door')).status).toBe(200);
      // the same as the host's, word for word once tidied: one option, written by both
      const last = await write(b, 'A small grey bird.');
      expect(last.status).toBe(200);

      const deck = await state<Deck>(id);
      const real = deck.current.options!.find((o) => o.real)!;
      const bird = deck.current.options!.find((o) => o.text.startsWith('a small'))!;
      const door = deck.current.options!.find((o) => o.text === 'a heavy wooden door')!;
      const hostView = ((await call(host, 'GET', `/mp/bluff/${id}`)).body as View).board!;
      expect(hostView.phase).toBe('vote');
      expect(hostView.options!.map((o) => o.id)).not.toContain(bird.id);
      expect(hostView.options!.map((o) => o.id)).toEqual(expect.arrayContaining([real.id, door.id]));
      for (const o of hostView.options!) expect(Object.keys(o).sort()).toEqual(['id', 'text']);
      expect(((await call(b, 'GET', `/mp/bluff/${id}`)).body as View).board!.options!.map((o) => o.id)).not.toContain(bird.id);

      expect((await vote(host, bird.id)).status).toBe(409);
      expect((await vote(host, real.id)).status).toBe(200);
      expect((await vote(a, bird.id)).status).toBe(200);
      // a vote is hidden until everyone has voted
      const waiting = ((await call(b, 'GET', `/mp/bluff/${id}`)).body as View).board!;
      expect(waiting.reveal).toBeNull();
      expect(waiting.votedBy).toHaveLength(2);
      expect(JSON.stringify(waiting)).not.toContain('"voters":[');
      expect((await vote(b, door.id)).status).toBe(200);

      const reveal = ((await call(a, 'GET', `/mp/bluff/${id}`)).body as View).board!;
      expect(reveal.phase).toBe('reveal');
      expect(reveal.reveal).toMatchObject({ word: deck.deck[0]!.word, real: deck.deck[0]!.real });
      const score = (who: number) => reveal.scores.find((s) => s.seat === who)!.score;
      const [hs, as, bs] = [await seatOf(id, host), await seatOf(id, a), await seatOf(id, b)];
      // the host found it and fooled one; the second guest fooled one with the same bird; the first guest wrote the door
      expect(score(hs)).toBe(3);
      expect(score(bs)).toBe(1);
      expect(score(as)).toBe(1);

      const moves = await pool.query<{ text: string | null; seat: number }>(`SELECT text, seat FROM game_moves WHERE lobby_id = $1 AND kind = 'move' ORDER BY seq`, [id]);
      expect(moves.rows.map((r) => r.text)).toEqual(['a small grey bird', 'a heavy wooden door', 'A small grey bird.', null, null, null]);

      // a report names the seat and keeps what was written
      const filed = await call(host, 'POST', '/reports', { targetType: 'game_player', targetId: id, game: 'bluff', seat: as, category: 'other' });
      expect(filed.status).toBe(201);
      const evidence = await pool.query<{ evidence: { extra?: { typed?: Array<{ text: string }> } } }>(
        `SELECT evidence FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [host.id],
      );
      expect(evidence.rows[0]!.evidence.extra!.typed!.map((t) => t.text)).toEqual(['a heavy wooden door']);

      // the reveal's time up: the next word
      await expire(id, 'phaseEndsAt');
      expect(((await call(a, 'GET', `/mp/bluff/${id}`)).body as View).board).toMatchObject({ phase: 'write', round: 2 });
    });

    it('plays out on the clock and pays placement to the players who played', async () => {
      const { host, guests, id } = await started('bluff', { language: 'en', rounds: 3, writeSeconds: 60 }, 'end', 2);
      for (const who of [host, ...guests]) await call(who, 'POST', `/mp/bluff/${id}/moves`, { kind: 'write', text: `a guess by ${who.id.slice(0, 4)}` });
      for (let i = 0; i < 10 && (await pool.query(`SELECT status FROM game_lobbies WHERE id = $1`, [id])).rows[0].status !== 'finished'; i++) {
        await expire(id, 'phaseEndsAt');
      }
      const done = (await call(host, 'GET', `/mp/bluff/${id}`)).body as View;
      expect(done.status).toBe('finished');
      expect(done.board!.history).toHaveLength(3);
      const paid = await pool.query(`SELECT 1 FROM xp_ledger WHERE source = 'game_bluff_place' AND ref_id LIKE $1`, [`mp:${id}:%`]);
      expect(paid.rowCount).toBe(3);
    });

    it('is not made in a dialect without its cards', async () => {
      const me = await register('nockb');
      const r = await call(me, 'POST', '/play/lobbies', { game: 'bluff', settings: { dialect: 'ckb', language: 'en' } });
      expect(r.status).toBe(404);
    });

    it('reads a game in a fixed number of statements', async () => {
      const { host, id } = await started('bluff', { language: 'en', rounds: 3 }, 'budget', 2);
      await call(host, 'GET', `/mp/bluff/${id}`);
      const log = countQueries(app.db);
      try {
        await call(host, 'GET', `/mp/bluff/${id}`);
      } finally {
        log.stop();
      }
      // the lobby, its seats, the names, and whose fakes this viewer may not be shown
      expect(log.count, log.statements.join('\n')).toBeLessThanOrEqual(7);
    });
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
