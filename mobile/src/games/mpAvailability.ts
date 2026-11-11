import { useEffect, useState } from 'react';
import type { GameDifficulty, LetterDialect, MultiGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';

/**
 * Where a multiplayer learning game is offered now (`GET /mp/:game/availability`),
 * on the phone, for a game that answers more than "with friends or not": the
 * Who Am I? race names the difficulties its identities fill. Per dialect; a
 * game is only offered where it says so, with no "coming soon" anywhere.
 *
 * Read once while the app runs and shared by every screen that asks, as The
 * Last Letter's is (lastletter/availability.ts).
 */
export interface MpDialectOffer {
  dialect: LetterDialect;
  group: boolean;
  solo: boolean;
  /** the Who Am I? race: the difficulties it can be played at */
  difficulties?: GameDifficulty[];
}

const cached = new Map<MultiGame, Promise<MpDialectOffer[]>>();

/** Test seam: forget what was read. */
export function forgetMpAvailability(): void {
  cached.clear();
}

export function useMpAvailability(game: MultiGame, enabled = true): MpDialectOffer[] | null {
  const { client } = useAuth();
  const [answer, setAnswer] = useState<MpDialectOffer[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let read = cached.get(game);
    if (!read) {
      read = client.get<{ dialects: MpDialectOffer[] }>(`/mp/${game}/availability`).then((r) => {
        if (r.ok && Array.isArray(r.data?.dialects)) return r.data.dialects;
        // a failed read is not an answer: asked again next time
        cached.delete(game);
        return [];
      });
      cached.set(game, read);
    }
    void read.then((d) => {
      if (alive) setAnswer(d);
    });
    return () => {
      alive = false;
    };
  }, [client, enabled, game]);
  return answer;
}

/** The dialects a game is offered in with friends. */
export function groupDialects(answer: readonly MpDialectOffer[] | null): LetterDialect[] {
  return (answer ?? []).filter((a) => a.group).map((a) => a.dialect);
}
