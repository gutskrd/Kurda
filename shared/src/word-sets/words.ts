import type { CompareLocale } from '../alphabet/letters.js';
import type { AppLocale } from '../locales.js';
import { kurdishNumber } from './number.js';

/**
 * Words to know: colours, numbers, the days of the week and the months,
 * taught the way the alphabet is — a set of tiles to tap and hear, each word
 * in both dialects, and a round of questions to check yourself with.
 *
 * Every word is given in Kurmancî, and in Soranî in its own script with the
 * same word in Latin letters under it, for the many Kurds who read one script
 * and not the other. What it means is held here in the seven other languages
 * the app speaks; for a Kurdish reader the meaning shown is the same word in
 * the other dialect, as the alphabet does (`meaningLocale`).
 *
 * Each set carries what makes it worth learning as a set rather than as a
 * list: a colour's swatch and a phrase to say it in, a number's value (and
 * `kurdishNumber` for every number after it), where in the week a day falls
 * — the names count from Saturday, with the number inside them — and which
 * season each month is in, on the calendar on the wall and on the Kurdish one
 * that starts at Newroz.
 *
 * All of it is listed for a native speaker to check before it is relied on.
 */

export type Dialect = 'kmr' | 'ckb';
export type WordSetId = 'colours' | 'numbers' | 'days' | 'months';
export const WORD_SET_IDS: readonly WordSetId[] = ['colours', 'numbers', 'days', 'months'];

export function isWordSetId(value: unknown): value is WordSetId {
  return typeof value === 'string' && (WORD_SET_IDS as readonly string[]).includes(value);
}

/** A word or phrase in the seven languages besides Kurdish. */
export type Gloss = Record<CompareLocale, string>;

/** One word in both dialects: Soranî in its own script, and in Latin letters. */
export interface Word {
  kmr: string;
  ckb: string;
  ckbLatin: string;
}

interface Base<S extends WordSetId> extends Word {
  set: S;
  /** unique within its set; part of its sound's key */
  id: string;
}

export interface Colour extends Base<'colours'> {
  hex: string;
  meaning: Gloss;
  /** the colour after a word, as Kurdish puts it: gula sor, a red rose */
  example: Word & { meaning: Gloss };
}

export interface NumberWord extends Base<'numbers'> {
  value: number;
}

