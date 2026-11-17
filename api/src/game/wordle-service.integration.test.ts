/** Peyvok daily & practice backend against real Postgres (CI job). KUR-304. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { WordleService } from './wordle-service.js';
import { filterByDifficulty, pickDailyWord, utcDayIndex, type Difficulty } from './wordle-daily.js';
import { loadWordlePool } from './word-pool.js';
import { dictionaryKey, letterKey } from '@kurda/shared';
import { DictionaryRepository } from '../dictionary/repository.js';

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
  const cardIds: string[] = [];
  /** The days whose schedule these tests write, cleared afterwards so a second run starts from the same place. */
  const days = new Set<number>();

  const serviceAt = (date: Date): WordleService => {
    days.add(utcDayIndex(date));
    return new WordleService(pool, { now: () => date });
  };

  /** A curated word, written the way the seed migration and the admin screen write one. */
  async function seedWord(headword: string, dialect = 'kurmanji'): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [headword, letterKey(headword), dictionaryKey(headword), dialect],
    );
    entryIds.push(res.rows[0]!.id);
    return res.rows[0]!.id;
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
    if (cardIds.length) await pool.query(`DELETE FROM game_content WHERE id = ANY($1)`, [cardIds]);
    if (days.size) await pool.query(`DELETE FROM wordle_daily WHERE day_index = ANY($1)`, [[...days]]);
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

  it('gives two asks made at the same moment the one game of the day, and fails neither', async () => {
    const u = await makeUser();
    const svc = serviceAt(new Date('2026-08-03T09:00:00Z'));
    const answers = await Promise.all(Array.from({ length: 6 }, () => svc.startDaily(u, 'medium')));
    const ids = answers.map((a) => (a.ok ? a.game.id : null));
    expect(ids.every((id) => id !== null)).toBe(true);
    expect(new Set(ids).size).toBe(1);
    const rows = await pool.query(`SELECT count(*)::int AS n FROM wordle_games WHERE user_id = $1 AND mode = 'daily'`, [u]);
    expect(rows.rows[0].n).toBe(1);
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

  it('scores a first-guess daily win: reveals the answer, streak 1, and pays no XP for a game played alone', async () => {
    const u = await makeUser();
    const dayIndex = utcDayIndex(new Date('2026-08-03T00:00:00Z'));
    const gameId = await insertGame(u, 'daily', 'medium', 'malan', dayIndex);
    const svc = serviceAt(new Date());

    const res = await svc.guess(u, gameId, 'malan');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.game.status).toBe('won');
    expect(res.game.target).toBe('malan'); // revealed only now
    expect(res.game.xpAwarded).toBe(0);
    expect(res.game.guesses[0]!.feedback).toEqual(['green', 'green', 'green', 'green', 'green']);

    const stats = await svc.stats(u);
    expect(stats.wins).toBe(1);
    expect(stats.played).toBe(1);
    expect(stats.currentStreak).toBe(1);
    expect(stats.totalXp).toBe(0);
    expect(stats.winPercentage).toBe(100);

    const xp = await pool.query<{ xp: number }>(`SELECT xp FROM users WHERE id=$1`, [u]);
    expect(xp.rows[0]!.xp).toBe(0);
    expect((await pool.query(`SELECT 1 FROM xp_ledger WHERE user_id = $1`, [u])).rowCount).toBe(0);
  });

  it('pays none of the players of the same daily word: nothing is written to the ledger for Peyvok', async () => {
    const dayIndex = utcDayIndex(new Date('2026-08-05T00:00:00Z'));
    const players = [await makeUser(), await makeUser(), await makeUser()];
    const svc = serviceAt(new Date());

    for (const u of players) {
      const gameId = await insertGame(u, 'daily', 'medium', 'malan', dayIndex);
      const res = await svc.guess(u, gameId, 'malan');
      expect(res.ok && res.game.status).toBe('won');
      expect(res.ok && res.game.xpAwarded).toBe(0);
    }

    const xp = await pool.query<{ xp: number }>(`SELECT xp FROM users WHERE id = ANY($1)`, [players]);
    expect(xp.rows.map((r) => r.xp)).toEqual([0, 0, 0]);
    expect((await pool.query(`SELECT 1 FROM xp_ledger WHERE source = 'wordle' AND user_id = ANY($1)`, [players])).rowCount).toBe(0);
  });

  it('reports a daily win that extends the streak, so streak milestones can be awarded', async () => {
    const recorded: Array<[string, number]> = [];
    const milestones = {
      recordStreak: async (userId: string, current: number) => void recorded.push([userId, current]),
      recordLessonCompleted: async () => undefined,
    };
    const u = await makeUser();
    const gameId = await insertGame(u, 'daily', 'medium', 'malan', utcDayIndex(new Date('2026-08-06T00:00:00Z')));
    const res = await new WordleService(pool, { now: () => new Date(), milestones }).guess(u, gameId, 'malan');
    expect(res.ok).toBe(true);
    expect(recorded).toEqual([[u, 1]]);
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

  /**
   * A guess is found by the folded key (1751000115000), which is how an
   * imported word is stored, and then compared with its marks: a player who
   * typed the plain letters typed another word, and the tiles would score it as
   * that one. sevci is not sêvçî.
   */
  it('accepts an imported word as it is spelt, and not its letters without their marks', async () => {
    const imported = `sêvçî`;
    entryIds.push(await new DictionaryRepository(pool).createEntry(imported));

    const u = await makeUser();
    const gameId = await insertGame(u, 'practice', 'medium', 'malan', null);
    const svc = serviceAt(new Date());

    expect((await svc.guess(u, gameId, imported)).ok).toBe(true);
    const folded = await svc.guess(u, gameId, 'sevci');
    expect(folded).toEqual({ ok: false, reason: 'not-a-word' });
    const row = await pool.query<{ guesses: unknown[] }>(`SELECT guesses FROM wordle_games WHERE id = $1`, [gameId]);
    expect(row.rows[0]!.guesses).toHaveLength(1); // the refused one cost nothing
  });

  it('takes a word of another dialect of the dictionary as no Kurmancî guess, and a word the course teaches as one', async () => {
    await seedWord('zazak', 'zazaki');
    const card = await pool.query<{ id: string }>(
      `INSERT INTO game_content (kind, dialect, level, payload, status, review_status, source)
       VALUES ('word_card', 'kmr', 1, $1, 'published', 'approved', 'admin') RETURNING id`,
      [JSON.stringify({ word: 'qirşo', category: 'things', meanings: { en: 'a word only a lesson has' } })],
    );
    cardIds.push(card.rows[0]!.id);
    const u = await makeUser();
    const gameId = await insertGame(u, 'practice', 'medium', 'malan', null);
    const svc = serviceAt(new Date());
    expect(await svc.guess(u, gameId, 'zazak')).toEqual({ ok: false, reason: 'not-a-word' });
    expect((await svc.guess(u, gameId, 'qirşo')).ok).toBe(true);
  });

  it('gives each difficulty its own daily game the same day, and the same one again when asked twice', async () => {
    const u = await makeUser();
    const svc = serviceAt(new Date('2026-08-12T09:00:00Z'));
    const easy = await svc.startDaily(u, 'easy');
    const medium = await svc.startDaily(u, 'medium');
    expect(easy.ok && medium.ok).toBe(true);
    if (!easy.ok || !medium.ok) return;
    expect(easy.game.id).not.toBe(medium.game.id);
    expect([easy.game.difficulty, easy.game.targetLength]).toEqual(['easy', 4]);
    expect([medium.game.difficulty, medium.game.targetLength]).toEqual(['medium', 5]);
    const again = await svc.startDaily(u, 'easy');
    expect(again.ok && again.game.id).toBe(easy.game.id);
  });

  /**
   * The schedule's whole point: the first player of the day fixes the word,
   * and a word added to the pool afterwards — which reorders the permutation
   * the pick walks — does not move it for anybody who comes later.
   */
  it('keeps the day’s word for everyone once the first player has it, however the pool changes', async () => {
    const day = new Date('2026-08-13T08:00:00Z');
    const first = await serviceAt(day).startDaily(await makeUser(), 'medium');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const target = (await pool.query<{ target: string }>(`SELECT target FROM wordle_games WHERE id = $1`, [first.game.id])).rows[0]!.target;

    for (const w of ['nûjen', 'şîrev', 'gewez', 'birûz', 'tavik']) await seedWord(w);
    const later = await serviceAt(new Date('2026-08-13T20:00:00Z')).startDaily(await makeUser(), 'medium');
    expect(later.ok).toBe(true);
    if (!later.ok) return;
    const theirs = (await pool.query<{ target: string }>(`SELECT target FROM wordle_games WHERE id = $1`, [later.game.id])).rows[0]!.target;
    expect(theirs).toBe(target);
    const scheduled = await pool.query<{ word: string }>(`SELECT word FROM wordle_daily WHERE day_index = $1 AND difficulty = 'medium'`, [
      utcDayIndex(day),
    ]);
    expect(scheduled.rows[0]?.word).toBe(target);
  });

  it('keeps the word a day was already played with before there was a schedule', async () => {
    const day = new Date('2026-08-14T10:00:00Z');
    const dayIndex = utcDayIndex(day);
    days.add(dayIndex);
    await pool.query(`DELETE FROM wordle_daily WHERE day_index = $1`, [dayIndex]);
    await insertGame(await makeUser(), 'daily', 'hard', 'kurdis', dayIndex);

    const res = await serviceAt(day).startDaily(await makeUser(), 'hard');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const target = (await pool.query<{ target: string }>(`SELECT target FROM wordle_games WHERE id = $1`, [res.game.id])).rows[0]!.target;
    expect(target).toBe('kurdis');
  });

  it('does not set a daily word that was set within the repeat window', async () => {
    const day = new Date('2026-08-16T10:00:00Z');
    const dayIndex = utcDayIndex(day);
    days.add(dayIndex - 1);
    await pool.query(`DELETE FROM wordle_daily WHERE day_index IN ($1, $2)`, [dayIndex, dayIndex - 1]);
    // the word the day would have had, set yesterday as if the pool had been ordered differently then
    const own = pickDailyWord(filterByDifficulty(await loadWordlePool(pool), 'medium'), dayIndex, 'medium')!;
    await pool.query(`INSERT INTO wordle_daily (day_index, difficulty, word) VALUES ($1, 'medium', $2)`, [dayIndex - 1, own]);

    const res = await serviceAt(day).startDaily(await makeUser(), 'medium');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const target = (await pool.query<{ target: string }>(`SELECT target FROM wordle_games WHERE id = $1`, [res.game.id])).rows[0]!.target;
    expect(target).not.toBe(own);
  });

  it('counts a day once in the streak when two difficulties are played on it', async () => {
    const u = await makeUser();
    const svc = serviceAt(new Date());
    const day = 21100;
    await svc.guess(u, await insertGame(u, 'daily', 'easy', 'mala', day), 'mala');
    await svc.guess(u, await insertGame(u, 'daily', 'medium', 'kurdi', day), 'kurdi');
    const stats = await svc.stats(u);
    expect([stats.wins, stats.currentStreak, stats.lastDailyDayIndex]).toEqual([2, 1, day]);
  });

  /**
   * The results card: exactly the answer's meaning, never a search's nearest
   * hit (which is how the phone once showed another word's), and a save that
   * counts once toward the words learned.
   */
  it('shows the finished game’s word with its meaning, and saves it to the player’s words once', async () => {
    // a made-up word, so no word list the migrations seed (the Peyvok pool holds zirav) has an entry of its own for it
    const entryId = await seedWord('zuqav');
    await pool.query(`INSERT INTO dict_senses (entry_id, position, pos, definition_en) VALUES ($1, 1, 'adjective', 'thin, slender')`, [entryId]);
    const u = await makeUser();
    const svc = serviceAt(new Date());
    const gameId = await insertGame(u, 'practice', 'medium', 'zuqav', null);

    expect(await svc.saveWord(u, gameId)).toEqual({ ok: false, reason: 'not-finished' });
    const won = await svc.guess(u, gameId, 'zuqav');
    expect(won.ok).toBe(true);
    if (!won.ok) return;
    expect(won.game.word).toEqual({ entryId, meanings: { en: 'thin, slender' }, saved: false });

    const saved = await svc.saveWord(u, gameId);
    expect(saved.ok && saved.wordsLearned).toBe(1);
    const twice = await svc.saveWord(u, gameId);
    expect(twice.ok && twice.wordsLearned).toBe(1);
    expect((await svc.stats(u)).wordsLearned).toBe(1);
    expect(await svc.saveWord(await makeUser(), gameId)).toEqual({ ok: false, reason: 'not-found' });

    // the word shows as saved on the game from now on
    const resumed = await pool.query(`SELECT 1 FROM saved_words WHERE user_id = $1 AND entry_id = $2`, [u, entryId]);
    expect(resumed.rowCount).toBe(1);
  });

  it('gives the meanings of the word’s card, in every language it has, before a dictionary gloss', async () => {
    const entryId = await seedWord('fireh');
    await pool.query(`INSERT INTO dict_senses (entry_id, position, pos, definition_en) VALUES ($1, 1, 'adjective', 'wide (gloss)')`, [entryId]);
    const card = await pool.query<{ id: string }>(
      `INSERT INTO game_content (kind, dialect, level, payload, status, review_status, source)
       VALUES ('word_card', 'kmr', 1, $1, 'published', 'approved', 'admin') RETURNING id`,
      [JSON.stringify({ word: 'fireh', category: 'qualities', meanings: { en: 'wide', de: 'breit', ckb: 'پان' } })],
    );
    cardIds.push(card.rows[0]!.id);
    const u = await makeUser();
    const gameId = await insertGame(u, 'practice', 'medium', 'fireh', null);
    const won = await serviceAt(new Date()).guess(u, gameId, 'fireh');
    expect(won.ok && won.game.word?.meanings).toEqual({ en: 'wide', de: 'breit', ckb: 'پان' });
  });

  it('keeps the streak at 0 on a daily loss, and pays nothing for taking part', async () => {
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
    expect(last!.game.xpAwarded).toBe(0);

    const stats = await svc.stats(u);
    expect(stats.losses).toBe(1);
    expect(stats.currentStreak).toBe(0);
    expect(stats.totalXp).toBe(0);
  });

  it('practice win pays nothing and never touches the daily streak', async () => {
    const u = await makeUser();
    const gameId = await insertGame(u, 'practice', 'medium', 'kurdi', null);
    const svc = serviceAt(new Date());

    const res = await svc.guess(u, gameId, 'kurdi');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.game.status).toBe('won');
    expect(res.game.xpAwarded).toBe(0);

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
