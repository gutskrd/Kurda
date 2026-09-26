/**
 * What belongs in an inbox, and in what order.
 *
 * Three things arrive for you and they lived in three places: friend requests
 * on the Friends tab, conversations behind a Messages button, notifications
 * behind a bell. Nothing told you the total, so the only way to find out
 * whether anything had happened was to visit all three.
 *
 * They are not merged into one time-ordered stream, and that is deliberate.
 * Two reasons:
 *
 *   `/friends/requests` returns no timestamp — only who, so there is nothing
 *   to sort a request against a message by
 *
 *   and a request is the only one of the three that is waiting on you. Sorted
 *   by time it sinks under a morning of chatter; kept in its own section at
 *   the top it cannot.
 *
 * So: sections, in a fixed order, each sorted within itself. This module is
 * the part with no React in it.
 */
import type { TranslationKey } from '../i18n/translations';

export type InboxFilter = 'all' | 'requests' | 'chats' | 'alerts';

/** In the order the filter shows them; `all` is first because it is the default. */
export const FILTERS: readonly InboxFilter[] = ['all', 'requests', 'chats', 'alerts'] as const;

/**
 * What a chip says, and what the heading under it says.
 *
 * Mostly the same word, and where it is the same it is the same key — a chip
 * saying "Requests" and a heading saying "Requests" from two keys would drift
 * the first time somebody reworded one.
 *
 * Alerts is the exception. Measured at 375pt, four chips get 92 points each
 * and "Notifications" needs 96, so it arrives on screen as "Notificatio…".
 * Every other language is worse: "Benachrichtigungen" is 140. So the chip gets
 * a short word of its own and the heading keeps the real one, which is the
 * same split the tab bar already makes with `shortLabelKey`.
 */
export const FILTER_LABEL: Record<InboxFilter, TranslationKey> = {
  all: 'inbox.filter.all',
  requests: 'friends.requests',
  chats: 'nav.messages',
  alerts: 'inbox.filter.alerts',
};

/** The heading over a section, where there is room for the longer word. */
export const SECTION_LABEL: Record<Exclude<InboxFilter, 'all'>, TranslationKey> = {
  requests: 'friends.requests',
  chats: 'nav.messages',
  alerts: 'notifications.title',
};

/** The sections a filter shows, in the order they are drawn. */
export function sectionsFor(filter: InboxFilter): readonly Exclude<InboxFilter, 'all'>[] {
  return filter === 'all' ? ['requests', 'chats', 'alerts'] : [filter];
}

/**
 * The number on the tab.
 *
 * A friend request counts as one whether or not you have looked at it — there
 * is no read state for a request, and one waiting on you is the whole point of
 * the badge. Chats count unread messages, not unread conversations: three
 * messages from one person is three things you have not read.
 */
export function unreadTotal(input: {
  requests: number;
  chatUnread: readonly number[];
  alertsUnread: number;
}): number {
  return input.requests + input.chatUnread.reduce((a, b) => a + b, 0) + input.alertsUnread;
}

/**
 * Newest first, by an ISO timestamp, with anything undated last.
 *
 * `lastAt` on a conversation and `createdAt` on a notification are both ISO
 * strings from Postgres, so they compare correctly as strings — but a row
 * missing one must not sort to the top, which is what comparing `undefined`
 * would do.
 */
export function newestFirst<T>(rows: readonly T[], at: (row: T) => string | null | undefined): T[] {
  return [...rows].sort((a, b) => {
    const x = at(a) ?? '';
    const y = at(b) ?? '';
    if (x === y) return 0;
    if (x === '') return 1;
    if (y === '') return -1;
    return x < y ? 1 : -1;
  });
}
