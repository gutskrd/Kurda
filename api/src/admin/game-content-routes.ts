import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { classifyRhyme, normalizeWord, rhymePrefix, PERFECT_FROM, type RhymeQuality } from '../game/rhyme.js';
import { applyRulings, rhymeGroupSizes } from '../game/rhyme-groups.js';

/**
 * How many rhyming words a prompt's list shows before it stops.
 *
 * Over the pool this never bit — a few hundred words, and a prompt had a
 * handful of rhymes. Over an imported dictionary a common ending has tens of
 * thousands, and nobody reads those; the count beside the list is the part a
 * curator acts on.
 */
const RHYME_LIST_LIMIT = 200;
import { DIFFICULTY_LENGTHS, type Difficulty } from '../game/wordle-daily.js';
import { QuizQuestionService } from './quiz-questions.js';
import { dictionaryKey, letterCount } from '@kurda/shared';

/**
 * Admin management of the shared game word pool (`dict_entries`).
 *
 * One dictionary drives every word game: Wordle picks its targets from it and
 * validates guesses against it, and Rhyme draws prompts from it and only accepts
 * submissions that are in it. So adding a word here makes it playable everywhere.
 *
 * Rhymes are NOT stored — `classifyRhyme` derives them from how many letters two
 * words end with in common, so an admin curates *words* and the rhyme sets follow.
 * `GET /admin/dictionary/rhymes` exposes that computation so an admin can see
 * which words currently rhyme with a given one and spot thin coverage.
 *
 * Writes are role-gated server-side; the admin SPA only hides UI.
 */

/**
 * A boolean in a query string, which `z.coerce.boolean()` cannot read.
 *
 * Coercion is `Boolean(value)`, and every non-empty string is truthy — so
 * `?inGames=false` parsed as **true** and the "dictionary only" view returned
 * the pool. The word "false" is the one input a flag like this is guaranteed to
 * receive, so it has to be read rather than coerced.
 */
const queryBool = z.enum(['true', 'false']).transform((v) => v === 'true');

