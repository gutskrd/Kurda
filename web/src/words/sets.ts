import { SEASONS, SEASON_ORDER, WORD_COLOURS, type KurdishWord, type WordGroupId, type WordSetId } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

/**
 * What the pages call each set, and what they show for it: the title and the
 * line under it, the set's own Kurdish name, and the colours its card is
 * pictured with. Kept apart from the two pages (Words.tsx, WordSet.tsx) so
 * both, and Learn's tile, read the same names.
 */

export const SET_TITLE: Record<WordSetId, MessageKey> = {
  colours: 'words.set.colours',
  numbers: 'words.set.numbers',
  days: 'words.set.days',
  months: 'words.set.months',
};

export const SET_BODY: Record<WordSetId, MessageKey> = {
  colours: 'words.set.coloursBody',
  numbers: 'words.set.numbersBody',
  days: 'words.set.daysBody',
  months: 'words.set.monthsBody',
};

/**
 * Each set's name in Kurdish, as its card says it: the Kurmancî and Soranî
 * titles the phone's catalogues give the sets, with the Soranî in Latin
 * letters beside them for a reader of the other script. Listed for a native
 * speaker to check, like every Kurdish word here.
 */
export const SET_NAME: Record<WordSetId, KurdishWord> = {
  colours: { kmr: 'Reng', ckb: 'ڕەنگەکان', ckbLatin: 'řengekan' },
  numbers: { kmr: 'Hejmar', ckb: 'ژمارەکان', ckbLatin: 'jimarekan' },
  days: { kmr: 'Rojên hefteyê', ckb: 'ڕۆژەکانی هەفتە', ckbLatin: 'řojekanî hefte' },
  months: { kmr: 'Meh', ckb: 'مانگەکان', ckbLatin: 'mangekan' },
};

/** A group's heading; the sets with one group need none. */
export const GROUP_TITLE: Partial<Record<WordGroupId, MessageKey>> = {
  units: 'words.group.units',
  teens: 'words.group.teens',
  tens: 'words.group.tens',
  big: 'words.group.big',
  gregorian: 'words.group.gregorian',
  kurdish: 'words.group.kurdish',
};

/** The first four colours, for the colours' card and Learn's tile. */
export const TEASER_COLOURS: readonly string[] = ['red', 'yellow', 'green', 'blue'].map((id) => WORD_COLOURS.find((c) => c.id === id)!.hex);

/** The four seasons' tints, in order, for the months' card. */
export const SEASON_TINTS: readonly string[] = SEASON_ORDER.map((s) => SEASONS[s].tint);

/** A season's tint over a month's tile or a legend's pill: faint enough that the words keep their contrast in either theme. */
export const tinted = (hex: string): string => `${hex}2E`;
