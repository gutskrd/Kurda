import type { MessageKey } from '../i18n/en';
import { formatUntil } from '../reports/restriction';
import type { InboxNote, NoteView } from '../reports/notifications';

/** Just enough of the i18n contract to write a sentence; no React in here. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
/** A push's data is all strings, so 'true' counts as true. */
const yes = (v: unknown): boolean => v === true || v === 'true';

const BANNED_FOR: Record<string, MessageKey> = {
  '1d': 'notify.groupBanned.day',
  '7d': 'notify.groupBanned.week',
  perm: 'notify.groupBanned.forGood',
};

/**
 * Group notifications (removed, banned, a request to come back, a request answered) worded from `data` in the reader's
 * language, opening the group or, for requests, its page. One that leaves the reader outside without a ban opens
 * their conversations instead, since the group's address would show nothing. Without a group name in `data` the
 * server's English is used. Anything not about a group is null.
 */
export function groupNotification(note: InboxNote, t: Translate, locale: string): NoteView | null {
  const data = note.data;
  if (!data || typeof data !== 'object') return null;
  const groupId = str(data.groupId);
  const kind = data.kind;
  if (!groupId || typeof kind !== 'string' || !kind.startsWith('group_')) return null;
  const to = `/app/messages?group=${encodeURIComponent(groupId)}`;
  // Where a line goes when the reader is out of the group.
  const mine = '/app/messages';
  const group = str(data.groupName);
  const letBackOnly = kind === 'group_request_approved' && (data.rejoined === false || data.rejoined === 'false');
  const asWritten: NoteView = { title: note.title, body: note.body, to: kind === 'group_removed' || letBackOnly ? mine : to };
  if (!group) return asWritten;

  switch (kind) {
    case 'group_removed':
      return { title: t('notify.groupRemoved.title', { group }), body: t('notify.groupRemoved.canBeAdded'), to: mine };
    case 'group_banned': {
      const length = typeof data.duration === 'string' ? BANNED_FOR[data.duration] : undefined;
      const reason = str(data.reason);
      return {
        title: t(length ?? 'notify.groupBanned.title', { group }),
        body: reason ? `${t('notify.groupBanned.ask')} ${t('groups.banned.reason')} ${reason}` : t('notify.groupBanned.ask'),
        to,
      };
    }
    case 'group_request': {
      const count = Math.max(1, Math.floor(Number(data.count)) || 1);
      return {
        title: count > 1 ? t('notify.groupRequest.many', { count, group }) : t('notify.groupRequest.one', { group }),
        body: null,
        to: `${to}&info=requests`,
      };
    }
    case 'group_request_approved':
      // Let back but not re-added: the ban is lifted, and an admin who is their friend can add them again.
      if (letBackOnly) return { title: t('notify.groupApproved.out', { group }), body: null, to: mine };
      return { title: t('notify.groupApproved.in', { group }), body: null, to };
    case 'group_request_declined': {
      const after = str(data.until);
      return {
        title: t('notify.groupDeclined.title', { group }),
        body: yes(data.closed) ? t('notify.groupDeclined.closed') : after ? t('groups.ask.wait', { date: formatUntil(after, locale) }) : null,
        to,
      };
    }
    default:
      return asWritten;
  }
}
