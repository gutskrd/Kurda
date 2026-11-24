/**
 * How an English answer to a "translate into English" item is compared. Kurmanji has no word for "the" and marks "a"
 * with an ending a learner does not always carry over, so articles are left out of the comparison; contractions are
 * spelled out, so "I'm" and "I am" are one answer. It works on `gradingKey` output, where an apostrophe is a space.
 */

const ARTICLES: ReadonlySet<string> = new Set(['the', 'a', 'an']);

/** Words whose "'s" is "is" rather than a possessive, so "it's" is "it is" but "Hamo's" stays as written. */
const IS_BEFORE_S: ReadonlySet<string> = new Set(['it', 'he', 'she', 'that', 'what', 'there', 'here', 'who', 'where', 'how', 'this']);

/** The second half of a contraction, spelled out. */
const ENDINGS: Readonly<Record<string, string>> = { m: 'am', re: 'are', ve: 'have', ll: 'will', d: 'would' };

/** The negatives whose first half changes when "n't" is spelled out; the rest only drop their "n" ("isn't" → "is not"). */
const NEGATIVES: Readonly<Record<string, string>> = { can: 'can', won: 'will', don: 'do', shan: 'shall' };

/** One token pair of a contraction spelled out, or null when the pair is not one. */
function spelledOut(word: string, next: string): string | null {
  if (next === 't' && word.endsWith('n')) return `${NEGATIVES[word] ?? word.slice(0, -1)} not`;
  if (next === 's') return IS_BEFORE_S.has(word) ? `${word} is` : word === 'let' ? 'let us' : null;
  const ending = ENDINGS[next];
  return ending ? `${word} ${ending}` : null;
}

/** An English answer's grading key with contractions spelled out and articles left out. */
export function englishKey(key: string): string {
  const words = key.replace(/\bcannot\b/g, 'can not').split(' ').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const pair = i + 1 < words.length ? spelledOut(words[i]!, words[i + 1]!) : null;
    if (pair) {
      out.push(pair);
      i++;
    } else {
      out.push(words[i]!);
    }
  }
  return out
    .join(' ')
    .split(' ')
    .filter((w) => !ARTICLES.has(w))
    .join(' ');
}