export interface Day extends Base<'days'> {
  /** where it falls in the Kurdish week: Saturday 0 … Friday 6 */
  order: number;
  /** the number inside its name — Yekşem 1 … Pêncşem 5 — or null for Şemî and În */
  count: number | null;
  meaning: Gloss;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** A day of the year, on the calendar on the wall. */
export interface DayOfYear {
  month: number;
  day: number;
}

export interface CalendarMonth extends Base<'months'> {
  calendar: 'gregorian';
  /** 1 for January */
  number: number;
  season: Season;
  meaning: Gloss;
  /** the other name Kurmancî has for it, where it has one */
  also?: string;
}

export interface KurdishMonth extends Base<'months'> {
  calendar: 'kurdish';
  /** 1 for Xakelêwe, the month that starts at Newroz */
  number: number;
  season: Season;
  /** its first and last days, about: the solar year shifts by a day now and then */
  from: DayOfYear;
  to: DayOfYear;
}

export type Month = CalendarMonth | KurdishMonth;
export type SetWord = Colour | NumberWord | Day | Month;

export const COLOURS: readonly Colour[] = [
  {
    set: 'colours', id: 'red', kmr: 'sor', ckb: 'سوور', ckbLatin: 'sûr', hex: '#D93A3A',
    meaning: { en: 'red', de: 'rot', nl: 'rood', fr: 'rouge', es: 'rojo', tr: 'kırmızı', ar: 'أحمر' },
    example: {
      kmr: 'gula sor', ckb: 'گوڵی سوور', ckbLatin: 'gułî sûr',
      meaning: { en: 'a red rose', de: 'eine rote Rose', nl: 'een rode roos', fr: 'une rose rouge', es: 'una rosa roja', tr: 'kırmızı bir gül', ar: 'وردة حمراء' },
    },
  },
  {
    set: 'colours', id: 'blue', kmr: 'şîn', ckb: 'شین', ckbLatin: 'şîn', hex: '#2F6FD6',
    meaning: { en: 'blue', de: 'blau', nl: 'blauw', fr: 'bleu', es: 'azul', tr: 'mavi', ar: 'أزرق' },
    example: {
      kmr: 'asmanê şîn', ckb: 'ئاسمانی شین', ckbLatin: 'asmanî şîn',
      meaning: { en: 'the blue sky', de: 'der blaue Himmel', nl: 'de blauwe lucht', fr: 'le ciel bleu', es: 'el cielo azul', tr: 'mavi gökyüzü', ar: 'السماء الزرقاء' },
    },
  },
  {
    set: 'colours', id: 'green', kmr: 'kesk', ckb: 'سەوز', ckbLatin: 'sewz', hex: '#2E9E5B',
    meaning: { en: 'green', de: 'grün', nl: 'groen', fr: 'vert', es: 'verde', tr: 'yeşil', ar: 'أخضر' },
    example: {
      kmr: 'dara kesk', ckb: 'داری سەوز', ckbLatin: 'darî sewz',
      meaning: { en: 'a green tree', de: 'ein grüner Baum', nl: 'een groene boom', fr: 'un arbre vert', es: 'un árbol verde', tr: 'yeşil bir ağaç', ar: 'شجرة خضراء' },
    },
  },
  {
    set: 'colours', id: 'yellow', kmr: 'zer', ckb: 'زەرد', ckbLatin: 'zerd', hex: '#F2C230',
    meaning: { en: 'yellow', de: 'gelb', nl: 'geel', fr: 'jaune', es: 'amarillo', tr: 'sarı', ar: 'أصفر' },
    example: {
      kmr: 'sêva zer', ckb: 'سێوی زەرد', ckbLatin: 'sêwî zerd',
      meaning: { en: 'a yellow apple', de: 'ein gelber Apfel', nl: 'een gele appel', fr: 'une pomme jaune', es: 'una manzana amarilla', tr: 'sarı bir elma', ar: 'تفاحة صفراء' },
    },
  },
  {
    set: 'colours', id: 'black', kmr: 'reş', ckb: 'ڕەش', ckbLatin: 'řeş', hex: '#1E1E1E',
    meaning: { en: 'black', de: 'schwarz', nl: 'zwart', fr: 'noir', es: 'negro', tr: 'siyah', ar: 'أسود' },
    example: {
      kmr: 'pisîka reş', ckb: 'پشیلەی ڕەش', ckbLatin: 'pişîley řeş',
      meaning: { en: 'a black cat', de: 'eine schwarze Katze', nl: 'een zwarte kat', fr: 'un chat noir', es: 'un gato negro', tr: 'siyah bir kedi', ar: 'قطة سوداء' },
    },
  },
  {
    set: 'colours', id: 'white', kmr: 'spî', ckb: 'سپی', ckbLatin: 'spî', hex: '#FFFFFF',
    meaning: { en: 'white', de: 'weiß', nl: 'wit', fr: 'blanc', es: 'blanco', tr: 'beyaz', ar: 'أبيض' },
    example: {
      kmr: 'berfa spî', ckb: 'بەفری سپی', ckbLatin: 'befrî spî',
      meaning: { en: 'white snow', de: 'weißer Schnee', nl: 'witte sneeuw', fr: 'la neige blanche', es: 'nieve blanca', tr: 'beyaz kar', ar: 'ثلج أبيض' },
    },
  },
  {
    set: 'colours', id: 'brown', kmr: 'qehweyî', ckb: 'قاوەیی', ckbLatin: 'qaweyî', hex: '#8A5A36',
    meaning: { en: 'brown', de: 'braun', nl: 'bruin', fr: 'marron', es: 'marrón', tr: 'kahverengi', ar: 'بني' },
    example: {
      kmr: 'çavên qehweyî', ckb: 'چاوی قاوەیی', ckbLatin: 'çawî qaweyî',
      meaning: { en: 'brown eyes', de: 'braune Augen', nl: 'bruine ogen', fr: 'des yeux marron', es: 'ojos marrones', tr: 'kahverengi gözler', ar: 'عيون بنية' },
    },
  },
  {
    set: 'colours', id: 'orange', kmr: 'porteqalî', ckb: 'پرتەقاڵی', ckbLatin: 'pirteqałî', hex: '#F08A24',
    meaning: { en: 'orange', de: 'orange', nl: 'oranje', fr: 'orange', es: 'naranja', tr: 'turuncu', ar: 'برتقالي' },
    example: {
      kmr: 'kirasê porteqalî', ckb: 'کراسی پرتەقاڵی', ckbLatin: 'kirasî pirteqałî',
      meaning: { en: 'an orange shirt', de: 'ein orangefarbenes Hemd', nl: 'een oranje overhemd', fr: 'une chemise orange', es: 'una camisa naranja', tr: 'turuncu bir gömlek', ar: 'قميص برتقالي' },
    },
  },
  {
    set: 'colours', id: 'purple', kmr: 'mor', ckb: 'مۆر', ckbLatin: 'mor', hex: '#7B4BC4',
    meaning: { en: 'purple', de: 'lila', nl: 'paars', fr: 'violet', es: 'morado', tr: 'mor', ar: 'بنفسجي' },
    example: {
      kmr: 'kulîlka mor', ckb: 'گوڵی مۆر', ckbLatin: 'gułî mor',
      meaning: { en: 'a purple flower', de: 'eine lila Blume', nl: 'een paarse bloem', fr: 'une fleur violette', es: 'una flor morada', tr: 'mor bir çiçek', ar: 'زهرة بنفسجية' },
    },
  },
  {
    set: 'colours', id: 'pink', kmr: 'pembe', ckb: 'پەمەیی', ckbLatin: 'pemeyî', hex: '#F28DB2',
    meaning: { en: 'pink', de: 'rosa', nl: 'roze', fr: 'rose', es: 'rosa', tr: 'pembe', ar: 'وردي' },
    example: {
      kmr: 'pirtûka pembe', ckb: 'کتێبی پەمەیی', ckbLatin: 'kitêbî pemeyî',
      meaning: { en: 'a pink book', de: 'ein rosa Buch', nl: 'een roze boek', fr: 'un livre rose', es: 'un libro rosa', tr: 'pembe bir kitap', ar: 'كتاب وردي' },
    },
  },
  {
    set: 'colours', id: 'grey', kmr: 'gewr', ckb: 'خۆڵەمێشی', ckbLatin: 'xołemêşî', hex: '#8C8C8C',
    meaning: { en: 'grey', de: 'grau', nl: 'grijs', fr: 'gris', es: 'gris', tr: 'gri', ar: 'رمادي' },
    example: {
      kmr: 'ewrê gewr', ckb: 'هەوری خۆڵەمێشی', ckbLatin: 'hewrî xołemêşî',
      meaning: { en: 'a grey cloud', de: 'eine graue Wolke', nl: 'een grijze wolk', fr: 'un nuage gris', es: 'una nube gris', tr: 'gri bir bulut', ar: 'غيمة رمادية' },
    },
  },
];

/** Zero to ten, the teens, the tens, a hundred and a thousand: enough to say any number up to 9999. */
const NUMBER_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 30, 40, 50, 60, 70, 80, 90, 100, 1000];

