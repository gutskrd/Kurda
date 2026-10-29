import { seededShuffle } from './exercises.js';
import { foldedKey, itemWords, leaning, varietyOf, wordsOf, type SessionItem } from './item-words.js';

/** An answer longer than this is typed: a bank of its words would be a wall of tiles. */
export const BANK_MAX_WORDS = 10;
/** No more tiles than this in a bank. */
export const BANK_MAX_TILES = 12;

/** How many tiles that are not the answer a bank takes beside an answer of `words` words. */
function distractorsFor(words: number): number {
  return Math.min(words <= 2 ? 3 : words <= 5 ? 4 : 5, BANK_MAX_TILES - words);
}

const LETTER = /\p{L}/u;

/**
 * The word tiles of each translate and listening item of a session (undefined
 * for the others): the words of its main accepted answer, a word twice being
 * two tiles, and a few that are not, in an order shuffled for the session, so
 * a resumed session shows the same bank.
 *
 * The words that are not the answer come from the session's other items of
 * the same variety, in the answer's language (`item-words.ts`), and are none of
 * the item's accepted answers' words nor a diacritic slip of one. An item whose
 * answer's language cannot be told gets no bank, and its learner types as
 * before; so does an answer of more than `BANK_MAX_WORDS` words, and a one-word
 * answer the session has nothing to set beside.
 */
export function wordBanks(items: readonly SessionItem[]): Array<string[] | undefined> {
  const words = items.map((item) => itemWords(item.type, item.payload, item.dialect));
  return items.map((item, i) => {
    const answer = words[i]!.answer;
    if (!answer || (item.type !== 'translate' && item.type !== 'listening')) return undefined;
    const tiles = wordsOf(answer.text);
    if (tiles.length === 0 || tiles.length > BANK_MAX_WORDS) return undefined;

    const variety = varietyOf(item.dialect);
    const seen = new Set(words[i]!.accepted.flatMap(wordsOf).map(foldedKey));
    const pool: string[] = [];
    items.forEach((other, j) => {
      if (j === i || varietyOf(other.dialect) !== variety) return;
      for (const text of words[j]!.texts) {
        if (text.lang !== answer.lang) continue;
        for (const word of wordsOf(text.text)) {
          const key = foldedKey(word);
          // a word of a Latin-script text that looks like the other language stays out: a name, a Kurdish word in an English hint
          const leans = variety === 'kurmanji' ? leaning([word]) : null;
          if (seen.has(key) || !LETTER.test(word) || (leans !== null && leans !== answer.lang)) continue;
          seen.add(key);
          pool.push(word);
        }
      }
    });
    const distractors = seededShuffle(pool, `${item.seed}:distractors`).slice(0, distractorsFor(tiles.length));
    if (distractors.length === 0 && tiles.length < 2) return undefined;
    return seededShuffle([...tiles, ...distractors], `${item.seed}:bank`);
  });
}
