import { useEffect, useState } from 'react';
import { readEveryDialect, type GameDialect, type GameDifficulty, type GamesAvailability, type LearnGameId } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { ApiError } from '../lib/types';

/**
 * Where Impostor is offered: per variety, the difficulties with enough approved cards (`GET /games/availability`).
 * The start page and the invite sheet choose among these. Read once per page load, since it changes only when an
 * editor publishes cards.
 */
export type PartyGame = Extract<LearnGameId, 'impostor'>;

interface PartyOffer {
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
    // both varieties in one read
    cached ??= readEveryDialect<GamesAvailability, ApiError>(client, '/games/availability').then((res) => {
      // A failed read is not cached, so the next caller asks again.
      if (!res.ok) cached = null;
      return res.ok ? res.data.filter((a) => Array.isArray(a?.games)) : [];
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
function offersOf(answer: readonly GamesAvailability[], game: PartyGame): PartyOffer[] {
  return answer.flatMap((a) => {
    const g = a.games.find((x) => x.id === game);
    return g && g.available && g.difficulties.length > 0 ? [{ dialect: a.dialect, difficulties: [...g.difficulties] }] : [];
  });
}
