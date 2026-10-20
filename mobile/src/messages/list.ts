/**
 * What the Messages tab lists, and in what order. The part with no React in it.
 *
 * Two kinds of conversation share one list: a chat with one person, from
 * `/chat/conversations`, and a group's room, from `/me/groups` with its unread
 * count from `/me/groups/unread`. Friend requests are not rows of the list —
 * they are the one thing in here waiting on *you*, so they get a row of their
 * own above it rather than a place in an order where a morning of chatter
 * could bury them.
 */
import { foldDiacritics, type ChatMessageKind } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

export interface DirectConversation {
  userId: string;
  username: string;
  lastMessage: string;
  /** a gift or a game card says so here, and the line is written from it */
  lastKind?: ChatMessageKind;
  lastAt?: string | null;
  lastFromMe: boolean;
  unread: number;
  avatarUrl?: string | null;
}

export interface GroupConversation {
  id: string;
  name: string;
  memberCount: number;
  unread: number;
}

/** One row of the list: a person, or a group. */
export type MessageRow =
  | { kind: 'direct'; key: string; name: string; unread: number; at: string | null; chat: DirectConversation }
  | { kind: 'group'; key: string; name: string; unread: number; at: null; group: GroupConversation };

export type MessageFilter = 'all' | 'unread' | 'groups';

/** In the order the chips show them; `all` first because it is where you land. */
export const MESSAGE_FILTERS: readonly MessageFilter[] = ['all', 'unread', 'groups'] as const;

export const FILTER_LABEL: Record<MessageFilter, TranslationKey> = {
  all: 'messages.filter.all',
  unread: 'messages.filter.unread',
  groups: 'messages.filter.groups',
};

/**
 * Newest first, by an ISO timestamp, with anything undated last.
 *
 * `lastAt` on a conversation is an ISO string from Postgres, so it compares
 * correctly as a string — but a row missing one must not sort to the top,
 * which is what comparing `undefined` would do.
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

/**
 * The list, for a chip and whatever is typed in the field.
 *
 * A group has no time on it yet (`/me/groups` sends none), so groups cannot be
 * slotted between chats by when they last spoke. What is known is whether
 * something in them is unread — which means it arrived after you last looked,
 * so it is recent — and those go first, before the chats by time; the quiet
 * groups follow, by name. When the server sends a group's last message time,
 * this becomes one sort by time and nothing else changes.
 *
 * The field filters what is already loaded, on the name and the last line,
 * folded so "rojhat" finds "Rojhat" and "se" finds "sê".
 */
export function messageRows(input: {
  chats: readonly DirectConversation[];
  groups: readonly GroupConversation[];
  filter: MessageFilter;
  query?: string;
  /** the last line of a chat as the reader sees it (a gift says so in their language) */
  preview?: (chat: DirectConversation) => string;
}): MessageRow[] {
  const direct: MessageRow[] = newestFirst(input.chats, (c) => c.lastAt).map((chat) => ({
    kind: 'direct',
    key: `dm:${chat.userId}`,
    name: chat.username,
    unread: chat.unread,
    at: chat.lastAt ?? null,
    chat,
  }));
  const byName = (a: GroupConversation, b: GroupConversation) => a.name.localeCompare(b.name);
  const group = (g: GroupConversation): MessageRow => ({ kind: 'group', key: `group:${g.id}`, name: g.name, unread: g.unread, at: null, group: g });
  const busyGroups = input.groups.filter((g) => g.unread > 0).sort(byName).map(group);
  const quietGroups = input.groups.filter((g) => g.unread === 0).sort(byName).map(group);

  let rows: MessageRow[];
  switch (input.filter) {
    case 'groups':
      rows = [...busyGroups, ...quietGroups];
      break;
    case 'unread':
      rows = [...busyGroups, ...direct.filter((r) => r.unread > 0)];
      break;
    default:
      rows = [...busyGroups, ...direct, ...quietGroups];
  }

  const q = fold(input.query ?? '');
  if (!q) return rows;
  return rows.filter((row) => {
    if (fold(row.name).includes(q)) return true;
    return row.kind === 'direct' && fold(input.preview ? input.preview(row.chat) : row.chat.lastMessage).includes(q);
  });
}

function fold(text: string): string {
  return foldDiacritics(text).toLowerCase().trim();
}

/**
 * The number on the Messages tab.
 *
 * Messages, not conversations: three messages from one person is three things
 * you have not read, and counting conversations would say "1" to somebody
 * with a morning of backlog. A friend request counts as one whether or not
 * you have seen it — there is no read state for a request, and one waiting
 * on you is the point of the badge — because the row that answers it is at
 * the top of this tab.
 */
export function messagesUnread(input: { chats: readonly number[]; groups: readonly number[]; requests: number }): number {
  const sum = (list: readonly number[]) => list.reduce((a, b) => a + Math.max(0, b), 0);
  return sum(input.chats) + sum(input.groups) + Math.max(0, input.requests);
}

/**
 * When a message arrived, as a list shows it: the time today, the weekday this
 * week, a short date before that. Formatted by the reader's locale, so a
 * Soranî reader gets their own digits and month names — and the hour the way
 * the locale writes it ("3:49 PM", not "03:49 PM"; "15:49" in German).
 */
export function listTime(iso: string | null | undefined, locale: string, now: number = Date.now()): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const today = new Date(now);
  const sameDay = at.toDateString() === today.toDateString();
  const days = (now - at.getTime()) / 86_400_000;
  try {
    if (sameDay) return at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
    if (days < 6) return at.toLocaleDateString(locale, { weekday: 'short' });
    return at.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  } catch {
    // a locale the runtime does not know falls back to the device's own
    return sameDay ? at.toLocaleTimeString() : at.toLocaleDateString();
  }
}
