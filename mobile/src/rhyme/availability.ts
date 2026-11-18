import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { CourseScript } from '../learn/courseDialect';
import type { Dialect } from './matchApi';

/**
 * Which varieties a rhyme round can be played in now, for training and matches (`GET /rhyme/availability`), and
 * which one a screen opens on. A variety without enough curated prompts is left out of the choice until it has
 * them, and a choice of one is not shown. Until the server answers, or when it cannot, both are offered.
 */

export const RHYME_DIALECTS: readonly Dialect[] = ['kurmanci', 'sorani'];

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
      // An answer that offers nothing says nothing either: better both offered than neither.
      if (RHYME_DIALECTS.some((d) => known[d] === true)) setOffered(known);
    });
    return () => {
      alive = false;
    };
  }, [client]);
  return offered;
}

/** The varieties to offer, in their usual order: those the server has not ruled out. */
export function offeredRhymeDialects(offered: RhymeOffered): Dialect[] {
  return RHYME_DIALECTS.filter((d) => isRhymeOffered(offered, d));
}

/** Whether rounds can be started in `dialect`: anything the server has not ruled out is. */
export function isRhymeOffered(offered: RhymeOffered, dialect: Dialect): boolean {
  return offered?.[dialect] !== false;
}

/**
 * The variety a rhyme screen opens on: the learner's own (their course, else Soranî for a Soranî interface, else
 * Kurmancî) when rounds are offered there, otherwise the first that has them.
 */
export function openingRhymeDialect(offered: RhymeOffered, course: CourseScript, locale: string): Dialect {
  const own: Dialect = course === 'ckb' || locale === 'ckb' ? 'sorani' : 'kurmanci';
  if (isRhymeOffered(offered, own)) return own;
  return RHYME_DIALECTS.find((d) => isRhymeOffered(offered, d)) ?? own;
}
