/** Rhyming Words training backend against real Postgres (CI job). KUR-299. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { RhymeService } from './rhyme-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('rhyme training service (integration)', () => {
  let pool: pg.Pool;
  const entryIds: string[] = [];
  const userIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);

  const serviceAt = (date: Date): RhymeService => new RhymeService(pool, { now: () => date });

  async function seedWord(headword: string): Promise<void> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO dict_entries (headword, headword_normalized, dialect)
       VALUES ($1, $1, 'kurmanji') RETURNING id`,
      [headword],
    );
    entryIds.push(res.rows[0]!.id);
  }

  async function makeUser(): Promise<string> {
    const n = userIds.length;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
      [`rhyme_${n}_${suffix}@it.kurda.app`, `rhyme_${n}_${suffix}`],
    );
    userIds.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  }

  /** Insert a training game with a known prompt + start time (bypasses random pick). */
  async function insertGame(userId: string, prompt: string, startedAt: Date, windowMs = 60_000): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO rhyme_games (user_id, mode, dialect, prompt, window_ms, started_at)
       VALUES ($1, 'training', 'kurmanci', $2, $3, $4) RETURNING id`,
      [userId, prompt, windowMs, startedAt],
    );
    return res.rows[0]!.id;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // The service picks its prompt at random from the WHOLE dictionary, so this
    // suite must own that table rather than assume it is empty (a baseline word
    // pool ships in a seed migration). Integration files run serially — see
    // api/vitest.config.ts — and every suite seeds the words it needs.
    await pool.query(`DELETE FROM dict_entries`);
    await Promise.all(['kul', 'roj'].map(seedWord)); // 'kul' rhymes with 'gul'; 'roj' does not
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
  });

  it('scores a real rhyming word and rejects non-rhymes, dups, the prompt, and non-words', async () => {
    const userId = await makeUser();
    const t0 = new Date();
    const id = await insertGame(userId, 'gul', t0);
    const svc = serviceAt(new Date(t0.getTime() + 1000));

    const good = await svc.submit(userId, id, 'kul');
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.result.accepted).toBe(true);
      expect(good.result.quality).toBe('perfect');
      expect(good.result.points).toBeGreaterThan(0);
      expect(good.game.score).toBe(good.result.points);
      expect(good.game.accepted).toBe(1);
    }

    const dup = await svc.submit(userId, id, 'kul');
    if (dup.ok) expect(dup.result.reason).toBe('already-used');

    const prompt = await svc.submit(userId, id, 'gul');
    if (prompt.ok) expect(prompt.result.reason).toBe('is-prompt');

    const notWord = await svc.submit(userId, id, 'zzqx');
    if (notWord.ok) expect(notWord.result.reason).toBe('not-a-word');

    const noRhyme = await svc.submit(userId, id, 'roj'); // real word, doesn't rhyme with gul
    if (noRhyme.ok) expect(noRhyme.result.reason).toBe('no-rhyme');
  });

  it('ends the game and awards XP for accepted rhymes', async () => {
    const userId = await makeUser();
    const t0 = new Date();
    const id = await insertGame(userId, 'gul', t0);
    const svc = serviceAt(new Date(t0.getTime() + 500));

    await svc.submit(userId, id, 'kul'); // 1 accepted
    const ended = await svc.end(userId, id);
    expect(ended.ok).toBe(true);
    if (ended.ok) {
      expect(ended.game.status).toBe('ended');
      expect(ended.game.xpAwarded).toBe(5); // 1 accepted * 5
    }

    // no more submissions after it ends
    const after = await svc.submit(userId, id, 'kul');
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toBe('ended');
  });

  it('ends (does not score) when the answer window has elapsed', async () => {
    const userId = await makeUser();
    const t0 = new Date();
    const id = await insertGame(userId, 'gul', t0, 1000); // 1s window
    const svc = serviceAt(new Date(t0.getTime() + 5000)); // well past the window

    const res = await svc.submit(userId, id, 'kul');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.game.status).toBe('ended');
      expect(res.result.accepted).toBe(false);
    }
  });

  it('starts a training game with a dictionary prompt', async () => {
    const userId = await makeUser();
    const res = await serviceAt(new Date()).startTraining(userId, 'kurmanci');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(['kul', 'roj']).toContain(res.game.prompt);
      expect(res.game.status).toBe('active');
      expect(res.game.remainingMs).toBeGreaterThan(0);
    }
  });
});
