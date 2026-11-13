/**
 * Xapînok through the routes, against real Postgres and Redis: a
 * game dealt only from approved cards, what each seat's view may and may not
 * hold (the word never in the impostor's, the impostor in nobody else's),
 * every clue and guess through the chat pipeline's gate and then the game's
 * own checks, places and placement XP, reports by seat with what was typed,
 * where the game is offered, and the admin's vocabulary picker and starter
 * word cards. And what keeps the games fair and safe: a game called off pays
 * nobody, nobody's text reaches the gate for a move that is not theirs, a
 * minor is never seated with someone who is not their friend, a block made
 * during a game parts the pair, and a report must name the lobby's own game.
 *
 * The games that are no longer part of Hevalo have a suite of their own
 * (retired-games.integration.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { IMPOSTOR_GUESS_OPTIONS, type ImpostorBoard, type ImpostorState, type MultiView } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { bustAvailability } from '../games/availability.js';
import { bustGamePools } from '../games/sources.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend } from '../test/social.js';
import { countQueries } from '../test/query-count.js';
import { removeCourses } from '../test/courses.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface User {
  id: string;
  token: string;
}

type ImpostorView = MultiView<ImpostorBoard | null>;

// stand-in Kurdish for the fixtures, never shown to a learner: harmless words for clues and guesses
const CLUES = ['heywan', 'biçûk', 'mezin', 'germ', 'sar', 'nerm', 'zû', 'dirêj', 'kesk', 'şîn', 'sor', 'spî', 'reş', 'zer', 'giran', 'sivik'];

describe.skipIf(!DATABASE_URL || !REDIS_URL)('the party games (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  // a word of letters only, unique to this run, that every card of this suite is made of
  const tag = `zq${suffix.replace(/[^a-z]/g, '')}`;
  const letters = (i: number) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
  const courseIds: string[] = [];
  let ip = 0;

  const register = async (name: string, roles = '{}', age = 30): Promise<User> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `pg_${name}_${suffix}@it.kurda.app`,
        username: `pg_${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(age),
      },
      remoteAddress: `10.152.${Math.floor(ip / 200)}.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode).toBe(201);
    await activate(app, pool, res);
    const user = { id: res.json().user.id as string, token: res.json().tokens.accessToken as string };
    if (roles !== '{}') {
      await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [user.id, roles]);
      await pass2fa(app, user.token, '10.152.250.2');
    }
    return user;
  };
  const call = async (who: User, method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: '10.152.251.1',
    });
    return { status: res.statusCode, body: res.body ? res.json() : null, raw: res.body };
  };

  /** A host and `n - 1` friends of the host in a started lobby of `game`. */
  const table = async (game: 'impostor', tagName: string, n: number, settings: Record<string, unknown> = {}, start = true) => {
    const people: User[] = [];
    for (let i = 0; i < n; i++) people.push(await register(`${tagName}${i}`));
    const [host, ...guests] = people;
    for (const g of guests) await befriend(pool, host!.id, g.id);
    const made = await call(host!, 'POST', '/play/lobbies', { game, settings: { dialect: 'kmr', difficulty: 'beginner', ...settings } });
    expect(made.status, made.raw).toBe(201);
    const id = made.body.lobbyId as string;
    for (const g of guests) expect((await call(g, 'POST', `/mp/${game}/${id}/join`)).status).toBe(200);
    if (start) expect((await call(host!, 'POST', `/mp/${game}/${id}/start`)).status).toBe(200);
    return { id, people, host: host! };
  };

  /** Who sits where, by seat. */
  const seats = async (id: string, people: User[]): Promise<Map<number, User>> => {
    const r = await pool.query<{ seat: number; user_id: string }>(`SELECT seat, user_id FROM game_lobby_players WHERE lobby_id = $1 AND user_id IS NOT NULL`, [id]);
    return new Map(r.rows.map((x) => [x.seat, people.find((p) => p.id === x.user_id)!]));
  };
  const state = async <S>(id: string): Promise<S> => (await pool.query<{ state: S }>(`SELECT state FROM game_lobbies WHERE id = $1`, [id])).rows[0]!.state;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // approved, published cards of this run: enough of each for a beginner's game in Kurmancî
    for (let i = 0; i < 14; i++) {
      const payload = {
        word: `${tag}${letters(i)}`,
        meanings: { en: `${tag} meaning ${letters(i)}` },
        category: 'things',
        hint: { ku: `${tag}kom`, meanings: { en: 'a group of things' } },
        forms: [],
      };
      await pool.query(
        `INSERT INTO game_content (kind, dialect, level, payload, status, review_status) VALUES ('word_card', 'kmr', 1, $1, 'published', 'approved')`,
        [payload],
      );
    }
    // a draft card nobody approved: never dealt
    await pool.query(`INSERT INTO game_content (kind, dialect, level, payload) VALUES ('word_card', 'kmr', 1, $1)`, [
      { word: `${tag}draftonly`, meanings: { en: 'draft' }, category: 'things', hint: { ku: `${tag}kom`, meanings: { en: 'things' } }, forms: [] },
    ]);
    for (const key of ['impostor:kmr', 'impostor:ckb']) await app.cache.del('mp-availability', key);
    await bustAvailability(app.cache);
    await bustGamePools(app.cache);
  });

  afterAll(async () => {
    // the starter import may have sorted other published words too: everything this suite's editor made goes
    await pool.query(`DELETE FROM game_content WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)`, [`%_${suffix}@it.kurda.app`]);
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
    await pool.query(`DELETE FROM game_content WHERE payload::text LIKE $1`, [`%${tag}%`]);
    await removeCourses(pool, courseIds);
    for (const key of ['impostor:kmr', 'impostor:ckb']) await app.cache.del('mp-availability', key);
    await bustAvailability(app.cache);
    await bustGamePools(app.cache);
    await pool.end();
    await app.close();
  });

  it('takes the games there are in each of the database’s lists of games', async () => {
    const defs = await pool.query<{ conrelid: string; def: string }>(
      `SELECT conrelid::regclass::text AS conrelid, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE contype = 'c' AND (conname LIKE '%_game_check' OR conname IN ('dm_messages_kind_check', 'group_messages_kind_check'))`,
    );
    expect(defs.rows.map((r) => r.conrelid)).toContain('game_lobbies');
    for (const row of defs.rows) {
      for (const g of ['impostor', 'last-letter', 'who-am-i']) expect(row.def, row.conrelid).toContain(`'${g}'`);
    }
  });

  // ---------------------------------------------------------------------------
  // Xapînok

  describe('Xapînok', () => {
    it('deals an approved card, keeps the word out of the impostor’s view and the impostor out of everyone else’s', async () => {
      const { id, people, host } = await table('impostor', 'imdeal', 4);
      const s = await state<ImpostorState>(id);
      expect(s.card.word.startsWith(tag)).toBe(true);
      expect(s.card.word).not.toContain('draftonly');
      const bySeat = await seats(id, people);
      for (const [seat, who] of bySeat) {
        const v = await call(who, 'GET', `/mp/impostor/${id}`);
        expect(v.status).toBe(200);
        const board = (v.body as ImpostorView).board!;
        expect(board.hint.ku).toBe(`${tag}kom`);
        expect(board.reveal).toBeNull();
        expect(board.accused).toBeNull();
        if (seat === s.impostor) {
          expect(board.hand).toEqual({ role: 'impostor' });
          for (const hidden of [...s.options, s.card.meanings.en]) expect(v.raw).not.toContain(hidden);
        } else {
          expect(board.hand).toEqual({ role: 'player', word: s.card.word, meanings: s.card.meanings });
          expect(v.raw).not.toContain('"role":"impostor"');
          expect(v.raw).not.toMatch(/"impostor":\d/);
          // the other options are not the table's business before a guess
          for (const decoy of s.options.filter((o) => o !== s.card.word)) expect(v.raw).not.toContain(decoy);
        }
      }
      // the deal is the game's alone: not in the lobby's stored settings, its chat card or its link
      const lobby = await pool.query<{ settings: unknown; code: string | null }>(`SELECT settings, code FROM game_lobbies WHERE id = $1`, [id]);
      expect(JSON.stringify(lobby.rows[0]!.settings)).not.toContain(tag);
      const card = await call(host, 'GET', `/play/cards/impostor/${id}`);
      expect(card.raw).not.toContain(s.card.word);
    });

    it('takes a clue only through the free-text gate, then refuses one that says the word, is too long or in the wrong script', async () => {
      const { id, people } = await table('impostor', 'imclue', 4);
      const bySeat = await seats(id, people);
      let s = await state<ImpostorState>(id);
      // a speaker who holds the word: the impostor's first clue, if it is theirs, is a plain one
      if (s.turn!.seat === s.impostor) {
        expect((await call(bySeat.get(s.turn!.seat)!, 'POST', `/mp/impostor/${id}/moves`, { clue: CLUES[0] })).status).toBe(200);
        s = await state<ImpostorState>(id);
      }
      const speaker = bySeat.get(s.turn!.seat)!;
      const other = [...bySeat.values()].find((u) => u !== speaker)!;
      const move = (who: User, clue: string) => call(who, 'POST', `/mp/impostor/${id}/moves`, { clue });

      const profane = await move(speaker, 'qûn');
      expect(profane.status).toBe(422);
      expect(profane.body.code).toBe('TEXT_NOT_ALLOWED');
      expect((await move(speaker, 'a'.repeat(41))).body.code).toBe('TEXT_TOO_LONG');
      const says = await move(speaker, `${s.card.word}a`);
      expect(says.status).toBe(409);
      expect(says.body).toMatchObject({ code: 'MOVE_REFUSED', details: { reason: 'says-word' } });
      expect((await move(speaker, 'گیانلەبەر')).body.details).toMatchObject({ reason: 'script' });
      expect((await move(other, 'heywanek')).body.code).toBe('NOT_YOUR_TURN');
      // the turn is checked before the text goes anywhere: out of turn, even a word the filter refuses is only not your turn
      expect((await move(other, 'qûn')).body.code).toBe('NOT_YOUR_TURN');
      // and someone not in the game is told it does not exist, whatever they typed
      const outsider = await register('imclueout');
      expect((await move(outsider, 'qûn')).status).toBe(404);
      // nothing refused was kept, or shown
      const before = await pool.query(`SELECT count(*)::int AS n FROM game_moves WHERE lobby_id = $1`, [id]);

      const ok = await move(speaker, 'heywanekî biçûk');
      expect(ok.status, ok.raw).toBe(200);
      const theirs = await call(other, 'GET', `/mp/impostor/${id}`);
      expect((theirs.body as ImpostorView).board!.clues.some((c) => c.text === 'heywanekî biçûk')).toBe(true);
      expect(theirs.raw).not.toContain('qûn');
      const kept = await pool.query<{ text: string }>(`SELECT text FROM game_moves WHERE lobby_id = $1 ORDER BY seq DESC LIMIT 1`, [id]);
      expect(kept.rows[0]!.text).toBe('heywanekî biçûk');
      expect((await pool.query(`SELECT count(*)::int AS n FROM game_moves WHERE lobby_id = $1`, [id])).rows[0].n).toBe(before.rows[0].n + 1);
    });

    it('plays two rounds of clues, the vote and the caught impostor’s guess to the reveal, and pays placement', async () => {
      const { id, people } = await table('impostor', 'implay', 4);
      const bySeat = await seats(id, people);
      let s = await state<ImpostorState>(id);
      let i = 0;
      while (s.phase === 'clues') {
        const r = await call(bySeat.get(s.turn!.seat)!, 'POST', `/mp/impostor/${id}/moves`, { clue: CLUES[i++] });
        expect(r.status, r.raw).toBe(200);
        s = await state<ImpostorState>(id);
      }
      expect(s.phase).toBe('vote');
      // how anyone voted stays hidden until the reveal
      const innocent = [...bySeat.keys()].find((x) => x !== s.impostor)!;
      for (const [seat, who] of bySeat) {
        const r = await call(who, 'POST', `/mp/impostor/${id}/moves`, { vote: seat === s.impostor ? innocent : s.impostor });
        expect(r.status, r.raw).toBe(200);
        if (seat !== s.impostor && (r.body.view as ImpostorView).board!.phase === 'vote') expect(r.raw).not.toMatch(/"for":/);
      }
      s = await state<ImpostorState>(id);
      expect(s.phase).toBe('guess');
      const impostor = bySeat.get(s.impostor)!;
      const guessing = (await call(impostor, 'GET', `/mp/impostor/${id}`)).body as ImpostorView;
      expect(guessing.board!.yourGuess).toBe(true);
      expect(guessing.board!.guess!.options).toHaveLength(4);
      const wrong = guessing.board!.guess!.options.findIndex((o) => o !== s.card.word);
      expect((await call(impostor, 'POST', `/mp/impostor/${id}/moves`, { guess: wrong })).status).toBe(200);

      const done = (await call(bySeat.get(innocent)!, 'GET', `/mp/impostor/${id}`)).body as ImpostorView;
      expect(done.status).toBe('finished');
      expect(done.board!.reveal).toMatchObject({ impostor: s.impostor, word: s.card.word, meanings: s.card.meanings, caught: true, guessedRight: false });
      expect(done.board!.clues).toHaveLength(8);
      expect(done.results!.find((r) => r.seat === s.impostor)!.place).toBe(4);
      const xp = await pool.query(`SELECT count(*)::int AS n FROM xp_ledger WHERE source = 'game_impostor_place' AND ref_id LIKE $1`, [`mp:${id}:%`]);
      expect(xp.rows[0].n).toBe(4);
    });

    it('reports a player by seat with the clues they typed', async () => {
      const { id, people } = await table('impostor', 'imrep', 3);
      const bySeat = await seats(id, people);
      const s = await state<ImpostorState>(id);
      const speaker = bySeat.get(s.turn!.seat)!;
      await call(speaker, 'POST', `/mp/impostor/${id}/moves`, { clue: 'gelek germ' });
      const reporter = [...bySeat.values()].find((u) => u !== speaker)!;
      const filed = await call(reporter, 'POST', '/reports', { targetType: 'game_player', targetId: id, game: 'impostor', seat: s.turn!.seat, category: 'other' });
      expect(filed.status).toBe(201);
      const evidence = await pool.query<{ evidence: { extra?: { typed?: Array<{ text: string }> } } }>(
        `SELECT evidence FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [reporter.id],
      );
      expect(evidence.rows[0]!.evidence.extra!.typed!.map((t) => t.text)).toEqual(['gelek germ']);
    });

    it('says where it is offered, and makes no lobby at a difficulty without enough approved cards', async () => {
      const me = await register('imav');
      const r = await call(me, 'GET', '/mp/impostor/availability');
      expect(r.body.dialects.find((d: { dialect: string }) => d.dialect === 'kmr')).toEqual({ dialect: 'kmr', group: true, solo: false });
      const listed = await call(me, 'GET', '/games/availability?dialect=kmr');
      expect(listed.body.games.find((g: { id: string }) => g.id === 'impostor')).toMatchObject({ available: true });
      const hard = await call(me, 'POST', '/play/lobbies', { game: 'impostor', settings: { dialect: 'kmr', difficulty: 'advanced' } });
      expect(hard.status).toBe(404);
      expect(hard.body.code).toBe('GAME_UNAVAILABLE');
    });

    it('draws the word from the category the host chose, and makes no lobby for a category without enough cards', async () => {
      const chosen = `${tag}-kat`;
      const lone = `${tag}-yek`;
      const add = async (word: string, category: string): Promise<void> => {
        await pool.query(`INSERT INTO game_content (kind, dialect, level, payload, status, review_status) VALUES ('word_card', 'kmr', 1, $1, 'published', 'approved')`, [
          { word, meanings: { en: `${word} meaning` }, category, hint: { ku: `${tag}kom`, meanings: { en: 'a group of things' } }, forms: [] },
        ]);
      };
      for (let i = 0; i < IMPOSTOR_GUESS_OPTIONS; i++) await add(`${tag}kat${letters(i)}`, chosen);
      await add(`${tag}yekane`, lone);
      await bustAvailability(app.cache);
      await bustGamePools(app.cache);

      const { id, host } = await table('impostor', 'imcat', 3, { category: chosen, clueSeconds: 60 });
      const s = await state<ImpostorState>(id);
      expect(s.card.word.startsWith(`${tag}kat`)).toBe(true);
      expect(s.options.every((o) => o.startsWith(`${tag}kat`))).toBe(true);
      expect(s.clueMs).toBe(60_000);
      // the lobby says which category it plays in, by its slug; the word is still nobody's to read
      const view = await call(host, 'GET', `/mp/impostor/${id}`);
      expect((view.body as ImpostorView).settings).toMatchObject({ category: chosen, clueSeconds: 60 });

      const me = await register('imcatno');
      const few = await call(me, 'POST', '/play/lobbies', { game: 'impostor', settings: { dialect: 'kmr', difficulty: 'beginner', category: lone } });
      expect(few.status).toBe(404);
      expect(few.body.code).toBe('GAME_UNAVAILABLE');
      // a category of another level’s cards is not this lobby’s to play in either
      expect((await call(me, 'POST', '/play/lobbies', { game: 'impostor', settings: { dialect: 'kmr', difficulty: 'advanced', category: chosen } })).status).toBe(404);
      expect((await call(me, 'POST', '/play/lobbies', { game: 'impostor', settings: { dialect: 'kmr', difficulty: 'beginner', category: 'Not A Slug' } })).status).toBe(400);
    });

    it('reads a game in a fixed number of statements', async () => {
      const { id, host } = await table('impostor', 'imbud', 3);
      await call(host, 'GET', `/mp/impostor/${id}`);
      const log = countQueries(app.db);
      try {
        await call(host, 'GET', `/mp/impostor/${id}`);
      } finally {
        log.stop();
      }
      // the lobby, its seats, the names, and whose text this viewer may not be shown
      expect(log.count, log.statements.join('\n')).toBeLessThanOrEqual(7);
    });

    it('pays nobody and rates nobody for a game called off with too few left', async () => {
      const { id, people } = await table('impostor', 'imvoid', 3);
      const bySeat = await seats(id, people);
      let s = await state<ImpostorState>(id);
      for (let i = 0; i < 2; i++) {
        expect((await call(bySeat.get(s.turn!.seat)!, 'POST', `/mp/impostor/${id}/moves`, { clue: CLUES[i] })).status).toBe(200);
        s = await state<ImpostorState>(id);
      }
      // whoever leaves, three less one is too few, or the impostor gone: either way nobody played it out
      const leaver = bySeat.get(s.turn!.seat)!;
      expect((await call(leaver, 'POST', `/mp/impostor/${id}/leave`)).status).toBe(200);
      const stayer = [...bySeat.values()].find((u) => u !== leaver)!;
      const done = (await call(stayer, 'GET', `/mp/impostor/${id}`)).body as ImpostorView;
      expect(done.status).toBe('finished');
      expect(['too-few', 'impostor-left']).toContain(done.board!.endedBy);
      const xp = await pool.query(`SELECT count(*)::int AS n FROM xp_ledger WHERE ref_id LIKE $1`, [`mp:${id}:%`]);
      expect(xp.rows[0].n).toBe(0);
      expect(done.results!.every((r) => !r.xpAwarded)).toBe(true);
      const rated = await pool.query<{ applied_at: Date | null; outcome: string | null }>(`SELECT applied_at, outcome FROM rated_games WHERE game = 'impostor' AND game_ref = $1`, [id]);
      for (const r of rated.rows) expect(r).toMatchObject({ outcome: 'void', applied_at: expect.any(Date) });
      expect((await pool.query(`SELECT 1 FROM rating_events WHERE game = 'impostor' AND game_ref = $1 AND kind = 'game'`, [id])).rowCount).toBe(0);
    });

    it('seats a minor only with their friends, either way round', async () => {
      const host = await register('imkidhost');
      const child = await register('imkid', '{}', 15);
      const stranger = await register('imkidstr');
      const third = await register('imkidthird');
      for (const u of [child, stranger, third]) await befriend(pool, host.id, u.id);
      const made = await call(host, 'POST', '/play/lobbies', { game: 'impostor', settings: { dialect: 'kmr', difficulty: 'beginner' } });
      const id = made.body.lobbyId as string;
      expect((await call(child, 'POST', `/mp/impostor/${id}/join`)).status).toBe(200);
      // the host's friend, but a stranger to the child at the table
      expect((await call(stranger, 'POST', `/mp/impostor/${id}/join`)).status).toBe(404);
      expect((await call(stranger, 'GET', `/mp/impostor/${id}`)).status).toBe(404);
      await befriend(pool, stranger.id, child.id);
      expect((await call(stranger, 'POST', `/mp/impostor/${id}/join`)).status).toBe(200);
      // the other way round: a child is not seated among strangers either
      const lobby2 = (await call(third, 'POST', '/play/lobbies', { game: 'impostor', settings: { dialect: 'kmr', difficulty: 'beginner' } })).body.lobbyId as string;
      const thirdsFriend = await register('imkidtf');
      await befriend(pool, third.id, thirdsFriend.id);
      await befriend(pool, third.id, child.id);
      expect((await call(thirdsFriend, 'POST', `/mp/impostor/${lobby2}/join`)).status).toBe(200);
      expect((await call(child, 'POST', `/mp/impostor/${lobby2}/join`)).status).toBe(404);
    });

    it('takes a blocked player out of a game of free text, and hides their clues from the one who blocked them', async () => {
      const { id, people } = await table('impostor', 'imblk', 4);
      const bySeat = await seats(id, people);
      let s = await state<ImpostorState>(id);
      const spoke = s.turn!.seat;
      expect((await call(bySeat.get(spoke)!, 'POST', `/mp/impostor/${id}/moves`, { clue: CLUES[0] })).status).toBe(200);
      s = await state<ImpostorState>(id);
      const blocker = [...bySeat.entries()].find(([seat]) => seat !== spoke)!;
      const bystander = [...bySeat.entries()].find(([seat]) => seat !== spoke && seat !== blocker[0])!;
      expect((await call(blocker[1], 'POST', `/friends/${bySeat.get(spoke)!.id}/block`)).status).toBe(200);
      // the blocked player is out of it: the game is nothing more to them
      expect((await call(bySeat.get(spoke)!, 'GET', `/mp/impostor/${id}`)).status).toBe(404);
      const seated = await pool.query<{ removed: boolean; left: boolean }>(`SELECT removed, left_at IS NOT NULL AS left FROM game_lobby_players WHERE lobby_id = $1 AND seat = $2`, [id, spoke]);
      expect(seated.rows[0]).toEqual({ removed: true, left: true });
      // the one who blocked them no longer reads what they wrote; everyone else still does
      const mine = (await call(blocker[1], 'GET', `/mp/impostor/${id}`)).body as ImpostorView;
      expect(mine.board!.clues.filter((c) => c.seat === spoke).every((c) => c.text === null)).toBe(true);
      const theirs = (await call(bystander[1], 'GET', `/mp/impostor/${id}`)).body as ImpostorView;
      expect(theirs.board!.clues.find((c) => c.seat === spoke)?.text).toBe(CLUES[0]);
      // and nobody is paid or rated for a seat taken out
      expect((await pool.query(`SELECT 1 FROM rated_leaves WHERE game = 'impostor' AND game_ref = $1`, [id])).rowCount).toBe(0);
    });

    it('takes a report by seat only under the lobby’s own game', async () => {
      const { id, people } = await table('impostor', 'imrepg', 3);
      const bySeat = await seats(id, people);
      const reporter = [...bySeat.values()][0]!;
      const seat = [...bySeat.keys()].find((x) => bySeat.get(x) !== reporter)!;
      const wrong = await call(reporter, 'POST', '/reports', { targetType: 'game_player', targetId: id, game: 'who-am-i', seat, category: 'other' });
      expect(wrong.status).toBe(404);
      expect((await call(reporter, 'POST', '/reports', { targetType: 'game_player', targetId: id, game: 'impostor', seat, category: 'other' })).status).toBe(201);
    });
  });

  // ---------------------------------------------------------------------------
  // the admin's cards

  describe('the cards in the admin', () => {
    it('picks a card’s Kurdish from published vocabulary, and imports starter word cards as drafts for review', async () => {
      const repo = new ContentRepository(pool);
      const course = await repo.createCourse({ slug: `party-${suffix}`, dialect: 'kurmanji', titleKu: 'P', titleEn: 'Party' });
      courseIds.push(course);
      const unit = await repo.createUnit(course, 1, 'Y', 'Unit');
      const skill = await repo.createSkill(unit, 1, 'S', 'Skill');
      const lesson = await repo.createLesson(skill, 1, 'D', 'Words');
      await repo.addExercise(lesson, 1, 'match_pairs', {
        pairs: [
          { left: `${tag}pisik`, right: 'cat' },
          { left: `${tag}kucik`, right: 'the dog' },
          { left: `${tag}rev`, right: 'to run' },
          { left: `${tag}lewra`, right: 'because' },
          // the category's own name, taught as a word: never a card of that category
          { left: 'heywan', right: 'cat, animal' },
        ],
      });
      await repo.publishLesson(lesson);
      await bustGamePools(app.cache);

      const editor = await register('dseditor', '{content_editor}');
      const picked = await call(editor, 'GET', `/admin/game-content/vocabulary?dialect=kmr&q=${tag}`);
      expect(picked.status, picked.raw).toBe(200);
      expect(picked.body.words.map((w: { ku: string }) => w.ku).sort()).toEqual([`${tag}kucik`, `${tag}lewra`, `${tag}pisik`, `${tag}rev`]);

      const imported = await call(editor, 'POST', '/admin/game-content/import', { from: 'vocabulary', dialect: 'kmr' });
      expect(imported.status, imported.raw).toBe(200);
      const rows = await pool.query<{ kind: string; status: string; review_status: string; source: string; payload: { word?: string; category?: string; hint?: { ku: string } } }>(
        `SELECT kind, status, review_status, source, payload FROM game_content WHERE kind = 'word_card' AND payload->>'word' LIKE $1`,
        [`${tag}%`],
      );
      const starters = rows.rows.filter((r) => r.source === 'starter');
      // a word no category takes ("because") makes no card; a verb goes among the verbs
      expect(starters.map((r) => r.payload.word).sort()).toEqual([`${tag}kucik`, `${tag}pisik`, `${tag}rev`]);
      for (const r of starters) {
        const verb = r.payload.word === `${tag}rev`;
        expect(r).toMatchObject({
          status: 'draft',
          review_status: 'unreviewed',
          payload: verb ? { category: 'actions', hint: { ku: 'lêker' } } : { category: 'animals', hint: { ku: 'heywan' } },
        });
      }
      const ownName = await pool.query(`SELECT 1 FROM game_content WHERE kind = 'word_card' AND payload->>'word' = 'heywan' AND created_by = $1`, [editor.id]);
      expect(ownName.rowCount).toBe(0);
      // an import run twice adds nothing
      const again = await call(editor, 'POST', '/admin/game-content/import', { from: 'vocabulary', dialect: 'kmr' });
      expect(again.body.created).toBe(0);
      // a learner is never dealt a starter draft, and the admin answers them as a route that is not there
      const learner = await register('dslearner');
      expect((await call(learner, 'GET', `/admin/game-content/vocabulary?dialect=kmr`)).status).toBe(404);
    });
  });
});
