/** Typing race against real Postgres: admin curation, and server-side scoring. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('typing race (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let adminToken = '';
  let playerToken = '';
  let playerId = '';
  const TEXT = 'Ez ji welatê xwe hez dikim û her roj hînî tiştekî nû dibim.';

  async function register(name: string, ip: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
      remoteAddress: '10.77.5.5',
    });

  /**
   * Make a race look like somebody typed it.
   *
   * Injecting a start and a finish back to back is a run of a few milliseconds,
   * which the scorer now rejects as faster than anyone types — correctly, since
   * that is exactly the shape of a paste. Moving `started_at` back is the only
   * honest way to fake elapsed time here, because elapsed time is the one thing
   * the client cannot tell the server.
   */
  async function typedFor(gameId: string, seconds: number): Promise<void> {
    await pool.query(`UPDATE race_games SET started_at = now() - ($2 || ' seconds')::interval WHERE id = $1`, [
      gameId,
      String(seconds),
    ]);
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const admin = await register('raceAdmin', '10.77.0.1');
    adminToken = admin.token;
    const player = await register('racePlayer', '10.77.0.2');
    playerToken = player.token;
    playerId = player.id;
    await pool.query(`UPDATE users SET roles = '{admin,superadmin}' WHERE id = $1`, [admin.id]);
    // every /admin route is behind 2FA now
    await pass2fa(app, adminToken);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM race_texts WHERE title LIKE $1`, [`it_${suffix}%`]);
    // deleting a user cascades into xp_ledger, which a trigger keeps append-only;
    // the ledger_admin flag is the sanctioned way through it
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('says so plainly when an admin has not added any texts', async () => {
    // whatever else exists, a difficulty nobody has curated is empty
    await pool.query(`UPDATE race_texts SET active = false WHERE difficulty = 3`);
    const res = await call('POST', '/race', playerToken, { difficulty: 3 });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('EMPTY_RACE_POOL');
  });

  it('an admin adds a text and a racer gets it', async () => {
    const created = await call('POST', '/admin/race/texts', adminToken, {
      title: `it_${suffix} welat`,
      body: TEXT,
      difficulty: 3,
    });
    expect(created.statusCode).toBe(201);

    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    expect(race.statusCode).toBe(200);
    expect(race.json().text.body).toBe(TEXT);
    expect(race.json().id).toBeTruthy();
  });

  it('scores from the server clock, so a racer cannot claim their own time', async () => {
    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    const id = race.json().id as string;
    await typedFor(id, 25);

    // a perfect run: the elapsed time is whatever the server measured, and
    // nothing in the request could change it
    const done = await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT });
    expect(done.statusCode).toBe(200);
    const result = done.json();
    expect(result.accuracy).toBe(1);
    expect(result.perfect).toBe(true);
    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(Number.isFinite(result.wpm)).toBe(true);
    expect(result.xpAwarded).toBeGreaterThan(0);
    expect(result.implausible).toBe(false);
  });

  /**
   * The typing box refuses a paste, but nothing here went through a typing box.
   * This is the request a cheat actually sends: the whole text, at once, the
   * instant the race is handed out.
   */
  it('will not rank or pay a run that arrives faster than anyone types', async () => {
    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    const id = race.json().id as string;

    const done = await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT });
    expect(done.statusCode).toBe(200);
    const result = done.json();
    expect(result.implausible).toBe(true);
    expect(result.score).toBe(0);
    expect(result.xpAwarded).toBe(0);
    expect(result.perfect).toBe(false);
    // the reading is still honest — only what it is worth is zero
    expect(result.accuracy).toBe(1);
    expect(result.wpm).toBeGreaterThan(350);

    // and nothing was paid for it
    const rows = await pool.query(`SELECT 1 FROM xp_ledger WHERE source = 'race' AND ref_id = $1`, [id]);
    expect(rows.rowCount).toBe(0);
  });

  it('refuses to finish the same race twice', async () => {
    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    const id = race.json().id as string;
    expect((await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT })).statusCode).toBe(200);

    // otherwise a racer could keep submitting until they liked the number, and
    // keep being paid for it
    const again = await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('ALREADY_FINISHED');
  });

  it('will not let one racer finish another racer race', async () => {
    const other = await register('raceThief', '10.77.0.3');
    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    const id = race.json().id as string;
    const res = await call('POST', `/race/${id}/finish`, other.token, { typed: TEXT });
    expect(res.statusCode).toBe(404);
  });

  it('pays XP once, however many times a finish is retried', async () => {
    const before = await pool.query<{ n: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text n FROM xp_ledger WHERE user_id = $1 AND source = 'race'`,
      [playerId],
    );
    const race = await call('POST', '/race', playerToken, { difficulty: 3 });
    const id = race.json().id as string;
    await typedFor(id, 25); // a run that pays at all has to be one a person could type
    await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT });
    await call('POST', `/race/${id}/finish`, playerToken, { typed: TEXT }); // rejected
    const after = await pool.query<{ n: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text n FROM xp_ledger WHERE user_id = $1 AND source = 'race'`,
      [playerId],
    );
    const paid = Number(after.rows[0]!.n) - Number(before.rows[0]!.n);
    expect(paid).toBeGreaterThan(0);
    // one race, one payment — (source, ref_id) is unique
    const rows = await pool.query(`SELECT 1 FROM xp_ledger WHERE source = 'race' AND ref_id = $1`, [id]);
    expect(rows.rowCount).toBe(1);
  });

  it('lists a racer best runs', async () => {
    const res = await call('GET', '/race/best', playerToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().races.length).toBeGreaterThan(0);
    expect(res.json().races[0]).toHaveProperty('wpm');
  });

  it('refuses a text too short to be a race', async () => {
    const res = await call('POST', '/admin/race/texts', adminToken, {
      title: `it_${suffix} tiny`,
      body: 'kurt',
      difficulty: 1,
    });
    expect(res.statusCode).toBe(400);
  });

  it('keeps race curation to admins', async () => {
    const res = await call('GET', '/admin/race/texts', playerToken);
    expect(res.statusCode).toBe(403);
  });

  // ---- varieties, accent modes, and what a keyboard actually sends ---------

  const SORANI = 'ڕۆژێکی خۆش بوو، چووینە باخچەکە و گوڵمان چنی.';
  /** TEXT as somebody without the accented keys types it */
  const PLAIN = TEXT.replace(/ê/g, 'e').replace(/î/g, 'i').replace(/û/g, 'u');

  async function race(payload: Record<string, unknown>): Promise<{ id: string; body: string; json: Record<string, unknown> }> {
    const res = await call('POST', '/race', playerToken, payload);
    expect(res.statusCode, res.body).toBe(200);
    return { id: res.json().id, body: res.json().text.body, json: res.json() };
  }

  it('hands a racer a text in the variety they asked for, and never the other', async () => {
    const created = await call('POST', '/admin/race/texts', adminToken, {
      title: `it_${suffix} soranî`,
      body: SORANI,
      language: 'ckb',
      difficulty: 3,
    });
    expect(created.statusCode, created.body).toBe(201);

    const sorani = await race({ length: 3, dialect: 'sorani' });
    expect(sorani.body).toBe(SORANI);
    expect(sorani.json).toMatchObject({ dialect: 'sorani', text: { language: 'ckb' } });

    // a Kurmancî racer (and an older app that does not say) is handed Kurmancî
    for (let i = 0; i < 6; i++) {
      const kurmanci = await race(i % 2 ? { length: 3 } : { difficulty: 3, dialect: 'kurmanci' });
      expect(kurmanci.json).toMatchObject({ dialect: 'kurmanci', text: { language: 'kmr' } });
    }
  });

  it('says the pool is empty for a variety with no texts at that length', async () => {
    await pool.query(`UPDATE race_texts SET active = false WHERE language = 'ckb' AND difficulty = 1`);
    const res = await call('POST', '/race', playerToken, { length: 1, dialect: 'sorani' });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('EMPTY_RACE_POOL');
  });

  it('stores the accent mode and scores the race in it', async () => {
    const strict = await race({ length: 3, accentMode: 'strict' });
    expect(strict.json.accentMode).toBe('strict');
    await typedFor(strict.id, 25);
    const strictDone = (await call('POST', `/race/${strict.id}/finish`, playerToken, { typed: PLAIN })).json();
    expect(strictDone.accentMode).toBe('strict');
    expect(strictDone.accuracy).toBeLessThan(1);
    expect(strictDone.accentMisses).toBe(6);

    const forgiving = await race({ length: 3, accentMode: 'forgiving' });
    await typedFor(forgiving.id, 25);
    const forgivingDone = (await call('POST', `/race/${forgiving.id}/finish`, playerToken, { typed: PLAIN })).json();
    expect(forgivingDone.accuracy).toBe(1);
    expect(forgivingDone.accentMisses).toBe(6);
    // seven accented letters reached: the ş was typed with its accent
    expect(forgivingDone.accented).toBe(7);
    expect(forgivingDone.perfect).toBe(false);

    const row = await pool.query(`SELECT accent_mode, accent_misses, errors FROM race_games WHERE id = $1`, [strict.id]);
    expect(row.rows[0]).toEqual({ accent_mode: 'strict', accent_misses: 6, errors: 6 });
  });

  it('refuses an accent mode or a variety it does not know', async () => {
    expect((await call('POST', '/race', playerToken, { accentMode: 'lazy' })).statusCode).toBe(400);
    expect((await call('POST', '/race', playerToken, { dialect: 'zazaki' })).statusCode).toBe(400);
  });

  it('keeps a personal best per accent mode, and the first race is not one', async () => {
    const first = await race({ length: 3, accentMode: 'hidden' });
    await typedFor(first.id, 30);
    const one = (await call('POST', `/race/${first.id}/finish`, playerToken, { typed: TEXT })).json();
    expect(one.personalBest).toBe(false);

    const faster = await race({ length: 3, accentMode: 'hidden' });
    await typedFor(faster.id, 15);
    expect((await call('POST', `/race/${faster.id}/finish`, playerToken, { typed: TEXT })).json().personalBest).toBe(true);

    const slower = await race({ length: 3, accentMode: 'hidden' });
    await typedFor(slower.id, 40);
    expect((await call('POST', `/race/${slower.id}/finish`, playerToken, { typed: TEXT })).json().personalBest).toBe(false);

    const best = (await call('GET', '/race/best?accentMode=hidden', playerToken)).json();
    expect(best.races.every((r: { accentMode: string }) => r.accentMode === 'hidden')).toBe(true);
    expect(best.personalBests.hidden.score).toBe(best.races[0].score);
    expect(best.personalBests.strict).toBeNull(); // filtered to one mode

    const all = (await call('GET', '/race/best', playerToken)).json();
    expect(Object.keys(all.personalBests).sort()).toEqual(['forgiving', 'hidden', 'strict']);
    expect(all.personalBests.hidden).not.toBeNull();
    expect(all.personalBests.forgiving).not.toBeNull();
  });

  it('scores one missed letter as one letter, not the rest of the text', async () => {
    const r = await race({ length: 3, accentMode: 'strict' });
    await typedFor(r.id, 25);
    const done = (await call('POST', `/race/${r.id}/finish`, playerToken, { typed: TEXT.slice(1) })).json();
    expect(done.correctChars).toBe([...TEXT].length - 1);
    expect(done.accuracy).toBeGreaterThan(0.95);
    expect(done.score).toBeGreaterThan(0);
  });

  it('does not count a dead key’s accent as the last letter', async () => {
    const r = await race({ length: 3, accentMode: 'strict' });
    await typedFor(r.id, 25);
    // the racer pressed ^ for the final letter and the app sent what the field held
    const typed = TEXT.replace(/m\.$/, 'ˆ');
    const done = (await call('POST', `/race/${r.id}/finish`, playerToken, { typed })).json();
    expect(done.perfect).toBe(false);
    expect(done.errors).toBe(0);
    expect(done.correctChars).toBe([...TEXT].length - 2);
  });

  it('saves a pasted text the way a keyboard types it, and warns about what nobody can type', async () => {
    const pasted = 'Ew\u00a0dibêje: “Kafe\u0301 û çay”— ji bo te…';
    const res = await call('POST', '/admin/race/texts', adminToken, {
      title: `it_${suffix}  pasted `,
      body: pasted,
      difficulty: 2,
    });
    expect(res.statusCode, res.body).toBe(201);
    const text = res.json();
    expect(text.body).toBe('Ew dibêje: "Kafé û çay"- ji bo te...');
    expect(text.title).toBe(`it_${suffix} pasted`);
    expect(text.untypeable).toEqual([{ char: 'é', codePoint: 'U+00E9', count: 1 }]);
    const stored = await pool.query(`SELECT body FROM race_texts WHERE id = $1`, [text.id]);
    expect(stored.rows[0].body).toBe(text.body);

    // and the list shows the warning for texts already saved
    const list = (await call('GET', '/admin/race/texts', adminToken)).json();
    const listed = list.texts.find((t: { id: string }) => t.id === text.id);
    expect(listed.untypeable).toHaveLength(1);
  });

  it('saves a Soranî text copied out of a PDF as its letters, with nothing to warn about', async () => {
    // a PDF hands over every letter as its shaped presentation form
    const shaped = SORANI.replace(/ک/g, 'ﻛ').replace(/ی/g, 'ﯼ').replace(/و/g, 'ﻮ');
    expect(shaped).not.toBe(SORANI);
    const res = await call('POST', '/admin/race/texts', adminToken, {
      title: `it_${suffix} pdf`,
      body: shaped,
      language: 'ckb',
      difficulty: 2,
      active: false,
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().body).toBe(SORANI);
    expect(res.json().untypeable).toEqual([]);
  });

  it('refuses a text that is too short once its spaces are tidied, and an unknown language', async () => {
    const spaced = await call('POST', '/admin/race/texts', adminToken, {
      title: `it_${suffix} spaced`,
      body: 'ez        ji       welat',
      difficulty: 1,
    });
    expect(spaced.statusCode).toBe(400);
    expect(spaced.json().code).toBe('TEXT_TOO_SHORT');

    const unknown = await call('POST', '/admin/race/texts', adminToken, {
      title: `it_${suffix} unknown`,
      body: TEXT,
      language: 'xx',
      difficulty: 1,
    });
    expect(unknown.statusCode).toBe(400);
  });

  /*
   * Texts saved before saving normalised them are still in the table as they
   * were pasted. One stored decomposed could not be typed at all.
   */
  it('hands out and scores an old text stored decomposed as the text a keyboard types', async () => {
    await pool.query(`UPDATE race_texts SET active = false WHERE difficulty = 2`);
    const decomposed = TEXT.normalize('NFD');
    expect(decomposed).not.toBe(TEXT);
    await pool.query(
      `INSERT INTO race_texts (title, body, language, difficulty, active) VALUES ($1, $2, 'kmr', 2, true)`,
      [`it_${suffix} decomposed`, decomposed],
    );
    const r = await race({ length: 2, accentMode: 'strict' });
    expect(r.body).toBe(TEXT);
    await typedFor(r.id, 25);
    const done = (await call('POST', `/race/${r.id}/finish`, playerToken, { typed: TEXT })).json();
    expect(done.perfect).toBe(true);
    expect(done.accuracy).toBe(1);
  });
});
