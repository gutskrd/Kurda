/**
 * The Last Letter as the phone's Learn Games list shows it: the shared
 * registry entry (`LAST_LETTER_LEARN_ENTRY`) with what the phone adds — its
 * catalogue keys, its screen and its icon — and whether it opens
 * (`useLastLetterAvailability`: only where a dialect's dictionary is big
 * enough; elsewhere it is listed as coming soon). The list renders it as every other card.
 */
import { LAST_LETTER_LEARN_ENTRY } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/Icon';

export const LAST_LETTER_CARD = {
  entry: LAST_LETTER_LEARN_ENTRY,
  nameKey: 'games.lastLetter.name' as TranslationKey,
  lineKey: 'games.invite.blurb.lastLetter' as TranslationKey,
  route: 'LastLetter' as const,
  icon: 'link' as IconName,
} as const;

export { offeredDialects, useLastLetterAvailability } from './availability';
