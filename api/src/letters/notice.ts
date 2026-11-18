import type pg from 'pg';
import { isAppLocale, type AppLocale } from '@kurda/shared';
import type { Notification } from '../push/service.js';

/**
 * A letter's push text in the reader's own language (users.locale), since it shows on the lock screen, and whether a
 * push held for quiet hours is still worth sending; the apps write the list line themselves from `data.kind` and
 * `data.how`. `window` is a pen pal's bird at your window with their next letter; `home` is your own bird back with
 * an answer.
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
 * For the push job's `stillNews`: whether a letter push held for quiet hours still tells of something waiting. Not
 * once the letter is read, has landed or is gone; any other push, and letter pushes that name no letter, still go.
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
