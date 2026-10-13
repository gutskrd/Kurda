/**
 * The rating box, Send feedback, the store prompt's limits, the admin inbox and
 * what GDPR does with the answers — against real Postgres (contract-2 §F).
 */
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { GdprService, DELETION_GRACE_DAYS } from '../gdpr/service.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { deleteStories, insertStory } from '../test/story-fixtures.js';
import { countFinishedGames, FINISHED_GAME_SOURCES } from './finished-games.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('app feedback (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let ip = 0;
  let raceTextId = '';
  /** stories made for the finished-games count, removed with their games */
  const stories: string[] = [];

  interface User {
    id: string;
    token: string;
  }

  async function register(name: string, birth = { birthYear: 1990, birthMonth: 6 }): Promise<User> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...birth,
      },
      remoteAddress: `10.156.${++ip}.1`,
    });
    expect(res.statusCode, res.body).toBe(201);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, user: User, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${user.token}` },
      payload: payload as object,
      remoteAddress: '10.156.200.1',
    });

  const state = async (user: User, query = '') => {
    const res = await call('GET', `/me/app-feedback/state${query}`, user);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as { shouldPrompt: boolean; storeReviewEligible: boolean };
  };

  /** A finished daily or practice Wordle, `daysAgo` days back. */
  async function finishedWordle(userId: string, daysAgo = 0, status: 'won' | 'lost' | 'playing' = 'won'): Promise<void> {
    await pool.query(
      `INSERT INTO wordle_games (user_id, mode, difficulty, target, target_length, status, started_at, finished_at)
       VALUES ($1, 'practice', 'easy', 'mala', 4, $2,
               now() - ($3 || ' days')::interval,
               CASE WHEN $2 = 'playing' THEN NULL ELSE now() - ($3 || ' days')::interval END)`,
      [userId, status, String(daysAgo)],
    );
  }

  /** Seat numbers arrive with the play invites (migration 149): give one where the column exists. */
  async function hasSeat(table: string): Promise<boolean> {
    const res = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'seat'`,
      [table],
    );
    return (res.rowCount ?? 0) > 0;
  }

  const answer = {
    stars: 2,
    categories: ['games', 'bugs'],
    comment: 'The race\u0007 froze on my phone.',
    source: 'first_game',
    platform: 'android',
    appVersion: '1.4.0',
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const text = await pool.query<{ id: string }>(
      `INSERT INTO race_texts (title, body, language, difficulty, active)
       VALUES ($1, 'Ez ji welatê xwe hez dikim û her roj.', 'kmr', 1, false) RETURNING id`,
      [`it_${suffix} feedback`],
    );
    raceTextId = text.rows[0]!.id;
  });

  afterAll(async () => {
    await deleteStories(pool, stories);
    await pool.query(
      `DELETE FROM app_feedback WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%_${suffix}@it.kurda.app')
          OR user_id IS NULL AND comment LIKE '%${suffix}%'`,
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM race_texts WHERE id = $1`, [raceTextId]);
    await pool.end();
    await app.close();
  });

  describe('the box', () => {
    it('is not due before a game is finished, and is due after the first', async () => {
      const user = await register('fbFirst');
      expect(await state(user)).toEqual({ shouldPrompt: false, storeReviewEligible: false });

      // a game left playing is not a game finished
      await finishedWordle(user.id, 0, 'playing');
      expect((await state(user)).shouldPrompt).toBe(false);

      await finishedWordle(user.id);
      expect(await state(user)).toEqual({ shouldPrompt: true, storeReviewEligible: false });
    });

    it('takes an answer, keeps it as it was meant, and does not come back', async () => {
      const user = await register('fbAnswer');
      await finishedWordle(user.id);
      const res = await call('POST', '/me/app-feedback', user, answer);
      expect(res.statusCode, res.body).toBe(201);
      const { id } = res.json();

      const row = await pool.query(`SELECT * FROM app_feedback WHERE id = $1`, [id]);
      expect(row.rows[0]).toMatchObject({
        user_id: user.id,
        stars: 2,
        categories: ['games', 'bugs'],
        comment: 'The race froze on my phone.', // the bell character is gone
        source: 'first_game',
        platform: 'android',
        app_version: '1.4.0',
        locale: 'en', // the account's, since the app did not say
        status: 'new',
        admin_note: null,
      });
      // a keyed pseudonym of the account, not the id itself
      expect(row.rows[0].user_hash).toBe(
        createHmac('sha256', config.JWT_SECRET).update(`app-feedback:${user.id}`).digest('hex'),
      );

      expect((await state(user)).shouldPrompt).toBe(false);
      const users = await pool.query(`SELECT app_feedback_prompted_at FROM users WHERE id = $1`, [user.id]);
      expect(users.rows[0].app_feedback_prompted_at).not.toBeNull();
    });

    it('takes any one part of an answer, and every star', async () => {
      const user = await register('fbParts');
      for (const part of [{ stars: 5 }, { stars: 1 }, { categories: ['too_hard'] }, { comment: 'Spas!' }]) {
        const res = await call('POST', '/me/app-feedback', user, { source: 'settings', platform: 'web', appVersion: 'web-1', ...part });
        expect(res.statusCode, `${JSON.stringify(part)} ${res.body}`).toBe(201);
      }
    });

    it('refuses an empty or malformed answer', async () => {
      // two accounts: a refused answer still counts towards the daily limit
      const users = [await register('fbBad'), await register('fbBad2')];
      const base = { source: 'settings', platform: 'web', appVersion: '1.0.0' };
      const bad = [
        base, // says nothing
        { ...base, comment: '   ' },
        // nothing but control characters, which are not kept
        { ...base, comment: String.fromCharCode(7, 8, 0x7f) },
        { ...base, categories: [] },
        { ...base, stars: 0 },
        { ...base, stars: 6 },
        { ...base, stars: 3.5 },
        { ...base, categories: ['ads'] },
        { ...base, stars: 4, platform: 'windows' },
        { ...base, stars: 4, source: 'popup' },
        { ...base, stars: 4, appVersion: '' },
        { ...base, stars: 4, appVersion: '<script>' },
        { ...base, stars: 4, comment: 'x'.repeat(2001) },
        // 2000 as sent, but NFC makes each of these three: 6000 as kept
        { ...base, stars: 4, comment: '\ufb2c'.repeat(2000) },
        { ...base, stars: 4, locale: 'xx' },
      ];
      for (const [i, payload] of bad.entries()) {
        const res = await call('POST', '/me/app-feedback', users[i % 2]!, payload);
        expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      }
      const stored = await pool.query(`SELECT 1 FROM app_feedback WHERE user_id = ANY($1)`, [users.map((u) => u.id)]);
      expect(stored.rowCount).toBe(0);
    });

    it('"not now" counts as shown', async () => {
      const user = await register('fbDismiss');
      await finishedWordle(user.id);
      expect((await state(user)).shouldPrompt).toBe(true);
      const res = await call('POST', '/me/app-feedback/dismiss', user);
      expect(res.statusCode).toBe(200);
      expect((await state(user)).shouldPrompt).toBe(false);
      // and answering later from Settings still works
      expect((await call('POST', '/me/app-feedback', user, { ...answer, source: 'settings' })).statusCode).toBe(201);
    });

    it('takes ten answers a day from one account', async () => {
      const user = await register('fbLimit');
      const one = { stars: 4, source: 'settings', platform: 'web', appVersion: '1.0.0' };
      for (let i = 0; i < 10; i++) expect((await call('POST', '/me/app-feedback', user, one)).statusCode).toBe(201);
      const eleventh = await call('POST', '/me/app-feedback', user, one);
      expect(eleventh.statusCode).toBe(429);
      expect(eleventh.json().code).toBe('RATE_LIMITED');
    });

    it('is for signed-in accounts only', async () => {
      const res = await app.inject({ method: 'GET', url: '/me/app-feedback/state', remoteAddress: '10.156.201.1' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('the store prompt', () => {
    async function veteran(name: string, birth?: { birthYear: number; birthMonth: number }): Promise<User> {
      const user = await register(name, birth);
      await finishedWordle(user.id, 0);
      await finishedWordle(user.id, 0);
      await finishedWordle(user.id, 3);
      // the box was shown long ago, so it does not hold the store prompt back
      await pool.query(`UPDATE users SET app_feedback_prompted_at = now() - interval '30 days' WHERE id = $1`, [user.id]);
      return user;
    }

    it('is eligible on a phone for an adult with three games on two days', async () => {
      const user = await veteran('srAdult');
      expect(await state(user, '?platform=ios&appVersion=1.4.0')).toEqual({ shouldPrompt: false, storeReviewEligible: true });
      expect((await state(user, '?platform=android&appVersion=1.4.0')).storeReviewEligible).toBe(true);
    });

    it('never on the web, without a version, or for a minor', async () => {
      const user = await veteran('srWeb');
      expect((await state(user, '?platform=web&appVersion=1.4.0')).storeReviewEligible).toBe(false);
      expect((await state(user, '?platform=ios')).storeReviewEligible).toBe(false);
      expect((await state(user)).storeReviewEligible).toBe(false);

      const teen = await veteran('srTeen', bornYearsAgo(15));
      expect((await state(teen, '?platform=ios&appVersion=1.4.0')).storeReviewEligible).toBe(false);
    });

    it('waits for games on a second day', async () => {
      const user = await register('srOneDay');
      for (let i = 0; i < 4; i++) await finishedWordle(user.id, 0);
      expect((await state(user, '?platform=ios&appVersion=1.4.0')).storeReviewEligible).toBe(false);
    });

    it('is recorded once per version, and then waits', async () => {
      const user = await veteran('srAsked');
      const first = await call('POST', '/me/store-review/prompted', user, { appVersion: '1.4.0' });
      expect(first.statusCode, first.body).toBe(200);
      await call('POST', '/me/store-review/prompted', user, { appVersion: '1.4.0' }); // a repeat
      const row = await pool.query(
        `SELECT store_review_count, store_review_version, store_review_prompted_at FROM users WHERE id = $1`,
        [user.id],
      );
      expect(row.rows[0]).toMatchObject({ store_review_count: 1, store_review_version: '1.4.0' });
      expect(row.rows[0].store_review_prompted_at).not.toBeNull();

      // not again for this version, nor for the next one so soon
      expect((await state(user, '?platform=ios&appVersion=1.4.0')).storeReviewEligible).toBe(false);
      expect((await state(user, '?platform=ios&appVersion=1.5.0')).storeReviewEligible).toBe(false);

      // a new version, long enough after
      await pool.query(`UPDATE users SET store_review_prompted_at = now() - interval '200 days' WHERE id = $1`, [user.id]);
      expect((await state(user, '?platform=ios&appVersion=1.5.0')).storeReviewEligible).toBe(true);
      expect((await state(user, '?platform=ios&appVersion=1.4.0')).storeReviewEligible).toBe(false);
    });

    it('and the box never share a session', async () => {
      const user = await register('srSession');
      await finishedWordle(user.id);
      await call('POST', '/me/store-review/prompted', user, { appVersion: '1.4.0' });
      // the store prompt was just called: the box waits
      expect((await state(user)).shouldPrompt).toBe(false);

      const other = await veteran('srBox');
      await pool.query(`UPDATE users SET app_feedback_prompted_at = now() WHERE id = $1`, [other.id]);
      // the box was just shown: the store prompt waits
      expect((await state(other, '?platform=ios&appVersion=1.4.0')).storeReviewEligible).toBe(false);
    });

    it('refuses a version that is not one', async () => {
      const user = await register('srBadVersion');
      expect((await call('POST', '/me/store-review/prompted', user, { appVersion: '' })).statusCode).toBe(400);
      expect((await call('POST', '/me/store-review/prompted', user, {})).statusCode).toBe(400);
    });
  });

  describe('finished games', () => {
    it('counts every kind of game, each once, and none left unfinished', async () => {
      const user = await register('fgAll');
      const other = await register('fgOther');

      await finishedWordle(user.id, 0, 'lost');
      await finishedWordle(user.id, 0, 'playing');

      await pool.query(
        `INSERT INTO rhyme_games (user_id, prompt, window_ms, status, ended_at) VALUES ($1, 'mal', 60000, 'ended', now()),
                ($1, 'mal', 60000, 'active', NULL)`,
        [user.id],
      );
      // a race run, one given up before a letter was typed, and one still going
      await pool.query(
        `INSERT INTO race_games (user_id, text_id, accent_mode, dialect, finished_at, wpm) VALUES
           ($1, $2, 'forgiving', 'kurmanci', now(), 31.5), ($1, $2, 'forgiving', 'kurmanci', now(), 0),
           ($1, $2, 'forgiving', 'kurmanci', NULL, NULL)`,
        [user.id, raceTextId],
      );

      // a battle the player finished, and one they are still playing
      for (const finished of [true, false]) {
        const battle = await pool.query<{ id: string }>(
          `INSERT INTO wordle_battles (created_by, difficulty, target, target_length, status)
           VALUES ($1, 'easy', 'mala', 4, 'active') RETURNING id`,
          [other.id],
        );
        const seat = (await hasSeat('wordle_battle_players')) ? ', seat' : '';
        await pool.query(
          `INSERT INTO wordle_battle_players (battle_id, user_id, status, finished_at${seat})
           VALUES ($1, $2, $3, $4${seat ? ', 1' : ''})`,
          [battle.rows[0]!.id, user.id, finished ? 'won' : 'playing', finished ? new Date() : null],
        );
      }

      // a match that finished with them in it, and one still going
      for (const finished of [true, false]) {
        const match = await pool.query<{ id: string }>(
          `INSERT INTO rhyme_matches (created_by, prompt, window_ms, status, finished_at)
           VALUES ($1, 'mal', 60000, $2, $3) RETURNING id`,
          [other.id, finished ? 'finished' : 'active', finished ? new Date() : null],
        );
        const seat = (await hasSeat('rhyme_match_players')) ? ', seat' : '';
        await pool.query(
          `INSERT INTO rhyme_match_players (match_id, user_id${seat}) VALUES ($1, $2${seat ? ', 1' : ''})`,
          [match.rows[0]!.id, user.id],
        );
      }

      // a story game finished with them in it; one they left, one the host took
      // them out of, and one still being read
      const story = await insertStory(pool, { slug: `fg-story-${Date.now().toString(36)}` });
      stories.push(story.id);
      for (const [status, leftAt, removed] of [
        ['finished', null, false],
        ['finished', new Date(), false],
        ['finished', null, true],
        ['reading', null, false],
      ] as const) {
        const game = await pool.query<{ id: string }>(
          `INSERT INTO story_games (mode, host_id, story_id, dialect, level, length, question_count, timer_seconds, status, finished_at)
           VALUES ('group', $1, $2, 'kurmanci', 1, 'short', 3, 60, $3, CASE WHEN $3 = 'finished' THEN now() END) RETURNING id`,
          [other.id, story.id, status],
        );
        await pool.query(
          `INSERT INTO story_game_players (game_id, user_id, seat, left_at, removed) VALUES ($1, $2, 2, $3, $4)`,
          [game.rows[0]!.id, user.id, leftAt, removed],
        );
      }

      expect(await countFinishedGames(pool, user.id, 'UTC')).toEqual({ games: 6, days: 1 });
      // and nothing of theirs is counted for anyone else
      expect(await countFinishedGames(pool, other.id, 'UTC')).toEqual({ games: 0, days: 0 });
    });

    /*
     * Giving up finishes a race as well, so an empty one opened and abandoned
     * would have been a "finished game" — enough for the box, and a third of
     * what the store prompt asks for.
     */
    it('does not count a race given up before a letter was typed', async () => {
      const user = await register('fgGaveUp');
      const start = async (): Promise<string> => {
        const res = await pool.query<{ id: string }>(
          `INSERT INTO race_games (user_id, text_id, accent_mode, dialect, started_at)
           VALUES ($1, $2, 'forgiving', 'kurmanci', now() - interval '30 seconds') RETURNING id`,
          [user.id, raceTextId],
        );
        return res.rows[0]!.id;
      };
      const gaveUp = await call('POST', `/race/${await start()}/finish`, user, { typed: '' });
      expect(gaveUp.statusCode, gaveUp.body).toBe(200);
      expect(await countFinishedGames(pool, user.id, 'UTC')).toEqual({ games: 0, days: 0 });
      expect((await state(user)).shouldPrompt).toBe(false);

      // given up halfway is still a race run
      const halfway = await call('POST', `/race/${await start()}/finish`, user, { typed: 'Ez ji welatê xwe' });
      expect(halfway.statusCode, halfway.body).toBe(200);
      expect(await countFinishedGames(pool, user.id, 'UTC')).toEqual({ games: 1, days: 1 });
      expect((await state(user)).shouldPrompt).toBe(true);
    });

    /*
     * The count runs on the results screen after every game, so each table it
     * reads must find one player's rows without reading everyone's: the two
     * multiplayer player tables were keyed by game alone (migration 156).
     */
    it('reads every game table by an index that starts with the player', async () => {
      const tables = FINISHED_GAME_SOURCES.map((sql) => /\bFROM\s+(\w+)/.exec(sql)![1]!);
      expect(tables).toEqual([
        'wordle_games',
        'rhyme_games',
        'race_games',
        'wordle_battle_players',
        'rhyme_match_players',
        'story_game_players',
      ]);
      const indexed = await pool.query<{ table: string }>(
        `SELECT DISTINCT c.relname AS table
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indrelid
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
          WHERE c.relname = ANY($1) AND a.attname = 'user_id' AND i.indpred IS NULL`,
        [tables],
      );
      expect(indexed.rows.map((r) => r.table).sort()).toEqual([...tables].sort());
    });

    /*
     * The play-invites migration (149, on its own branch) indexes the same two
     * player tables by player under the same default names. Merged, it runs
     * first, and 156 creating them again failed with 42P07 and stopped every
     * migration after it; and 156's down dropping them made 149's down fail.
     * This database already has them, as it will once 149 has run, so 156's
     * own statements are run against it here — in a transaction rolled back.
     */
    it('indexes the player tables whether or not the play-invites migration did first (migration 156)', async () => {
      const { MigrationBuilder } = await import('node-pg-migrate');
      const file = '../../migrations/1751000156000_app-feedback.js';
      const migration = (await import(file)) as Record<'up' | 'down', (pgm: InstanceType<typeof MigrationBuilder>) => void>;
      const sqlOf = (step: 'up' | 'down'): string[] => {
        const quiet = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
        const pgm = new MigrationBuilder({ query: pool.query.bind(pool), select: async () => [] }, undefined, false, quiet);
        migration[step](pgm);
        return pgm.getSqlSteps().filter((sql) => /\b(wordle_battle|rhyme_match)_players\b/.test(sql));
      };

      const up = sqlOf('up');
      // the names 149's `pgm.createIndex(players, 'user_id')` gives them
      expect(up).toEqual([
        'CREATE INDEX IF NOT EXISTS "wordle_battle_players_user_id_index" ON "wordle_battle_players" ("user_id");',
        'CREATE INDEX IF NOT EXISTS "rhyme_match_players_user_id_index" ON "rhyme_match_players" ("user_id");',
      ]);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const sql of up) await client.query(sql);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
      // and rolling 156 back leaves them for 149's down to drop
      expect(sqlOf('down')).toEqual([]);
    });

    it('counts days in the player’s own time zone', async () => {
      const user = await register('fgTz');
      // 23:30 and 00:30 UTC on consecutive days are one evening in Los Angeles
      await pool.query(
        `INSERT INTO wordle_games (user_id, mode, difficulty, target, target_length, status, finished_at) VALUES
           ($1, 'practice', 'easy', 'mala', 4, 'won', '2026-03-10T23:30:00Z'),
           ($1, 'practice', 'easy', 'mala', 4, 'won', '2026-03-11T00:30:00Z')`,
        [user.id],
      );
      expect(await countFinishedGames(pool, user.id, 'UTC')).toEqual({ games: 2, days: 2 });
      expect(await countFinishedGames(pool, user.id, 'America/Los_Angeles')).toEqual({ games: 2, days: 1 });
      // a zone nobody knows is UTC, not an error
      expect(await countFinishedGames(pool, user.id, 'Mars/Olympus')).toEqual({ games: 2, days: 2 });
    });
  });

  describe('the admin inbox', () => {
    let admin: User;
    let support: User;
    let player: User;
    const ids: string[] = [];
    const marker = `marker${suffix}`;

    beforeAll(async () => {
      admin = await register('fbAdmin');
      await pool.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [admin.id]);
      await pass2fa(app, admin.token, '10.156.210.1');
      support = await register('fbSupport');
      await pool.query(`UPDATE users SET roles = '{support}' WHERE id = $1`, [support.id]);
      await pass2fa(app, support.token, '10.156.210.2');

      player = await register('fbPlayer');
      const answers = [
        { stars: 1, categories: ['bugs'], comment: `Crashes ${marker} on start`, platform: 'ios' },
        { stars: 2, categories: ['too_hard', 'lessons'], comment: `Too hard ${marker}`, platform: 'android' },
        { stars: 5, comment: `Love the deer ${marker}`, platform: 'web' },
        { categories: ['stories'], comment: `More stories ${marker}`, platform: 'web' },
      ];
      for (const a of answers) {
        const res = await call('POST', '/me/app-feedback', player, { source: 'settings', appVersion: '2.0.0', ...a });
        expect(res.statusCode, res.body).toBe(201);
        ids.push(res.json().id);
      }
    });

    const list = async (query: string, as: User = admin) => {
      const res = await call('GET', `/admin/feedback?q=${marker}${query}`, as);
      expect(res.statusCode, res.body).toBe(200);
      return res.json() as { items: Array<Record<string, unknown>>; total: number };
    };

    it('lists the newest first, with who sent it', async () => {
      const page = await list('');
      expect(page.total).toBe(4);
      expect(page.items.map((i) => i.id)).toEqual([...ids].reverse());
      expect(page.items[0]).toMatchObject({
        user: { id: player.id, username: `fbPlayer_${suffix}`.slice(0, 30) },
        stars: null,
        categories: ['stories'],
        source: 'settings',
        platform: 'web',
        appVersion: '2.0.0',
        status: 'new',
        adminNote: null,
      });
      expect(typeof page.items[0]!.createdAt).toBe('string');
    });

    it('filters by stars, category, platform and status, and pages', async () => {
      expect((await list('&stars=1,2')).total).toBe(2);
      expect((await list('&stars=5')).items[0]!.comment).toBe(`Love the deer ${marker}`);
      expect((await list('&category=lessons')).total).toBe(1);
      expect((await list('&platform=web')).total).toBe(2);
      expect((await list('&status=archived')).total).toBe(0);
      const page = await list('&limit=3&offset=3');
      expect(page.total).toBe(4);
      expect(page.items).toHaveLength(1);
      // the username is searched too
      const byName = await call('GET', `/admin/feedback?q=fbPlayer_${suffix}`, admin);
      expect(byName.json().total).toBe(4);
      // and a % in the search is a percent sign, not a wildcard (as one, it would match all four)
      expect((await call('GET', `/admin/feedback?q=${marker}%25`, admin)).json().total).toBe(0);
      expect((await call('GET', '/admin/feedback?stars=6', admin)).statusCode).toBe(400);
      // an empty filter (a cleared search box, "All") is no filter
      const unfiltered = await call('GET', `/admin/feedback?q=%20&status=&stars=&category=&platform=&source=`, admin);
      expect(unfiltered.statusCode, unfiltered.body).toBe(200);
      expect(unfiltered.json().total).toBeGreaterThanOrEqual(4);
    });

    it('marks an answer read or archived, and keeps a note', async () => {
      const res = await call('PATCH', `/admin/feedback/${ids[0]}`, admin, { status: 'read', adminNote: 'Bug #12' });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({ id: ids[0], status: 'read', adminNote: 'Bug #12' });

      // status alone leaves the note; a null note clears it
      expect((await call('PATCH', `/admin/feedback/${ids[0]}`, admin, { status: 'archived' })).json().adminNote).toBe(
        'Bug #12',
      );
      expect((await call('PATCH', `/admin/feedback/${ids[0]}`, admin, { adminNote: null })).json()).toMatchObject({
        status: 'archived',
        adminNote: null,
      });
      expect((await list('&status=archived')).total).toBe(1);

      expect((await call('PATCH', `/admin/feedback/${ids[0]}`, admin, {})).statusCode).toBe(400);
      expect((await call('PATCH', `/admin/feedback/${ids[0]}`, admin, { status: 'spam' })).statusCode).toBe(400);
      const tooLong = await call('PATCH', `/admin/feedback/${ids[0]}`, admin, { adminNote: '\ufb2c'.repeat(2000) });
      expect(tooLong.statusCode).toBe(400);
      const missing = await call('PATCH', '/admin/feedback/00000000-0000-4000-8000-000000000000', admin, { status: 'read' });
      expect(missing.statusCode).toBe(404);

      // and the change is in the audit log, as every admin change is
      const audit = await pool.query(
        `SELECT 1 FROM admin_audit_log WHERE admin_id = $1 AND action LIKE 'PATCH /admin/feedback/%'`,
        [admin.id],
      );
      expect(audit.rowCount).toBeGreaterThan(0);
    });

    it('sums up the stars, overall and over the last 30 days', async () => {
      const res = await call('GET', '/admin/feedback/summary', admin);
      expect(res.statusCode, res.body).toBe(200);
      const s = res.json();
      expect(s.total.count).toBeGreaterThanOrEqual(4);
      expect(s.total.distribution).toHaveLength(5);
      expect(s.total.distribution[0]).toBeGreaterThanOrEqual(1);
      expect(s.last30Days.count).toBeGreaterThanOrEqual(4);
      expect(s.daily).toHaveLength(30);
      expect(s.daily[29].day).toBe(new Date().toISOString().slice(0, 10));
      expect(s.daily[29].count).toBeGreaterThanOrEqual(4);
      expect(Object.keys(s.byStatus).sort()).toEqual(['archived', 'new', 'read']);
      expect(s.byCategory.too_hard).toBeGreaterThanOrEqual(1);

      // the averages are what the stars say
      const avg = await pool.query<{ a: number }>(`SELECT round(avg(stars), 2)::float AS a FROM app_feedback`);
      expect(s.total.averageStars).toBe(avg.rows[0]!.a);
    });

    it('is open to support as well as moderators, and to nobody else', async () => {
      expect((await call('GET', '/admin/feedback', support)).statusCode).toBe(200);
      expect((await call('GET', '/admin/feedback/summary', support)).statusCode).toBe(200);

      const editor = await register('fbEditor');
      await pool.query(`UPDATE users SET roles = '{content_editor}' WHERE id = $1`, [editor.id]);
      await pass2fa(app, editor.token, '10.156.210.3');
      expect((await call('GET', '/admin/feedback', editor)).statusCode).toBe(403);
      expect((await call('GET', '/admin/feedback', player)).statusCode).toBe(403);
      expect((await call('PATCH', `/admin/feedback/${ids[1]}`, player, { status: 'read' })).statusCode).toBe(403);
    });

    it('still needs the second factor', async () => {
      const unverified = await register('fbNo2fa');
      await pool.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [unverified.id]);
      const res = await call('GET', '/admin/feedback', unverified);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toMatch(/^TOTP_/);
    });
  });

  describe('GDPR', () => {
    it('exports the answers and when the person was asked', async () => {
      const user = await register('gdprExport');
      await call('POST', '/me/app-feedback', user, answer);
      await call('POST', '/me/store-review/prompted', user, { appVersion: '1.4.0' });
      const doc = await new GdprService(pool).buildExport(user.id);
      const feedback = doc.appFeedback as Record<string, unknown> & { answers: Array<Record<string, unknown>> };
      expect(feedback.app_feedback_prompted_at).not.toBeNull();
      expect(feedback.store_review_count).toBe(1);
      expect(feedback.answers).toHaveLength(1);
      expect(feedback.answers[0]).toMatchObject({ stars: 2, comment: 'The race froze on my phone.', platform: 'android' });
      // the team's own notes and inbox state are not part of it
      expect(feedback.answers[0]).not.toHaveProperty('admin_note');
      expect(feedback.answers[0]).not.toHaveProperty('status');
    });

    it('scrubs the comment when an account is anonymised, and keeps the stars', async () => {
      const user = await register('gdprAnon');
      const res = await call('POST', '/me/app-feedback', user, answer);
      const id = res.json().id as string;
      await pool.query(
        `UPDATE users SET deletion_requested_at = now() - interval '${DELETION_GRACE_DAYS + 1} days' WHERE id = $1`,
        [user.id],
      );
      await new GdprService(pool).anonymizeExpired();
      const row = await pool.query(`SELECT comment, stars, categories FROM app_feedback WHERE id = $1`, [id]);
      expect(row.rows[0]).toEqual({ comment: null, stars: 2, categories: ['games', 'bugs'] });
    });

    it('removes an answer that was only words when the account is anonymised', async () => {
      const user = await register('gdprWords');
      const words = await call('POST', '/me/app-feedback', user, {
        comment: `Only words ${suffix}`,
        source: 'settings',
        platform: 'web',
        appVersion: '1.0.0',
      });
      expect(words.statusCode, words.body).toBe(201);
      const rated = await call('POST', '/me/app-feedback', user, { ...answer, source: 'settings' });
      await pool.query(
        `UPDATE users SET deletion_requested_at = now() - interval '${DELETION_GRACE_DAYS + 1} days' WHERE id = $1`,
        [user.id],
      );
      await new GdprService(pool).anonymizeExpired();

      // the account is anonymised (scrubbing the comment did not stop it) …
      const account = await pool.query(`SELECT deleted_at FROM users WHERE id = $1`, [user.id]);
      expect(account.rows[0].deleted_at).not.toBeNull();
      // … the answer with nothing left once its words go is gone, and the rated one keeps its stars
      expect((await pool.query(`SELECT 1 FROM app_feedback WHERE id = $1`, [words.json().id])).rowCount).toBe(0);
      const kept = await pool.query(`SELECT comment, stars FROM app_feedback WHERE id = $1`, [rated.json().id]);
      expect(kept.rows[0]).toEqual({ comment: null, stars: 2 });
    });

    it('deletes a child’s answers when the account is closed', async () => {
      const child = await register('gdprChild', bornYearsAgo(14));
      const res = await call('POST', '/me/app-feedback', child, answer);
      expect(res.statusCode).toBe(201);
      await new GdprService(pool).closeNow(child.id, 'under_minimum_age');
      expect((await pool.query(`SELECT 1 FROM app_feedback WHERE user_id = $1`, [child.id])).rowCount).toBe(0);
    });
  });
});
