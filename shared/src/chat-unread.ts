/**
 * Unread chat counts for the apps' badges (`GET /chat/unread`), and how a badge writes one. A group's count stops at
 * `GROUP_UNREAD_CAP`, so a group left unread for months costs no more to count than a busy afternoon.
 */

/** A group's unread count is counted up to this, and shown as "99+" once it gets there. */
export const GROUP_UNREAD_CAP = 100;

/** Only the conversations with something unread, so the answer stays small however many there are. */
export interface ChatUnread {
  /** each person with unread messages to you */
  direct: Array<{ userId: string; unread: number }>;
  /** each of your groups with unread messages, counted up to GROUP_UNREAD_CAP */
  groups: Array<{ groupId: string; unread: number }>;
}

/** An unread count as a badge writes it: the number, or "99+" from a hundred. Digits, so it is not translated. */
export function unreadLabel(count: number): string {
  return count >= GROUP_UNREAD_CAP ? '99+' : String(count);
}
