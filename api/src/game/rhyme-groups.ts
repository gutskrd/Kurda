/**
 * How many words the dictionary holds for each rhyme, counted in one pass.
 *
 * A rhyme is how many letters two words end with in common, so the words
 * rhyming with W are exactly those sharing W's last letter, and the perfect
 * ones exactly those sharing its last two. Rhyme groups are therefore suffix
 * groups, and one `GROUP BY` over the reversed headword sizes all of them at
 * once.
 *
 * That is the difference between this and comparing a prompt against every
 * word: the work is the same for one prompt as for fifty, and it does not grow
 * when a page shows more. Over 447,000 dictionary rows it is a single scan.
 *
 * The counts are over the whole dictionary rather than the game pool, because
 * the dictionary is what a player may answer with. The pool is what the game
 * *asks*, which is a different set and a different question.
 */
import type { FastifyInstance } from 'fastify';
import { classifyRhyme, PERFECT_FROM, rhymePrefix } from './rhyme.js';

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
): RhymeCounts & { ruledOut: number } {
  let { perfect, near } = counts;
  let ruledOut = 0;
  for (const [rhyme, quality] of rulings) {
    const derived = classifyRhyme(headword, rhyme);
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

/**
 * One row per (last letter, last two letters) pair, with how many words share
 * it. A Kurmancî dictionary has on the order of a thousand such pairs, so the
 * result is small however large the dictionary is.
 */
export async function rhymeGroupSizes(app: FastifyInstance): Promise<RhymeGroupSizes> {
  const rows = await app.cache.withCache('rhyme-groups', 'all', GROUPS_CACHE_TTL_SECONDS, async () => {
    const res = await app.db.query<{ one: string; two: string; n: string }>(
      `SELECT left(rhyme_key, 1) AS one, left(rhyme_key, ${PERFECT_FROM}) AS two, count(*)::text AS n
         FROM dict_entries WHERE rhyme_key <> '' GROUP BY 1, 2`,
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

      // the word itself sits in both of its own groups, so it comes out of both
      const anyRhyme = Math.max(0, (byOne.get(one) ?? 0) - selves);
      /*
       * A word too short to have two final letters has no perfect rhymes at
       * all. Falling back to its one-letter group here would have counted every
       * word ending in that letter as a perfect rhyme for it.
       */
      const perfect = two === null ? 0 : Math.max(0, (byTwo.get(two) ?? 0) - selves);
      return { perfect, near: Math.max(0, anyRhyme - perfect) };
    },
  };
}
