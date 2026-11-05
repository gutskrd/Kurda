/**
 * Cards made from approved words (api/src/games/word-cards.ts), as the Game
 * content page uses them: Kurdish Bluff's cards and Who Am I?'s identities are
 * a word picked from published lessons or the curated dictionary, its Kurdish
 * copied across by the server and never typed here.
 *
 *   GET  /admin/game-content/words?dialect&q&from&limit   { words }
 *   POST /admin/game-content/from-word                    { kind, dialect, ref, level, category?, facts? }: the new draft
 */
import type { AdminGameContent, GameDialect, GameWordCandidate, GameWordSource, WordCardRequest } from '@kurda/shared';
import { api } from './api';

export const WORD_SOURCE_NAME: Record<GameWordSource, string> = {
  vocabulary: 'Published lessons',
  dictionary: 'Curated dictionary',
};

export function listGameWords(dialect: GameDialect, query: string, from: GameWordSource | 'all'): Promise<{ words: GameWordCandidate[] }> {
  const p = new URLSearchParams({ dialect, limit: '40' });
  if (query.trim()) p.set('q', query.trim());
  if (from !== 'all') p.set('from', from);
  return api(`/admin/game-content/words?${p.toString()}`);
}

export const makeCardFromWord = (input: WordCardRequest): Promise<AdminGameContent> => api('/admin/game-content/from-word', { method: 'POST', body: input });
