import { useEffect, useState } from 'react';
import type { LastLetterAvailability, LastLetterAvailabilityAnswer, LetterDialect } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';

/**
 * Where The Last Letter is offered (`GET /mp/last-letter/availability`), per dialect: with friends once the dictionary
 * can check words, against Hevalo once enough of its words are curated. Read once per page load, since it changes
 * only with imports and curation.
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
      // A failed read is not cached, so the next caller asks again.
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
