/**
 * How many words the dictionary holds for each rhyme, counted in one pass.
 *
 * A rhyme is decided by how a word ends (rhyme.ts), so the words rhyming
 * with W are a suffix group and one `GROUP BY` over the reversed headword
 * sizes all of them at once:
 *
 * - **Kurmancî** rhymes by the rime, the last vowel and what follows it. The
 *   reversed headword up to and including its first vowel *is* the reversed
 *   rime, so grouping by that counts every word's perfect rhymes, and the
 *   same key without its vowel is the coda, which counts the near ones.
 * - **Soranî** rhymes by its last letters: the last two for a perfect rhyme,
 *   the last one for any rhyme at all.
 *
 * That is the difference between this and comparing a prompt against every
 * word: the work is the same for one prompt as for fifty, and it does not grow
 * when a page shows more. Over 447,000 dictionary rows it is a single scan.
 *
 * The counts are over the dictionary of the dialect rather than the game
 * pool, because that is what a player may answer with. The pool is what the
 * game *asks*, which is a different set and a different question. They count
 * every entry, inflected forms included, which a round does not take, so they
 * are an upper bound on what a round accepts.
 */
import type { FastifyInstance } from 'fastify';
import { classifyRhyme, KURMANCI_VOWELS, PERFECT_FROM, rhymeKey, rhymePrefix, rimeOf, type Dialect } from './rhyme.js';

export interface RhymeCounts {
  perfect: number;
  near: number;
}

/**
 * The counts again, with a curator's rulings applied.
 *
 * A ruling moves one word between the buckets the endings put it in, so the
 * grouped counts are adjusted by the decisions rather than recomputed from
 * them — there are only ever a handful per prompt, against a group that may
 * hold forty thousand.
 *
 * `ruledOut` counts only the rulings that took something away: a word the
 * endings accepted and a curator did not. A ruling that agrees with the
 * endings changes nothing and is not a decision anybody needs to see.
 */
export function applyRulings(
  headword: string,
  counts: RhymeCounts,
  rulings: Iterable<readonly [string, string]>,
  dialect: Dialect = 'kurmanci',
): RhymeCounts & { ruledOut: number } {
  let { perfect, near } = counts;
  let ruledOut = 0;
  for (const [rhyme, quality] of rulings) {
    const derived = classifyRhyme(headword, rhyme, dialect);
    if (derived === quality) continue;
    if (derived === 'perfect') perfect -= 1;
    else if (derived === 'near') near -= 1;
    if (quality === 'perfect') perfect += 1;
    else if (quality === 'near') near += 1;
    else if (derived !== 'none') ruledOut += 1;
  }
  return { perfect: Math.max(0, perfect), near: Math.max(0, near), ruledOut };
}

export interface RhymeGroupSizes {
  /**
   * What rhymes with `headword`, discounting the word itself.
   *
   * `selves` is how many dictionary rows carry this same normalized headword —
   * a word never rhymes with itself, and a grouped count cannot tell which row
   * it is looking at.
   */
  countsFor(headword: string, selves: number): RhymeCounts;
  /** how many distinct endings there are — a scale check for the caller */
  groups: number;
}

/**
 * How long the sizes are reused for.
 *
 * The pass is one sequential scan — 364ms over 450,000 rows — and the admin
 * coverage page runs it on every search. A word added in the meantime moves a
 * count by one in a group of tens of thousands, so a curator cannot see the
 * staleness; the delay on every keystroke they could.
 */
const GROUPS_CACHE_TTL_SECONDS = 60;

/** The dictionary's name for a dialect (`dict_entries.dialect`). */
const DICTIONARY_DIALECT: Record<Dialect, string> = { kurmanci: 'kurmanji', sorani: 'sorani' };

/** The reversed rime of a reversed headword: everything up to and including its first vowel (SQL's side of `rimeOf`). */
const REVERSED_RIME_SQL = `substring(rhyme_key from '^[^${[...KURMANCI_VOWELS].join('')}]*[${[...KURMANCI_VOWELS].join('')}]')`;

