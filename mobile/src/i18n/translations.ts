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
  | 'profile.shop'
  | 'nav.civak'
  | 'nav.friends'
  | 'civak.title'
  | 'civak.subtitle'
  | 'civak.loading'
  | 'civak.empty'
  | 'civak.filter.everything'
  | 'civak.filter.allKinds'
  | 'civak.section.writing'
  | 'civak.section.pictures'
  | 'civak.kind.saying'
  | 'civak.kind.story'
  | 'civak.kind.poem'
  | 'civak.kind.photo'
  | 'civak.kind.meme'
  | 'common.showMore';

type Catalog = Record<TranslationKey, string>;

const en: Catalog = {
  'common.back': 'Back',
  'nav.learn': 'Learn',
  'nav.play': 'Play',
  'nav.dictionary': 'Dictionary',
  'nav.social': 'Social',
  'nav.friends': 'Friends',
  'nav.civak': 'Community',
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
  'civak.title': 'Community',
  'civak.subtitle': 'Stories, poems and pictures from everyone.',
  'civak.loading': 'Loading the wall…',
  'civak.empty': 'Nothing here yet.',
  'civak.filter.everything': 'Everything',
  'civak.filter.allKinds': 'All',
  'civak.section.writing': 'Writing',
  'civak.section.pictures': 'Pictures',
  'civak.kind.saying': 'Saying',
  'civak.kind.story': 'Story',
  'civak.kind.poem': 'Poem',
  'civak.kind.photo': 'Photo',
  'civak.kind.meme': 'Meme',
  'common.showMore': 'Show more',
};

const ku: Catalog = {
  'common.back': 'Vegere',
  'nav.learn': 'Fêrbûn',
  'nav.play': 'Lîstin',
  'nav.dictionary': 'Ferheng',
  'nav.social': 'Civak',
  'nav.friends': 'Heval',
  'nav.civak': 'Civak',
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
  'profile.shop': 'Firoşgeh',
  'civak.title': 'Civak',
  'civak.subtitle': 'Çîrok, helbest û wêneyên ji her kesî.',
  'civak.loading': 'Dîwar tê barkirin…',
  'civak.empty': 'Hîn tiştek li vir tune.',
  'civak.filter.everything': 'Hemû',
  'civak.filter.allKinds': 'Hemû',
  'civak.section.writing': 'Gotin',
  'civak.section.pictures': 'Dîmen',
  'civak.kind.saying': 'Gotin',
  'civak.kind.story': 'Çîrok',
  'civak.kind.poem': 'Helbest',
  'civak.kind.photo': 'Wêne',
  'civak.kind.meme': 'Mîm',
  'common.showMore': 'Bêtir nîşan bide',
};

const de: Catalog = {
  'common.back': 'Zurück',
  'nav.learn': 'Lernen',
  'nav.play': 'Spielen',
  'nav.dictionary': 'Wörterbuch',
  'nav.social': 'Sozial',
  'nav.friends': 'Freunde',
  'nav.civak': 'Gemeinschaft',
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
  'civak.title': 'Gemeinschaft',
  'civak.subtitle': 'Geschichten, Gedichte und Bilder von allen.',
  'civak.loading': 'Die Wand wird geladen…',
  'civak.empty': 'Hier ist noch nichts.',
  'civak.filter.everything': 'Alles',
  'civak.filter.allKinds': 'Alle',
  'civak.section.writing': 'Texte',
  'civak.section.pictures': 'Bilder',
  'civak.kind.saying': 'Spruch',
  'civak.kind.story': 'Geschichte',
  'civak.kind.poem': 'Gedicht',
  'civak.kind.photo': 'Foto',
  'civak.kind.meme': 'Meme',
  'common.showMore': 'Mehr anzeigen',
};

const tr: Catalog = {
  'common.back': 'Geri',
  'nav.learn': 'Öğren',
  'nav.play': 'Oyna',
  'nav.dictionary': 'Sözlük',
  'nav.social': 'Sosyal',
  'nav.friends': 'Arkadaşlar',
  'nav.civak': 'Topluluk',
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
  'civak.title': 'Topluluk',
  'civak.subtitle': 'Herkesten hikâyeler, şiirler ve resimler.',
  'civak.loading': 'Duvar yükleniyor…',
  'civak.empty': 'Burada henüz bir şey yok.',
  'civak.filter.everything': 'Hepsi',
  'civak.filter.allKinds': 'Tümü',
  'civak.section.writing': 'Yazılar',
  'civak.section.pictures': 'Görseller',
  'civak.kind.saying': 'Söz',
  'civak.kind.story': 'Hikâye',
  'civak.kind.poem': 'Şiir',
  'civak.kind.photo': 'Fotoğraf',
  'civak.kind.meme': 'Caps',
  'common.showMore': 'Daha fazla göster',
};