export const NUMBERS: readonly NumberWord[] = NUMBER_VALUES.map(
  (value): NumberWord => ({
    set: 'numbers',
    id: String(value),
    value,
    kmr: kurdishNumber(value, 'kmr'),
    ckb: kurdishNumber(value, 'ckb'),
    ckbLatin: kurdishNumber(value, 'ckb', { latin: true }),
  }),
);

/** The week as Kurdish counts it, from Saturday. */
export const DAYS: readonly Day[] = [
  {
    set: 'days', id: 'sat', order: 0, count: null, kmr: 'Şemî', ckb: 'شەممە', ckbLatin: 'şemme',
    meaning: { en: 'Saturday', de: 'Samstag', nl: 'zaterdag', fr: 'samedi', es: 'sábado', tr: 'Cumartesi', ar: 'السبت' },
  },
  {
    set: 'days', id: 'sun', order: 1, count: 1, kmr: 'Yekşem', ckb: 'یەکشەممە', ckbLatin: 'yekşemme',
    meaning: { en: 'Sunday', de: 'Sonntag', nl: 'zondag', fr: 'dimanche', es: 'domingo', tr: 'Pazar', ar: 'الأحد' },
  },
  {
    set: 'days', id: 'mon', order: 2, count: 2, kmr: 'Duşem', ckb: 'دووشەممە', ckbLatin: 'dûşemme',
    meaning: { en: 'Monday', de: 'Montag', nl: 'maandag', fr: 'lundi', es: 'lunes', tr: 'Pazartesi', ar: 'الاثنين' },
  },
  {
    set: 'days', id: 'tue', order: 3, count: 3, kmr: 'Sêşem', ckb: 'سێشەممە', ckbLatin: 'sêşemme',
    meaning: { en: 'Tuesday', de: 'Dienstag', nl: 'dinsdag', fr: 'mardi', es: 'martes', tr: 'Salı', ar: 'الثلاثاء' },
  },
  {
    set: 'days', id: 'wed', order: 4, count: 4, kmr: 'Çarşem', ckb: 'چوارشەممە', ckbLatin: 'çwarşemme',
    meaning: { en: 'Wednesday', de: 'Mittwoch', nl: 'woensdag', fr: 'mercredi', es: 'miércoles', tr: 'Çarşamba', ar: 'الأربعاء' },
  },
  {
    set: 'days', id: 'thu', order: 5, count: 5, kmr: 'Pêncşem', ckb: 'پێنجشەممە', ckbLatin: 'pêncşemme',
    meaning: { en: 'Thursday', de: 'Donnerstag', nl: 'donderdag', fr: 'jeudi', es: 'jueves', tr: 'Perşembe', ar: 'الخميس' },
  },
  {
    set: 'days', id: 'fri', order: 6, count: null, kmr: 'În', ckb: 'هەینی', ckbLatin: 'heynî',
    meaning: { en: 'Friday', de: 'Freitag', nl: 'vrijdag', fr: 'vendredi', es: 'viernes', tr: 'Cuma', ar: 'الجمعة' },
  },
];

