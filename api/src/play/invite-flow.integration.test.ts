/**
 * Inviting a friend, end to end, for every game — with the settings the apps
 * send (web/src/play/InviteSheet.tsx, mobile/src/play/InviteSheet.tsx):
 * Friendly and Rated, the host making the lobby with the friend asked, the
 * friend seeing the banner and saying yes, and the game starting with both.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { dictionaryKey, isMissingRoute, letterKey, type PlayGame } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend } from '../test/social.js';
import { deleteStories, insertStory } from '../test/story-fixtures.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

const WORDS = ['malan', 'kurdi', 'rojan', 'zarok', 'aveji', 'bajar', 'welat', 'zanik'];

interface User {
  id: string;
  token: string;
}

describe.skipIf(!DATABASE_URL)('play: inviting a friend to every game (integration)', () => {
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
        email: `invf_${tag}_${suffix}@it.kurda.app`,
        username: `iv_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(years),
      },
      remoteAddress: `10.151.${Math.floor(ip / 200)}.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode).toBe(201);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  const call = async (who: User, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: '10.151.250.1',
    });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  };
  const pair = async (tag: string, years = 30): Promise<[User, User]> => {
    const host = await register(`${tag}h`, years);
    const friend = await register(`${tag}f`, years);
    await befriend(pool, host.id, friend.id);
    return [host, friend];
  };

  /** What the invite sheets send for each game (Stories as a duo of one story). */
  const settingsFor = async (game: PlayGame, rated: boolean, tag: string): Promise<Record<string, unknown>> => {
    if (game === 'wordle-battle') return { difficulty: 'medium', rated };
    if (game === 'rhyme-match') return { dialect: 'kurmanci', rated };
    const s = await insertStory(pool, { slug: `iv-${tag}-${suffix}`, questions: 6 });
    storyIds.push(s.id);
    return { mode: 'duo', storyId: s.id, questionCount: 3, timerSeconds: 0, textDuring: 'visible', access: 'friends', rated };
  };
  /** Starting the game once the friend is in, through each game's own route. */
  const start = async (game: PlayGame, host: User, lobbyId: string) => {
    if (game === 'wordle-battle') return call(host, 'POST', `/wordle/battles/${lobbyId}/start`);
    if (game === 'rhyme-match') return call(host, 'POST', `/rhyme/matches/${lobbyId}/start`);
    return call(host, 'POST', `/story-games/${lobbyId}/start`);
  };
  const started = async (game: PlayGame, lobbyId: string): Promise<boolean> => {
    const table = game === 'wordle-battle' ? 'wordle_battles' : game === 'rhyme-match' ? 'rhyme_matches' : 'story_games';
    const r = await pool.query<{ status: string }>(`SELECT status FROM ${table} WHERE id = $1`, [lobbyId]);
    return !['lobby', 'waiting', 'cancelled'].includes(r.rows[0]!.status);
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

  const GAMES: PlayGame[] = ['wordle-battle', 'rhyme-match', 'stories'];
  for (const game of GAMES) {
    for (const rated of [false, true]) {
      it(`${game}, ${rated ? 'Rated' : 'Friendly'}: the host invites a friend, the friend says yes, and the game starts`, async () => {
        const tag = `${game.slice(0, 2)}${rated ? 'r' : 'f'}`;
        const [host, friend] = await pair(tag);

        const made = await call(host, 'POST', '/play/lobbies', { game, settings: await settingsFor(game, rated, tag), invite: [friend.id] });
        expect(made.status, JSON.stringify(made.body)).toBe(201);
        expect(made.body).toMatchObject({ game, invited: 1 });
        const lobbyId = made.body.lobbyId as string;

        const incoming = (await call(friend, 'GET', '/play/invites')).body.incoming as Array<{ id: string; lobbyId: string }>;
        const invite = incoming.find((i) => i.lobbyId === lobbyId);
        expect(invite, JSON.stringify(incoming)).toBeDefined();
        const card = await call(friend, 'GET', `/play/cards/${game}/${lobbyId}`);
        expect(card.body).toMatchObject({ status: 'open', canJoin: true });

        const accepted = await call(friend, 'POST', `/play/invites/${invite!.id}/accept`);
        expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
        expect((await call(friend, 'GET', `/play/cards/${game}/${lobbyId}`)).body).toMatchObject({ isMember: true, players: 2 });

        const go = await start(game, host, lobbyId);
        expect(go.status, JSON.stringify(go.body)).toBe(200);
        expect(await started(game, lobbyId)).toBe(true);
      });
    }
  }

  it('the host invites a friend into a lobby already made, after changing it to Rated', async () => {
    for (const game of GAMES) {
      const tag = `${game.slice(0, 2)}l`;
      const [host, friend] = await pair(tag);
      const made = await call(host, 'POST', '/play/lobbies', { game, settings: await settingsFor(game, false, tag) });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      const lobbyId = made.body.lobbyId as string;
      const rated = await call(host, 'PUT', `/play/${game}/${lobbyId}/rated`, { rated: true });
      expect(rated.status, JSON.stringify(rated.body)).toBe(200);
      const asked = await call(host, 'POST', '/play/invites', { game, lobbyId, userIds: [friend.id] });
      expect(asked.body, game).toEqual({ ok: true, invited: 1 });
      const incoming = (await call(friend, 'GET', '/play/invites')).body.incoming as Array<{ id: string; lobbyId: string }>;
      const invite = incoming.find((i) => i.lobbyId === lobbyId);
      expect(invite, game).toBeDefined();
      expect((await call(friend, 'POST', `/play/invites/${invite!.id}/accept`)).status, game).toBe(200);
    }
  });

  it('two teenage friends invite each other the same way (Friendly)', async () => {
    for (const game of GAMES) {
      const tag = `${game.slice(0, 2)}t`;
      const [host, friend] = await pair(tag, 15);
      const made = await call(host, 'POST', '/play/lobbies', { game, settings: await settingsFor(game, false, tag), invite: [friend.id] });
      expect(made.status, `${game} ${JSON.stringify(made.body)}`).toBe(201);
      const incoming = (await call(friend, 'GET', '/play/invites')).body.incoming as Array<{ id: string; lobbyId: string }>;
      const invite = incoming.find((i) => i.lobbyId === made.body.lobbyId);
      expect(invite, game).toBeDefined();
      expect((await call(friend, 'POST', `/play/invites/${invite!.id}/accept`)).status, game).toBe(200);
    }
  });

  /**
   * An app talking to an API without these routes (one deployed from before
   * them) gets the not-found handler's answer, and the apps tell that from a
   * game that is gone by its words: it used to read "This game isn't available".
   */
  it('a path the API has no route for answers in the words the apps tell from a game that is gone', async () => {
    const [host] = await pair('nr');
    const missing = await call(host, 'POST', '/play/no-such-route', {});
    expect(missing.status).toBe(404);
    expect(isMissingRoute(missing.body)).toBe(true);
    // a battle the API does not know is another NOT_FOUND
    const gone = await call(host, 'GET', '/wordle/battles/00000000-0000-4000-8000-000000000000');
    expect(gone.status).toBe(404);
    expect(isMissingRoute(gone.body)).toBe(false);
  });
});
