/**
 * Kurdish Impostor for one phone, through the routes, against real Postgres
 * and Redis: where it is offered, an evening's cards dealt only from approved
 * word cards, one category's when one is asked for, and what the routes will
 * not take: a caller who is not signed in, a body that carries anything about
 * the people in the room, more decks than a room could play in a minute.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { COUCH_DECK_DEFAULT, COUCH_DECK_MAX, IMPOSTOR_GUESS_OPTIONS, learnGame, type CouchDeck, type CouchOffer } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { bustAvailability } from './availability.js';
import { bustGamePools } from './sources.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('Kurdish Impostor on one phone (integration)', () => {
  const config = loadConfig({ DATABASE_URL, ...(REDIS_URL ? { REDIS_URL } : {}), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  // stand-in Kurdish for the fixtures, never shown to a learner: words of letters only, unique to this run
  const tag = `zc${suffix.replace(/[^a-z]/g, '')}`;
  const letters = (i: number): string => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
  const MINIMUM = learnGame('impostor').minimum;
  const large = `${tag}-large`;
  const small = `${tag}-small`;
  let token = '';
  let ip = 0;

  const register = async (name: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `cp_${name}_${suffix}@it.kurda.app`, username: `cp_${name}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, ...bornYearsAgo(30) },
      remoteAddress: `10.153.0.${(ip++ % 200) + 1}`,
    });
    expect(res.statusCode).toBe(201);
    await activate(app, pool, res);
    return res.json().tokens.accessToken as string;
  };
  const call = async (who: string | null, method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: who ? { authorization: `Bearer ${who}` } : {},
      ...(payload !== undefined ? { payload: payload as object } : {}),
      remoteAddress: '10.153.1.1',
    });
    return { status: res.statusCode, body: res.body ? res.json() : null, headers: res.headers };
  };
  const insert = async (word: string, category: string, approved = true, level = 1): Promise<void> => {
    const payload = { word, meanings: { en: `${word} meaning` }, category, hint: { ku: `${tag}kom`, meanings: { en: `a group of ${category}` } }, forms: [] };
    await pool.query(
      approved
        ? `INSERT INTO game_content (kind, dialect, level, payload, status, review_status) VALUES ('word_card', 'kmr', $2, $1, 'published', 'approved')`
        : `INSERT INTO game_content (kind, dialect, level, payload) VALUES ('word_card', 'kmr', $2, $1)`,
      [payload, level],
    );
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    for (let i = 0; i < MINIMUM; i++) await insert(`${tag}l${letters(i)}`, large);
    for (let i = 0; i < IMPOSTOR_GUESS_OPTIONS; i++) await insert(`${tag}s${letters(i)}`, small);
    // a card nobody approved, and one too hard for a beginner's game: neither is ever dealt here
    await insert(`${tag}draftonly`, large, false);
    await insert(`${tag}hardone`, large, true, 4);
    await bustAvailability(app.cache);
    await bustGamePools(app.cache);
    token = await register('host');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM game_content WHERE payload::text LIKE $1`, [`%${tag}%`]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%_${suffix}@it.kurda.app`]);
    await bustAvailability(app.cache);
    await bustGamePools(app.cache);
    await pool.end();
    await app.close();
  });

  it('is for signed-in learners only', async () => {
    expect((await call(null, 'GET', '/games/impostor/couch?dialect=kmr')).status).toBe(401);
    expect((await call(null, 'POST', '/games/impostor/couch/deck', { dialect: 'kmr', difficulty: 'beginner' })).status).toBe(401);
  });

  it('says where it can be played: the difficulties with enough approved cards, and their categories', async () => {
    const res = await call(token, 'GET', '/games/impostor/couch?dialect=kmr');
    expect(res.status).toBe(200);
    const offer = res.body as CouchOffer;
    const beginner = offer.difficulties.find((d) => d.difficulty === 'beginner')!;
    expect(beginner.cards).toBeGreaterThanOrEqual(MINIMUM + IMPOSTOR_GUESS_OPTIONS);
    expect(beginner.categories.find((c) => c.slug === large)).toEqual({ slug: large, ku: `${tag}kom`, meanings: { en: `a group of ${large}` }, cards: MINIMUM });
    expect(beginner.categories.find((c) => c.slug === small)?.cards).toBe(IMPOSTOR_GUESS_OPTIONS);
    expect((await call(token, 'GET', '/games/impostor/couch?dialect=xx')).status).toBe(400);
  });

  it('deals an evening’s cards from approved cards of the level only, never to be kept on the way', async () => {
    const res = await call(token, 'POST', '/games/impostor/couch/deck', { dialect: 'kmr', difficulty: 'beginner', category: large, count: COUCH_DECK_MAX });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const deck = res.body as CouchDeck;
    expect(deck.cards).toHaveLength(MINIMUM);
    const text = JSON.stringify(deck);
    expect(text).not.toContain(`${tag}draftonly`);
    expect(text).not.toContain(`${tag}hardone`);
    for (const c of deck.cards) {
      expect(c.word.startsWith(`${tag}l`)).toBe(true);
      expect(c.decoys).toHaveLength(IMPOSTOR_GUESS_OPTIONS - 1);
      expect(c.decoys.every((d) => d.startsWith(`${tag}l`) && d !== c.word)).toBe(true);
      expect(c.twin!.word.startsWith(`${tag}l`)).toBe(true);
      expect(c.hint).toEqual({ ku: `${tag}kom`, meanings: { en: `a group of ${large}` } });
    }
  });

  it('deals ten cards when it is not told how many, in a different order each time', async () => {
    const words = async (): Promise<string[]> => ((await call(token, 'POST', '/games/impostor/couch/deck', { dialect: 'kmr', difficulty: 'beginner', category: large })).body as CouchDeck).cards.map((c) => c.word);
    const [a, b, c] = [await words(), await words(), await words()];
    expect(a).toHaveLength(COUCH_DECK_DEFAULT);
    expect(new Set(a).size).toBe(COUCH_DECK_DEFAULT);
    expect(a.join() === b.join() && b.join() === c.join()).toBe(false);
  });

  it('refuses a category with no cards, and a level with too few', async () => {
    const none = await call(token, 'POST', '/games/impostor/couch/deck', { dialect: 'kmr', difficulty: 'beginner', category: `${tag}-nowhere` });
    expect(none.status).toBe(409);
    expect(none.body.code).toBe('GAME_UNAVAILABLE');
    expect((await call(token, 'POST', '/games/impostor/couch/deck', { dialect: 'ckb', difficulty: 'advanced', category: large })).status).toBe(409);
  });

  it('takes nothing about the people in the room: a name, a result or anything else sent is refused', async () => {
    // an account of its own: the decks asked for above count toward the minute's ten
    const who = await register('strict');
    const base = { dialect: 'kmr', difficulty: 'beginner' };
    expect((await call(who, 'POST', '/games/impostor/couch/deck', { ...base, players: ['Azad', 'Berfîn'] })).status).toBe(400);
    expect((await call(who, 'POST', '/games/impostor/couch/deck', { ...base, winner: 'Azad', points: 3 })).status).toBe(400);
    expect((await call(who, 'POST', '/games/impostor/couch/deck', { ...base, category: 'Not A Slug' })).status).toBe(400);
    expect((await call(who, 'POST', '/games/impostor/couch/deck', { ...base, count: COUCH_DECK_MAX + 1 })).status).toBe(400);
    expect((await call(who, 'POST', '/games/impostor/couch/deck', { ...base, count: 0 })).status).toBe(400);
  });

  it('pays nothing: a deck fetched and played leaves no XP and no game behind', async () => {
    const who = await register('quiet');
    const me = (await call(who, 'GET', '/me')).body.user.id as string;
    expect((await call(who, 'POST', '/games/impostor/couch/deck', { dialect: 'kmr', difficulty: 'beginner' })).status).toBe(200);
    expect((await pool.query(`SELECT count(*)::int AS n FROM xp_ledger WHERE user_id = $1 AND source LIKE 'game_%'`, [me])).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM game_lobby_players WHERE user_id = $1`, [me])).rows[0].n).toBe(0);
  });

  it('gives out at most ten decks a minute', async () => {
    const hurried = await register('hurried');
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await call(hurried, 'POST', '/games/impostor/couch/deck', { dialect: 'kmr', difficulty: 'beginner' })).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
