/**
 * The gifts: tea and coffee, flowers, animals, music, boats, houses, legends and the sky, from 1 Zêr (one cent) to
 * 100,000 (a thousand euros). Each has its Kurmancî name, which every app shows as written, and what it means in each interface
 * language underneath, so a gift teaches a word. A gift is offered only once its picture is drawn (`GIFT_ART_IDS`), so a
 * new picture is all it takes to put one on sale. The server seeds these as shop items (`giftSku`), and an admin may
 * change a price through the usual approvals; the numbers here are what they were first put on sale at.
 */
import { GIFT_ART_IDS, giftArtKey, isGiftArtId } from './art/gift-art.js';
import type { AppLocale } from './locales.js';

/** The shelves of the gift sheet, in the order it shows them. */
export const GIFT_GROUPS = ['warm', 'flowers', 'animals', 'music', 'sky', 'boats', 'houses', 'legends'] as const;
export type GiftGroup = (typeof GIFT_GROUPS)[number];

export interface GiftDef {
  id: string;
  /** Kurmancî, as every app shows it */
  name: string;
  /** Zêr, 100 to the euro */
  price: number;
  group: GiftGroup;
  /** Earned into anyone's gift bag (`BAG_SOURCES`), as well as sold. */
  earnedFree: boolean;
  /** Sold only in its season (`months`), every year. */
  limited: boolean;
  /** The months it is sold in, 1–12 in UTC; null for all year. */
  months: readonly number[] | null;
  /** A token of courtship, offered and given only where giver and receiver are both known adults. */
  adultsOnly: boolean;
}

const gift = (id: string, name: string, price: number, group: GiftGroup, extra: Partial<Pick<GiftDef, 'earnedFree' | 'months' | 'adultsOnly'>> = {}): GiftDef => ({
  id,
  name,
  price,
  group,
  earnedFree: extra.earnedFree ?? false,
  limited: extra.months != null,
  months: extra.months ?? null,
  adultsOnly: extra.adultsOnly ?? false,
});

/** Every gift, cheapest first. */
export const GIFTS: readonly GiftDef[] = [
  gift('cay', 'Çay', 1, 'warm', { earnedFree: true }),
  gift('qehwe', 'Qehwe', 2, 'warm', { earnedFree: true }),
  gift('beybun', 'Beybûn', 3, 'flowers', { earnedFree: true }),
  gift('sev', 'Sêv', 3, 'warm', { earnedFree: true }),
  gift('lale', 'Lale', 10, 'flowers'),
  gift('gul', 'Gul', 25, 'flowers'),
  gift('nergiz', 'Nêrgiz', 50, 'flowers'),
  gift('kevok', 'Kevok', 50, 'animals'),
  gift('sosin', 'Sosin', 100, 'flowers'),
  // the apple stuck with cloves that is sent for love, so only ever between two adults
  gift('sev-mexek', 'Sêva mêxekî', 100, 'warm', { adultsOnly: true }),
  gift('pisik', 'Pisîk', 150, 'animals'),
  gift('kew', 'Kew', 300, 'animals'),
  gift('semawer', 'Semawer', 300, 'warm'),
  gift('def', 'Def', 400, 'music'),
  gift('deste-gul', 'Desteya gulan', 500, 'flowers'),
  gift('sterk', 'Stêrka xişok', 500, 'sky'),
  gift('kelek', 'Kelek', 800, 'boats'),
  gift('saz', 'Saz', 1_000, 'music'),
  gift('ask', 'Ask', 1_000, 'animals'),
  gift('keskesor', 'Keskesor', 1_200, 'sky'),
  gift('pezkovi', 'Pezkovî', 1_500, 'animals'),
  gift('belem', 'Belem', 2_000, 'boats'),
  // around Newroz on 21 March, every year
  gift('pet', 'Pêta Newrozê', 2_000, 'sky', { months: [3] }),
  gift('hesp', 'Hesp', 2_500, 'animals'),
  gift('kon', 'Reşmal', 3_000, 'houses'),
  gift('mal', 'Mala gund', 5_000, 'houses'),
  gift('kawa', 'Çakûçê Kawa', 5_000, 'legends'),
  gift('sahmaran', 'Wêneyê Şahmaranê', 7_500, 'legends'),
  gift('gemi', 'Gemiya bayê', 10_000, 'boats'),
  gift('kosk', 'Koşk', 15_000, 'houses'),
  gift('heyv', 'Heyv', 20_000, 'sky'),
  gift('keleh', 'Keleh', 30_000, 'houses'),
  gift('roj', 'Roj', 50_000, 'sky'),
  gift('kadiz', 'Rêya Kadizê', 100_000, 'sky'),
];

