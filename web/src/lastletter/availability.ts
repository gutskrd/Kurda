import { useEffect, useState } from 'react';
import type { LastLetterAvailability, LastLetterAvailabilityAnswer, LetterDialect } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';

/**
 * Where The Last Letter is offered now (`GET /mp/last-letter/availability`):
 * per dialect, with friends once the dictionary can check players' words, and
 * against Hevalo once admins have curated enough of its words. The game lists
 * itself only where it is offered; nowhere says "coming soon".
 *
 * Read once per page load and shared: the answer changes when an import or an
 * admin's curation lands, not while somebody is choosing a game.
 */
let cached: Promise<LastLetterAvailability[]> | null = null;

/** Test seam: forget the answer read earlier. */
export function forgetLastLetterAvailability(): void {
  cached = null;
}

export function useLastLetterAvailability(enabled = true): LastLetterAvailability[] | null {
  const { client, status } = useAuth();
  const [answer, setAnswer] = useState<LastLetterAvailability[] | null>(null);
  const on = enabled && status === 'signedIn';
  useEffect(() => {
    if (!on) return;
    let alive = true;
    cached ??= client.get<LastLetterAvailabilityAnswer>('/mp/last-letter/availability').then((r) => {
      if (r.ok && Array.isArray(r.data?.dialects)) return r.data.dialects;
      // asked again next time: a failed read is not an answer
      cached = null;
      return [];
    });
    void cached.then((d) => {
      if (alive) setAnswer(d);
    });
    return () => {
      alive = false;
    };
  }, [client, on]);
  return answer;
}

/** The dialects offered for a way of playing, in the order the apps list them. */
export function offeredDialects(answer: readonly LastLetterAvailability[] | null, how: 'group' | 'solo'): LetterDialect[] {
  return (answer ?? []).filter((a) => a[how]).map((a) => a.dialect);
}