const listQuery = z.object({
  q: z.string().max(80).optional(),
  /** filter to one letter-length (the Wordle difficulty bands are length-based) */
  length: z.coerce.number().int().min(1).max(40).optional(),
  /** only words marked as rhyme prompts */
  prompts: queryBool.optional(),
  /**
   * Which set to browse. The game pool by default, because that is what this
   * screen is for and because the dictionary behind it may be hundreds of
   * thousands of rows; `false` reaches those, to promote one into the pool.
   */
  inGames: queryBool.default(true),
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

const rebuildBody = z.object({
  dialect: z.enum(['kurmanci', 'sorani']).default('kurmanci'),
  /** preview the outcome without writing it */
  dryRun: z.boolean().default(false),
});

interface WordRow {
  id: string;
  headword: string;
  headword_normalized: string;
  dialect: string;
  is_rhyme_prompt: boolean;
  /** in the pool a game chooses from, as opposed to merely in the dictionary */
  in_games?: boolean;
}

export function registerGameContentRoutes(app: FastifyInstance): void {
  const quiz = new QuizQuestionService(app.db);
  // content_editor curates game content; admin/superadmin keep full access
  const canEdit = [requireAuth, requireRoles('admin', 'superadmin', 'content_editor')];

  /**
   * Browse the word pool: search, filter by letter length, paginated.
   *
   * Every condition is SQL now, and so is the page. This used to select all the
   * matching rows and then filter and slice them here, which was survivable at a
   * few hundred curated words — but the *dictionary-only* view is the one that
   * holds a whole imported lexicon, and it is also the one an admin has to use
   * to promote words into the games. `letter_count` is stored (1751000114000)
   * so the band filter is an index scan rather than 447,000 rows crossing the
   * wire on every keystroke.
   */
  app.get('/admin/dictionary', { schema: { querystring: listQuery }, preHandler: canEdit }, async (req) => {
    const { q, length, prompts, inGames, limit, offset } = req.query as z.infer<typeof listQuery>;
    const params: unknown[] = [];
    // always one way or the other, never both: the two views are different sets
    const conds: string[] = [inGames ? 'in_games' : 'NOT in_games'];
    if (q) {
      // the folded key, so that searching "sev" finds sêv and an imported word
      // can be found at all — see 1751000115000
      params.push(`%${dictionaryKey(q)}%`);
      conds.push(`headword_folded LIKE $${params.length}`);
    }
    if (length !== undefined) {
      params.push(length);
      conds.push(`letter_count = $${params.length}`);
    }
    if (prompts) conds.push('is_rhyme_prompt');

    /*
     * Counted separately rather than with COUNT(*) OVER(), which was the first
     * thing tried. A window function has to see every matching row before the
     * LIMIT can throw them away, so it sorts the whole set: measured at 400,000
     * dictionary rows, the unfiltered browse took 791ms that way and 26ms as
     * two queries — a count that reads no rows in order, and a page the index
     * hands back fifty of.
     */
    const where = conds.join(' AND ');
    const [counted, rows] = await Promise.all([
      app.db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM dict_entries WHERE ${where}`, params),
      app.db.query<WordRow & { letter_count: number }>(
        `SELECT id, headword, headword_normalized, dialect, is_rhyme_prompt, in_games, letter_count
           FROM dict_entries WHERE ${where}
          ORDER BY headword ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);
    return {
      total: Number(counted.rows[0]?.n ?? 0),
      words: rows.rows.map((r) => ({
        id: r.id,
        headword: r.headword,
        normalized: r.headword_normalized,
        dialect: r.dialect,
        isRhymePrompt: r.is_rhyme_prompt,
        inGames: r.in_games ?? true,
        length: r.letter_count,
      })),
    };
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
        // `in_games` is true here and defaults to false everywhere else: a word
        // an admin typed in is a word chosen for the games, which is the whole
        // difference between this and an imported lexicon (1751000112000)
        `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, is_rhyme_prompt, in_games, letter_count)
         SELECT $1, $2, $3, $4, $5, true, $6
          WHERE NOT EXISTS (SELECT 1 FROM dict_entries WHERE headword_normalized = $2)
         RETURNING id`,
        [headword, normalized, dictionaryKey(headword), dialect, isRhymePrompt, letterCount(headword)],
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
          .object({
            isRhymePrompt: z.boolean().optional(),
            headword: z.string().min(1).max(64).optional(),
            /** promote an imported word into the pool a game chooses from, or drop it back out */
            inGames: z.boolean().optional(),
          })
          .refine(
            (b) => b.isRhymePrompt !== undefined || b.headword !== undefined || b.inGames !== undefined,
            { message: 'nothing to change' },
          ),
      },
      preHandler: canEdit,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isRhymePrompt, headword, inGames } = req.body as {
        isRhymePrompt?: boolean;
        headword?: string;
        inGames?: boolean;
      };

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

      /*
       * Dropping a word out of the pool takes its prompt flag with it. A prompt
       * that is not in the pool is a round the game will never open, and a
       * coverage view counting it would be counting a word nobody can be asked.
       */
      if (inGames !== undefined) {
        await app.db.query(
          inGames
            ? `UPDATE dict_entries SET in_games = true WHERE id = $1`
            : `UPDATE dict_entries SET in_games = false, is_rhyme_prompt = false WHERE id = $1`,
          [id],
        );
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
      await client.query(
        `UPDATE dict_entries
            SET headword = $2, headword_normalized = $3, headword_folded = $4, letter_count = $5
          WHERE id = $1`,
        [id, headword, to, dictionaryKey(headword), letterCount(headword)],
      );
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
   * Which words rhyme with `word` — computed, never stored.
   *
   * **The whole dictionary, not the pool.** A player may answer with any word
   * the dictionary knows, so the pool was never the right set to report: after
   * an import it would show three rhymes for a prompt the game accepts forty
   * thousand answers to, and a curator would read that as thin coverage and go
   * looking for work that does not exist.
   *
   * It is a prefix scan on the reversed headword (1751000117000) rather than
   * `classifyRhyme` over every row, so the set it reads got a thousand times
   * bigger while the work got smaller. The list is capped — nobody scrolls
   * forty thousand words — and `total` says what the cap hid.
   */
  app.get('/admin/dictionary/rhymes', { schema: { querystring: rhymeQuery }, preHandler: canEdit }, async (req) => {
    const { word, dialect } = req.query as z.infer<typeof rhymeQuery>;
    const target = normalizeWord(word);
    const anyPrefix = rhymePrefix(word, 1);
    const perfectPrefix = rhymePrefix(word, PERFECT_FROM);

    // an admin's explicit decisions for this prompt, so the UI can show which
    // pairs are curated rather than merely derived
    const overrides = await app.db.query<{ rhyme_normalized: string; quality: string }>(
      `SELECT rhyme_normalized, quality FROM rhyme_overrides WHERE prompt_normalized = $1`,
      [target],
    );
    const decided = new Map(overrides.rows.map((o) => [o.rhyme_normalized, o.quality]));

    const listed = anyPrefix
      ? await app.db.query<{ headword: string; headword_normalized: string; perfect: boolean }>(
          // perfect first, then alphabetically, so thin coverage shows at a glance
          `SELECT headword, headword_normalized,
                  ($2::text IS NOT NULL AND rhyme_key LIKE $2 || '%') AS perfect
             FROM dict_entries
            WHERE rhyme_key LIKE $1 || '%' AND headword_normalized <> $3
            ORDER BY perfect DESC, headword ASC
            LIMIT $4`,
          [anyPrefix, perfectPrefix, target, RHYME_LIST_LIMIT],
        )
      : { rows: [], rowCount: 0 };

    const counts = anyPrefix
      ? await app.db.query<{ any_rhyme: string; perfect: string }>(
          `SELECT count(*)::text AS any_rhyme,
                  count(*) FILTER (WHERE $2::text IS NOT NULL AND rhyme_key LIKE $2 || '%')::text AS perfect
             FROM dict_entries
            WHERE rhyme_key LIKE $1 || '%' AND headword_normalized <> $3`,
          [anyPrefix, perfectPrefix, target],
        )
      : { rows: [{ any_rhyme: '0', perfect: '0' }] };

    const inPool = await app.db.query(
      `SELECT 1 FROM dict_entries WHERE headword_normalized = $1 AND in_games LIMIT 1`,
      [target],
    );

    /*
     * Every word a curator has ruled on for this prompt, fetched by name.
     *
     * The prefix scan above finds what the endings accept, and that is not the
     * same set: a ruling can bring in a word that does not rhyme at all, and it
     * can sit past the cap on a prompt with thousands of partners. Both are
     * decisions somebody made deliberately, so neither may go missing because
     * of where it happened to fall in a list.
     */
    const named = decided.size
      ? await app.db.query<{ headword: string; headword_normalized: string }>(
          `SELECT headword, headword_normalized FROM dict_entries WHERE headword_normalized = ANY($1)`,
          [[...decided.keys()]],
        )
      : { rows: [] };

    const byNormalized = new Map<string, { word: string; derived: RhymeQuality }>();
    for (const r of listed.rows) {
      byNormalized.set(r.headword_normalized, {
        word: r.headword,
        derived: r.perfect ? 'perfect' : 'near',
      });
    }
    for (const r of named.rows) {
      if (byNormalized.has(r.headword_normalized)) continue;
      byNormalized.set(r.headword_normalized, {
        word: r.headword,
        derived: classifyRhyme(word, r.headword),
      });
    }

    const rhymes = [...byNormalized].map(([normalized, { word: headword, derived }]) => {
      const chosen = decided.get(normalized) as RhymeQuality | undefined;
      return {
        word: headword,
        quality: chosen ?? derived,
        derived,
        /** 'decided' means a curator overrode the endings, in either direction */
        source: chosen ? ('decided' as const) : ('derived' as const),
      };
    });

    /** words a curator ruled out that the endings would have accepted */
    const ruledOut = rhymes
      .filter((r) => r.quality === 'none' && r.source === 'decided' && r.derived !== 'none')
      .sort((a, b) => a.word.localeCompare(b.word));

    const ORDER: Record<RhymeQuality, number> = { perfect: 0, near: 1, none: 2 };

    const anyRhyme = Number(counts.rows[0]?.any_rhyme ?? 0);
    const perfect = Number(counts.rows[0]?.perfect ?? 0);
    return {
      word,
      dialect,
      inDictionary: (inPool.rowCount ?? 0) > 0,
      /** accepted rhymes, strongest first — capped, see `total` */
      rhymes: rhymes
        .filter((r) => r.quality !== 'none')
        .sort((a, b) => ORDER[a.quality] - ORDER[b.quality] || a.word.localeCompare(b.word)),
      ruledOut,
      /** what the game accepts, whether or not it fitted in the list above */
      total: { perfect, near: anyRhyme - perfect },
      truncated: anyRhyme > listed.rows.length,
    };
  });

  /**
   * The words a round can actually open with, each with how much it has to rhyme
   * against.
   *
   * A prompt with nothing to rhyme with makes an unplayable round, and that was
   * invisible until someone hit it in a game.
   *
   * **The counts are over the dictionary**, because that is what the game
   * accepts — the pool is what it *asks*. Counting the pool made a prompt with
   * forty thousand valid answers read as having three, which is a curator sent
   * to fix something that is not broken.
   *
   * It used to compare every listed word against every pool word. One grouped
   * pass over the dictionary replaces that: a rhyme group is a suffix group
   * (1751000117000), so counting how many words end in each letter and each
   * pair of letters answers the whole page at once, exactly, however many
   * prompts are on it.
   */
  app.get('/admin/rhyme/prompts', { schema: { querystring: promptsQuery }, preHandler: canEdit }, async (req) => {
    // `dialect` is still accepted and still ignored: a rhyme is decided by the
    // letters two words end with, which is the same question in either script.
    const { q, limit, offset } = req.query as z.infer<typeof promptsQuery>;

    const poolSizeRow = await app.db.query<{ n: string; curated: string }>(
      `SELECT count(*)::text AS n, count(*) FILTER (WHERE is_rhyme_prompt)::text AS curated
         FROM dict_entries WHERE in_games`,
    );
    const poolSize = Number(poolSizeRow.rows[0]?.n ?? 0);
    // Rounds fall back to the WHOLE pool while nothing is curated, so that is
    // genuinely the set of possible base words — say so rather than showing none.
    const usingFallback = Number(poolSizeRow.rows[0]?.curated ?? 0) === 0;

    const params: unknown[] = [];
    const conds = ['in_games'];
    if (!usingFallback) conds.push('is_rhyme_prompt');
    if (q) {
      params.push(`%${normalizeWord(q)}%`);
      conds.push(`headword_normalized LIKE $${params.length}`);
    }
    const where = conds.join(' AND ');
    params.push(limit, offset);
    const [matchedRow, pageRows] = await Promise.all([
      app.db.query<{ n: string }>(`SELECT count(*)::text AS n FROM dict_entries WHERE ${where}`, params.slice(0, -2)),
      app.db.query<WordRow & { rhyme_key: string }>(
        `SELECT id, headword, headword_normalized, dialect, is_rhyme_prompt, rhyme_key
           FROM dict_entries WHERE ${where}
          ORDER BY headword ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
    ]);
    const page = pageRows.rows;

    const groups = await rhymeGroupSizes(app);
    const names = page.map((r) => r.headword_normalized);
    // how many dictionary rows *are* each prompt: a word never rhymes with
    // itself, and the grouped counts above cannot know which row is which
    const selves = await app.db.query<{ headword_normalized: string; n: string }>(
      `SELECT headword_normalized, count(*)::text AS n FROM dict_entries
        WHERE headword_normalized = ANY($1) GROUP BY 1`,
      [names],
    );
    const selfCount = new Map(selves.rows.map((r) => [r.headword_normalized, Number(r.n)]));

    const decided = await app.db.query<{ prompt_normalized: string; rhyme_normalized: string; quality: string }>(
      `SELECT prompt_normalized, rhyme_normalized, quality FROM rhyme_overrides WHERE prompt_normalized = ANY($1)`,
      [names],
    );
    const byPrompt = new Map<string, Map<string, string>>();
    for (const d of decided.rows) {
      const m = byPrompt.get(d.prompt_normalized) ?? new Map<string, string>();
      m.set(d.rhyme_normalized, d.quality);
      byPrompt.set(d.prompt_normalized, m);
    }

    const words = page.map((row) => {
      const { perfect, near, ruledOut } = applyRulings(
        row.headword,
        groups.countsFor(row.headword, selfCount.get(row.headword_normalized) ?? 0),
        byPrompt.get(row.headword_normalized) ?? [],
      );
      return {
        id: row.id,
        headword: row.headword,
        dialect: row.dialect,
        isRhymePrompt: row.is_rhyme_prompt,
        perfect,
        near,
        ruledOut,
        decided: byPrompt.get(row.headword_normalized)?.size ?? 0,
      };
    });

    return { total: Number(matchedRow.rows[0]?.n ?? 0), poolSize, usingFallback, words };
  });

  /**
   * Make every word that has something to rhyme with a base word.
   *
   * There is a cliff in how base words are chosen: a round falls back to the
   * whole pool while NOTHING is marked, so marking the very first word silently
   * takes every other word out of the game. Marking two words does not narrow
   * the game a little — it narrows it to two. That is how a 159-word pool came
   * to serve two prompts, and nothing in the admin page said so.
   *
   * This is the way back, and the way to a set that cannot bite: it marks every
   * word that has at least one partner, so the curated set starts out as the
   * whole playable pool and marking one more word after that adds to it rather
   * than replacing it. Words with no rhyme are deliberately left unmarked —
   * excluding those is what the flag was for.
   *
   * The count is computed exactly as `GET /admin/rhyme/prompts` computes it —
   * over the dictionary, from the same grouped pass — so the number here and
   * the number on the page agree.
   *
   * After an import there is usually nothing left for it to exclude: a word is
   * unplayable only if the dictionary holds nothing else ending in its last
   * letter, and among several hundred thousand words that is close to nobody.
   * Running it is still how the cliff above gets unset.
   */
  app.post(
    '/admin/rhyme/prompts/rebuild',
    { schema: { body: rebuildBody }, preHandler: canEdit },
    async (req) => {
      const { dryRun } = req.body as z.infer<typeof rebuildBody>;
      const all = await app.db.query<WordRow>(
        // rebuild decides which pool words a round may open on; what they rhyme
        // against is the dictionary, which is what the grouped counts below read
        `SELECT id, headword, headword_normalized, dialect, is_rhyme_prompt FROM dict_entries WHERE in_games`,
      );
      const decided = await app.db.query<{ prompt_normalized: string; rhyme_normalized: string; quality: string }>(
        `SELECT prompt_normalized, rhyme_normalized, quality FROM rhyme_overrides`,
      );
      const byPrompt = new Map<string, Map<string, string>>();
      for (const d of decided.rows) {
        const m = byPrompt.get(d.prompt_normalized) ?? new Map<string, string>();
        m.set(d.rhyme_normalized, d.quality);
        byPrompt.set(d.prompt_normalized, m);
      }

      const groups = await rhymeGroupSizes(app);
      const selves = await app.db.query<{ headword_normalized: string; n: string }>(
        `SELECT headword_normalized, count(*)::text AS n FROM dict_entries
          WHERE headword_normalized = ANY($1) GROUP BY 1`,
        [all.rows.map((r) => r.headword_normalized)],
      );
      const selfCount = new Map(selves.rows.map((r) => [r.headword_normalized, Number(r.n)]));

      const playable: string[] = [];
      const unplayable: string[] = [];
      for (const row of all.rows) {
        // the same numbers the coverage page shows, rulings and all, so a word
        // reported as having no rhymes there is the word left unmarked here
        const { perfect, near } = applyRulings(
          row.headword,
          groups.countsFor(row.headword, selfCount.get(row.headword_normalized) ?? 0),
          byPrompt.get(row.headword_normalized) ?? [],
        );
        if (perfect + near > 0) playable.push(row.id);
        else unplayable.push(row.headword);
      }

      // how many this actually changes, so the response can say what it did
      const willMark = new Set(playable);
      const alreadyMarked = all.rows.filter((r) => r.is_rhyme_prompt).length;
      const newlyMarked = all.rows.filter((r) => !r.is_rhyme_prompt && willMark.has(r.id)).length;

      if (!dryRun && playable.length > 0) {
        await app.db.query(`UPDATE dict_entries SET is_rhyme_prompt = true WHERE id = ANY($1)`, [playable]);
      }

      return {
        dryRun,
        poolSize: all.rows.length,
        /** base words after this runs */
        baseWords: playable.length,
        newlyMarked,
        alreadyMarked,
        /** left out on purpose: a round on one of these could not be played */
        withoutRhymes: unplayable.sort((a, b) => a.localeCompare(b)),
      };
    },
  );

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
          // "add to pool" means exactly that
          `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
           SELECT $1, $2, $3, $4, true
            WHERE NOT EXISTS (SELECT 1 FROM dict_entries WHERE headword_normalized = $2)`,
          [trimmed, target, dictionaryKey(trimmed), dialect],
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
    /*
     * Length bands describe what Wordle can offer, so they count the pool. The
     * dictionary behind it is counted separately below — the two numbers
     * answer different questions, and showing only the second is how you end up
     * believing there are 447,000 words to play with.
     */
    const rows = await app.db.query<{ headword: string }>(`SELECT headword FROM dict_entries WHERE in_games`);
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
    const counts = await app.db.query<{ prompts: number; dictionary: number }>(
      `SELECT COUNT(*) FILTER (WHERE is_rhyme_prompt AND in_games)::int AS prompts,
              COUNT(*)::int AS dictionary
         FROM dict_entries`,
    );
    return {
      /** words a game can choose from */
      total: rows.rows.length,
      /** every headword, including any imported lexicon — what a guess is checked against */
      dictionary: Number(counts.rows[0]?.dictionary ?? 0),
      rhymePrompts: Number(counts.rows[0]?.prompts ?? 0),
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