/** The shop item a gift is sold as. */
export const giftSku = (id: string): string => `gift-${id}`;

const BY_ID: ReadonlyMap<string, GiftDef> = new Map(GIFTS.map((g) => [g.id, g]));

/** The gift a shop item is, by its sku; null for any other item. */
export function giftOfSku(sku: string): GiftDef | null {
  return sku.startsWith('gift-') ? (BY_ID.get(sku.slice(5)) ?? null) : null;
}

/** A gift's drawn picture, as an asset key under /cosmetics, or null while it is not drawn yet. */
export function drawnGiftArtKey(sku: string): string | null {
  const def = giftOfSku(sku);
  return def && isGiftArtId(def.id) ? giftArtKey(def.id) : null;
}

/** Whether a gift is in its season now (UTC); always for a gift sold all year, or an item that is not a gift. */
export function giftInSeason(sku: string, now: Date = new Date()): boolean {
  const months = giftOfSku(sku)?.months;
  return !months || months.includes(now.getUTCMonth() + 1);
}

/** Whether a gift is a token of courtship, given only between two known adults. */
export function giftForAdultsOnly(sku: string): boolean {
  return giftOfSku(sku)?.adultsOnly === true;
}

/** Whether a shop item is limited: an end date set on it, or a gift sold only in its season. */
export function isLimitedItem(sku: string, availableTo: Date | string | null | undefined): boolean {
  return availableTo != null || giftOfSku(sku)?.limited === true;
}

/** The gifts that are drawn, which are the ones on offer. */
export function drawnGifts(): GiftDef[] {
  return GIFTS.filter((g) => (GIFT_ART_IDS as readonly string[]).includes(g.id));
}

/**
 * What each gift means, in every interface language, shown under its Kurmancî name. Kurmancî readers get a few words
 * about it rather than the name again; Soranî readers get the Soranî word.
 */
