/**
 * The games that are no longer part of Hevalo, against real Postgres and
 * Redis: Don't Say the Word!, Kurdish Bluff and The Village.
 *
 * Two promises are kept here. Nothing starts one: every route that takes a
 * game's name refuses theirs, and the village's routes are gone. And what was
 * stored while they were played is never in the way: a lobby, an invitation,
 * a join code or a card written for one of them stays in the database, is
 * answered as something that is not there, and is passed over by the timers,
 * the sweep and every list, so the games there are go on untouched. The
 * migration that calls the open ones off is run here as it is written.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { GamesAvailability, InviteLists } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { exportProgress } from '../gdpr/progress-export.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend } from '../test/social.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface User {
  id: string;
  token: string;
}

const RETIRED = ['dont-say', 'bluff'] as const;
const NOWHERE = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!DATABASE_URL || !REDIS_URL)('the games that are no longer part of Hevalo (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  // a word of letters only, unique to this run, that every row of this suite's content is made of
  const tag = `zr${suffix.replace(/[^a-z]/g, '')}`;
  let ip = 0;
  let host: User;
  let friend: User;
  let third: User;

  const register = async (name: string, roles = '{}'): Promise<User> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rg_${name}_${suffix}@it.kurda.app`,
        username: `rg_${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(30),
      },
      remoteAddress: `10.157.${Math.floor(ip / 200)}.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode).toBe(201);
    await activate(app, pool, res);
    const user = { id: res.json().user.id as string, token: res.json().tokens.accessToken as string };
    if (roles !== '{}') {
      await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [user.id, roles]);
      await pass2fa(app, user.token, '10.157.250.2');
    }
    return user;
  };
  const call = async (who: User, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: '10.157.251.1',
    });
    return { status: res.statusCode, body: res.body ? res.json() : null, raw: res.body };
  };

  /** A lobby as one was stored while the game was played, with the three of them seated in it. */
  const stored = async (game: string, status: 'lobby' | 'active' | 'finished'): Promise<string> => {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO game_lobbies (game, host_id, mode, status, dialect, settings, state, min_players, max_players, seats_issued,
                                 started_at, finished_at, due_at)
       VALUES ($1, $2, 'group', $3, 'kmr', '{}', $4, 3, 8, 3,
               CASE WHEN $3 = 'lobby' THEN NULL ELSE now() - interval '10 minutes' END,
               CASE WHEN $3 = 'finished' THEN now() - interval '5 minutes' ELSE NULL END,
               CASE WHEN $3 = 'active' THEN now() - interval '1 minute' ELSE NULL END)
       RETURNING id`,
      [game, host.id, status, status === 'lobby' ? null : JSON.stringify({ phase: 'play' })],
    );
    const id = row.rows[0]!.id;
    for (const [i, who] of [host, friend, third].entries()) {
      await pool.query(`INSERT INTO game_lobby_players (lobby_id, seat, user_id, place, score) VALUES ($1, $2, $3, $4, $5)`, [
        id,
        i + 1,
        who.id,
        status === 'finished' ? i + 1 : null,
        status === 'finished' ? 3 - i : null,
      ]);
    }
    return id;
  };
  const lobby = async (id: string) =>
    (await pool.query<{ status: string; version: number; code: string | null; finished_at: Date | null }>(`SELECT status, version, code, finished_at FROM game_lobbies WHERE id = $1`, [id])).rows[0]!;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    host = await register('host');
    friend = await register('friend');
    third = await register('third');
    await befriend(pool, host.id, friend.id);
    await befriend(pool, host.id, third.id);
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
    await pool.query(`DELETE FROM game_content WHERE payload::text LIKE $1`, [`%${tag}%`]);
    await pool.end();
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // nothing starts one

  describe('starting one', () => {
    it('makes no lobby of Don’t Say the Word! or Kurdish Bluff, with friends or against Hevalo', async () => {
      for (const game of RETIRED) {
        const made = await call(host, 'POST', '/play/lobbies', { game, settings: { dialect: 'kmr', difficulty: 'beginner' } });
        expect(made.status, `${game}: ${made.raw}`).toBe(400);
        expect((await call(host, 'POST', `/mp/${game}/solo`, { dialect: 'kmr' })).status).toBe(400);
        expect((await call(host, 'GET', `/mp/${game}/availability?dialect=kmr`)).status).toBe(400);
        expect((await call(host, 'POST', '/play/invites', { game, lobbyId: NOWHERE, userIds: [friend.id] })).status).toBe(400);
        expect((await call(host, 'GET', `/play/cards/${game}/${NOWHERE}`)).status).toBe(400);
        expect((await call(host, 'GET', `/ranks/${game}/board`)).status).toBeGreaterThanOrEqual(400);
        expect((await call(host, 'GET', `/ranks/${game}/board`)).status).toBeLessThan(500);
      }
      const rows = await pool.query(`SELECT 1 FROM game_lobbies WHERE host_id = $1`, [host.id]);
      expect(rows.rowCount).toBe(0);
    });

    it('takes no report under the name of one', async () => {
      for (const game of RETIRED) {
        const res = await call(host, 'POST', '/reports', { targetType: 'game_player', targetId: NOWHERE, game, seat: 1, category: 'other' });
        expect(res.status).toBe(400);
      }
    });

    it('has no village: its routes are gone, and no round of a solo game can be asked for under its name', async () => {
      expect((await call(host, 'GET', '/kingdom')).status).toBe(404);
      expect((await call(host, 'POST', '/kingdom/seen', { levels: [] })).status).toBe(404);
      for (const game of ['kingdom', ...RETIRED]) {
        expect((await call(host, 'POST', '/games/solo/sessions', { game, dialect: 'kmr', difficulty: 'beginner' })).status).toBe(400);
      }
    });

    it('lists none of the three among what can be played, and still counts the lessons’ two exercises', async () => {
      const res = await call(host, 'GET', '/games/availability?dialect=kmr');
      expect(res.status, res.raw).toBe(200);
      const ids = (res.body as GamesAvailability).games.map((g) => g.id as string);
      for (const gone of ['kingdom', ...RETIRED]) expect(ids).not.toContain(gone);
      expect(ids).toEqual(expect.arrayContaining(['build-sentence', 'hear-it', 'impostor', 'who-am-i', 'last-letter']));
    });
  });

  // ---------------------------------------------------------------------------
  // what was stored while they were played

  describe('a game stored while one was played', () => {
    it('is not there for any route, whichever game the address names', async () => {
      const id = await stored('dont-say', 'active');
      for (const game of ['impostor', 'last-letter', 'who-am-i']) {
        expect((await call(host, 'GET', `/mp/${game}/${id}`)).status).toBe(404);
        expect((await call(host, 'GET', `/mp/${game}/${id}?v=0`)).status).toBe(404);
        expect((await call(host, 'POST', `/mp/${game}/${id}/moves`, { clue: 'heywan' })).status).toBe(404);
        expect((await call(host, 'POST', `/mp/${game}/${id}/start`)).status).toBe(404);
        expect((await call(host, 'POST', `/mp/${game}/${id}/leave`)).status).toBe(404);
        expect((await call(host, 'POST', `/mp/${game}/${id}/remove`, { seat: 2 })).status).toBe(404);
        expect((await call(host, 'POST', `/mp/${game}/${id}/team`, { seat: 2, team: 1 })).status).toBe(404);
        const card = await call(friend, 'GET', `/play/cards/${game}/${id}`);
        expect(card.status).toBe(200);
        expect(card.body).toMatchObject({ status: 'unavailable', canJoin: false, isMember: false });
        expect((await call(host, 'GET', `/play/${game}/${id}/rematch`)).status).toBe(404);
      }
      const outsider = await register('outsider');
      expect((await call(outsider, 'POST', `/mp/impostor/${id}/join`)).status).toBe(404);
      // and nothing about it moved
      expect(await lobby(id)).toMatchObject({ status: 'active', version: 0 });
    });

    it('is passed over by the timers and the sweep, which go on with the games there are', async () => {
      const id = await stored('bluff', 'active');
      // its deadline passed long ago: nothing advances it, and no timer is left armed for it
      await expect(app.multiplayer.advance(id)).resolves.toBeUndefined();
      expect(app.multiplayer.armedAt(id)).toBeNull();
      for (const game of ['impostor', 'last-letter', 'who-am-i'] as const) await expect(app.multiplayer.sweep(game)).resolves.toBeUndefined();
      await expect(app.multiplayer.housekeeping()).resolves.toBeDefined();
      expect(await lobby(id)).toMatchObject({ status: 'active', version: 0 });
    });

    it('does not trip an account leaving its games, or a block between two who sat in it', async () => {
      const id = await stored('dont-say', 'lobby');
      await expect(app.multiplayer.leaveAll(third.id)).resolves.toBeUndefined();
      await expect(app.multiplayer.onBlock(friend.id, third.id)).resolves.toBeUndefined();
      const seats = await pool.query(`SELECT 1 FROM game_lobby_players WHERE lobby_id = $1 AND left_at IS NULL AND NOT removed`, [id]);
      expect(seats.rowCount).toBe(3);
      expect(await lobby(id)).toMatchObject({ status: 'lobby', version: 0 });
    });

    it('joins nobody by the code it still holds', async () => {
      const id = await stored('bluff', 'lobby');
      const { code } = await lobby(id);
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      const outsider = await register('coder');
      await befriend(pool, host.id, outsider.id);
      const res = await call(outsider, 'POST', '/play/join', { code });
      expect(res.status).toBe(404);
      const seats = await pool.query(`SELECT 1 FROM game_lobby_players WHERE lobby_id = $1 AND user_id = $2`, [id, outsider.id]);
      expect(seats.rowCount).toBe(0);
    });

    it('ends an invitation to it when the invitation is listed or answered, and shows the host none', async () => {
      const id = await stored('dont-say', 'lobby');
      const invite = async (game: string, to: User): Promise<string> =>
        (
          await pool.query<{ id: string }>(
            `INSERT INTO play_invites (game, lobby_id, host_id, invitee_id, expires_at) VALUES ($1, $2, $3, $4, now() + interval '10 minutes') RETURNING id`,
            [game, id, host.id, to.id],
          )
        ).rows[0]!.id;
      const statusOf = async (inviteId: string) => (await pool.query<{ status: string }>(`SELECT status FROM play_invites WHERE id = $1`, [inviteId])).rows[0]!.status;

      // answered: the same 404 as an invitation to a game that is gone, and it is over
      const answered = await invite('dont-say', friend);
      expect((await call(friend, 'POST', `/play/invites/${answered}/accept`)).status).toBe(404);
      expect(await statusOf(answered)).toBe('expired');

      // listed: no banner for the friend, nothing in the host's list of answers
      const listed = await invite('dont-say', third);
      const banners = (await call(third, 'GET', '/play/invites')).body as InviteLists;
      expect(banners.incoming).toEqual([]);
      expect(await statusOf(listed)).toBe('expired');
      const mine = (await call(host, 'GET', '/play/invites')).body as InviteLists;
      expect(mine.outgoing.map((g) => g.game as string)).not.toContain('dont-say');
    });

    it('is not named among a profile’s games played, and the list still reads', async () => {
      await stored('dont-say', 'finished');
      await stored('bluff', 'finished');
      const kept = await stored('impostor', 'finished');
      const res = await call(host, 'GET', `/users/${host.id}/activity?kind=games`);
      expect(res.status, res.raw).toBe(200);
      const entries = res.body.entries as Array<{ id: string; title: string }>;
      expect(entries.map((e) => e.title)).toEqual(['Xapînok']);
      expect(entries[0]!.id).toContain(kept);
    });

    it('stays in what an account is given of its own data', async () => {
      const finished = await stored('bluff', 'finished');
      await pool.query(`INSERT INTO kingdom_villages (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [host.id]);
      await pool.query(`INSERT INTO kingdom_levels (user_id, building, level, zer) VALUES ($1, 'school', 1, 20) ON CONFLICT DO NOTHING`, [host.id]);
      const progress = await exportProgress(pool, host.id);
      expect(progress.kingdomVillage).not.toBeNull();
      expect(progress.kingdomLevels).toMatchObject([{ building: 'school', level: 1, zer: 20 }]);
      const games = await pool.query<{ game: string }>(
        `SELECT l.game FROM game_lobby_players p JOIN game_lobbies l ON l.id = p.lobby_id WHERE p.user_id = $1 AND l.id = $2`,
        [host.id, finished],
      );
      expect(games.rows).toEqual([{ game: 'bluff' }]);
    });

    it('keeps the XP one paid counting as game XP', async () => {
      const { GAME_XP_SOURCES } = await import('../xp/rules.js');
      expect(GAME_XP_SOURCES).toEqual(expect.arrayContaining(['game_dont_say_place', 'game_bluff_place']));
    });
  });

  // ---------------------------------------------------------------------------
  // the content written for them

  describe('content written for one', () => {
    it('is not listed, opened, changed or counted in the admin, which goes on reading the rest', async () => {
      const editor = await register('editor', '{content_editor}');
      const made = async (kind: string, payload: unknown): Promise<string> =>
        (
          await pool.query<{ id: string }>(
            `INSERT INTO game_content (kind, dialect, level, payload, status, review_status) VALUES ($1, 'kmr', 1, $2, 'published', 'approved') RETURNING id`,
            [kind, JSON.stringify(payload)],
          )
        ).rows[0]!.id;
      const taboo = await made('taboo_card', { target: `${tag}pisik`, meanings: { en: 'cat' }, forbidden: [`${tag}a`, `${tag}b`, `${tag}c`], forms: [] });
      const bluff = await made('bluff_card', { word: `${tag}gurz`, definitions: { en: 'a club' } });
      const building = await made('building_name', { building: 'school', ku: `${tag}dibistan`, meanings: { en: 'school' } });
      const kept = await made('question_template', { ku: `Ma ew ${tag} ye?`, meanings: { en: 'Is it one?' }, fact: 'alive' });

      const list = await call(editor, 'GET', `/admin/game-content?q=${tag}`);
      expect(list.status, list.raw).toBe(200);
      expect((list.body.rows as Array<{ id: string }>).map((r) => r.id)).toEqual([kept]);
      expect(list.body.total).toBe(1);

      for (const id of [taboo, bluff, building]) {
        expect((await call(editor, 'GET', `/admin/game-content/${id}`)).status).toBe(404);
        expect((await call(editor, 'PUT', `/admin/game-content/${id}`, { level: 1, payload: {}, lockVersion: 0 })).status).toBe(404);
        expect((await call(editor, 'DELETE', `/admin/game-content/${id}?lockVersion=0`)).status).toBe(404);
      }
      for (const kind of ['taboo_card', 'bluff_card', 'building_name']) {
        expect((await call(editor, 'GET', `/admin/game-content?kind=${kind}`)).status).toBe(400);
        expect((await call(editor, 'POST', '/admin/game-content', { kind, dialect: 'kmr', level: 1, payload: {} })).status).toBe(400);
      }
      const readiness = await call(editor, 'GET', '/admin/game-content/readiness');
      expect(readiness.status, readiness.raw).toBe(200);
      const kinds = new Set((readiness.body.counts as Array<{ kind: string }>).map((c) => c.kind));
      for (const kind of ['taboo_card', 'bluff_card', 'building_name']) expect(kinds.has(kind)).toBe(false);
      // and every one of them is still where it was
      const still = await pool.query(`SELECT 1 FROM game_content WHERE id = ANY($1::uuid[])`, [[taboo, bluff, building]]);
      expect(still.rowCount).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // the migration

  describe('the migration that calls the open ones off', () => {
    it('ends every open lobby and game of the two, frees their codes, and touches nothing else', async () => {
      const waiting = await stored('dont-say', 'lobby');
      const playing = await stored('bluff', 'active');
      const over = await stored('bluff', 'finished');
      const other = await stored('impostor', 'lobby');
      const before = { over: await lobby(over), other: await lobby(other) };
      expect((await lobby(waiting)).code).not.toBeNull();

      const path = '../../migrations/1751000450000_retired-games-end.js';
      const migration = (await import(/* @vite-ignore */ path)) as { up: (pgm: unknown) => void };
      const statements: string[] = [];
      migration.up({ sql: (s: string) => statements.push(s) });
      expect(statements).toHaveLength(1);
      for (const statement of statements) await pool.query(statement);

      for (const id of [waiting, playing]) {
        const row = await lobby(id);
        expect(row).toMatchObject({ status: 'cancelled', code: null, version: 1 });
        expect(row.finished_at).not.toBeNull();
      }
      expect(await lobby(over)).toEqual(before.over);
      expect(await lobby(other)).toEqual(before.other);
      // nobody was taken out of anything, paid or rated by it
      const seats = await pool.query(`SELECT 1 FROM game_lobby_players WHERE lobby_id = ANY($1::uuid[])`, [[waiting, playing]]);
      expect(seats.rowCount).toBe(6);
      const paid = await pool.query(`SELECT 1 FROM xp_ledger WHERE ref_id LIKE $1 OR ref_id LIKE $2`, [`mp:${waiting}:%`, `mp:${playing}:%`]);
      expect(paid.rowCount).toBe(0);
    });
  });
});