const ar: Catalog = {
  'common.back': 'رجوع',
  'nav.learn': 'تعلّم',
  'nav.play': 'العب',
  'nav.dictionary': 'القاموس',
  'nav.social': 'المجتمع',
  'nav.friends': 'الأصدقاء',
  'nav.civak': 'المجتمع',
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
  'civak.title': 'المجتمع',
  'civak.subtitle': 'قصص وقصائد وصور من الجميع.',
  'civak.loading': 'جارٍ تحميل الحائط…',
  'civak.empty': 'لا يوجد شيء هنا بعد.',
  'civak.filter.everything': 'الكل',
  'civak.filter.allKinds': 'الكل',
  'civak.section.writing': 'كتابات',
  'civak.section.pictures': 'صور',
  'civak.kind.saying': 'قول',
  'civak.kind.story': 'قصة',
  'civak.kind.poem': 'قصيدة',
  'civak.kind.photo': 'صورة',
  'civak.kind.meme': 'ميم',
  'common.showMore': 'عرض المزيد',
};

const fr: Catalog = {
  'common.back': 'Retour',
  'nav.learn': 'Apprendre',
  'nav.play': 'Jouer',
  'nav.dictionary': 'Dictionnaire',
  'nav.social': 'Social',
  'nav.friends': 'Amis',
  'nav.civak': 'Communauté',
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
  'civak.title': 'Communauté',
  'civak.subtitle': 'Récits, poèmes et images de tout le monde.',
  'civak.loading': 'Chargement du mur…',
  'civak.empty': 'Il n’y a encore rien ici.',
  'civak.filter.everything': 'Tout',
  'civak.filter.allKinds': 'Tous',
  'civak.section.writing': 'Écrits',
  'civak.section.pictures': 'Images',
  'civak.kind.saying': 'Dicton',
  'civak.kind.story': 'Récit',
  'civak.kind.poem': 'Poème',
  'civak.kind.photo': 'Photo',
  'civak.kind.meme': 'Mème',
  'common.showMore': 'Afficher plus',
};

const nl: Catalog = {
  'common.back': 'Terug',
  'nav.learn': 'Leren',
  'nav.play': 'Spelen',
  'nav.dictionary': 'Woordenboek',
  'nav.social': 'Sociaal',
  'nav.friends': 'Vrienden',
  'nav.civak': 'Gemeenschap',
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
  'civak.title': 'Gemeenschap',
  'civak.subtitle': 'Verhalen, gedichten en foto’s van iedereen.',
  'civak.loading': 'De muur wordt geladen…',
  'civak.empty': 'Hier is nog niets.',
  'civak.filter.everything': 'Alles',
  'civak.filter.allKinds': 'Alle',
  'civak.section.writing': 'Teksten',
  'civak.section.pictures': 'Beelden',
  'civak.kind.saying': 'Gezegde',
  'civak.kind.story': 'Verhaal',
  'civak.kind.poem': 'Gedicht',
  'civak.kind.photo': 'Foto',
  'civak.kind.meme': 'Meme',
  'common.showMore': 'Meer tonen',
};

// Soranî (Central Kurdish) — Arabic script, right-to-left.
const ckb: Catalog = {
  'common.back': 'گەڕانەوە',
  'nav.learn': 'فێربوون',
  'nav.play': 'یاری',
  'nav.dictionary': 'فەرهەنگ',
  'nav.social': 'کۆمەڵایەتی',
  'nav.friends': 'هاوڕێیان',
  'nav.civak': 'کۆمەڵگا',
  'nav.profile': 'پرۆفایل',
  'events.title': 'بۆنەکان',
  'events.none': 'ئێستا هیچ بۆنەیەک نییە. دواتر بگەڕێوە!',
  'events.bannerSubtitle': 'ئەرک و خەڵات — بۆ یاریکردن دەستی لێبدە',
  'events.claim': 'وەرگرتن',
  'events.claimed': 'وەرگیرا',
  'events.inProgress': 'بەردەوامە',
  'events.endsIn': 'لە {time} کۆتایی دێت',
  'settings.language': 'زمان',
  'settings.eventThemes': 'ڕووکارەکانی بۆنە',
  'profile.logout': 'دەرچوون',
  'profile.league': 'لیگ',
  'profile.shop': 'فرۆشگا',
  'civak.title': 'کۆمەڵگا',
  'civak.subtitle': 'چیرۆک، شیعر و وێنە لە هەمووان.',
  'civak.loading': 'دیوارەکە بار دەکرێت…',
  'civak.empty': 'هێشتا هیچ لێرە نییە.',
  'civak.filter.everything': 'هەموو',
  'civak.filter.allKinds': 'هەموو',
  'civak.section.writing': 'نووسین',
  'civak.section.pictures': 'وێنەکان',
  'civak.kind.saying': 'قسە',
  'civak.kind.story': 'چیرۆک',
  'civak.kind.poem': 'شیعر',
  'civak.kind.photo': 'وێنە',
  'civak.kind.meme': 'میم',
  'common.showMore': 'زیاتر پیشان بدە',
};

export const TRANSLATIONS: Record<Locale, Catalog> = { en, de, fr, nl, ku, ckb, ar, tr };
