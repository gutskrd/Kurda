import { useEffect, useState } from 'react';
import type { LetterDialect, MultiGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';

/**
 * Where a multiplayer learning game is offered now (`GET /mp/:game/availability`),
 * for the games that answer more than "with friends or not" — the Who Am I?
 * race names the difficulties its identities fill. Per dialect; a game is
 * only offered where it says so, and nothing says "coming soon".
 *
 * Read once per page load per game and shared, as The Last Letter's is: the
 * answer moves when content is published, not while somebody is choosing.
 */
export interface MpDialectOffer {
  dialect: LetterDialect;
  group: boolean;
  solo: boolean;
  [more: string]: unknown;
}

const cached = new Map<MultiGame, Promise<MpDialectOffer[]>>();

/** Test seam: forget what was read. */
export function forgetMpAvailability(): void {
  cached.clear();
}

export function useMpAvailability<T extends MpDialectOffer = MpDialectOffer>(game: MultiGame, enabled = true): T[] | null {
  const { client, status } = useAuth();
  const [answer, setAnswer] = useState<T[] | null>(null);
  const on = enabled && status === 'signedIn';
  useEffect(() => {
    if (!on) return;
    let alive = true;
    let read = cached.get(game);
    if (!read) {
      read = client.get<{ dialects: MpDialectOffer[] }>(`/mp/${game}/availability`).then((r) => {
        if (r.ok && Array.isArray(r.data?.dialects)) return r.data.dialects;
        // asked again next time: a failed read is not an answer
        cached.delete(game);
        return [];
      });
      cached.set(game, read);
    }
    void read.then((d) => {
      if (alive) setAnswer(d as T[]);
    });
    return () => {
      alive = false;
    };
  }, [client, on, game]);
  return answer;
}

/** The dialects a game is offered in with friends. */
export function groupDialects(answer: readonly MpDialectOffer[] | null): LetterDialect[] {
  return (answer ?? []).filter((a) => a.group).map((a) => a.dialect);
}
