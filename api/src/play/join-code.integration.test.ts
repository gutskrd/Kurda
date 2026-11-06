/**
 * Joining a game by its code, for every game: every lobby has a code, one
 * route takes the code of any game, the join rule decides as for an invite,
 * and a code is gone once its game starts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { JOIN_CODE_ALPHABET, dictionaryKey, letterKey, type PlayGame } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend } from '../test/social.js';
import { deleteStories, insertStory } from '../test/story-fixtures.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

const WORDS = ['malan', 'kurdi', 'rojan', 'zarok', 'aveji', 'bajar', 'welat', 'zanik'];
const GAMES: PlayGame[] = ['wordle-battle', 'rhyme-match', 'stories'];

interface User {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('play: joining a game by its code (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const entryIds: string[] = [];
  const storyIds: string[] = [];
  let ip = 0;

  const register = async (tag: string, years = 30): Promise<User> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `jcode_${tag}_${suffix}@it.kurda.app`,
        username: `jc_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(years),
      },
      remoteAddress: `10.152.${Math.floor(ip / 200)}.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode).toBe(201);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  // each caller from its own address, so ten tries a minute is ten per person here
  const call = async (who: User, method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: `10.152.251.${(Number.parseInt(who.id.slice(0, 2), 16) % 250) + 1}`,
    });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  };

  const settingsFor = async (game: PlayGame, tag: string): Promise<Record<string, unknown>> => {
    if (game === 'wordle-battle') return { difficulty: 'medium' };
    if (game === 'rhyme-match') return { dialect: 'kurmanci' };
    const s = await insertStory(pool, { slug: `jc-${tag}-${suffix}`, questions: 6 });
    storyIds.push(s.id);
    return { mode: 'duo', storyId: s.id, questionCount: 3, timerSeconds: 0, textDuring: 'visible', access: 'friends' };
  };
  /** The lobby as its member sees it, through the game's own route: where the apps read the code. */
  const view = async (game: PlayGame, who: User, lobbyId: string) => {
    if (game === 'wordle-battle') return (await call(who, 'GET', `/wordle/battles/${lobbyId}`)).body as { code: string | null };
    if (game === 'rhyme-match') return (await call(who, 'GET', `/rhyme/matches/${lobbyId}`)).body as { code: string | null };
    return (await call(who, 'GET', `/story-games/${lobbyId}`)).body as { code: string | null };
  };
  const start = async (game: PlayGame, host: User, lobbyId: string) => {
    if (game === 'wordle-battle') return call(host, 'POST', `/wordle/battles/${lobbyId}/start`);
    if (game === 'rhyme-match') return call(host, 'POST', `/rhyme/matches/${lobbyId}/start`);
    return call(host, 'POST', `/story-games/${lobbyId}/start`);
  };
  const lobby = async (game: PlayGame, host: User, tag: string): Promise<{ lobbyId: string; code: string }> => {
    const made = await call(host, 'POST', '/play/lobbies', { game, settings: await settingsFor(game, tag) });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const lobbyId = made.body.lobbyId as string;
    const { code } = await view(game, host, lobbyId);
    expect(code, game).toMatch(new RegExp(`^[${JOIN_CODE_ALPHABET}]{6}$`));
    return { lobbyId, code: code! };
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
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
    await deleteStories(pool, storyIds);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
    await app.close();
  });

  for (const game of GAMES) {
    it(`${game}: a friend types the code, however they type it, and is in; the code is gone once the game starts`, async () => {
      const tag = `${game.slice(0, 2)}j`;
      const host = await register(`${tag}h`);
      const friend = await register(`${tag}f`);
      await befriend(pool, host.id, friend.id);
      const { lobbyId, code } = await lobby(game, host, tag);

      // lower case, a space in the middle, as read out over the phone
      const typed = `${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`;
      const joined = await call(friend, 'POST', '/play/join', { code: typed });
      expect(joined.status, JSON.stringify(joined.body)).toBe(200);
      expect(joined.body).toEqual({ game, lobbyId });
      expect((await call(friend, 'GET', `/play/cards/${game}/${lobbyId}`)).body).toMatchObject({ isMember: true, players: 2 });
      // the friend sees the same code in the lobby, and typing it again is the same yes
      expect((await view(game, friend, lobbyId)).code).toBe(code);
      expect((await call(friend, 'POST', '/play/join', { code })).body).toEqual({ game, lobbyId });

      const go = await start(game, host, lobbyId);
      expect(go.status, JSON.stringify(go.body)).toBe(200);
      if (game !== 'stories') {
        // a battle or match leaves the lobby at once: its code goes with it
        expect((await view(game, host, lobbyId)).code).toBeNull();
        const late = await register(`${tag}l`);
        await befriend(pool, host.id, late.id);
        const tooLate = await call(late, 'POST', '/play/join', { code });
        expect(tooLate.status).toBe(404);
        expect(tooLate.body.code).toBe('GAME_NOT_FOUND');
      }
    });
  }

  it('a stranger with the code of a friends game is told the same as for a code nobody uses', async () => {
    for (const game of GAMES) {
      const tag = `${game.slice(0, 2)}s`;
      const host = await register(`${tag}h`);
      const stranger = await register(`${tag}x`);
      const { lobbyId, code } = await lobby(game, host, tag);
      const refused = await call(stranger, 'POST', '/play/join', { code });
      expect(refused.status, game).toBe(404);
      expect(refused.body.code, game).toBe('GAME_NOT_FOUND');
      expect((await call(host, 'GET', `/play/cards/${game}/${lobbyId}`)).body, game).toMatchObject({ players: 1 });
    }
    const someone = await register('nobody');
    for (const code of ['ZZZZZZ', 'abc', '0O1IL0', '']) {
      const res = await call(someone, 'POST', '/play/join', { code });
      expect([400, 404], code).toContain(res.status);
    }
  });

  it('no two open lobbies share a code, whichever game they are', async () => {
    const host = await register('many');
    const codes: string[] = [];
    for (const game of GAMES) codes.push((await lobby(game, host, `${game.slice(0, 2)}m`)).code);
    expect(new Set(codes).size).toBe(codes.length);
    const used = await pool.query<{ code: string; n: string }>(
      `SELECT code, count(*) AS n FROM (
         SELECT code FROM wordle_battles WHERE code IS NOT NULL
         UNION ALL SELECT code FROM rhyme_matches WHERE code IS NOT NULL
         UNION ALL SELECT code FROM story_games WHERE code IS NOT NULL) c
       GROUP BY code HAVING count(*) > 1`,
    );
    expect(used.rows).toEqual([]);
  });

  it('a full lobby says so', async () => {
    const host = await register('fullh');
    const made = await call(host, 'POST', '/play/lobbies', { game: 'wordle-battle', settings: { difficulty: 'easy', maxPlayers: 2 } });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const { code } = await view('wordle-battle', host, made.body.lobbyId as string);
    const first = await register('fulla');
    const second = await register('fullb');
    await befriend(pool, host.id, first.id);
    await befriend(pool, host.id, second.id);
    expect((await call(first, 'POST', '/play/join', { code })).status).toBe(200);
    const full = await call(second, 'POST', '/play/join', { code });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('GAME_FULL');
  });
});
