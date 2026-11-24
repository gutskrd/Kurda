import type { ParentalSwitch } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

/** Each part of Hevalo a parent can switch off, by name and by what it covers, in shared `PARENTAL_SWITCHES` order. */
export const SWITCH_TITLE: Record<ParentalSwitch, MessageKey> = {
  chat: 'parental.switch.chat',
  letters: 'parental.switch.letters',
  posts: 'parental.switch.posts',
  games: 'parental.switch.games',
  friends: 'parental.switch.friends',
  purchases: 'parental.switch.purchases',
};

export const SWITCH_HINT: Record<ParentalSwitch, MessageKey> = {
  chat: 'parental.switch.chatHint',
  letters: 'parental.switch.lettersHint',
  posts: 'parental.switch.postsHint',
  games: 'parental.switch.gamesHint',
  friends: 'parental.switch.friendsHint',
  purchases: 'parental.switch.purchasesHint',
};
