import { HELPLINE_URL, isSanctionKind, type SanctionKind } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import { SANCTION_LABEL } from './labels';
import { MY_REPORTS_PATH, STANDING_PATH } from './restriction';

/** Just enough of the i18n contract to write a sentence; no React in here. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** A notification as the rail holds it: the server's English, and the data it was made from. */
export interface InboxNote {
  title: string;
  body: string | null;
  data?: Record<string, unknown> | null;
}

/** What a notification says in the reader's language, and where tapping it goes. */
export interface NoteView {
  title: string;
  body: string | null;
  /** a page in the app */
  to?: string;
  /** somewhere outside it (a helpline) */
  href?: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * The chat a gift notification points at, opening that gift: `dm:<userId>` or
 * `group:<groupId>` (the API's `data.chat`), with `gift=<giftId>` so the
 * thread unwraps it on arrival.
 */
export function giftChatPath(chat: string | null, giftId: string | null, name?: string): string | null {
  if (!chat) return null;
  const [kind, id] = chat.split(':');
  if (!id) return null;
  const gift = giftId ? `&gift=${encodeURIComponent(giftId)}` : '';
  // a direct thread titles itself with the name it was opened with
  const named = name ? `&name=${encodeURIComponent(name)}` : '';
  if (kind === 'dm') return `/app/messages?to=${encodeURIComponent(id)}${named}${gift}`;
  if (kind === 'group') return `/app/messages?group=${encodeURIComponent(id)}${gift}`;
  return null;
}

/**
 * The words and the way in for the notifications this part of the app sends
 * — a report's outcome, a decision about your account, a review answered, a
 * caring message, a gift. The server writes their title and body in English
 * for clients that cannot do better; these are said in the reader's own
 * language from `data`, which is what it is there for.
 *
 * Anything else (null) is shown as the server wrote it, and goes nowhere.
 */
export function socialNotification(note: InboxNote, t: Translate): NoteView | null {
  const data = note.data;
  if (!data || typeof data !== 'object') return null;
  switch (data.kind) {
    case 'report_outcome':
      return {
        title: t('notify.reportOutcome.title'),
        body: data.outcome === 'actioned' ? t('reports.status.actioned') : t('reports.status.noViolation'),
        to: MY_REPORTS_PATH,
      };
    case 'sanction': {
      const kind = isSanctionKind(data.sanction) ? (data.sanction as SanctionKind) : null;
      return {
        title: t('notify.sanction.title'),
        body: kind ? t(SANCTION_LABEL[kind]) : note.body,
        to: STANDING_PATH,
      };
    }
    case 'sanction_lifted':
      return { title: t('notify.sanctionLifted.title'), body: null, to: STANDING_PATH };
    case 'appeal_decided':
      return { title: t('notify.appealDecided.title'), body: null, to: STANDING_PATH };
    case 'caring_message': {
      // the moderator's own words, when there are some, come first and as
      // they wrote them; the rest is said in the reader's language
      const personal = str(data.message);
      const helpline = str(data.helplineUrl);
      return {
        title: t('notify.caring.title'),
        body: personal ? `${personal} ${t('notify.caring.body')}` : t('notify.caring.body'),
        // a link that leaves the app goes only to a real web address
        href: helpline && /^https:\/\//.test(helpline) ? helpline : HELPLINE_URL,
      };
    }
    case 'gift': {
      const to = giftChatPath(str(data.chat), str(data.giftId));
      return { title: t('notify.gift.title'), body: t('notify.gift.body'), ...(to ? { to } : {}) };
    }
    default:
      return null;
  }
}
