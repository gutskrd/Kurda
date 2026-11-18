/**
 * What a right answer is told, in the course's Kurdish ("Aferîn!", "Pir baş!"), so it teaches a little each time; the
 * interface language still gives the verdict to a screen reader, and a small gloss says what the word means. This is
 * content, the same in every interface language, so it lives here rather than in the translation files, and every word
 * needs a native speaker's check. Only right answers are praised; "almost", "not yet" and spoken self-ratings keep their
 * own words, which must stay true of the answer.
 */
import { isSoraniDialect } from './lesson-answers.js';

export const PRAISE = {
  kmr: ['Aferîn!', 'Pir baş!', 'Rast e!', 'Gelek baş!'],
  ckb: ['ئافەرین!', 'زۆر باشە!', 'ڕاستە!', 'دەستخۆش!'],
} as const;

/** The praise words for a course's variety: Soranî's for Soranî, Kurmancî's otherwise. */
export function praiseWords(dialect: string | null | undefined): readonly string[] {
  return isSoraniDialect(dialect) ? PRAISE.ckb : PRAISE.kmr;
}

/**
 * The word for this right answer, chosen by the turn and the run so the same lesson played the same way says the same
 * things, and never the last word said, so two right answers in a row are not told the same.
 */
export function praiseFor(dialect: string | null | undefined, { index, run, previous = null }: { index: number; run: number; previous?: string | null }): string {
  const words = praiseWords(dialect);
  const at = (((index + run) % words.length) + words.length) % words.length;
  const word = words[at]!;
  return word === previous ? words[(at + 1) % words.length]! : word;
}
