/**
 * The slips a word box can see for itself before a word is sent, so they cost
 * no strike: not one word in the game's letters, the wrong first letter, a
 * word already in the chain. The server judges every word again (and alone
 * asks the dictionary); this is only so a player is told about a typo before
 * it counts. Both apps word the answer from their own catalogues.
 */
import { beginsWith, wordKey } from '../letters.js';
import type { LastLetterBoard } from './rules.js';

export type LastLetterSlip = { kind: 'script' } | { kind: 'letter'; letter: string } | { kind: 'used' };

export function lastLetterSlip(board: Pick<LastLetterBoard, 'dialect' | 'required' | 'requiredSpellings' | 'chain'>, typed: string): LastLetterSlip | null {
  if (!typed.trim()) return null;
  const key = wordKey(board.dialect, typed);
  if (key === null) return { kind: 'script' };
  if (board.required && !beginsWith(board.dialect, key, board.required)) {
    return { kind: 'letter', letter: board.requiredSpellings.join(' / ') || board.required };
  }
  if (board.chain.some((w) => w.word === key)) return { kind: 'used' };
  return null;
}