const MEANINGS: Readonly<Record<string, Readonly<Record<AppLocale, string>>>> = {
  cay: {
    en: 'A glass of tea', ku: 'Îstîkaneke çayê', ckb: 'پیاڵەیەک چا', de: 'Ein Glas Tee', es: 'Un vaso de té',
    fr: 'Un verre de thé', nl: 'Een glas thee', tr: 'Bir bardak çay', ar: 'كأس شاي',
  },
  qehwe: {
    en: 'Kurdish coffee', ku: 'Fincaneke qehweya kurdî', ckb: 'قاوەی کوردی', de: 'Kurdischer Kaffee', es: 'Café kurdo',
    fr: 'Café kurde', nl: 'Koerdische koffie', tr: 'Kürt kahvesi', ar: 'قهوة كردية',
  },
  beybun: {
    en: 'A sprig of chamomile', ku: 'Çiqileke beybûnê', ckb: 'بەیبوون', de: 'Ein Kamillenzweig', es: 'Una ramita de manzanilla',
    fr: 'Un brin de camomille', nl: 'Een takje kamille', tr: 'Bir dal papatya', ar: 'غصن بابونج',
  },
  sev: {
    en: 'A red apple', ku: 'Sêveke sor bi pelekî', ckb: 'سێوێکی سوور', de: 'Ein roter Apfel', es: 'Una manzana roja',
    fr: 'Une pomme rouge', nl: 'Een rode appel', tr: 'Kırmızı bir elma', ar: 'تفاحة حمراء',
  },
  'sev-mexek': {
    en: 'A clove apple, a sign of love', ku: 'Sêveke bi mêxekan, nîşana evînê', ckb: 'سێوی مێخەکدار، نیشانەی خۆشەویستی',
    de: 'Ein Nelkenapfel, ein Zeichen der Liebe', es: 'Una manzana con clavos, señal de amor', fr: 'Une pomme piquée de clous de girofle, signe d’amour',
    nl: 'Een kruidnagelappel, een teken van liefde', tr: 'Karanfilli elma, sevginin işareti', ar: 'تفاحة بالقرنفل، علامة حب',
  },
  lale: {
    en: 'A tulip', ku: 'Kulîlka lalê', ckb: 'گوڵاڵە', de: 'Eine Tulpe', es: 'Un tulipán', fr: 'Une tulipe', nl: 'Een tulp',
    tr: 'Bir lale', ar: 'زهرة توليب',
  },
  gul: {
    en: 'A red rose', ku: 'Gula sor', ckb: 'گوڵێکی سوور', de: 'Eine rote Rose', es: 'Una rosa roja', fr: 'Une rose rouge',
    nl: 'Een rode roos', tr: 'Kırmızı bir gül', ar: 'وردة حمراء',
  },
  nergiz: {
    en: 'A narcissus, the Newroz flower', ku: 'Kulîlka Newrozê', ckb: 'نێرگز، گوڵی نەورۆز', de: 'Eine Narzisse, die Newroz-Blume',
    es: 'Un narciso, la flor de Newroz', fr: 'Un narcisse, la fleur de Newroz', nl: 'Een narcis, de bloem van Newroz',
    tr: 'Nergis, Newroz çiçeği', ar: 'نرجسة، زهرة نوروز',
  },
  kevok: {
    en: 'A pigeon', ku: 'Kevoka nameyan', ckb: 'کۆتر', de: 'Eine Taube', es: 'Una paloma', fr: 'Un pigeon', nl: 'Een duif',
    tr: 'Bir güvercin', ar: 'حمامة',
  },
  sosin: {
    en: 'An iris', ku: 'Kulîlka sosinê', ckb: 'سۆسن', de: 'Eine Schwertlilie', es: 'Un lirio', fr: 'Un iris', nl: 'Een iris',
    tr: 'Bir süsen', ar: 'زهرة سوسن',
  },
  pisik: {
    en: 'A kitten curled up', ku: 'Pisîkeke biçûk di xewê de', ckb: 'بێچووە پشیلەیەکی خەوتوو', de: 'Ein eingerolltes Kätzchen',
    es: 'Un gatito acurrucado', fr: 'Un chaton blotti', nl: 'Een opgekruld katje', tr: 'Kıvrılmış bir yavru kedi', ar: 'قطة صغيرة متكوّرة',
  },
  kew: {
    en: 'A partridge', ku: 'Kewa çiyê', ckb: 'کەو', de: 'Ein Steinhuhn', es: 'Una perdiz', fr: 'Une perdrix', nl: 'Een patrijs',
    tr: 'Bir keklik', ar: 'طائر حجل',
  },
  semawer: {
    en: 'A samovar with tea glasses', ku: 'Semawer û îstîkanên çayê', ckb: 'سەماوەر و پیاڵەی چا', de: 'Ein Samowar mit Teegläsern',
    es: 'Un samovar con vasos de té', fr: 'Un samovar et ses verres à thé', nl: 'Een samovar met theeglazen',
    tr: 'Çay bardaklarıyla bir semaver', ar: 'سماور مع كؤوس الشاي',
  },
  def: {
    en: 'A frame drum', ku: 'Defa govendê', ckb: 'دەف', de: 'Eine Rahmentrommel', es: 'Un tambor de marco', fr: 'Un tambour sur cadre',
    nl: 'Een lijsttrommel', tr: 'Bir def', ar: 'دفّ',
  },
  'deste-gul': {
    en: 'A bouquet of roses, tulips and narcissi', ku: 'Destek ji gul, lale û nêrgizan', ckb: 'چەپکێک گوڵ و گوڵاڵە و نێرگز',
    de: 'Ein Strauß aus Rosen, Tulpen und Narzissen', es: 'Un ramo de rosas, tulipanes y narcisos', fr: 'Un bouquet de roses, de tulipes et de narcisses',
    nl: 'Een boeket rozen, tulpen en narcissen', tr: 'Gül, lale ve nergisten bir buket', ar: 'باقة من الورد والتوليب والنرجس',
  },
  sterk: {
    en: 'A shooting star', ku: 'Stêrkeke ku di ezmên de dişemite', ckb: 'ئەستێرەیەکی کشاو', de: 'Eine Sternschnuppe',
    es: 'Una estrella fugaz', fr: 'Une étoile filante', nl: 'Een vallende ster', tr: 'Bir kayan yıldız', ar: 'شهاب',
  },
  kelek: {
    en: 'A kelek raft on the river', ku: 'Kelek li ser çem', ckb: 'کەلەک لەسەر ڕووبار', de: 'Ein Kelek-Floß auf dem Fluss',
    es: 'Una balsa kelek en el río', fr: 'Un radeau kelek sur la rivière', nl: 'Een kelekvlot op de rivier', tr: 'Nehirde bir kelek salı',
    ar: 'طوف كَلَك على النهر',
  },
  saz: {
    en: 'A saz, the long-necked lute', ku: 'Saza bi destikê dirêj', ckb: 'ساز', de: 'Eine Saz, die Langhalslaute',
    es: 'Un saz, el laúd de mástil largo', fr: 'Un saz, le luth à long manche', nl: 'Een saz, de langhalsluit',
    tr: 'Bir saz', ar: 'ساز، العود طويل العنق',
  },
  ask: {
    en: 'A gazelle', ku: 'Askeke çiyê', ckb: 'ئاسک', de: 'Eine Gazelle', es: 'Una gacela', fr: 'Une gazelle', nl: 'Een gazelle',
    tr: 'Bir ceylan', ar: 'غزال',
  },
  keskesor: {
    en: 'A rainbow over the hills', ku: 'Keskesor li ser giran', ckb: 'پەلکەزێڕینە بەسەر گردەکانەوە', de: 'Ein Regenbogen über den Hügeln',
    es: 'Un arcoíris sobre las colinas', fr: 'Un arc-en-ciel sur les collines', nl: 'Een regenboog boven de heuvels',
    tr: 'Tepelerin üstünde bir gökkuşağı', ar: 'قوس قزح فوق التلال',
  },
  pezkovi: {
    en: 'A wild goat of the Zagros', ku: 'Pezkoviyê Zagrosê', ckb: 'بزنەکێوی زاگرۆس', de: 'Eine Wildziege aus dem Zagros',
    es: 'Una cabra montés de los Zagros', fr: 'Une chèvre sauvage du Zagros', nl: 'Een wilde geit uit het Zagrosgebergte',
    tr: 'Bir Zagros yaban keçisi', ar: 'ماعز جبلي من زاغروس',
  },
  belem: {
    en: 'A rowing boat', ku: 'Belemeke bi bêrikan', ckb: 'بەلەمێکی سەوڵدار', de: 'Ein Ruderboot', es: 'Una barca de remos',
    fr: 'Une barque', nl: 'Een roeiboot', tr: 'Bir kayık', ar: 'قارب تجديف',
  },
  pet: {
    en: 'The Newroz fire', ku: 'Agirê Newrozê', ckb: 'ئاگری نەورۆز', de: 'Das Newroz-Feuer', es: 'El fuego de Newroz',
    fr: 'Le feu de Newroz', nl: 'Het Newrozvuur', tr: 'Newroz ateşi', ar: 'نار نوروز',
  },
  hesp: {
    en: 'A horse', ku: 'Hespekî bedew', ckb: 'ئەسپ', de: 'Ein Pferd', es: 'Un caballo', fr: 'Un cheval', nl: 'Een paard',
    tr: 'Bir at', ar: 'حصان',
  },
  kon: {
    en: 'A nomad’s black tent', ku: 'Kona reş a koçeran', ckb: 'ڕەشماڵ', de: 'Ein schwarzes Nomadenzelt',
    es: 'Una tienda negra de nómadas', fr: 'Une tente noire de nomades', nl: 'Een zwarte nomadententent', tr: 'Bir göçebe kara çadırı',
    ar: 'خيمة سوداء للرحّل',
  },
  mal: {
    en: 'A village house', ku: 'Xaniyekî gund bi banê rast', ckb: 'ماڵێکی گوند', de: 'Ein Dorfhaus', es: 'Una casa de pueblo',
    fr: 'Une maison de village', nl: 'Een dorpshuis', tr: 'Bir köy evi', ar: 'بيت قروي',
  },
  gemi: {
    en: 'A sailing ship', ku: 'Gemiyeke ku bi bayê diçe', ckb: 'کەشتییەکی چارۆکەدار', de: 'Ein Segelschiff', es: 'Un velero',
    fr: 'Un voilier', nl: 'Een zeilschip', tr: 'Bir yelkenli', ar: 'سفينة شراعية',
  },
  kosk: {
    en: 'A stone mansion with arches', ku: 'Koşkeke kevirîn bi kemeran', ckb: 'کۆشکێکی بەردین بە تاقەوە', de: 'Ein Steinhaus mit Bögen',
    es: 'Una mansión de piedra con arcos', fr: 'Une demeure en pierre à arcades', nl: 'Een stenen landhuis met bogen',
    tr: 'Kemerli bir taş köşk', ar: 'قصر حجري بأقواس',
  },
  heyv: {
    en: 'The full moon', ku: 'Heyva çardehê', ckb: 'مانگی چواردە', de: 'Der Vollmond', es: 'La luna llena', fr: 'La pleine lune',
    nl: 'De volle maan', tr: 'Dolunay', ar: 'البدر',
  },
  keleh: {
    en: 'A castle on a hill', ku: 'Keleheke li ser girekî', ckb: 'قەڵایەک لەسەر گردێک', de: 'Eine Burg auf einem Hügel',
    es: 'Un castillo en una colina', fr: 'Un château sur une colline', nl: 'Een kasteel op een heuvel', tr: 'Tepede bir kale',
    ar: 'قلعة على تلّ',
  },
  roj: {
    en: 'The sun', ku: 'Roja ezmên', ckb: 'خۆر', de: 'Die Sonne', es: 'El sol', fr: 'Le soleil', nl: 'De zon', tr: 'Güneş',
    ar: 'الشمس',
  },
  kawa: {
    en: 'Kawa’s hammer', ku: 'Çakûçê Kawayê Hesinkar', ckb: 'چەکوشی کاوەی ئاسنگەر', de: 'Kawas Hammer', es: 'El martillo de Kawa',
    fr: 'Le marteau de Kawa', nl: 'De hamer van Kawa', tr: 'Kawa’nın çekici', ar: 'مطرقة كاوا',
  },
  sahmaran: {
    en: 'A painting of Şahmaran', ku: 'Şahmaran, şahbanûya maran', ckb: 'تابلۆیەکی شاماران', de: 'Ein Gemälde von Şahmaran',
    es: 'Un cuadro de Şahmaran', fr: 'Un tableau de Şahmaran', nl: 'Een schilderij van Şahmaran', tr: 'Bir Şahmeran tablosu',
    ar: 'لوحة لشاهماران',
  },
  kadiz: {
    en: 'The Milky Way', ku: 'Galaksiya me', ckb: 'کاکێشان', de: 'Die Milchstraße', es: 'La Vía Láctea', fr: 'La Voie lactée',
    nl: 'De Melkweg', tr: 'Samanyolu', ar: 'درب التبانة',
  },
};

