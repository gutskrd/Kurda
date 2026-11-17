import type pg from 'pg';
import { isAppLocale, type AppLocale } from '@kurda/shared';
import type { Notification } from '../push/service.js';

/**
 * What a letter's notification says, in the reader's own language, and
 * whether a push that waited for quiet hours to end is still worth sending.
 *
 * The push is what a phone shows on its lock screen, so it is written here,
 * in the language the reader chose in the app (users.locale), rather than in
 * English for everyone. The apps write their own words for the line in the
 * notification list from `data.kind` and `data.how`, as before.
 *
 * Two kinds of letter come: a pen pal's bird at your window with their next
 * letter (`window`), and your own bird home from somebody's window with their
 * answer (`home`). The titles say what happened at the window, the bodies who
 * it was. The window title is the one both apps already show for a letter.
 */

export type LetterNoticeHow = 'window' | 'home';

interface NoticeCopy {
  windowTitle: string;
  windowBody: (name: string) => string;
  homeTitle: string;
  homeBody: (name: string) => string;
}

const COPY: Record<AppLocale, NoticeCopy> = {
  en: {
    windowTitle: 'A bird came to your window',
    windowBody: (n) => `${n} wrote you a letter.`,
    homeTitle: 'Your bird came home',
    homeBody: (n) => `${n} answered your letter.`,
  },
  ku: {
    windowTitle: 'Balindeyek hat ber pencereya te',
    windowBody: (n) => `${n} nameyek ji te re nivîsand.`,
    homeTitle: 'Balindeyê te vegeriya malê',
    homeBody: (n) => `${n} bersiva nameya te da.`,
  },
  ckb: {
    windowTitle: 'باڵندەیەک هاتە بەر پەنجەرەکەت',
    windowBody: (n) => `${n} نامەیەکی بۆت نووسی.`,
    homeTitle: 'باڵندەکەت گەڕایەوە ماڵەوە',
    homeBody: (n) => `${n} وەڵامی نامەکەتی دایەوە.`,
  },
  ar: {
    windowTitle: 'وصل طائر إلى نافذتك',
    windowBody: (n) => `كتب لك ${n} رسالة.`,
    homeTitle: 'عاد طائرك إلى البيت',
    homeBody: (n) => `ردّ ${n} على رسالتك.`,
  },
  tr: {
    windowTitle: 'Pencerene bir kuş geldi',
    windowBody: (n) => `${n} sana bir mektup yazdı.`,
    homeTitle: 'Kuşun eve döndü',
    homeBody: (n) => `${n} mektubunu yanıtladı.`,
  },
  de: {
    windowTitle: 'Ein Vogel ist an deinem Fenster',
    windowBody: (n) => `${n} hat dir einen Brief geschrieben.`,
    homeTitle: 'Dein Vogel ist heimgekommen',
    homeBody: (n) => `${n} hat deinen Brief beantwortet.`,
  },
  fr: {
    windowTitle: 'Un oiseau est à ta fenêtre',
    windowBody: (n) => `${n} t’a écrit une lettre.`,
    homeTitle: 'Ton oiseau est rentré',
    homeBody: (n) => `${n} a répondu à ta lettre.`,
  },
  es: {
    windowTitle: 'Un pájaro llegó a tu ventana',
    windowBody: (n) => `${n} te ha escrito una carta.`,
    homeTitle: 'Tu pájaro volvió a casa',
    homeBody: (n) => `${n} ha respondido a tu carta.`,
  },
  nl: {
    windowTitle: 'Er zit een vogel bij je raam',
    windowBody: (n) => `${n} heeft je een brief geschreven.`,
    homeTitle: 'Je vogel is thuisgekomen',
    homeBody: (n) => `${n} heeft je brief beantwoord.`,
  },
};

/** The title and body of a letter's notification for a reader in `locale`; anything the app does not speak gets English. */
export function letterNoticeText(how: LetterNoticeHow, fromName: string, locale?: string | null): { title: string; body: string } {
  const copy = COPY[isAppLocale(locale) ? locale : 'en'];
  return how === 'home' ? { title: copy.homeTitle, body: copy.homeBody(fromName) } : { title: copy.windowTitle, body: copy.windowBody(fromName) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For the push job (jobs/push-jobs.ts `stillNews`): whether a letter's push
 * that waited for quiet hours to end still tells of something waiting. Not
 * once the letter has been read, or has landed at the window, or is gone: a
 * morning push for a letter already seen would only send the reader looking
 * for nothing. Any other push, and a letter push from before letters named
 * their letter, is still news.
 */
export function letterPushStillNews(pool: Pick<pg.Pool, 'query'>): (userId: string, notification: Notification) => Promise<boolean> {
  return async (userId, notification) => {
    const letterId = notification.data?.kind === 'letter' ? notification.data.letterId : undefined;
    if (!letterId || !UUID_RE.test(letterId)) return true;
    const r = await pool.query(
      `SELECT 1 FROM letters WHERE id = $1 AND recipient_id = $2 AND status = 'delivered' AND read_at IS NULL AND landed_at IS NULL`,
      [letterId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  };
}
