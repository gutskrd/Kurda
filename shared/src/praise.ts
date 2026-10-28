/**
 * What a right answer is told, in Kurdish: "Aferîn!", "Pir baş!". Said in the
 * course's own variety, it teaches a little each time it is read, which an
 * English "Correct!" never does — the interface's language still says the
 * verdict to a screen reader, and a small gloss says what the word means.
 *
 * This is content, not interface copy: it is the same whatever language the
 * app is in, so it lives here rather than in the translation files. Every
 * word wants checking by a native Kurmancî and Soranî speaker before it ships
 * further than this list.
 *
 * Only a right answer is praised. "Almost", "not yet" and a spoken answer's
 * own rating keep their words, which must be true of the answer they are
 * shown for.
 */
import { isSoraniDialect } from './lesson-answers.js';

export const PRAISE = {
  kmr: ['Aferîn!', 'Pir baş!', 'Rast e!', 'Gelek baş!'],
  ckb: ['ئافەرین!', 'زۆر باشە!', 'ڕاستە!', 'دەستخۆش!'],
} as const;

/** The praise words in a course's variety: Soranî's for Soranî, Kurmancî's otherwise. */
export function praiseWords(dialect: string | null | undefined): readonly string[] {
  return isSoraniDialect(dialect) ? PRAISE.ckb : PRAISE.kmr;
}

/**
 * The word for this right answer: chosen by the turn and the run, so the same
 * lesson played the same way says the same things (and a test can know which),
 * and never the word said last time, so two right answers in a row are not
 * told the same thing twice.
 */
export function praiseFor(dialect: string | null | undefined, { index, run, previous = null }: { index: number; run: number; previous?: string | null }): string {
  const words = praiseWords(dialect);
  const at = (((index + run) % words.length) + words.length) % words.length;
  const word = words[at]!;
  return word === previous ? words[(at + 1) % words.length]! : word;
}
