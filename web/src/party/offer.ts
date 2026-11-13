import { useEffect, useState } from 'react';
import { GAME_DIALECTS, type GameDialect, type GameDifficulty, type GamesAvailability, type LearnGameId } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';

/**
 * Where Impostor is offered now: per variety, the difficulties whose
 * approved cards reach the game's minimum (`GET /games/availability`, the same answer Learn's list reads). A
 * game is made only where it is offered, so the start page and the invite
 * sheet choose among these, and a game offered nowhere says so rather than
 * "coming soon".
 *
 * Read once per page load for both varieties and shared: it changes when an
 * editor publishes cards, not while somebody is choosing a game.
 */
export type PartyGame = Extract<LearnGameId, 'impostor'>;

export interface PartyOffer {
  dialect: GameDialect;
  difficulties: GameDifficulty[];
}

let cached: Promise<GamesAvailability[]> | null = null;

/** Test seam: forget the answer read earlier. */
export function forgetPartyOffers(): void {
  cached = null;
}

/** The varieties the game is offered in, each with its difficulties; null until it answers. */
export function usePartyOffer(game: PartyGame, enabled = true): PartyOffer[] | null {
  const { client } = useAuth();
  const [answer, setAnswer] = useState<GamesAvailability[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    cached ??= Promise.all(GAME_DIALECTS.map((d) => client.get<GamesAvailability>(`/games/availability?dialect=${d}`))).then((all) => {
      const ok = all.flatMap((r) => (r.ok && r.data && Array.isArray(r.data.games) ? [r.data] : []));
      // a failed read is not an answer: asked again next time
      if (ok.length < all.length) cached = null;
      return ok;
    });
    void cached.then((list) => {
      if (alive) setAnswer(list);
    });
    return () => {
      alive = false;
    };
  }, [client, enabled]);
  if (answer === null) return null;
  return offersOf(answer, game);
}

/** The offers in an availability answer, varieties with no difficulty left out. */
export function offersOf(answer: readonly GamesAvailability[], game: PartyGame): PartyOffer[] {
  return answer.flatMap((a) => {
    const g = a.games.find((x) => x.id === game);
    return g && g.available && g.difficulties.length > 0 ? [{ dialect: a.dialect, difficulties: [...g.difficulties] }] : [];
  });
}
