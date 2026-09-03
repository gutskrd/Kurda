import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { classifyRhyme, normalizeWord, type Dialect } from '../game/rhyme.js';
import { DIFFICULTY_LENGTHS, type Difficulty } from '../game/wordle-daily.js';

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
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

const addBody = z.object({
  words: z.array(z.string().min(1).max(64)).min(1).max(500),
  dialect: z.enum(['kurmanji', 'sorani']).default('kurmanji'),
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
}

export function registerGameContentRoutes(app: FastifyInstance): void {
  // content_editor curates game content; admin/superadmin keep full access
  const canEdit = [requireAuth, requireRoles('admin', 'superadmin', 'content_editor')];

  /**
   * Browse the word pool (search + filter by letter length, paginated). Length is
   * computed in JS with the same letterCount() the games use, so the bands here
   * always agree with what Wordle actually offers (rather than relying on a
   * locale-dependent SQL character class).
   */
  app.get('/admin/dictionary', { schema: { querystring: listQuery }, preHandler: canEdit }, async (req) => {
    const { q, length, limit, offset } = req.query as z.infer<typeof listQuery>;
    const params: unknown[] = [];
    let clause = '';
    if (q) {
      params.push(`%${normalizeWord(q)}%`);
      clause = 'WHERE headword_normalized LIKE $1';
    }
    const rows = await app.db.query<WordRow>(
      `SELECT id, headword, headword_normalized, dialect FROM dict_entries ${clause} ORDER BY headword ASC`,
      params,
    );
    const all = rows.rows
      .map((r) => ({
        id: r.id,
        headword: r.headword,
        normalized: r.headword_normalized,
        dialect: r.dialect,
        length: letterCount(r.headword),
      }))
      .filter((w) => length === undefined || w.length === length);
    return { total: all.length, words: all.slice(offset, offset + limit) };
  });

  /**
   * Add words (bulk). Idempotent: a word whose normalized form already exists is
   * reported as skipped rather than duplicated.
   */
  app.post('/admin/dictionary', { schema: { body: addBody }, preHandler: canEdit }, async (req) => {
    const { words, dialect } = req.body as z.infer<typeof addBody>;
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
        `INSERT INTO dict_entries (headword, headword_normalized, dialect)
         SELECT $1, $2, $3
          WHERE NOT EXISTS (SELECT 1 FROM dict_entries WHERE headword_normalized = $2)
         RETURNING id`,
        [headword, normalized, dialect],
      );
      if (res.rowCount) added.push(headword);
      else skipped.push(headword);
    }
    return { added, skipped, invalid };
  });

  /** Remove a word from the pool. */
  app.delete(
    '/admin/dictionary/:id',
    { schema: { params: z.object({ id: z.uuid() }) }, config: { skipValidation: true }, preHandler: canEdit },
    async (req) => {
      const { id } = req.params as { id: string };
      const res = await app.db.query(`DELETE FROM dict_entries WHERE id = $1`, [id]);
      if (!res.rowCount) throw new AppError('NOT_FOUND', 404, 'no such word');
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
    return { word, dialect, perfect: perfect.sort(), near: near.sort(), inDictionary: rows.rows.some((r) => normalizeWord(r.headword) === target) };
  });

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
    return {
      total: rows.rows.length,
      byLength: [...byLength.entries()].sort((a, b) => a[0] - b[0]).map(([length, words]) => ({ length, words })),
      difficulties,
    };
  });
}
