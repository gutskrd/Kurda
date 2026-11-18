/**
 * The Last Letter's card in Learn's games list: the shared registry entry (`LAST_LETTER_LEARN_ENTRY`) plus the
 * phone's catalogue keys, screen and icon, and whether it opens (`useLastLetterAvailability`; elsewhere it shows
 * as coming soon).
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
