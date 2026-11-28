import { HELPLINE_URL, isSanctionKind, letterNoticeOf, type SanctionKind } from '@kurda/shared';
import type { Translate } from '../i18n/I18nProvider';
import { SANCTION_LABEL } from './labels';
import { formatUntil, MY_REPORTS_PATH, STANDING_PATH } from './restriction';
import { pictureReviewNotification } from '../pictures/notifications';
import { isHoldNotice } from './hold';

/** A notification as the rail holds it: the server's English and the data it was made from. */
export interface InboxNote {
  title: string;
  body: string | null;
  data?: Record<string, unknown> | null;
}

/** What a notification says in the reader's language, and where tapping it goes. */
export interface NoteView {
  title: string;
  body: string | null;
  /** A page in the app. */
  to?: string;
  /** An address outside the app, such as a helpline. */
  href?: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** How many of one gift a gift notification is for, from `data.quantity` (set only for several); one otherwise. */
export function giftNoticeCount(data: Record<string, unknown> | null | undefined): number {
  const n = Number(str(data?.quantity));
  return Number.isInteger(n) && n > 1 ? n : 1;
}

/** The chat a gift notification opens (`dm:<userId>` or `group:<groupId>` from `data.chat`), with `gift=<giftId>` to unwrap it. */
export function giftChatPath(chat: string | null, giftId: string | null, name?: string): string | null {
  if (!chat) return null;
  const [kind, id] = chat.split(':');
  if (!id) return null;
  const gift = giftId ? `&gift=${encodeURIComponent(giftId)}` : '';
  // A direct thread titles itself with the name it was opened with.
  const named = name ? `&name=${encodeURIComponent(name)}` : '';
  if (kind === 'dm') return `/app/messages?to=${encodeURIComponent(id)}${named}${gift}`;
  if (kind === 'group') return `/app/messages?group=${encodeURIComponent(id)}${gift}`;
  return null;
}

/**
 * Wording and links for report outcomes, account decisions, answered reviews, checked pictures, caring messages, gifts
 * and letters, from `data` in the reader's language rather than the server's English. Anything else is null and shown as the server
 * wrote it. `locale` formats a decision's end date; without it, the page's language.
 */
export function socialNotification(note: InboxNote, t: Translate, locale?: string): NoteView | null {
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
      // A hold is a check rather than a penalty, and is said as one.
      if (isHoldNotice(note)) return { title: t('hold.heading'), body: t('hold.statement'), to: STANDING_PATH };
      const kind = isSanctionKind(data.sanction) ? (data.sanction as SanctionKind) : null;
      // What is limited and until when.
      const until = str(data.until);
      const ends = until && !Number.isNaN(Date.parse(until)) ? until : null;
      const lang = locale || (typeof document !== 'undefined' ? document.documentElement.lang : '') || 'en';
      const what = kind ? t(SANCTION_LABEL[kind]) : null;
      return {
        title: t('notify.sanction.title'),
        body: what && ends ? t('notify.sanction.until', { what, time: formatUntil(ends, lang) }) : (what ?? note.body),
        to: STANDING_PATH,
      };
    }
    case 'sanction_lifted':
      return { title: t('notify.sanctionLifted.title'), body: null, to: STANDING_PATH };
    case 'appeal_decided':
      return { title: t('notify.appealDecided.title'), body: null, to: STANDING_PATH };
    case 'picture_review':
      return pictureReviewNotification(data, t);
    case 'caring_message': {
      // The moderator's own words come first as written; the rest is in the reader's language.
      const personal = str(data.message);
      const helpline = str(data.helplineUrl);
      return {
        title: t('notify.caring.title'),
        body: personal ? `${personal} ${t('notify.caring.body')}` : t('notify.caring.body'),
        // A link leaving the app goes only to an https address.
        href: helpline && /^https:\/\//.test(helpline) ? helpline : HELPLINE_URL,
      };
    }
    case 'letter': {
      // A letter arrived: open the window naming the correspondence, so its bird lands before the letter is read; the
      // correspondence opens directly when there is nothing to land.
      const notice = letterNoticeOf(data);
      const to = notice?.threadId ? `/app/letters?bird=${notice.threadId}` : '/app/letters';
      return notice?.how === 'home'
        ? { title: t('letters.notify.homeTitle'), body: t('letters.notify.homeBody'), to }
        : { title: t('letters.notify.title'), body: t('letters.notify.body'), to };
    }
    case 'gift': {
      const to = giftChatPath(str(data.chat), str(data.giftId));
      // Several of one gift are counted, and the item stays a surprise until it is unwrapped in the chat.
      const count = giftNoticeCount(data);
      const words =
        count > 1
          ? { title: t('notify.gift.titleMany', { count: count.toLocaleString(locale) }), body: t('notify.gift.bodyMany') }
          : { title: t('notify.gift.title'), body: t('notify.gift.body') };
      return { ...words, ...(to ? { to } : {}) };
    }
    case 'post_gift': {
      // Named as the server lets the post's author see the giver, or not at all.
      const name = str(data.fromName);
      const id = str(data.postId);
      // to the post, where the author's own gift opens in its light
      const gift = str(data.giftId);
      const to = data.postType === 'library' && id ? `/app/library/${encodeURIComponent(id)}${gift ? `?gift=${encodeURIComponent(gift)}` : ''}` : undefined;
      const n = giftNoticeCount(data);
      const count = n.toLocaleString(locale);
      const title =
        n > 1
          ? name
            ? t('post.gifts.noticeMany', { name, count })
            : t('post.gifts.noticeSomeoneMany', { count })
          : name
            ? t('post.gifts.notice', { name })
            : t('post.gifts.noticeSomeone');
      return { title, body: null, ...(to ? { to } : {}) };
    }
    default:
      return null;
  }
}