/** Yesterday, today and tomorrow: what a day is called from where you stand. */
export const RELATIVE_DAYS: Readonly<Record<'yesterday' | 'today' | 'tomorrow', Word & { meaning: Gloss }>> = {
  yesterday: {
    kmr: 'duh', ckb: 'دوێنێ', ckbLatin: 'dwênê',
    meaning: { en: 'yesterday', de: 'gestern', nl: 'gisteren', fr: 'hier', es: 'ayer', tr: 'dün', ar: 'أمس' },
  },
  today: {
    kmr: 'îro', ckb: 'ئەمڕۆ', ckbLatin: 'emřo',
    meaning: { en: 'today', de: 'heute', nl: 'vandaag', fr: 'aujourd’hui', es: 'hoy', tr: 'bugün', ar: 'اليوم' },
  },
  tomorrow: {
    kmr: 'sibe', ckb: 'سبەی', ckbLatin: 'sibey',
    meaning: { en: 'tomorrow', de: 'morgen', nl: 'morgen', fr: 'demain', es: 'mañana', tr: 'yarın', ar: 'غدًا' },
  },
};

/** The four seasons, each with the colour its months are tinted with. */
export const SEASONS: Readonly<Record<Season, Word & { meaning: Gloss; tint: string }>> = {
  spring: {
    kmr: 'bihar', ckb: 'بەهار', ckbLatin: 'behar', tint: '#5FB86A',
    meaning: { en: 'spring', de: 'Frühling', nl: 'lente', fr: 'printemps', es: 'primavera', tr: 'ilkbahar', ar: 'الربيع' },
  },
  summer: {
    kmr: 'havîn', ckb: 'هاوین', ckbLatin: 'hawîn', tint: '#EBB52B',
    meaning: { en: 'summer', de: 'Sommer', nl: 'zomer', fr: 'été', es: 'verano', tr: 'yaz', ar: 'الصيف' },
  },
  autumn: {
    kmr: 'payîz', ckb: 'پاییز', ckbLatin: 'payîz', tint: '#D9773A',
    meaning: { en: 'autumn', de: 'Herbst', nl: 'herfst', fr: 'automne', es: 'otoño', tr: 'sonbahar', ar: 'الخريف' },
  },
  winter: {
    kmr: 'zivistan', ckb: 'زستان', ckbLatin: 'zistan', tint: '#5B8FD4',
    meaning: { en: 'winter', de: 'Winter', nl: 'winter', fr: 'hiver', es: 'invierno', tr: 'kış', ar: 'الشتاء' },
  },
};
export const SEASON_ORDER: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** Newroz, the Kurdish new year, on 21 March: the first day of Xakelêwe. */
export const NEWROZ: DayOfYear = { month: 3, day: 21 };

