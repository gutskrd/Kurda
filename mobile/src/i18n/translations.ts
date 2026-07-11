/**
 * UI string catalogs (KUR-093) for the Kurdish diaspora: Kurdish (Kurmanji),
 * English, German, Turkish, Arabic. Strings live here, never hardcoded in
 * components — `t(key)` reads the active locale and falls back to English then
 * the key itself, so a missing translation degrades gracefully. Arabic is RTL.
 */

export const LOCALES = ['ku', 'en', 'de', 'tr', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  ku: 'Kurdî',
  en: 'English',
  de: 'Deutsch',
  tr: 'Türkçe',
  ar: 'العربية',
};

/** Locales that render right-to-left. */
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export type TranslationKey =
  | 'common.back'
  | 'nav.learn'
  | 'nav.play'
  | 'nav.dictionary'
  | 'nav.social'
  | 'nav.profile'
  | 'events.title'
  | 'events.none'
  | 'events.bannerSubtitle'
  | 'events.claim'
  | 'events.claimed'
  | 'events.inProgress'
  | 'events.endsIn'
  | 'settings.language'
  | 'settings.eventThemes'
  | 'profile.logout'
  | 'profile.league'
  | 'profile.shop';

type Catalog = Record<TranslationKey, string>;

const en: Catalog = {
  'common.back': 'Back',
  'nav.learn': 'Learn',
  'nav.play': 'Play',
  'nav.dictionary': 'Dictionary',
  'nav.social': 'Social',
  'nav.profile': 'Profile',
  'events.title': 'Events',
  'events.none': 'No events are running right now. Check back soon!',
  'events.bannerSubtitle': 'Quests & rewards — tap to play',
  'events.claim': 'Claim',
  'events.claimed': 'Claimed',
  'events.inProgress': 'In progress',
  'events.endsIn': 'Ends in {time}',
  'settings.language': 'Language',
  'settings.eventThemes': 'Event themes',
  'profile.logout': 'Log out',
  'profile.league': 'League',
  'profile.shop': 'Shop',
};

const ku: Catalog = {
  'common.back': 'Vegere',
  'nav.learn': 'Fêrbûn',
  'nav.play': 'Lîstin',
  'nav.dictionary': 'Ferheng',
  'nav.social': 'Civak',
  'nav.profile': 'Profîl',
  'events.title': 'Bûyer',
  'events.none': 'Niha tu bûyer nayên lîstin. Paşê were!',
  'events.bannerSubtitle': 'Erk û xelat — bitikîne û bilîze',
  'events.claim': 'Bistîne',
  'events.claimed': 'Hat stendin',
  'events.inProgress': 'Di meşê de',
  'events.endsIn': 'Di {time} de diqede',
  'settings.language': 'Ziman',
  'settings.eventThemes': 'Temayên bûyeran',
  'profile.logout': 'Derkeve',
  'profile.league': 'Lîg',
  'profile.shop': 'Firotgeh',
};

const de: Catalog = {
  'common.back': 'Zurück',
  'nav.learn': 'Lernen',
  'nav.play': 'Spielen',
  'nav.dictionary': 'Wörterbuch',
  'nav.social': 'Sozial',
  'nav.profile': 'Profil',
  'events.title': 'Events',
  'events.none': 'Zurzeit laufen keine Events. Schau später wieder vorbei!',
  'events.bannerSubtitle': 'Quests & Belohnungen — zum Spielen tippen',
  'events.claim': 'Einlösen',
  'events.claimed': 'Eingelöst',
  'events.inProgress': 'Läuft',
  'events.endsIn': 'Endet in {time}',
  'settings.language': 'Sprache',
  'settings.eventThemes': 'Event-Designs',
  'profile.logout': 'Abmelden',
  'profile.league': 'Liga',
  'profile.shop': 'Shop',
};

const tr: Catalog = {
  'common.back': 'Geri',
  'nav.learn': 'Öğren',
  'nav.play': 'Oyna',
  'nav.dictionary': 'Sözlük',
  'nav.social': 'Sosyal',
  'nav.profile': 'Profil',
  'events.title': 'Etkinlikler',
  'events.none': 'Şu anda etkinlik yok. Sonra tekrar bak!',
  'events.bannerSubtitle': 'Görevler ve ödüller — oynamak için dokun',
  'events.claim': 'Al',
  'events.claimed': 'Alındı',
  'events.inProgress': 'Devam ediyor',
  'events.endsIn': '{time} içinde bitiyor',
  'settings.language': 'Dil',
  'settings.eventThemes': 'Etkinlik temaları',
  'profile.logout': 'Çıkış yap',
  'profile.league': 'Lig',
  'profile.shop': 'Mağaza',
};

const ar: Catalog = {
  'common.back': 'رجوع',
  'nav.learn': 'تعلّم',
  'nav.play': 'العب',
  'nav.dictionary': 'القاموس',
  'nav.social': 'المجتمع',
  'nav.profile': 'الملف',
  'events.title': 'الفعاليات',
  'events.none': 'لا توجد فعاليات حالياً. تحقّق لاحقاً!',
  'events.bannerSubtitle': 'مهام ومكافآت — انقر للّعب',
  'events.claim': 'استلام',
  'events.claimed': 'تم الاستلام',
  'events.inProgress': 'قيد التقدّم',
  'events.endsIn': 'ينتهي خلال {time}',
  'settings.language': 'اللغة',
  'settings.eventThemes': 'سمات الفعاليات',
  'profile.logout': 'تسجيل الخروج',
  'profile.league': 'الدوري',
  'profile.shop': 'المتجر',
};

export const TRANSLATIONS: Record<Locale, Catalog> = { en, ku, de, tr, ar };