/**
 * Each gift's own light, for the glow and rays behind it as it is opened (gift-moment.ts): the strongest colour in its
 * picture, made bright. One the pictures do not say (a steel hammer) takes its shelf's, as does a gift added later.
 */
const GLOW: Readonly<Record<string, string>> = {
  cay: '#ea6b52', qehwe: '#daac62', beybun: '#f5be47', sev: '#e86354', 'sev-mexek': '#e8584c', lale: '#ea5f52', gul: '#ec5165', nergiz: '#f5b547',
  kevok: '#e0845d', sosin: '#8a62da', pisik: '#ef964d', kew: '#daae62', semawer: '#e0b45d', def: '#e1b25b',
  'deste-gul': '#dc6075', sterk: '#6270da', kelek: '#daaa62', saz: '#e3ae59', ask: '#a8da62', keskesor: '#f59047',
  pezkovi: '#daac62', belem: '#62b8da', pet: '#f5b847', hesp: '#e0885d', kon: '#daaa62', mal: '#e4a558',
  sahmaran: '#dcaf60', gemi: '#e0b45d', kosk: '#daac62', heyv: '#6278da', keleh: '#daae62', roj: '#f5b247',
  kadiz: '#7062da',
};

/** A shelf's light, for a gift with none of its own; the warm one for anything that is not a gift. */
const GROUP_GLOW: Readonly<Record<GiftGroup, string>> = {
  warm: '#ef9a4d',
  flowers: '#ec5f74',
  animals: '#e8a05a',
  music: '#e3ae59',
  sky: '#f5b847',
  boats: '#62b8da',
  houses: '#e4a558',
  legends: '#f58747',
};