const seasonOf = (month: number): Season => SEASON_ORDER[Math.floor(((month + 9) % 12) / 3)]!;

/**
 * The months on the calendar on the wall, by their Kurdish names. Soranî says
 * them as Iraq and Syria do; Kurmancî has a second, older name for most of
 * them, from the Kurdish months they fall in.
 */
export const CALENDAR_MONTHS: readonly CalendarMonth[] = (
  [
    ['jan', 'Kanûna Paşîn', 'کانوونی دووەم', 'kanûnî duwem', 'Rêbendan', { en: 'January', de: 'Januar', nl: 'januari', fr: 'janvier', es: 'enero', tr: 'Ocak', ar: 'كانون الثاني' }],
    ['feb', 'Sibat', 'شوبات', 'şubat', 'Reşemî', { en: 'February', de: 'Februar', nl: 'februari', fr: 'février', es: 'febrero', tr: 'Şubat', ar: 'شباط' }],
    ['mar', 'Adar', 'ئازار', 'azar', undefined, { en: 'March', de: 'März', nl: 'maart', fr: 'mars', es: 'marzo', tr: 'Mart', ar: 'آذار' }],
    ['apr', 'Nîsan', 'نیسان', 'nîsan', undefined, { en: 'April', de: 'April', nl: 'april', fr: 'avril', es: 'abril', tr: 'Nisan', ar: 'نيسان' }],
    ['may', 'Gulan', 'ئایار', 'ayar', undefined, { en: 'May', de: 'Mai', nl: 'mei', fr: 'mai', es: 'mayo', tr: 'Mayıs', ar: 'أيار' }],
    ['jun', 'Hezîran', 'حوزەیران', 'ḧuzeyran', 'Pûşper', { en: 'June', de: 'Juni', nl: 'juni', fr: 'juin', es: 'junio', tr: 'Haziran', ar: 'حزيران' }],
    ['jul', 'Tîrmeh', 'تەممووز', 'temmûz', undefined, { en: 'July', de: 'Juli', nl: 'juli', fr: 'juillet', es: 'julio', tr: 'Temmuz', ar: 'تموز' }],
    ['aug', 'Tebax', 'ئاب', 'ab', 'Gelawêj', { en: 'August', de: 'August', nl: 'augustus', fr: 'août', es: 'agosto', tr: 'Ağustos', ar: 'آب' }],
    ['sep', 'Îlon', 'ئەیلوول', 'eylûl', 'Rezber', { en: 'September', de: 'September', nl: 'september', fr: 'septembre', es: 'septiembre', tr: 'Eylül', ar: 'أيلول' }],
    ['oct', 'Cotmeh', 'تشرینی یەکەم', 'tişrînî yekem', 'Kewçêr', { en: 'October', de: 'Oktober', nl: 'oktober', fr: 'octobre', es: 'octubre', tr: 'Ekim', ar: 'تشرين الأول' }],
    ['nov', 'Mijdar', 'تشرینی دووەم', 'tişrînî duwem', 'Sermawez', { en: 'November', de: 'November', nl: 'november', fr: 'novembre', es: 'noviembre', tr: 'Kasım', ar: 'تشرين الثاني' }],
    ['dec', 'Kanûna Pêşîn', 'کانوونی یەکەم', 'kanûnî yekem', 'Berfanbar', { en: 'December', de: 'Dezember', nl: 'december', fr: 'décembre', es: 'diciembre', tr: 'Aralık', ar: 'كانون الأول' }],
  ] as const
).map(([id, kmr, ckb, ckbLatin, also, meaning], i): CalendarMonth => ({
  set: 'months',
  calendar: 'gregorian',
  id,
  number: i + 1,
  season: seasonOf(i + 1),
  kmr,
  ckb,
  ckbLatin,
  meaning,
  ...(also ? { also } : {}),
}));

