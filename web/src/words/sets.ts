import type { KurdishWord, WordGroupId, WordSetId } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

/** Each word set's title, subtitle and Kurdish name, shared by the Words and WordSet pages. */

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

/** Each set's Kurdish name on its card, as in the phone's catalogues, with the Soranî also in Latin letters. */
export const SET_NAME: Record<WordSetId, KurdishWord> = {
  colours: { kmr: 'Reng', ckb: 'ڕەنگەکان', ckbLatin: 'řengekan' },
  numbers: { kmr: 'Hejmar', ckb: 'ژمارەکان', ckbLatin: 'jimarekan' },
  days: { kmr: 'Rojên hefteyê', ckb: 'ڕۆژەکانی هەفتە', ckbLatin: 'řojekanî hefte' },
  months: { kmr: 'Meh', ckb: 'مانگەکان', ckbLatin: 'mangekan' },
};

/** The alphabet's own name, for its card at the top of Letters and words. */
export const LETTERS_NAME: KurdishWord = { kmr: 'Alfabe', ckb: 'ئەلفوبێ', ckbLatin: 'elfubê' };

/** A group's heading; the sets with one group need none. */
export const GROUP_TITLE: Partial<Record<WordGroupId, MessageKey>> = {
  units: 'words.group.units',
  teens: 'words.group.teens',
  tens: 'words.group.tens',
  big: 'words.group.big',
  gregorian: 'words.group.gregorian',
  kurdish: 'words.group.kurdish',
};

/** A season's tint over a month's tile or a legend pill, faint enough to keep the text's contrast in either theme. */
export const tinted = (hex: string): string => `${hex}2E`;