/** The word itself sits in its own groups, so it comes out of them. */
const less = (n: number | undefined, selves: number): number => Math.max(0, (n ?? 0) - selves);

/**
 * One row per ending, with how many words share it. A dictionary has on the
 * order of a thousand such endings, so the result is small however large the
 * dictionary is.
 */
export async function rhymeGroupSizes(app: FastifyInstance, dialect: Dialect = 'kurmanci'): Promise<RhymeGroupSizes> {
  return dialect === 'sorani' ? soraniGroups(app) : kurmanciGroups(app);
}

async function kurmanciGroups(app: FastifyInstance): Promise<RhymeGroupSizes> {
  const rows = await app.cache.withCache('rhyme-groups', 'kurmanci', GROUPS_CACHE_TTL_SECONDS, async () => {
    const res = await app.db.query<{ rime: string | null; n: string }>(
      `SELECT ${REVERSED_RIME_SQL} AS rime, count(*)::text AS n
         FROM dict_entries WHERE rhyme_key <> '' AND dialect = $1 GROUP BY 1`,
      [DICTIONARY_DIALECT.kurmanci],
    );
    return res.rows;
  });

  const byRime = new Map<string, number>();
  const byCoda = new Map<string, number>();
  for (const r of rows) {
    // a word with no vowel rhymes with nothing by this rule, and is in no group
    if (r.rime === null) continue;
    const n = Number(r.n);
    byRime.set(r.rime, (byRime.get(r.rime) ?? 0) + n);
    const coda = [...r.rime].slice(0, -1).join('');
    if (coda !== '') byCoda.set(coda, (byCoda.get(coda) ?? 0) + n);
  }

  return {
    groups: byRime.size,
    countsFor(headword, selves) {
      const r = rimeOf(headword);
      if (!r) return { perfect: 0, near: 0 };
      const rime = rhymeKey(r.rime);
      const perfect = less(byRime.get(rime), selves);
      // a word ending in a vowel has only perfect rhymes: there is no coda for another vowel to come before
      if (r.coda === '') return { perfect, near: 0 };
      const withCoda = less(byCoda.get(rhymeKey(r.coda)), selves);
      return { perfect, near: Math.max(0, withCoda - perfect) };
    },
  };
}

async function soraniGroups(app: FastifyInstance): Promise<RhymeGroupSizes> {
  const rows = await app.cache.withCache('rhyme-groups', 'sorani', GROUPS_CACHE_TTL_SECONDS, async () => {
    const res = await app.db.query<{ one: string; two: string; n: string }>(
      `SELECT left(rhyme_key, 1) AS one, left(rhyme_key, ${PERFECT_FROM}) AS two, count(*)::text AS n
         FROM dict_entries WHERE rhyme_key <> '' AND dialect = $1 GROUP BY 1, 2`,
      [DICTIONARY_DIALECT.sorani],
    );
    return res.rows;
  });

  const byOne = new Map<string, number>();
  const byTwo = new Map<string, number>();
  for (const r of rows) {
    const n = Number(r.n);
    byOne.set(r.one, (byOne.get(r.one) ?? 0) + n);
    byTwo.set(r.two, (byTwo.get(r.two) ?? 0) + n);
  }

  return {
    groups: byTwo.size,
    countsFor(headword, selves) {
      const one = rhymePrefix(headword, 1);
      const two = rhymePrefix(headword, PERFECT_FROM);
      if (one === null) return { perfect: 0, near: 0 };
      const anyRhyme = less(byOne.get(one), selves);
      /*
       * A word too short to have two final letters has no perfect rhymes at
       * all. Falling back to its one-letter group here would have counted every
       * word ending in that letter as a perfect rhyme for it.
       */
      const perfect = two === null ? 0 : less(byTwo.get(two), selves);
      return { perfect, near: Math.max(0, anyRhyme - perfect) };
    },
  };
}
