import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { classifyRhyme, normalizeWord, type Dialect } from '../game/rhyme.js';
import { DIFFICULTY_LENGTHS, type Difficulty } from '../game/wordle-daily.js';
import { QuizQuestionService } from './quiz-questions.js';

/**
 * Admin management of the shared game word pool (`dict_entries`).
 *
 * One dictionary drives every word game: Wordle picks its targets from it and
 * validates guesses against it, and Rhyme draws prompts from it and only accepts
 * submissions that are in it. So adding a word here makes it playable everywhere.
 *
 * Rhymes are NOT stored — `classifyRhyme` derives them from the rime (final vowel
 * + trailing consonants), so an admin curates *words* and the rhyme sets follow.
 * `GET /admin/dictionary/rhymes` exposes that computation so an admin can see
 * which words currently rhyme with a given one and spot thin coverage.
 *
 * Writes are role-gated server-side; the admin SPA only hides UI.
 */

/** Kurdish letter count (NFC, code-point aware) — matches the games' view. */
function letterCount(word: string): number {
  return Array.from(word.normalize('NFC').replace(/[^\p{L}]/gu, '')).length;
}

const listQuery = z.object({
  q: z.string().max(80).optional(),
  /** filter to one letter-length (the Wordle difficulty bands are length-based) */
  length: z.coerce.number().int().min(1).max(40).optional(),
  /** only words marked as rhyme prompts */
  prompts: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

const addBody = z.object({
  words: z.array(z.string().min(1).max(64)).min(1).max(500),
  dialect: z.enum(['kurmanji', 'sorani']).default('kurmanji'),
  /** mark them as rhyme prompts too — adding a base word is otherwise two steps */
  isRhymePrompt: z.boolean().default(false),
});

const promptsQuery = z.object({
  q: z.string().max(80).optional(),
  dialect: z.enum(['kurmanci', 'sorani']).default('kurmanci'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

const rhymeQuery = z.object({
  word: z.string().min(1).max(64),
  dialect: z.enum(['kurmanci', 'sorani']).default('kurmanci'),
});

interface WordRow {
  id: string;
  headword: string;
  headword_normalized: string;
  dialect: string;
  is_rhyme_prompt: boolean;
}

export function registerGameContentRoutes(app: FastifyInstance): void {
  const quiz = new QuizQuestionService(app.db);
  // content_editor curates game content; admin/superadmin keep full access
  const canEdit = [requireAuth, requireRoles('admin', 'superadmin', 'content_editor')];

  /**
   * Browse the word pool (search + filter by letter length, paginated). Length is
   * computed in JS with the same letterCount() the games use, so the bands here
   * always agree with what Wordle actually offers (rather than relying on a
   * locale-dependent SQL character class).
   */
  app.get('/admin/dictionary', { schema: { querystring: listQuery }, preHandler: canEdit }, async (req) => {
    const { q, length, prompts, limit, offset } = req.query as z.infer<typeof listQuery>;
    const params: unknown[] = [];
    let clause = '';
    if (q) {
      params.push(`%${normalizeWord(q)}%`);
      clause = 'WHERE headword_normalized LIKE $1';
    }
    const rows = await app.db.query<WordRow>(
      `SELECT id, headword, headword_normalized, dialect, is_rhyme_prompt FROM dict_entries ${clause} ORDER BY headword ASC`,
      params,
    );
    const all = rows.rows
      .map((r) => ({
        id: r.id,
        headword: r.headword,
        normalized: r.headword_normalized,
        dialect: r.dialect,
        isRhymePrompt: r.is_rhyme_prompt,
        length: letterCount(r.headword),
      }))
      .filter((w) => length === undefined || w.length === length)
      .filter((w) => !prompts || w.isRhymePrompt);
    return { total: all.length, words: all.slice(offset, offset + limit) };
  });

  /**
   * Add words (bulk). Idempotent: a word whose normalized form already exists is
   * reported as skipped rather than duplicated.
   */
  app.post('/admin/dictionary', { schema: { body: addBody }, preHandler: canEdit }, async (req) => {
    const { words, dialect, isRhymePrompt } = req.body as z.infer<typeof addBody>;
    const added: string[] = [];
    const skipped: string[] = [];
    const invalid: string[] = [];
    for (const raw of words) {
      const headword = raw.trim();
      const normalized = normalizeWord(headword);
      // a headword must be actual letters — reject digits/punctuation-only input
      if (!normalized || letterCount(headword) < 2) {
        invalid.push(raw);
        continue;
      }
      const res = await app.db.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, dialect, is_rhyme_prompt)
         SELECT $1, $2, $3, $4
          WHERE NOT EXISTS (SELECT 1 FROM dict_entries WHERE headword_normalized = $2)
         RETURNING id`,
        [headword, normalized, dialect, isRhymePrompt],
      );
      if (res.rowCount) added.push(headword);
      else {
        // already in the pool: still honour the request to use it as a prompt,
        // so re-adding a word to promote it does what it looks like it does
        if (isRhymePrompt) {
          await app.db.query(
            `UPDATE dict_entries SET is_rhyme_prompt = true WHERE headword_normalized = $1`,
            [normalized],
          );
        }
        skipped.push(headword);
      }
    }
    return { added, skipped, invalid };
  });

  /**
   * Choose whether a word is used as a rhyme prompt. Rounds pick only from the
   * curated set once anything is marked, so an admin can keep out words that have
   * no rhyming partner and would make an unplayable round.
   */
  app.patch(
    '/admin/dictionary/:id',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        body: z
          .object({ isRhymePrompt: z.boolean().optional(), headword: z.string().min(1).max(64).optional() })
          .refine((b) => b.isRhymePrompt !== undefined || b.headword !== undefined, {
            message: 'nothing to change',
          }),
      },
      preHandler: canEdit,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isRhymePrompt, headword } = req.body as { isRhymePrompt?: boolean; headword?: string };

      const existing = await app.db.query<WordRow>(
        `SELECT id, headword, headword_normalized, dialect, is_rhyme_prompt FROM dict_entries WHERE id = $1`,
        [id],
      );
      const before = existing.rows[0];
      if (!before) throw new AppError('NOT_FOUND', 404, 'no such word');

      if (headword !== undefined) {
        const trimmed = headword.trim();
        const normalized = normalizeWord(trimmed);
        if (!normalized || letterCount(trimmed) < 2) {
          throw new AppError('BAD_WORD', 400, 'a word must be at least two letters');
        }
        const clash = await app.db.query(
          `SELECT 1 FROM dict_entries WHERE headword_normalized = $1 AND id <> $2`,
          [normalized, id],
        );
        if (clash.rowCount) throw new AppError('DUPLICATE_WORD', 409, 'another entry already uses that word');
        await renameWord(id, before.headword_normalized, trimmed, normalized);
      }

      if (isRhymePrompt !== undefined) {
        await app.db.query(`UPDATE dict_entries SET is_rhyme_prompt = $2 WHERE id = $1`, [id, isRhymePrompt]);
      }

      const after = await app.db.query<WordRow>(
        `SELECT id, headword, headword_normalized, dialect, is_rhyme_prompt FROM dict_entries WHERE id = $1`,
        [id],
      );
      const row = after.rows[0]!;
      return { ok: true, headword: row.headword, isRhymePrompt: row.is_rhyme_prompt };
    },
  );

  /**
   * Rename a word, carrying its rhyme decisions with it.
   *
   * Decisions are keyed by the NORMALIZED form, not the word's id, so a rename
   * would otherwise orphan every one of them: the curated pairs would silently
   * stop applying and reappear only if the old spelling ever came back. All of it
   * happens in one transaction — a half-migrated rename would leave decisions
   * pointing at a word that no longer exists.
   */
  async function renameWord(id: string, from: string, headword: string, to: string): Promise<void> {
    const client = await app.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE dict_entries SET headword = $2, headword_normalized = $3 WHERE id = $1`, [
        id,
        headword,
        to,
      ]);
      // Only the normalized form keys the decisions, so a cosmetic edit (case or
      // punctuation) needs no migration at all.
      if (from !== to) {
        // a decision may already exist under the new name; the rename must not
        // violate the primary key, so drop the ones that would collide
        await client.query(
          `DELETE FROM rhyme_overrides o
             WHERE (o.prompt_normalized = $2
                    AND EXISTS (SELECT 1 FROM rhyme_overrides x
                                 WHERE x.prompt_normalized = $1 AND x.rhyme_normalized = o.rhyme_normalized))
                OR (o.rhyme_normalized = $2
                    AND EXISTS (SELECT 1 FROM rhyme_overrides x
                                 WHERE x.rhyme_normalized = $1 AND x.prompt_normalized = o.prompt_normalized))`,
          [from, to],
        );
        await client.query(`UPDATE rhyme_overrides SET prompt_normalized = $2 WHERE prompt_normalized = $1`, [from, to]);
        await client.query(`UPDATE rhyme_overrides SET rhyme_normalized = $2 WHERE rhyme_normalized = $1`, [from, to]);
        // renaming one half of a pair onto the other makes it self-referential,
        // and nothing rhymes with itself
        await client.query(`DELETE FROM rhyme_overrides WHERE prompt_normalized = rhyme_normalized`);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Remove a word from the pool. */
  app.delete(
    '/admin/dictionary/:id',
    { schema: { params: z.object({ id: z.uuid() }) }, config: { skipValidation: true }, preHandler: canEdit },
    async (req) => {
      const { id } = req.params as { id: string };
      const row = await app.db.query<{ headword_normalized: string }>(
        `SELECT headword_normalized FROM dict_entries WHERE id = $1`,
        [id],
      );
      const word = row.rows[0];
      if (!word) throw new AppError('NOT_FOUND', 404, 'no such word');
      const client = await app.db.connect();
      try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM dict_entries WHERE id = $1`, [id]);
        // otherwise the decisions linger and would quietly reattach if the word
        // were ever added back, with no sign of where they came from
        await client.query(
          `DELETE FROM rhyme_overrides WHERE prompt_normalized = $1 OR rhyme_normalized = $1`,
          [word.headword_normalized],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
      return { ok: true };
    },
  );

  /**
   * Which dictionary words rhyme with `word` — computed, never stored. Lets an
   * admin verify a prompt actually has rhymes available before relying on it.
   */
  app.get('/admin/dictionary/rhymes', { schema: { querystring: rhymeQuery }, preHandler: canEdit }, async (req) => {
    const { word, dialect } = req.query as z.infer<typeof rhymeQuery>;
    const rows = await app.db.query<{ headword: string }>(`SELECT headword FROM dict_entries`);
    const perfect: string[] = [];
    const near: string[] = [];
    const target = normalizeWord(word);
    for (const r of rows.rows) {
      if (normalizeWord(r.headword) === target) continue; // a word never rhymes with itself
      const q = classifyRhyme(word, r.headword, dialect as Dialect);
      if (q === 'perfect') perfect.push(r.headword);
      else if (q === 'near') near.push(r.headword);
    }
    // an admin's explicit decisions for this prompt, so the UI can show which
    // pairs are curated rather than merely derived
    const overrides = await app.db.query<{ rhyme_normalized: string; quality: string }>(
      `SELECT rhyme_normalized, quality FROM rhyme_overrides WHERE prompt_normalized = $1`,
      [target],
    );
    const decided = new Map(overrides.rows.map((o) => [o.rhyme_normalized, o.quality]));

    // What the game will actually accept, and at what strength: the derived
    // answer with any decision applied on top. Strongest first, so thin coverage
    // for a prompt is obvious at a glance.
    const ORDER: Record<string, number> = { perfect: 0, near: 1 };
    const rhymes = rows.rows
      .map((r) => r.headword)
      .filter((h) => normalizeWord(h) !== target)
      .map((h) => {
        const derivedQuality = classifyRhyme(word, h, dialect as Dialect);
        const chosen = decided.get(normalizeWord(h));
        return {
          word: h,
          quality: chosen ?? derivedQuality,
          derived: derivedQuality,
          /** 'decided' means a curator overrode the endings, in either direction */
          source: chosen ? ('decided' as const) : ('derived' as const),
        };
      });

    return {
      word,
      dialect,
      inDictionary: rows.rows.some((r) => normalizeWord(r.headword) === target),
      /** accepted rhymes, strongest first */
      rhymes: rhymes
        .filter((r) => r.quality !== 'none')
        .sort((a, b) => ORDER[a.quality]! - ORDER[b.quality]! || a.word.localeCompare(b.word)),
      /** words a curator ruled out that the endings would have accepted */
      ruledOut: rhymes
        .filter((r) => r.quality === 'none' && r.source === 'decided' && r.derived !== 'none')
        .sort((a, b) => a.word.localeCompare(b.word)),
      // kept for the pair editor: every pool word, so a curator can rule one IN
      // that the endings missed
      candidates: rhymes.filter((r) => r.quality === 'none').map((r) => r.word),
    };
  });

  /**
   * The words a round can actually open with, each with how much it has to rhyme
   * against.
   *
   * A prompt with nothing to rhyme with makes an unplayable round, and that was
   * invisible until someone hit it in a game. Counts are computed per listed word
   * against the whole pool rather than for every pair up front — the page is small
   * and the pool is hand-curated, so this stays exact instead of approximating.
   */
  app.get('/admin/rhyme/prompts', { schema: { querystring: promptsQuery }, preHandler: canEdit }, async (req) => {
    const { q, dialect, limit, offset } = req.query as z.infer<typeof promptsQuery>;
    const all = await app.db.query<WordRow>(
      `SELECT id, headword, headword_normalized, dialect, is_rhyme_prompt FROM dict_entries ORDER BY headword ASC`,
    );
    const curated = all.rows.filter((r) => r.is_rhyme_prompt);
    // Rounds fall back to the WHOLE pool while nothing is curated, so that is
    // genuinely the set of possible base words — say so rather than showing none.
    const usingFallback = curated.length === 0;
    const base = usingFallback ? all.rows : curated;

    const needle = q ? normalizeWord(q) : '';
    const matched = needle ? base.filter((r) => r.headword_normalized.includes(needle)) : base;
    const page = matched.slice(offset, offset + limit);

    const decided = await app.db.query<{ prompt_normalized: string; rhyme_normalized: string; quality: string }>(
      `SELECT prompt_normalized, rhyme_normalized, quality FROM rhyme_overrides`,
    );
    const byPrompt = new Map<string, Map<string, string>>();
    for (const d of decided.rows) {
      const m = byPrompt.get(d.prompt_normalized) ?? new Map<string, string>();
      m.set(d.rhyme_normalized, d.quality);
      byPrompt.set(d.prompt_normalized, m);
    }

    const words = page.map((row) => {
      const overrides = byPrompt.get(row.headword_normalized);
      let perfect = 0;
      let near = 0;
      let ruledOut = 0;
      for (const other of all.rows) {
        if (other.headword_normalized === row.headword_normalized) continue;
        const derived = classifyRhyme(row.headword, other.headword, dialect as Dialect);
        const quality = overrides?.get(other.headword_normalized) ?? derived;
        if (quality === 'perfect') perfect++;
        else if (quality === 'near') near++;
        else if (overrides?.get(other.headword_normalized) === 'none' && derived !== 'none') ruledOut++;
      }
      return {
        id: row.id,
        headword: row.headword,
        dialect: row.dialect,
        isRhymePrompt: row.is_rhyme_prompt,
        perfect,
        near,
        ruledOut,
        decided: overrides?.size ?? 0,
      };
    });

    return { total: matched.length, poolSize: all.rows.length, usingFallback, words };
  });

  /**
   * Decide a pair explicitly. 'perfect' / 'near' accept the word (and set what it
   * scores); 'none' rules it out even though the endings match. Passing 'auto'
   * removes the decision and hands the pair back to the derived result.
   */
  app.put(
    '/admin/dictionary/rhymes',
    {
      schema: {
        body: z.object({
          word: z.string().min(1).max(64),
          rhyme: z.string().min(1).max(64),
          quality: z.enum(['perfect', 'near', 'none', 'auto']),
          /**
           * Put the rhyme in the word pool if it is not already there. A rhyme
           * outside the pool is rejected by the game as "not a word" whatever
           * this says, so adding one is genuinely two changes; the caller opts
           * in rather than having a decision silently grow the pool.
           */
          addToPool: z.boolean().default(false),
          dialect: z.enum(['kurmanji', 'sorani']).default('kurmanji'),
        }),
      },
      preHandler: canEdit,
    },
    async (req) => {
      const { word, rhyme, quality, addToPool, dialect } = req.body as {
        word: string;
        rhyme: string;
        quality: string;
        addToPool: boolean;
        dialect: string;
      };
      const prompt = normalizeWord(word);
      const target = normalizeWord(rhyme);
      if (!prompt || !target) throw new AppError('BAD_WORD', 400, 'both words must contain letters');
      if (prompt === target) throw new AppError('SAME_WORD', 400, 'a word cannot rhyme with itself');

      let addedToPool = false;
      if (addToPool) {
        const trimmed = rhyme.trim();
        if (letterCount(trimmed) < 2) throw new AppError('BAD_WORD', 400, 'a word must be at least two letters');
        const ins = await app.db.query(
          `INSERT INTO dict_entries (headword, headword_normalized, dialect)
           SELECT $1, $2, $3
            WHERE NOT EXISTS (SELECT 1 FROM dict_entries WHERE headword_normalized = $2)`,
          [trimmed, target, dialect],
        );
        addedToPool = (ins.rowCount ?? 0) > 0;
      }

      if (quality === 'auto') {
        await app.db.query(
          `DELETE FROM rhyme_overrides WHERE prompt_normalized = $1 AND rhyme_normalized = $2`,
          [prompt, target],
        );
        return { ok: true, quality: 'auto', addedToPool };
      }
      await app.db.query(
        `INSERT INTO rhyme_overrides (prompt_normalized, rhyme_normalized, quality)
         VALUES ($1, $2, $3)
         ON CONFLICT (prompt_normalized, rhyme_normalized) DO UPDATE SET quality = EXCLUDED.quality`,
        [prompt, target, quality],
      );
      return { ok: true, quality, addedToPool };
    },
  );

  /**
   * Pool health: how many words sit in each Wordle difficulty band, so an admin
   * can see at a glance whether a difficulty is thin (or empty → EMPTY_POOL).
   */
  app.get('/admin/dictionary/stats', { config: { skipValidation: true }, preHandler: canEdit }, async () => {
    const rows = await app.db.query<{ headword: string }>(`SELECT headword FROM dict_entries`);
    const byLength = new Map<number, number>();
    for (const r of rows.rows) {
      const n = letterCount(r.headword);
      byLength.set(n, (byLength.get(n) ?? 0) + 1);
    }
    const difficulties = (Object.keys(DIFFICULTY_LENGTHS) as Difficulty[]).map((d) => ({
      difficulty: d,
      lengths: [...DIFFICULTY_LENGTHS[d]],
      words: DIFFICULTY_LENGTHS[d].reduce((sum, n) => sum + (byLength.get(n) ?? 0), 0),
    }));
    const prompts = await app.db.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM dict_entries WHERE is_rhyme_prompt`,
    );
    return {
      total: rows.rows.length,
      rhymePrompts: Number(prompts.rows[0]?.n ?? 0),
      byLength: [...byLength.entries()].sort((a, b) => a[0] - b[0]).map(([length, words]) => ({ length, words })),
      difficulties,
    };
  });

  // ---- quiz questions ----------------------------------------------------

  const questionBody = z.object({
    prompt: z.string().min(1).max(300),
    /** exactly four, in display order */
    options: z.array(z.string().min(1).max(120)).length(4),
    correctIndex: z.number().int().min(0).max(3),
    category: z.enum(['vocabulary', 'phrases']),
    level: z.number().int().min(1).max(3),
    active: z.boolean().optional(),
  });

  /** Every question, retired ones included. */
  app.get('/admin/quiz/questions', { config: { skipValidation: true }, preHandler: canEdit }, async () => ({
    questions: await quiz.list(),
  }));

  app.post('/admin/quiz/questions', { schema: { body: questionBody }, preHandler: canEdit }, async (req, reply) => {
    const b = req.body as z.infer<typeof questionBody>;
    return reply.code(201).send(await quiz.create(b));
  });

  app.put(
    '/admin/quiz/questions/:id',
    { schema: { params: z.object({ id: z.uuid() }), body: questionBody.extend({ active: z.boolean() }) }, preHandler: canEdit },
    async (req) => {
      const { id } = req.params as { id: string };
      const updated = await quiz.update(id, req.body as z.infer<typeof questionBody> & { active: boolean });
      if (!updated) throw new AppError('NOT_FOUND', 404, 'no such question');
      return updated;
    },
  );

  app.delete(
    '/admin/quiz/questions/:id',
    { schema: { params: z.object({ id: z.uuid() }) }, config: { skipValidation: true }, preHandler: canEdit },
    async (req) => {
      const { id } = req.params as { id: string };
      if (!(await quiz.remove(id))) throw new AppError('NOT_FOUND', 404, 'no such question');
      return { ok: true };
    },
  );

  // Copy the built-in questions into the table once, then keep the engine's bank
  // in step — the engine picks questions synchronously and cannot query per game.
  app.addHook('onReady', async () => {
    try {
      const seeded = await quiz.seedIfEmpty();
      const loaded = await quiz.refresh();
      app.log.info({ seeded, loaded }, 'quiz question bank ready');
    } catch (err) {
      app.log.warn({ err }, 'failed to load quiz questions — using the built-in bank');
    }
  });
}