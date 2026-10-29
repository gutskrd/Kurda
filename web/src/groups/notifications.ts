import type { MessageKey } from '../i18n/en';
import { formatUntil } from '../reports/restriction';
import type { InboxNote, NoteView } from '../reports/notifications';

/** Just enough of the i18n contract to write a sentence; no React in here. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
/** A push's data is all strings: 'true' is true, whether it came as a string or as itself. */
const yes = (v: unknown): boolean => v === true || v === 'true';

const BANNED_FOR: Record<string, MessageKey> = {
  '1d': 'notify.groupBanned.day',
  '7d': 'notify.groupBanned.week',
  perm: 'notify.groupBanned.forGood',
};

/**
 * What happened between you and a group — removed, banned, someone asking to
 * come back, your request approved or turned down — said in the reader's own
 * language from `data`, and opening the group (a request opens it on the
 * group's own page, where the requests are answered).
 *
 * The server writes these in English too; that is what is shown when `data`
 * does not name the group, rather than half a sentence in each language.
 * Anything that is not about a group is null, for the next reader to try.
 */
export function groupNotification(note: InboxNote, t: Translate, locale: string): NoteView | null {
  const data = note.data;
  if (!data || typeof data !== 'object') return null;
  const groupId = str(data.groupId);
  const kind = data.kind;
  if (!groupId || typeof kind !== 'string' || !kind.startsWith('group_')) return null;
  const to = `/app/messages?group=${encodeURIComponent(groupId)}`;
  const group = str(data.groupName);
  const asWritten: NoteView = { title: note.title, body: note.body, to };
  if (!group) return asWritten;

  switch (kind) {
    case 'group_removed':
      return {
        title: t('notify.groupRemoved.title', { group }),
        body: data.privacy === 'invite' ? t('notify.groupRemoved.invite') : t('notify.groupRemoved.open'),
        to,
      };
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
      // let back but not put back: in an invite-only group only an admin can add them again, as the server's own words say
      if (data.rejoined === false || data.rejoined === 'false') {
        return data.privacy === 'invite' ? asWritten : { title: t('notify.groupApproved.out', { group }), body: null, to };
      }
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
