import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { CourseScript } from '../learn/courseDialect';
import type { Dialect } from './matchApi';

/**
 * Which varieties a rhyme round can be played in now, for training and for a
 * match alike (`GET /rhyme/availability`), and which one a screen opens on.
 *
 * A variety without enough curated prompts would open a round on a word of
 * the other variety, or on none at all (a match then failed with "no words"),
 * so the phone leaves it out of the choice until it has them: a choice that
 * reads "coming soon" is a promise, not a game, and a choice of one is no
 * choice and is not shown. Until the server answers, and whenever it cannot
 * say, both are offered, as they were before it could.
 */

export const RHYME_DIALECTS: readonly Dialect[] = ['kurmanci', 'sorani'];

/**
 * A variety is called by its own name in every language, the way a language
 * is. Not a catalogue entry: translating "Kurmancî" into Kurmancî nine times
 * is how you end up with nine spellings of one word.
 */
export const DIALECT_NAME: Record<Dialect, string> = { kurmanci: 'Kurmancî', sorani: 'Soranî' };

/** What the server said, variety by variety; null until it has said anything useful. */
export type RhymeOffered = Partial<Record<Dialect, boolean>> | null;

export function useRhymeOffered(): RhymeOffered {
  const { client } = useAuth();
  const [offered, setOffered] = useState<RhymeOffered>(null);
  useEffect(() => {
    let alive = true;
    void client.get<{ dialects?: Partial<Record<Dialect, { available?: boolean }>> }>('/rhyme/availability').then((r) => {
      const dialects = r.ok ? r.data?.dialects : undefined;
      if (!alive || !dialects) return;
      const known: Partial<Record<Dialect, boolean>> = {};
      for (const d of RHYME_DIALECTS) {
        const available = dialects[d]?.available;
        if (typeof available === 'boolean') known[d] = available;
      }
      // an answer that offers nothing says nothing either: better both offered than neither
      if (RHYME_DIALECTS.some((d) => known[d] === true)) setOffered(known);
    });
    return () => {
      alive = false;
    };
  }, [client]);
  return offered;
}

/** The varieties to offer in the choice, in their usual order: the ones the server has not ruled out. */
export function offeredRhymeDialects(offered: RhymeOffered): Dialect[] {
  return RHYME_DIALECTS.filter((d) => isRhymeOffered(offered, d));
}

/** Whether rounds can be started in `dialect`: anything the server has not ruled out is. */
export function isRhymeOffered(offered: RhymeOffered, dialect: Dialect): boolean {
  return offered?.[dialect] !== false;
}

/**
 * The variety a rhyme screen opens on: the learner's own (the course on their
 * path, else Soranî when the interface is Soranî, else Kurmancî) when rounds
 * are offered in it, and otherwise the first one that has them.
 */
export function openingRhymeDialect(offered: RhymeOffered, course: CourseScript, locale: string): Dialect {
  const own: Dialect = course === 'ckb' || locale === 'ckb' ? 'sorani' : 'kurmanci';
  if (isRhymeOffered(offered, own)) return own;
  return RHYME_DIALECTS.find((d) => isRhymeOffered(offered, d)) ?? own;
}
