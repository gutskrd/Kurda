import type { AppLocale } from '../locales.js';
import { LATIN, SORANI, bandOf, compareLocaleOf, likeFor, type LatinLetter, type SoraniLetter } from './letters.js';
import type { Script } from './practice.js';

/**
 * How an alphabet page lays the letters out, the same on the website and the
 * phone: which groups, in which order, and the few words under each letter.
 * The titles and the sentences are each app's own catalogue's; the groups are
 * named here by what they are.
 */

/** A group of letters, by what it holds. */
export type GroupId = 'watch' | 'new' | 'same' | 'vowels' | 'consonants' | 'throat';

export interface LetterGroup<L> {
  id: GroupId;
  letters: L[];
}

/**
 * Kurmancî, sorted against the reader's language — the false friends first,
 * because that is where the mistakes are. A reader with no language to compare
 * against (a Kurdish one) gets the vowels and the consonants instead.
 */
export function latinGroups(locale: AppLocale): LetterGroup<LatinLetter>[] {
  const lang = compareLocaleOf(locale);
  if (!lang) {
    return [
      { id: 'vowels', letters: LATIN.filter((l) => l.vowel) },
      { id: 'consonants', letters: LATIN.filter((l) => !l.vowel) },
    ];
  }
  return (['watch', 'new', 'same'] as const)
    .map((band) => ({ id: band, letters: LATIN.filter((l) => bandOf(l.id, lang) === band) }))
    .filter((g) => g.letters.length > 0);
}

/** Soranî by kind: the vowels it writes, the consonants, and the sounds from the throat. */
export function soraniGroups(): LetterGroup<SoraniLetter>[] {
  return [
    { id: 'vowels', letters: SORANI.filter((l) => l.kind === 'vowel') },
    { id: 'consonants', letters: SORANI.filter((l) => l.kind === 'consonant') },
    { id: 'throat', letters: SORANI.filter((l) => l.kind === 'throat') },
  ];
}

/** What a Kurmancî letter's tile says under it: the sound it is like, or its partner in the other script. */
export function latinHint(letter: LatinLetter, locale: AppLocale): string | null {
  const lang = compareLocaleOf(locale);
  if (!lang) return letter.sorani;
  if (bandOf(letter.id, lang) === 'same') return null;
  // a vowel's comparison marks the same letter ("f[a]ther"); repeating it under the tile says nothing
  const sound = likeFor(letter.id, locale)?.sound ?? null;
  return sound && sound.toLocaleLowerCase() !== letter.id ? sound : null;
}

/**
 * Which language an example word's meaning is shown in: the reader's — or, for
 * a reader who already speaks that dialect, the same word in the other one,
 * which is the more useful thing to put under it: a Soranî reader learns the
 * Kurmancî word, and the reverse.
 */
export function meaningLocale(script: Script, locale: AppLocale): AppLocale {
  if (script === 'kmr' && locale === 'ku') return 'ckb';
  if (script === 'ckb' && locale === 'ckb') return 'ku';
  return locale;
}
