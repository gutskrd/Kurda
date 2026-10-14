/**
 * The Game Ranks routes over HTTP: what the apps call (`/ranks/*`, the lobby's
 * Rated/Friendly toggle, a frame on the profile) and what the admin panel
 * calls — staff only, behind the 2FA gate.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { dictionaryKey, letterKey } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { befriend } from '../test/social.js';
import { deleteUsers } from '../test/ranks.js';

const DATABASE_URL = process.env.DATABASE_URL;
const WORDS = ['hewal', 'darik', 'bajer'];

describe.skipIf(!DATABASE_URL)('game ranks routes (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const users: Record<string, { id: string; token: string }> = {};
  const entryIds: string[] = [];
  let ip = 0;

  const register = async (tag: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rr_${tag}_${suffix}@it.kurda.app`,
        username: `rr_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: `10.71.${++ip}.1`,
    });
    await activate(app, pool, res);
    users[tag] = { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  const call = (tag: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${users[tag]!.token}` }, remoteAddress: '10.71.200.1' });

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
    for (const tag of ['host', 'mate', 'stranger', 'admin', 'super']) await register(tag);
    await befriend(pool, users.host!.id, users.mate!.id);
  });

  afterAll(async () => {
    await deleteUsers(pool, Object.values(users).map((u) => u.id));
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
    await app.close();
  });

  it('reads your ranks, the season and your preferences', async () => {
    const me = await call('host', 'GET', '/ranks/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().ranks.map((r: { game: string }) => r.game)).toEqual(['wordle-battle', 'rhyme-match', 'stories']);
    expect(me.json().ranks[0]).toMatchObject({ points: 0, tier: null, placement: { played: 0, of: 5 } });
    expect((await call('host', 'GET', '/ranks/me/stories')).json()).toMatchObject({ game: 'stories' });
    expect((await call('host', 'GET', '/ranks/me/race')).statusCode).toBe(400);
    expect((await call('host', 'GET', '/ranks/seasons/current')).json().rewards).toHaveLength(6);
    expect((await call('host', 'PUT', '/ranks/preferences/rhyme-match', { rated: true })).statusCode).toBe(200);
    expect((await call('host', 'GET', '/ranks/preferences')).json()).toEqual({ preferences: { 'rhyme-match': true } });
    const signedOut = await app.inject({ method: 'GET', url: '/ranks/me', remoteAddress: '10.71.200.2' });
    expect(signedOut.statusCode).toBe(401);
  });

  it('runs a lobby through the play layer: the badge, the toggle, the expected gains, a result', async () => {
    const created = await call('host', 'POST', '/play/lobbies', { game: 'wordle-battle', settings: { difficulty: 'medium', rated: false } });
    expect(created.statusCode).toBe(201);
    const lobbyId = created.json().lobbyId as string;
    expect((await call('mate', 'POST', `/wordle/battles/${lobbyId}/join`)).statusCode).toBe(200);

    const card = await call('mate', 'GET', `/play/cards/wordle-battle/${lobbyId}`);
    expect(card.json().summary).toMatchObject({ rated: false });
    expect((await call('mate', 'PUT', `/play/wordle-battle/${lobbyId}/rated`, { rated: true })).statusCode).toBe(403);
    expect((await call('host', 'PUT', `/play/wordle-battle/${lobbyId}/rated`, { rated: true })).json()).toEqual({ ok: true, rated: true });
    const view = await call('mate', 'GET', `/wordle/battles/${lobbyId}`);
    expect(view.json().rated).toMatchObject({ rated: true, counts: null });

    const gains = await call('mate', 'GET', `/ranks/expected/wordle-battle/${lobbyId}`);
    expect(gains.statusCode).toBe(200);
    // both are brand-new accounts: rated, with each moving the other by half
    expect(gains.json()).toMatchObject({ rated: true, wouldCount: true });
    expect((await call('stranger', 'GET', `/ranks/expected/wordle-battle/${lobbyId}`)).statusCode).toBe(404);

    expect((await call('host', 'POST', `/wordle/battles/${lobbyId}/start`)).statusCode).toBe(200);
    expect((await call('host', 'PUT', `/play/wordle-battle/${lobbyId}/rated`, { rated: false })).statusCode).toBe(409);
    const target = (await pool.query<{ target: string }>(`SELECT target FROM wordle_battles WHERE id = $1`, [lobbyId])).rows[0]!.target;
    await call('host', 'POST', `/wordle/battles/${lobbyId}/guesses`, { word: target });
    // the mate leaves mid-race: the battle ends, the host first
    await call('mate', 'POST', `/wordle/battles/${lobbyId}/leave`);

    const result = await call('host', 'GET', `/ranks/results/wordle-battle/${lobbyId}`);
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ counted: true, reason: 'placement' });
    expect(result.json().delta).toBeGreaterThan(0);
    expect((await call('stranger', 'GET', `/ranks/results/wordle-battle/${lobbyId}`)).statusCode).toBe(404);

    // the profile shows the rank now
    const profile = await call('stranger', 'GET', `/users/${users.host!.id}`);
    expect(profile.json().ranks).toEqual([expect.objectContaining({ game: 'wordle-battle', placing: true })]);
    expect(profile.json()).not.toHaveProperty('rating');
  });

  it('serves the boards', async () => {
    const friends = await call('mate', 'GET', '/ranks/boards/wordle-battle?scope=friends');
    expect(friends.statusCode).toBe(200);
    expect(friends.json().entries.length).toBeGreaterThanOrEqual(2);
    const top = await call('mate', 'GET', '/ranks/boards/wordle-battle?scope=top');
    expect(top.json()).toMatchObject({ scope: 'top' });
    expect((await call('mate', 'GET', '/ranks/boards/wordle-battle?scope=world')).statusCode).toBe(400);
  });

  it('wears a season frame only once it is yours', async () => {
    const before = await call('host', 'PUT', '/me/cosmetics/frame', { sku: 'frame_rank_gir' });
    // never on sale, so out of reach until granted (the cosmetics' own rule)
    expect(before.statusCode).toBe(409);
    await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, 'frame_rank_gir', 'reward')`, [users.host!.id]);
    expect((await call('host', 'PUT', '/me/cosmetics/frame', { sku: 'frame_rank_gir' })).statusCode).toBe(200);
    expect((await call('stranger', 'GET', `/users/${users.host!.id}`)).json().frameSku).toBe('frame_rank_gir');
    // a background is not a frame
    expect((await call('host', 'PUT', '/me/cosmetics/frame', { sku: 'tag_kurdish' })).statusCode).toBe(400);
  });

  it('keeps the admin tools to staff with 2FA', async () => {
    expect((await call('stranger', 'GET', '/admin/ranks/spread')).statusCode).toBe(403);
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [users.admin!.id]);
    await pass2fa(app, users.admin!.token, '10.71.250.1');
    const get = (url: string) =>
      app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${users.admin!.token}` }, remoteAddress: '10.71.250.1' });
    expect((await get('/admin/ranks/spread')).json().games).toHaveLength(3);
    expect((await get('/admin/ranks/suspicious-pairs')).statusCode).toBe(200);
    expect((await get('/admin/ranks/top/wordle-battle')).statusCode).toBe(200);
    expect((await get('/admin/seasons')).json()).toHaveProperty('current');
    expect((await get('/admin/seasons/nope/rewards')).statusCode).toBe(400);
    const rewards = await get(`/admin/seasons/${(await get('/admin/seasons')).json().current}/rewards`);
    expect(rewards.json()).toEqual({ rewards: expect.any(Array), given: expect.any(Array) });

    // a player's ranks and rated games, and a pair's games together: the host's battle with the mate
    const player = await get(`/admin/ranks/players/${users.host!.id}`);
    expect(player.statusCode).toBe(200);
    expect(player.json().ranks.map((r: { game: string }) => r.game)).toEqual(['wordle-battle', 'rhyme-match', 'stories']);
    expect(player.json().games).toEqual([expect.objectContaining({ game: 'wordle-battle', place: 1, voided: false })]);
    expect((await get('/admin/ranks/players/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    const pair = await get(`/admin/ranks/pairs/wordle-battle/${users.host!.id}/${users.mate!.id}`);
    expect(pair.json().games).toEqual([expect.objectContaining({ aPlace: 1, bPlace: 2 })]);
    expect((await get(`/admin/ranks/pairs/race/${users.host!.id}/${users.mate!.id}`)).statusCode).toBe(400);
    expect((await call('stranger', 'GET', `/admin/ranks/players/${users.host!.id}`)).statusCode).toBe(403);
    const ended = await app.inject({
      method: 'POST',
      url: '/admin/seasons/end',
      headers: { authorization: `Bearer ${users.admin!.token}` },
      remoteAddress: '10.71.250.1',
    });
    expect(ended.statusCode).toBe(200);
    expect(ended.json()).toHaveProperty('processed');
  });
  it('opens the rank, season, league and badge tools to a superadmin without the legacy admin role', async () => {
    await pool.query(`UPDATE users SET roles = '{superadmin}' WHERE id = $1`, [users.super!.id]);
    await pass2fa(app, users.super!.token, '10.71.251.1');
    const as = (method: 'GET' | 'POST', url: string) =>
      app.inject({ method, url, headers: { authorization: `Bearer ${users.super!.token}` }, remoteAddress: '10.71.251.1' });
    for (const url of [
      '/admin/ranks/spread',
      '/admin/ranks/suspicious-pairs',
      '/admin/ranks/top/stories',
      `/admin/ranks/players/${users.host!.id}`,
      '/admin/seasons',
      '/admin/leagues',
      '/admin/badges',
      `/admin/users/${users.host!.id}/badges`,
    ]) {
      expect({ url, status: (await as('GET', url)).statusCode }).toEqual({ url, status: 200 });
    }
    expect((await as('POST', '/admin/badges/rarity')).statusCode).toBe(200);
    // and still nobody else: a moderator is refused
    await pool.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [users.super!.id]);
    expect((await as('GET', '/admin/ranks/spread')).statusCode).toBe(403);
    expect((await as('GET', '/admin/leagues')).statusCode).toBe(403);
    expect((await as('GET', '/admin/badges')).statusCode).toBe(403);
  });
});
