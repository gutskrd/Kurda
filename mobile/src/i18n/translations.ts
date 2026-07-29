/**
 * UI string catalogs (KUR-093 / KUR-184) for the Kurdish diaspora, in 8
 * languages: English, German, French, Dutch, Kurmancî (Northern Kurdish),
 * Soranî (Central Kurdish), Arabic, Turkish. Each language is shown in its own
 * native name. Strings live here, never hardcoded in components — `t(key)` reads
 * the active locale and falls back to English then the key itself, so a missing
 * translation degrades gracefully. Arabic and Soranî (Arabic script) are RTL.
 */

export const LOCALES = ['en', 'de', 'fr', 'nl', 'ku', 'ckb', 'ar', 'tr'] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language shown in its own native name (used by Settings + onboarding). */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  nl: 'Nederlands',
  ku: 'Kurmancî',
  ckb: 'Soranî',
  ar: 'العربية',
  tr: 'Türkçe',
};

/** Locales that render right-to-left (Arabic + Soranî, which uses Arabic script). */
export const RTL_LOCALES: readonly Locale[] = ['ar', 'ckb'];

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

const fr: Catalog = {
  'common.back': 'Retour',
  'nav.learn': 'Apprendre',
  'nav.play': 'Jouer',
  'nav.dictionary': 'Dictionnaire',
  'nav.social': 'Social',
  'nav.profile': 'Profil',
  'events.title': 'Événements',
  'events.none': 'Aucun événement en cours pour le moment. Revenez bientôt !',
  'events.bannerSubtitle': 'Quêtes et récompenses — touchez pour jouer',
  'events.claim': 'Réclamer',
  'events.claimed': 'Réclamé',
  'events.inProgress': 'En cours',
  'events.endsIn': 'Se termine dans {time}',
  'settings.language': 'Langue',
  'settings.eventThemes': 'Thèmes d’événement',
  'profile.logout': 'Se déconnecter',
  'profile.league': 'Ligue',
  'profile.shop': 'Boutique',
};

const nl: Catalog = {
  'common.back': 'Terug',
  'nav.learn': 'Leren',
  'nav.play': 'Spelen',
  'nav.dictionary': 'Woordenboek',
  'nav.social': 'Sociaal',
  'nav.profile': 'Profiel',
  'events.title': 'Evenementen',
  'events.none': 'Er zijn nu geen evenementen. Kom later terug!',
  'events.bannerSubtitle': 'Quests en beloningen — tik om te spelen',
  'events.claim': 'Claimen',
  'events.claimed': 'Geclaimd',
  'events.inProgress': 'Bezig',
  'events.endsIn': 'Eindigt over {time}',
  'settings.language': 'Taal',
  'settings.eventThemes': 'Evenementthema’s',
  'profile.logout': 'Uitloggen',
  'profile.league': 'Competitie',
  'profile.shop': 'Winkel',
};

// Soranî (Central Kurdish) — Arabic script, right-to-left.
const ckb: Catalog = {
  'common.back': 'گەڕانەوە',
  'nav.learn': 'فێربوون',
  'nav.play': 'یاری',
  'nav.dictionary': 'فەرهەنگ',
  'nav.social': 'کۆمەڵایەتی',
  'nav.profile': 'پرۆفایل',
  'events.title': 'بۆنەکان',
  'events.none': 'ئێستا هیچ بۆنەیەک نییە. دواتر بگەڕێوە!',
  'events.bannerSubtitle': 'ئەرک و خەڵات — بۆ یاریکردن دەستی لێبدە',
  'events.claim': 'وەرگرتن',
  'events.claimed': 'وەرگیرا',
  'events.inProgress': 'لە جێبەجێکردندایە',
  'events.endsIn': 'لە {time} کۆتایی دێت',
  'settings.language': 'زمان',
  'settings.eventThemes': 'ڕووکارەکانی بۆنە',
  'profile.logout': 'دەرچوون',
  'profile.league': 'خول',
  'profile.shop': 'فرۆشگا',
};

export const TRANSLATIONS: Record<Locale, Catalog> = { en, de, fr, nl, ku, ckb, ar, tr };
