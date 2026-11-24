import { useEffect, useState } from 'react';
import { readEveryDialect, type GameDialect, type GameDifficulty, type GamesAvailability, type LearnGameId } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';

/**
 * Where Impostor is offered: per variety, the difficulties whose approved cards reach the game's minimum (`GET
 * /games/availability`, as Learn reads it). The start screen and invite sheet choose among these. Read once per
 * app run and shared; it only changes when an editor publishes cards.
 */
export type PartyGame = Extract<LearnGameId, 'impostor'>;

export interface PartyOffer {
  dialect: GameDialect;
  difficulties: GameDifficulty[];
}

let cached: Promise<GamesAvailability[]> | null = null;

/** Forget the answer read earlier, so the next screen asks again (tests, and Settings → Clear cache). */
export function forgetPartyOffers(): void {
  cached = null;
}

/** The varieties a party game is offered in, each with its difficulties; null until it answers. */
export function usePartyOffer(game: PartyGame, enabled = true): PartyOffer[] | null {
  const { client } = useAuth();
  const [answer, setAnswer] = useState<GamesAvailability[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    // both varieties in one read
    cached ??= readEveryDialect<GamesAvailability, ApiError>(client, '/games/availability').then((res) => {
      // A failed read is not an answer, so ask again next time.
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
  return answer === null ? null : offersOf(answer, game);
}

/** The offers in an availability answer, varieties with no difficulty left out. */
export function offersOf(answer: readonly GamesAvailability[], game: PartyGame): PartyOffer[] {
  return answer.flatMap((a) => {
    const g = a.games.find((x) => x.id === game);
    return g && g.available && g.difficulties.length > 0 ? [{ dialect: a.dialect, difficulties: [...g.difficulties] }] : [];
  });
}
