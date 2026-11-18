/**
 * How many dictionary words share each rhyme, counted in one pass. A rhyme is decided by a word's ending (rhyme.ts), so
 * rhyming words form a suffix group and one `GROUP BY` over the reversed headword sizes all of them:
 * - **Kurmancî** rhymes by the rime (last vowel and what follows). The reversed headword up to its first vowel is the
 *   reversed rime, counting perfect rhymes; the same key without the vowel is the coda, counting near ones.
 * - **Soranî** rhymes by its last letters: two for a perfect rhyme, one for any rhyme.
 *
 * The work is the same for one prompt as for fifty: a single scan even over hundreds of thousands of rows.
 *
 * Counts are over the dialect's dictionary (what players may answer with), not the game pool, and include inflected
 * forms a round does not take, so they are an upper bound.
 */
import type { FastifyInstance } from 'fastify';
import { classifyRhyme, KURMANCI_VOWELS, PERFECT_FROM, rhymeKey, rhymePrefix, rimeOf, type Dialect } from './rhyme.js';

export interface RhymeCounts {
  perfect: number;
  near: number;
}

/**
 * The counts with a curator's rulings applied. A ruling moves one word between buckets, so counts are adjusted by the
 * few decisions per prompt rather than recomputed.
 *
 * `ruledOut` counts only rulings that removed a word the endings accepted; a ruling agreeing with the endings changes
 * nothing.
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
   * What rhymes with `headword`, excluding the word itself. `selves` is how many dictionary rows share this normalized
   * headword, since a grouped count cannot tell which row it is.
   */
  countsFor(headword: string, selves: number): RhymeCounts;
  /** how many distinct endings there are — a scale check for the caller */
  groups: number;
}

/**
 * How long the sizes are reused. The pass is one sequential scan (about 364 ms over 450,000 rows) and the admin
 * coverage page runs it on every search; a minute's staleness moves a count by one in groups of tens of thousands.
 */
const GROUPS_CACHE_TTL_SECONDS = 60;

/** The dictionary's name for a dialect (`dict_entries.dialect`). */
const DICTIONARY_DIALECT: Record<Dialect, string> = { kurmanci: 'kurmanji', sorani: 'sorani' };

/** The reversed rime of a reversed headword: everything up to and including its first vowel (SQL's side of `rimeOf`). */
const REVERSED_RIME_SQL = `substring(rhyme_key from '^[^${[...KURMANCI_VOWELS].join('')}]*[${[...KURMANCI_VOWELS].join('')}]')`;

/** The word itself sits in its own groups, so it comes out of them. */
const less = (n: number | undefined, selves: number): number => Math.max(0, (n ?? 0) - selves);

/**
 * One row per ending with how many words share it. There are on the order of a thousand endings, so the result stays
 * small.
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
       * A word too short for two final letters has no perfect rhymes; its one-letter group would wrongly count every
       * word ending in that letter.
       */
      const perfect = two === null ? 0 : less(byTwo.get(two), selves);
      return { perfect, near: Math.max(0, anyRhyme - perfect) };
    },
  };
}