/**
 * The Kurdish solar months. The year starts at Newroz, the first three months
 * are spring, and each season has three; the first six have 31 days, the next
 * five 30, the last 29 (30 in a leap year).
 */
export const KURDISH_MONTHS: readonly KurdishMonth[] = (
  [
    ['xakelewe', 'Xakelêwe', 'خاکەلێوە', 'xakelêwe', [3, 21], [4, 20]],
    ['gulan', 'Gulan', 'گوڵان', 'gułan', [4, 21], [5, 21]],
    ['cozerdan', 'Cozerdan', 'جۆزەردان', 'cozerdan', [5, 22], [6, 21]],
    ['pusper', 'Pûşper', 'پووشپەڕ', 'pûşpeř', [6, 22], [7, 22]],
    ['gelawej', 'Gelawêj', 'گەلاوێژ', 'gelawêj', [7, 23], [8, 22]],
    ['xermanan', 'Xermanan', 'خەرمانان', 'xermanan', [8, 23], [9, 22]],
    ['rezber', 'Rezber', 'ڕەزبەر', 'řezber', [9, 23], [10, 22]],
    ['gelarezan', 'Gelarêzan', 'گەڵاڕێزان', 'gełařêzan', [10, 23], [11, 21]],
    ['sermawez', 'Sermawez', 'سەرماوەز', 'sermawez', [11, 22], [12, 21]],
    ['berfanbar', 'Berfanbar', 'بەفرانبار', 'befranbar', [12, 22], [1, 20]],
    ['rebendan', 'Rêbendan', 'ڕێبەندان', 'řêbendan', [1, 21], [2, 19]],
    ['resemi', 'Reşemî', 'ڕەشەمە', 'řeşeme', [2, 20], [3, 20]],
  ] as const
).map(([id, kmr, ckb, ckbLatin, from, to], i): KurdishMonth => ({
  set: 'months',
  calendar: 'kurdish',
  id,
  number: i + 1,
  season: SEASON_ORDER[Math.floor(i / 3)]!,
  kmr,
  ckb,
  ckbLatin,
  from: { month: from[0], day: from[1] },
  to: { month: to[0], day: to[1] },
}));

export const MONTHS: readonly Month[] = [...CALENDAR_MONTHS, ...KURDISH_MONTHS];

/** A set's words, in the order its page shows them. */
export function wordSet(set: WordSetId): readonly SetWord[] {
  switch (set) {
    case 'colours':
      return COLOURS;
    case 'numbers':
      return NUMBERS;
    case 'days':
      return DAYS;
    case 'months':
      return MONTHS;
  }
}

export function findWord(set: WordSetId, id: string): SetWord | undefined {
  return wordSet(set).find((w) => w.id === id);
}

