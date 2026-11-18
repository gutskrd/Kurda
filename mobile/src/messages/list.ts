/**
 * What the Messages tab lists, and in what order. One-to-one chats come from `/chat/conversations` and group
 * rooms from `/me/groups`, with unread counts from `/me/groups/unread`. Friend requests get their own row above
 * the list.
 */
import { foldDiacritics, type ChatMessageKind } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

export interface DirectConversation {
  userId: string;
  username: string;
  lastMessage: string;
  /** A gift or a game card says so here, and the line is written from it. */
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
  /** The group's own picture, or none for its initials. */
  photoUrl?: string | null;
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

/** Newest first by ISO timestamp (Postgres ISO strings compare correctly as strings), with undated rows last rather than first. */
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
 * The list for a chip and the typed filter. Groups have no time yet (`/me/groups` sends none): unread groups go
 * first, since unread means recent, then chats by time, then quiet groups by name. Once the server sends a
 * group's last message time this becomes one sort by time.
 *
 * The filter matches loaded names and last lines, folded so "rojhat" finds "Rojhat" and "se" finds "sê".
 */
export function messageRows(input: {
  chats: readonly DirectConversation[];
  groups: readonly GroupConversation[];
  filter: MessageFilter;
  query?: string;
  /** The last line of a chat as the reader sees it (a gift says so in their language). */
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
 * The number on the Messages tab: unread messages, not conversations, so a backlog from one person is not "1".
 * Each friend request counts as one, since requests have no read state and the row answering them is on this tab.
 */
export function messagesUnread(input: { chats: readonly number[]; groups: readonly number[]; requests: number }): number {
  const sum = (list: readonly number[]) => list.reduce((a, b) => a + Math.max(0, b), 0);
  return sum(input.chats) + sum(input.groups) + Math.max(0, input.requests);
}

/**
 * When a message arrived, as a list shows it: the time today, the weekday this week, a short date before that.
 * Formatted for the reader's locale, so Soranî gets its own digits and month names and hours follow the locale
 * ("3:49 PM"; "15:49" in German).
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
    // A locale the runtime does not know falls back to the device's own.
    return sameDay ? at.toLocaleTimeString() : at.toLocaleDateString();
  }
}