/** The colour a gift glows in as it is opened, by its sku. */
export function giftGlow(sku: string): string {
  const def = giftOfSku(sku);
  if (!def) return GROUP_GLOW.warm;
  return GLOW[def.id] ?? GROUP_GLOW[def.group];
}

/** What a gift means in `locale` (English where the locale is not an interface language), by its sku; null for any other item. */
export function giftMeaning(sku: string, locale: string): string | null {
  const def = giftOfSku(sku);
  const words = def ? MEANINGS[def.id] : undefined;
  if (!words) return null;
  return (words as Partial<Record<string, string>>)[locale] ?? words.en;
}

/** Whether every gift has its meaning in every language, for the tests. */
export function giftMeaningLocales(id: string): string[] {
  return Object.keys(MEANINGS[id] ?? {});
}

/** The gift sheet's shelves: each group in order, its gifts cheapest first, groups with none left out. */
export function giftShelves<T extends { sku: string; price: number }>(items: readonly T[]): Array<{ group: GiftGroup; items: T[] }> {
  return GIFT_GROUPS.map((group) => ({
    group,
    items: items.filter((i) => giftOfSku(i.sku)?.group === group).sort((a, b) => a.price - b.price),
  })).filter((s) => s.items.length > 0);
}

// ─────────────────────────────────────────────────────────────── the gift bag

