import { useEffect, useState } from 'react';
import type { LastLetterAvailability, LastLetterAvailabilityAnswer, LetterDialect } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';

/**
 * Where The Last Letter is offered (`GET /mp/last-letter/availability`), per dialect: with friends once the
 * dictionary can check words, against Hevalo once admins have curated enough words. Learn opens it only where
 * offered and shows it as coming soon elsewhere. Read once per app run and shared.
 */
let cached: Promise<LastLetterAvailability[]> | null = null;

/** Test seam: forget the answer read earlier. */
export function forgetLastLetterAvailability(): void {
  cached = null;
}

export function useLastLetterAvailability(enabled = true): LastLetterAvailability[] | null {
  const { client } = useAuth();
  const [answer, setAnswer] = useState<LastLetterAvailability[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    cached ??= client.get<LastLetterAvailabilityAnswer>('/mp/last-letter/availability').then((r) => {
      if (r.ok && Array.isArray(r.data?.dialects)) return r.data.dialects;
      // A failed read is not an answer: asked again next time.
      cached = null;
      return [];
    });
    void cached.then((d) => {
      if (alive) setAnswer(d);
    });
    return () => {
      alive = false;
    };
  }, [client, enabled]);
  return answer;
}

/** The dialects offered for a way of playing. */
export function offeredDialects(answer: readonly LastLetterAvailability[] | null, how: 'group' | 'solo'): LetterDialect[] {
  return (answer ?? []).filter((a) => a[how]).map((a) => a.dialect);
}
