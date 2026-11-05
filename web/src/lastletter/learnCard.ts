/**
 * The Last Letter as the website's Learn Games list shows it: the shared
 * registry entry (`LAST_LETTER_LEARN_ENTRY`) with what the website adds — its
 * catalogue keys, its page and its glyph — and whether to show it at all
 * (`useLastLetterAvailability`: only where a dialect's dictionary is big
 * enough, with no "coming soon"). The list renders it as it renders every
 * other game's card.
 */
import { LAST_LETTER_LEARN_ENTRY } from '@kurda/shared';
import { ChainIcon } from '../components/icons';
import type { MessageKey } from '../i18n/en';

export const LAST_LETTER_CARD = {
  entry: LAST_LETTER_LEARN_ENTRY,
  nameKey: 'games.lastLetter.name' as MessageKey,
  blurbKey: 'games.invite.blurb.lastLetter' as MessageKey,
  modes: [
    { labelKey: 'games.lastLetter.withFriends' as MessageKey, blurbKey: 'games.lastLetter.withFriendsBlurb' as MessageKey, how: 'group' as const },
    { labelKey: 'games.lastLetter.againstHevalo' as MessageKey, blurbKey: 'games.lastLetter.againstHevaloBlurb' as MessageKey, how: 'solo' as const },
  ],
  href: LAST_LETTER_LEARN_ENTRY.path,
  Icon: ChainIcon,
} as const;

export { offeredDialects, useLastLetterAvailability } from './availability';
