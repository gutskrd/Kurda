/** Wordle daily & practice backend against real Postgres (CI job). KUR-304. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { WordleService } from './wordle-service.js';
import { utcDayIndex, type Difficulty } from './wordle-daily.js';

const DATABASE_URL = process.env.DATABASE_URL;

// 5-letter Kurdish-ish words for the medium pool + valid guesses
const MEDIUM = ['malan', 'kurdi', 'rojan', 'zarok', 'aveji', 'bajar', 'welat', 'zanik'];
const EASY = ['mala', 'kurd', 'roja', 'name'];
const HARD = ['zimane', 'welate', 'kurdis'];

describe.skipIf(!DATABASE_URL)('wordle service (integration)', () => {
  let pool: pg.Pool;
  const entryIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);
  const userIds: string[] = [];

  const serviceAt = (date: Date): WordleService =>
    new WordleService(pool, { now: () => date });

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
      [`wordle_${n}_${suffix}@it.kurda.app`, `wordle_${n}_${suffix}`],
    );
    const id = res.rows[0]!.id;
    userIds.push(id);
    return id;
  }

  /** Insert a game with a known target, bypassing selection, so guess/XP/stats are deterministic. */
  async function insertGame(
    userId: string,
    mode: 'daily' | 'practice',
    difficulty: Difficulty,
    target: string,
    dayIndex: number | null,
  ): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO wordle_games (user_id, mode, difficulty, day_index, target, target_length)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, mode, difficulty, dayIndex, target, [...target].length],
    );
    return res.rows[0]!.id;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    for (const w of [...EASY, ...MEDIUM, ...HARD]) await seedWord(w);
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

  it('gives every player the same daily word, and withholds the answer while playing', async () => {
    const day = new Date('2026-08-01T12:00:00Z');
    const a = await makeUser();
    const b = await makeUser();
    const svc = serviceAt(day);

    const gameA = await svc.startDaily(a, 'medium');
    const gameB = await svc.startDaily(b, 'medium');
    expect(gameA.ok && gameB.ok).toBe(true);
    if (!gameA.ok || !gameB.ok) return;

    // answer never leaves the server while the game is in progress
    expect(gameA.game.target).toBeNull();

    const [ta, tb] = await Promise.all([
      pool.query<{ target: string }>(`SELECT target FROM wordle_games WHERE id = $1`, [gameA.game.id]),
      pool.query<{ target: string }>(`SELECT target FROM wordle_games WHERE id = $1`, [gameB.game.id]),
    ]);
    expect(ta.rows[0]!.target).toBe(tb.rows[0]!.target);
  });

  it('blocks a second daily game the same day (resumes the first)', async () => {
    const day = new Date('2026-08-02T09:00:00Z');
    const u = await makeUser();
    const svc = serviceAt(day);

    const first = await svc.startDaily(u, 'medium');
    const second = await svc.startDaily(u, 'medium');
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.game.id).toBe(first.game.id); // same game, not a new word
  });

  it('rotates the daily word every 24h', async () => {
    const u1 = await makeUser();
    const u2 = await makeUser();
    const g1 = await serviceAt(new Date('2026-08-10T12:00:00Z')).startDaily(u1, 'medium');
    const g2 = await serviceAt(new Date('2026-08-11T12:00:00Z')).startDaily(u2, 'medium');
    expect(g1.ok && g2.ok).toBe(true);
    if (!g1.ok || !g2.ok) return;
    const t1 = await pool.query<{ target: string }>(`SELECT target FROM wordle_games WHERE id=$1`, [g1.game.id]);
    const t2 = await pool.query<{ target: string }>(`SELECT target FROM wordle_games WHERE id=$1`, [g2.game.id]);
    expect(t1.rows[0]!.target).not.toBe(t2.rows[0]!.target);
  });

  it('scores a first-guess daily win: reveals answer, awards 100 XP, streak 1', async () => {
    const u = await makeUser();
    const dayIndex = utcDayIndex(new Date('2026-08-03T00:00:00Z'));
    const gameId = await insertGame(u, 'daily', 'medium', 'malan', dayIndex);
    const svc = serviceAt(new Date());

    const res = await svc.guess(u, gameId, 'malan');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.game.status).toBe('won');
    expect(res.game.target).toBe('malan'); // revealed only now
    expect(res.game.xpAwarded).toBe(100);
    expect(res.game.guesses[0]!.feedback).toEqual(['green', 'green', 'green', 'green', 'green']);

    const stats = await svc.stats(u);
    expect(stats.wins).toBe(1);
    expect(stats.played).toBe(1);
    expect(stats.currentStreak).toBe(1);
    expect(stats.totalXp).toBe(100);
    expect(stats.winPercentage).toBe(100);

    const xp = await pool.query<{ xp: number }>(`SELECT xp FROM users WHERE id=$1`, [u]);
    expect(xp.rows[0]!.xp).toBe(100);
  });

  it('rejects wrong-length and non-dictionary guesses without consuming an attempt', async () => {
    const u = await makeUser();
    const gameId = await insertGame(u, 'practice', 'medium', 'malan', null);
    const svc = serviceAt(new Date());

    const shortGuess = await svc.guess(u, gameId, 'mal');
    expect(shortGuess.ok).toBe(false);
    if (!shortGuess.ok) expect(shortGuess.reason).toBe('wrong-length');

    const notWord = await svc.guess(u, gameId, 'abcde');
    expect(notWord.ok).toBe(false);
    if (!notWord.ok) expect(notWord.reason).toBe('not-a-word');

    const row = await pool.query<{ guesses: unknown[] }>(`SELECT guesses FROM wordle_games WHERE id=$1`, [gameId]);
    expect(row.rows[0]!.guesses).toHaveLength(0); // neither attempt landed
  });

  it('awards participation XP (10) on a daily loss and keeps streak at 0', async () => {
    const u = await makeUser();
    const dayIndex = utcDayIndex(new Date('2026-08-04T00:00:00Z'));
    const gameId = await insertGame(u, 'daily', 'medium', 'malan', dayIndex);
    const svc = serviceAt(new Date());

    const wrong = ['kurdi', 'rojan', 'zarok', 'aveji', 'bajar', 'welat'];
    let last;
    for (const w of wrong) last = await svc.guess(u, gameId, w);
    expect(last!.ok).toBe(true);
    if (!last!.ok) return;
    expect(last!.game.status).toBe('lost');
    expect(last!.game.xpAwarded).toBe(10);

    const stats = await svc.stats(u);
    expect(stats.losses).toBe(1);
    expect(stats.currentStreak).toBe(0);
    expect(stats.totalXp).toBe(10);
  });

  it('practice win pays reduced XP (50) and never touches the daily streak', async () => {
    const u = await makeUser();
    const gameId = await insertGame(u, 'practice', 'medium', 'kurdi', null);
    const svc = serviceAt(new Date());

    const res = await svc.guess(u, gameId, 'kurdi');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.game.status).toBe('won');
    expect(res.game.xpAwarded).toBe(50); // round(100 * 0.5)

    const stats = await svc.stats(u);
    expect(stats.wins).toBe(1);
    expect(stats.currentStreak).toBe(0); // practice never affects streak
    expect(stats.lastDailyDayIndex).toBeNull();
  });

  it('increments the streak across consecutive daily wins', async () => {
    const u = await makeUser();
    const svc = serviceAt(new Date());
    const d0 = 21000;

    const g0 = await insertGame(u, 'daily', 'medium', 'malan', d0);
    await svc.guess(u, g0, 'malan');
    const g1 = await insertGame(u, 'daily', 'medium', 'kurdi', d0 + 1);
    await svc.guess(u, g1, 'kurdi');

    const stats = await svc.stats(u);
    expect(stats.wins).toBe(2);
    expect(stats.currentStreak).toBe(2);
    expect(stats.longestStreak).toBe(2);
  });
});