/** A group of a set's words, by what it holds. A set with one group shows it without a heading. */
export type WordGroupId = 'colours' | 'units' | 'teens' | 'tens' | 'big' | 'week' | 'gregorian' | 'kurdish';

export interface WordGroup {
  id: WordGroupId;
  words: readonly SetWord[];
}

/** How a set's page lays its words out: the numbers by how they are built, the months by calendar. */
export function wordGroups(set: WordSetId): WordGroup[] {
  switch (set) {
    case 'colours':
      return [{ id: 'colours', words: COLOURS }];
    case 'days':
      return [{ id: 'week', words: DAYS }];
    case 'numbers':
      return [
        { id: 'units', words: NUMBERS.filter((n) => n.value <= 10) },
        { id: 'teens', words: NUMBERS.filter((n) => n.value > 10 && n.value < 20) },
        { id: 'tens', words: NUMBERS.filter((n) => n.value >= 20 && n.value < 100) },
        { id: 'big', words: NUMBERS.filter((n) => n.value >= 100) },
      ];
    case 'months':
      return [
        { id: 'gregorian', words: CALENDAR_MONTHS },
        { id: 'kurdish', words: KURDISH_MONTHS },
      ];
  }
}

/** A word in a dialect, as the page writes it: Soranî in its own script, unless `latin` asks for its Latin letters. */
export function wordIn(word: Word, dialect: Dialect, { latin = false }: { latin?: boolean } = {}): string {
  return dialect === 'kmr' ? word.kmr : latin ? word.ckbLatin : word.ckb;
}

/**
 * What a word means in `locale`: its word in that language, its digits for a
 * number — and in Kurmancî or Soranî, the word itself in that dialect, so a
 * Kurdish reader is shown the other dialect's word (pass `meaningLocale`'s
 * answer). A Kurdish month means its dates, which the page says in its own
 * words: null.
 */
export function wordGloss(word: SetWord, locale: AppLocale): string | null {
  if (locale === 'ku') return word.kmr;
  if (locale === 'ckb') return word.ckb;
  if (word.set === 'numbers') return String(word.value);
  if (word.set === 'months' && word.calendar === 'kurdish') return null;
  return word.meaning[locale];
}

/** A gloss in `locale`, for the words held with one (an example, a season, today): a Kurdish locale gets the dialect's own word. */
export function glossIn(word: Word & { meaning: Gloss }, locale: AppLocale): string {
  return locale === 'ku' ? word.kmr : locale === 'ckb' ? word.ckb : word.meaning[locale];
}

/**
 * A day's name split at the number inside it — Yek + şem, یەک + شەممە — for
 * marking it; null for Şemî and În, which have none.
 */
export function dayParts(day: Day, dialect: Dialect, { latin = false }: { latin?: boolean } = {}): { number: string; rest: string } | null {
  if (day.count === null) return null;
  const name = wordIn(day, dialect, { latin });
  const n = wordIn(NUMBERS[day.count]!, dialect, { latin });
  // Kurmancî writes a day with a capital: the number inside it is capitalised with it
  const head = name.slice(0, n.length);
  return head.toLocaleLowerCase('ku') === n ? { number: head, rest: name.slice(n.length) } : null;
}

/** The day after `day`, Friday's being Saturday: the week goes round. */
export function dayAfter(day: Day, by = 1): Day {
  return DAYS[(((day.order + by) % 7) + 7) % 7]!;
}

/** Where in the Kurdish week a date falls: Saturday 0 … Friday 6. */
export function kurdishWeekday(date: Date): number {
  return (date.getDay() + 1) % 7;
}

/** The month `by` after `month` in its own calendar, the year going round: December's next is January, Reşemî's Xakelêwe. */
export function monthAfter(month: Month, by = 1): Month {
  const all = month.calendar === 'gregorian' ? CALENDAR_MONTHS : KURDISH_MONTHS;
  return all[(((month.number - 1 + by) % 12) + 12) % 12]!;
}
