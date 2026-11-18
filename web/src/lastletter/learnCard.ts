/**
 * The Last Letter's card in the Learn Games list: the shared registry entry (`LAST_LETTER_LEARN_ENTRY`) with the
 * website's catalogue keys, page and glyph, open only where `useLastLetterAvailability` offers it.
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
  Icon: ChainIcon as (p: { size?: number; className?: string }) => React.JSX.Element,
} as const;

export { offeredDialects, useLastLetterAvailability } from './availability';
