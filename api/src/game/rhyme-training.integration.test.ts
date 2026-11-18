/** Peyvên Hevserwa training backend against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dictionaryKey, letterKey } from '@kurda/shared';
import pg from 'pg';
import { RhymeService } from './rhyme-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('rhyme training service (integration)', () => {
  let pool: pg.Pool;
  const entryIds: string[] = [];
  const userIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);

  const serviceAt = (date: Date): RhymeService => new RhymeService(pool, { now: () => date });

  async function seedWord(headword: string, dialect = 'kurmanji', opts: { prompt?: boolean; meaning?: string } = {}): Promise<void> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games, is_rhyme_prompt)
       VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
      [headword, letterKey(headword), dictionaryKey(headword), dialect, opts.prompt ?? false],
    );
    entryIds.push(res.rows[0]!.id);
    if (opts.meaning) {
      await pool.query(`INSERT INTO dict_senses (entry_id, position, pos, definition_en) VALUES ($1, 1, 'noun', $2)`, [res.rows[0]!.id, opts.meaning]);
    }
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
  async function insertGame(userId: string, prompt: string, startedAt: Date, windowMs = 60_000, dialect = 'kurmanci'): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO rhyme_games (user_id, mode, dialect, prompt, window_ms, started_at)
       VALUES ($1, 'training', $5, $2, $3, $4) RETURNING id`,
      [userId, prompt, windowMs, startedAt, dialect],
    );
    return res.rows[0]!.id;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // The service picks its prompt from the WHOLE dictionary, so this suite owns that table rather than assume it empty
    // (a seed migration ships a word pool). Integration files run serially, and each suite seeds the words it needs.
    await pool.query(`DELETE FROM dict_entries`);
    await Promise.all(['kul', 'roj'].map((w) => seedWord(w))); // 'kul' rhymes with 'gul'; 'roj' does not
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

  it('ends the game, and pays no XP for rhymes found alone', async () => {
    const userId = await makeUser();
    const t0 = new Date();
    const id = await insertGame(userId, 'gul', t0);
    const svc = serviceAt(new Date(t0.getTime() + 500));

    await svc.submit(userId, id, 'kul'); // 1 accepted
    const ended = await svc.end(userId, id);
    expect(ended.ok).toBe(true);
    if (ended.ok) {
      expect(ended.game.status).toBe('ended');
      expect(ended.game.xpAwarded).toBe(0);
    }
    expect((await pool.query(`SELECT 1 FROM xp_ledger WHERE user_id = $1`, [userId])).rowCount).toBe(0);

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

  it('starts a Soranî round on a Soranî prompt, never a Kurmancî one in the Latin alphabet', async () => {
    await seedWord('باران', 'sorani');
    await seedWord('نان', 'sorani');
    const userId = await makeUser();
    const res = await serviceAt(new Date()).startTraining(userId, 'sorani');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(['باران', 'نان']).toContain(res.game.prompt);
      expect(res.game.dialect).toBe('sorani');
    }
  });

  /**
   * A word the course teaches counts as its card spells it: a Soranî h written ه on the card and ھ from the keyboard is
   * the same letter and word.
   */
  it('takes a Soranî word the course teaches, however its h is written', async () => {
    const card = await pool.query<{ id: string }>(
      `INSERT INTO game_content (kind, dialect, level, payload, status, review_status, source)
       VALUES ('word_card', 'ckb', 1, $1, 'published', 'approved', 'admin') RETURNING id`,
      [JSON.stringify({ word: 'هەرزان', category: 'money', meanings: { en: 'cheap' } })],
    );
    try {
      const userId = await makeUser();
      const t0 = new Date();
      const id = await insertGame(userId, 'باران', t0, 60_000, 'sorani');
      const res = await serviceAt(new Date(t0.getTime() + 1000)).submit(userId, id, 'هەرزان');
      expect(res.ok && res.result).toMatchObject({ accepted: true, quality: 'perfect' });
    } finally {
      await pool.query(`DELETE FROM game_content WHERE id = $1`, [card.rows[0]!.id]);
    }
  });

  /** The prompt şev typed as "sev" used to be found by the folded key and score as a perfect rhyme of itself. */
  it('refuses the prompt typed without its marks, and a word the filter refuses', async () => {
    for (const w of ['şev', 'sêv', 'derî', 'kerî']) await seedWord(w);
    const userId = await makeUser();
    const t0 = new Date();
    const svc = serviceAt(new Date(t0.getTime() + 1000));
    const night = await insertGame(userId, 'şev', t0);
    const sev = await svc.submit(userId, night, 'sev');
    expect(sev.ok && sev.result).toMatchObject({ accepted: false, reason: 'not-a-word' });
    const apple = await svc.submit(userId, night, 'sêv');
    expect(apple.ok && apple.result).toMatchObject({ accepted: true, quality: 'near' });

    // a round played alone is still words on a screen: the filter applies as it does in a match
    const door = await insertGame(userId, 'derî', t0);
    const flagged = await svc.submit(userId, door, 'kerî');
    expect(flagged.ok && flagged.result).toMatchObject({ accepted: false, reason: 'profane' });
  });

  it('shows the rhymes the player missed when the round ends, with what they mean', async () => {
    await seedWord('pul', 'kurmanji', { meaning: 'stamp' });
    await seedWord('gul');
    const userId = await makeUser();
    const t0 = new Date();
    const id = await insertGame(userId, 'gul', t0);
    const svc = serviceAt(new Date(t0.getTime() + 500));
    await svc.submit(userId, id, 'kul');
    const ended = await svc.end(userId, id);
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    // kul was found and gul is the prompt: what is left is pul, with its meaning
    expect(ended.game.missed).toEqual([{ word: 'pul', meanings: { en: 'stamp' } }]);
  });

  it('says how many curated prompts each dialect has, and offers neither below the minimum', async () => {
    await seedWord('baran', 'kurmanji', { prompt: true });
    const dialects = await serviceAt(new Date()).availability();
    expect(dialects.kurmanci).toEqual({ prompts: 1, available: false });
    expect(dialects.sorani).toEqual({ prompts: 0, available: false });
  });
});
