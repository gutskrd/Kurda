import { useEffect, useState } from 'react';
import type { CouchCategory, CouchOffer, GameDialect, GameDifficulty } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';

/**
 * The categories a game of Kurdish Impostor can draw its word from, on the
 * phone: per variety and difficulty, those with enough approved cards for a
 * word and the guess’s other options (`GET /games/impostor/couch`, the list
 * the game on one phone chooses from too). A host picks one of these or none;
 * the server checks the choice again when the lobby is made.
 *
 * Read once per variety while the app runs: it changes when an editor
 * publishes cards, not while somebody is choosing a game.
 */
const cached = new Map<GameDialect, Promise<CouchOffer | null>>();

/** Test seam: forget the answers read earlier. */
export function forgetImpostorCategories(): void {
  cached.clear();
}

/** Where the game is offered in a variety, with each difficulty’s categories; null until it answers, and when it cannot be read. */
export function useImpostorCategories(dialect: GameDialect | null): CouchOffer | null {
  const { client } = useAuth();
  const [answer, setAnswer] = useState<CouchOffer | null>(null);
  useEffect(() => {
    if (dialect === null) return;
    let alive = true;
    let asked = cached.get(dialect);
    if (!asked) {
      asked = client.get<CouchOffer>(`/games/impostor/couch?dialect=${dialect}`).then((r) => {
        const ok = r.ok && r.data && Array.isArray(r.data.difficulties) ? r.data : null;
        // a failed read is not an answer: asked again next time
        if (!ok) cached.delete(dialect);
        return ok;
      });
      cached.set(dialect, asked);
    }
    void asked.then((offer) => {
      if (alive) setAnswer(offer);
    });
    return () => {
      alive = false;
    };
  }, [client, dialect]);
  return answer && answer.dialect === dialect ? answer : null;
}

/** The categories to choose among at a difficulty; none while the answer is not here. */
export function categoriesAt(offer: CouchOffer | null, difficulty: GameDifficulty | null | undefined): CouchCategory[] {
  return offer?.difficulties.find((d) => d.difficulty === difficulty)?.categories ?? [];
}
