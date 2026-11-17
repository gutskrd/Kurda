import type { BadgeUnlockedEvent, GiftUserEvent, LettersChangedEvent, PlayUserEvent } from '@kurda/shared';
import type { RealtimeEvent } from './RealtimeClient';

/**
 * Everything the gateway pushes on your own channel that is not a direct
 * message (those are `useChatSocket`'s): game invites and their answers,
 * "something changed in a game you are in", rematch offers, gifts, a badge
 * just earned (its celebration), and "something changed in your letters"
 * (`letters_changed`: a bird came, went or landed), which carries nothing and
 * only says to read the letters again.
 *
 * The quiz's `challenge_*` and `match_*` went with the quiz.
 */
export type UserEvent = PlayUserEvent | GiftUserEvent | BadgeUnlockedEvent | LettersChangedEvent;

/** The prefixes this channel carries for `useUserEvents`; a new kind of user event adds its prefix here. */
const MINE = ['play_', 'rematch_', 'gift_', 'badge_', 'letters_'];

/** Is this an event meant for the person, rather than a room's traffic or a DM? */
export function isUserEvent(type: unknown): type is UserEvent['type'] {
  return typeof type === 'string' && MINE.some((p) => type.startsWith(p));
}

/**
 * Only what arrived on the person's own channel (`user:<id>`). A game shared
 * into a group chat also sends `play_changed` to the group's room, and a
 * screen watching that room must not hear it a second time as a personal event.
 */
export function userEventOf(event: RealtimeEvent, room: string): UserEvent | null {
  return room.startsWith('user:') && isUserEvent(event.type) ? (event as unknown as UserEvent) : null;
}

/** A direct-message event (new message, receipt, typing) on your own channel. */
export function isChatEvent(event: RealtimeEvent, room: string): boolean {
  return room.startsWith('user:') && event.type.startsWith('dm');
}
