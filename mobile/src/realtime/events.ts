import type { BadgeUnlockedEvent, GiftUserEvent, LettersChangedEvent, PlayUserEvent } from '@kurda/shared';
import type { RealtimeEvent } from './RealtimeClient';

/**
 * Events on your own channel other than direct messages (those are `useChatSocket`'s): game invites and answers,
 * game state changes, rematch offers, gifts, badge unlocks, and `letters_changed`, which carries nothing and only
 * says to reload the letters.
 */
export type UserEvent = PlayUserEvent | GiftUserEvent | BadgeUnlockedEvent | LettersChangedEvent;

/** The event prefixes `useUserEvents` carries; a new kind of user event adds its prefix here. */
const MINE = ['play_', 'rematch_', 'gift_', 'badge_', 'letters_'];

/** Is this an event meant for the person, rather than a room's traffic or a DM? */
export function isUserEvent(type: unknown): type is UserEvent['type'] {
  return typeof type === 'string' && MINE.some((p) => type.startsWith(p));
}

/**
 * Only events from the person's own channel (`user:<id>`): a game shared into a group chat also sends
 * `play_changed` to the group's room, which must not count twice.
 */
export function userEventOf(event: RealtimeEvent, room: string): UserEvent | null {
  return room.startsWith('user:') && isUserEvent(event.type) ? (event as unknown as UserEvent) : null;
}

/** A direct-message event (new message, receipt, typing) on your own channel. */
export function isChatEvent(event: RealtimeEvent, room: string): boolean {
  return room.startsWith('user:') && event.type.startsWith('dm');
}