/**
 * The moments that pay a member Zêr also put a small gift in everyone's gift bag, members and free accounts alike:
 * the daily cycle, a streak milestone, a win online, a quiz night's podium and a tree's harvest. A child's profile gets
 * nothing. What is in the bag can only be given away: never sold, turned into Zêr or traded.
 */
export const BAG_SOURCES = ['daily', 'streak', 'win', 'podium', 'harvest'] as const;
export type BagSource = (typeof BAG_SOURCES)[number];

/** At most this many gifts land in one bag in a UTC day, all sources together. */
export const BAG_GIFTS_PER_DAY = 5;
/** At most this many of any one gift wait in a bag; past it, the next earned gift is another kind or none. */
export const BAG_MAX_EACH = 99;

/** Which earned gift each moment brings, first choice first: tea for the day, coffee for a streak, an apple from the tree. */
const BAG_PREFERENCE: Readonly<Record<BagSource, readonly string[]>> = {
  daily: ['cay', 'qehwe'],
  streak: ['qehwe', 'cay'],
  win: ['cay', 'qehwe'],
  podium: ['beybun', 'qehwe'],
  harvest: ['sev', 'cay'],
};

/**
 * The gift a moment puts in the bag: its first choice that is drawn and not already full in the bag, then any other
 * earned gift that is; null when every one is full. `held` gives how many of a gift the bag holds now.
 */
export function bagGiftFor(source: BagSource, held: (id: string) => number = () => 0): GiftDef | null {
  const earned = GIFTS.filter((g) => g.earnedFree && isGiftArtId(g.id));
  const order = [...BAG_PREFERENCE[source].flatMap((id) => earned.filter((g) => g.id === id)), ...earned];
  return order.find((g) => held(g.id) < BAG_MAX_EACH) ?? null;
}

/** One kind of gift in the bag, as the gift sheet shows it (GET /gifts/catalog, GET /gifts/bag). */
export interface BagEntry {
  sku: string;
  name: string;
  assetUrl: string | null;
  count: number;
}

/** A gift that just landed in the bag, for the one quiet line that says so. */
export interface BagArrival {
  id: string;
  sku: string;
  name: string;
  assetUrl: string | null;
  source: BagSource;
  at: string;
}

/** GET /gifts/bag: what the bag holds, and what landed since it was last looked at. */
export interface GiftBagView {
  items: BagEntry[];
  arrivals: BagArrival[];
  /** whether this account also earns Zêr at these moments, so the apps know whether to say members do */
  earnsZer: boolean;
  /** a known adult, who may be told what Hevalo+ gives; never a guest, a minor or someone of unknown age */
  nudges: boolean;
}
