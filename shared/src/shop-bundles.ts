/**
 * Bundles: a themed set from the shop sold together for less than its parts — a background, a frame, an icon and a word
 * tag that belong together, with a few small gifts for the gift bag. The server keeps each bundle's price and parts
 * (`shop_bundles`) and settles every purchase; this holds what both apps and the server agree on: the price someone
 * pays when they own some of the parts already, the shapes the API answers with, and each bundle's words and light.
 */
import type { AppLocale } from './locales.js';

/** A part as the price sees it: what it costs alone, how many come, and whether the buyer has it already. */
export interface BundlePartPrice {
  price: number;
  quantity: number;
  /** a gift for the bag rather than a cosmetic to wear */
  gift: boolean;
  /** a cosmetic the buyer owns; never true for a gift, since more of one always lands in the bag */
  owned: boolean;
}

/** What one person pays for a bundle, and what that saves on buying what is new to them one by one. */
export interface BundleQuote {
  /** Zêr to pay now */
  price: number;
  /** what the parts new to them cost one by one */
  worth: number;
  /** `worth` less `price`; never below 0 */
  saving: number;
  /** the saving as a whole percent of `worth`, rounded down */
  savingPercent: number;
  /** how many of its cosmetics they own already */
  owned: number;
  /** every cosmetic in it is theirs already, so it is not sold to them */
  complete: boolean;
}

/** A bundle never sells for less than this share of its own price, however much of it someone owns. */
export const BUNDLE_FLOOR_SHARE = 0.2;

/** Zêr amounts a reduced price is rounded up to. */
const STEP = 5;
const roundUp = (zer: number): number => Math.ceil(zer / STEP) * STEP;
const value = (parts: readonly BundlePartPrice[]): number => parts.reduce((sum, p) => sum + p.price * p.quantity, 0);

/**
 * The price for someone who owns some of the cosmetics: the bundle's own rate applied to what is new to them, so owning
 * the dearest part takes the most off; never under `BUNDLE_FLOOR_SHARE` of the bundle's price and never over what the
 * new parts cost one by one. A bundle priced at or over its parts' worth (after an admin's change to a part) sells at
 * their worth, saving nothing.
 */
export function bundleQuote(bundlePrice: number, parts: readonly BundlePartPrice[]): BundleQuote {
  const cosmetics = parts.filter((p) => !p.gift);
  const owned = cosmetics.filter((p) => p.owned).length;
  const complete = cosmetics.length > 0 && owned === cosmetics.length;
  const full = value(parts);
  const worth = value(parts.filter((p) => p.gift || !p.owned));
  let price: number;
  if (complete) price = 0;
  else if (owned === 0 || full <= 0) price = Math.min(bundlePrice, full);
  else price = Math.min(worth, Math.max(roundUp((bundlePrice * worth) / full), roundUp(bundlePrice * BUNDLE_FLOOR_SHARE)));
  const saving = complete ? 0 : Math.max(0, worth - price);
  return { price, worth: complete ? 0 : worth, saving, savingPercent: worth > 0 && !complete ? Math.floor((saving / worth) * 100) : 0, owned, complete };
}

/** A cosmetic in a bundle, as `GET /shop/bundles` lists it for one viewer. */
export interface BundlePartView {
  sku: string;
  name: string;
  /** its English meaning; the apps show it in the reader's language (`shopItemDescription`) */
  description: string | null;
  category: string;
  /** what it costs alone */
  price: number;
  assetUrl: string | null;
  owned: boolean;
}

/** Gifts a bundle puts in the gift bag. */
export interface BundleGiftView {
  sku: string;
  name: string;
  count: number;
  /** what one costs alone */
  price: number;
  assetUrl: string | null;
}

/** One bundle as `GET /shop/bundles` lists it for one viewer. */
export interface BundleView {
  id: string;
  /** Kurmancî, as every app shows it */
  name: string;
  /** the bundle's own price, before anything the viewer owns */
  listPrice: number;
  parts: BundlePartView[];
  gifts: BundleGiftView[];
  /** what this viewer pays and saves */
  quote: BundleQuote;
  /** listed, and every part it would give can be had */
  onSale: boolean;
  /** some of its gifts would not fit in the viewer's gift bag (99 of a kind) */
  bagFull: boolean;
}

/** `GET /shop/bundles`. */
export interface BundlesView {
  bundles: BundleView[];
  /**
   * A known adult, who may be shown what a bundle saves and which saves most. Anyone under 18 or of unknown age sees the
   * same bundles and prices without them (shared gift rules: no purchase nudges to minors).
   */
  nudges: boolean;
}

/** `POST /shop/bundles/purchase`. */
export interface BundlePurchaseResult {
  purchased: true;
  /** this exact request was settled before; nothing moved again */
  duplicate: boolean;
  bundle: string;
  /** Zêr paid */
  price: number;
  balance: number;
  /** the cosmetics it gave, which were new to the buyer */
  granted: string[];
  /** what went into the gift bag */
  gifts: { sku: string; count: number }[];
}

/**
 * The bundle that saves the most, by its computed share, among those on sale and not yet complete; the cheaper on a tie.
 * Null with fewer than two to compare, or when none saves anything.
 */
export function bestValueBundle(bundles: readonly Pick<BundleView, 'id' | 'quote' | 'onSale'>[]): string | null {
  const open = bundles.filter((b) => b.onSale && !b.quote.complete && b.quote.saving > 0);
  if (open.length < 2) return null;
  const best = [...open].sort((a, b) => b.quote.savingPercent - a.quote.savingPercent || a.quote.price - b.quote.price)[0]!;
  return best.id;
}

/** What a bundle's name means and the few words that set its scene, in every interface language. */
interface BundleWords {
  title: string;
  story: string;
}

const WORDS: Readonly<Record<string, Readonly<Record<AppLocale, BundleWords>>>> = {
  cayxane: {
    en: { title: 'The tea house', story: 'A red kilim on the floor, the tea glass never empty and a welcome for everyone who comes in.' },
    ku: { title: 'Çayxane', story: 'Kilîmeke sor li erdê, îstîkana çayê her tijî û ji her kesê ku tê hundir re bi xêr hatî.' },
    ckb: { title: 'چایخانە', story: 'بەڕەیەکی سوور لەسەر زەوی، پیاڵەی چا هەمیشە پڕ و بەخێرهاتن بۆ هەر کەسێک کە دێتە ژوورەوە.' },
    de: { title: 'Das Teehaus', story: 'Ein roter Kelim auf dem Boden, das Teeglas nie leer und ein Willkommen für alle, die hereinkommen.' },
    es: { title: 'La casa de té', story: 'Un kilim rojo en el suelo, el vaso de té nunca vacío y una bienvenida para todo el que entra.' },
    fr: { title: 'La maison de thé', story: 'Un kilim rouge au sol, le verre de thé jamais vide et un accueil pour chaque personne qui entre.' },
    nl: { title: 'Het theehuis', story: 'Een rode kelim op de vloer, het theeglas nooit leeg en een welkom voor iedereen die binnenkomt.' },
    tr: { title: 'Çayhane', story: 'Yerde kırmızı bir kilim, hiç boş kalmayan çay bardağı ve içeri giren herkese bir hoş geldin.' },
    ar: { title: 'بيت الشاي', story: 'كليم أحمر على الأرض، وكأس شاي لا يفرغ، وترحيب بكل من يدخل.' },
  },
  gund: {
    en: { title: 'The village', story: 'Wheat in the fields, a golden evening over the roofs and apples from the orchard to share.' },
    ku: { title: 'Gund', story: 'Genim li zeviyan, êvareke zêrîn li ser banan û sêvên baxçe ji bo parvekirinê.' },
    ckb: { title: 'گوند', story: 'گەنم لە کێڵگەکان، ئێوارەیەکی زێڕین لەسەر بانەکان و سێوی باخ بۆ بەشکردن.' },
    de: { title: 'Das Dorf', story: 'Weizen auf den Feldern, ein goldener Abend über den Dächern und Äpfel aus dem Obstgarten zum Teilen.' },
    es: { title: 'El pueblo', story: 'Trigo en los campos, un atardecer dorado sobre los tejados y manzanas del huerto para compartir.' },
    fr: { title: 'Le village', story: 'Du blé dans les champs, un soir doré sur les toits et des pommes du verger à partager.' },
    nl: { title: 'Het dorp', story: 'Tarwe op de velden, een gouden avond boven de daken en appels uit de boomgaard om te delen.' },
    tr: { title: 'Köy', story: 'Tarlalarda buğday, damların üstünde altın bir akşam ve paylaşmak için bahçeden elmalar.' },
    ar: { title: 'القرية', story: 'قمح في الحقول، ومساء ذهبي فوق السطوح، وتفاح من البستان لتتقاسمه.' },
  },
  baxce: {
    en: { title: 'The garden', story: 'Tulips in rows, a wreath of roses and something small to give the people you love.' },
    ku: { title: 'Baxçe', story: 'Lale rêz bi rêz, xelekeke gulan û tiştekî biçûk ji bo kesên ku tu ji wan hez dikî.' },
    ckb: { title: 'باخچە', story: 'لالە ڕیز بە ڕیز، ئەڵقەیەک لە گوڵ و شتێکی بچووک بۆ ئەوانەی خۆشت دەوێن.' },
    de: { title: 'Der Garten', story: 'Tulpen in Reihen, ein Kranz aus Rosen und eine Kleinigkeit für die Menschen, die du liebst.' },
    es: { title: 'El jardín', story: 'Tulipanes en fila, una corona de rosas y un detalle para la gente que quieres.' },
    fr: { title: 'Le jardin', story: 'Des tulipes en rangs, une couronne de roses et une petite attention pour les gens que tu aimes.' },
    nl: { title: 'De tuin', story: 'Tulpen in rijen, een krans van rozen en iets kleins voor de mensen van wie je houdt.' },
    tr: { title: 'Bahçe', story: 'Sıra sıra laleler, güllerden bir çelenk ve sevdiklerin için küçük bir armağan.' },
    ar: { title: 'الحديقة', story: 'توليب في صفوف، وإكليل من الورد، وهدية صغيرة لمن تحب.' },
  },
  zagros: {
    en: { title: 'The Zagros mountains', story: 'Snow on the peaks, a fawn in the high pastures and a hot tea after the climb.' },
    ku: { title: 'Zagros', story: 'Berf li serê çiyayan, askek li zozanan û çayeke germ piştî hilkişînê.' },
    ckb: { title: 'زاگرۆس', story: 'بەفر لەسەر لووتکەکان، ئاسکێک لە کوێستان و چایەکی گەرم دوای سەرکەوتن.' },
    de: { title: 'Das Zagros-Gebirge', story: 'Schnee auf den Gipfeln, ein Rehkitz auf den Hochweiden und ein heißer Tee nach dem Aufstieg.' },
    es: { title: 'Los montes Zagros', story: 'Nieve en las cumbres, un cervatillo en los pastos altos y un té caliente después de la subida.' },
    fr: { title: 'Les monts Zagros', story: 'De la neige sur les sommets, un faon dans les alpages et un thé chaud après la montée.' },
    nl: { title: 'Het Zagrosgebergte', story: 'Sneeuw op de toppen, een reekalf op de bergweiden en hete thee na de klim.' },
    tr: { title: 'Zagros Dağları', story: 'Zirvelerde kar, yaylada bir yavru geyik ve tırmanıştan sonra sıcak bir çay.' },
    ar: { title: 'جبال زاغروس', story: 'ثلج على القمم، وخشف في المراعي العالية، وشاي ساخن بعد الصعود.' },
  },
  'seva-sterkan': {
    en: { title: 'A night of stars', story: 'The moon slides over the sun and the stars come out: a ring of light round your face.' },
    ku: { title: 'Şeva Stêrkan', story: 'Heyv dikeve ber rojê û stêrk derdikevin: xelekeke ronahiyê li dora rûyê te.' },
    ckb: { title: 'شەوی ئەستێرەکان', story: 'مانگ دەچێتە بەردەم خۆر و ئەستێرەکان دەردەکەون: ئەڵقەیەک لە ڕووناکی بە دەوری ڕووخسارتدا.' },
    de: { title: 'Eine Sternennacht', story: 'Der Mond schiebt sich vor die Sonne, die Sterne gehen auf: ein Ring aus Licht um dein Gesicht.' },
    es: { title: 'Una noche de estrellas', story: 'La luna pasa delante del sol y salen las estrellas: un anillo de luz alrededor de tu cara.' },
    fr: { title: 'Une nuit d’étoiles', story: 'La lune passe devant le soleil et les étoiles s’allument : un anneau de lumière autour de ton visage.' },
    nl: { title: 'Een sterrennacht', story: 'De maan schuift voor de zon en de sterren komen op: een ring van licht om je gezicht.' },
    tr: { title: 'Yıldızlı bir gece', story: 'Ay güneşin önüne geçer, yıldızlar çıkar: yüzünün çevresinde bir ışık halkası.' },
    ar: { title: 'ليلة النجوم', story: 'يمرّ القمر أمام الشمس وتطلع النجوم: حلقة من نور حول وجهك.' },
  },
  newroz: {
    en: { title: 'Newroz', story: 'Fire on the hills, narcissus in every hand and the first day of the new year.' },
    ku: { title: 'Newroz', story: 'Agir li ser giran, nêrgiz di her destî de û roja yekem a sala nû.' },
    ckb: { title: 'نەورۆز', story: 'ئاگر لەسەر گردەکان، نێرگز لە هەموو دەستێک و یەکەم ڕۆژی ساڵی نوێ.' },
    de: { title: 'Newroz', story: 'Feuer auf den Hügeln, Narzissen in jeder Hand und der erste Tag des neuen Jahres.' },
    es: { title: 'Newroz', story: 'Fuego en las colinas, narcisos en cada mano y el primer día del año nuevo.' },
    fr: { title: 'Newroz', story: 'Du feu sur les collines, des narcisses dans chaque main et le premier jour de l’année nouvelle.' },
    nl: { title: 'Newroz', story: 'Vuur op de heuvels, narcissen in elke hand en de eerste dag van het nieuwe jaar.' },
    tr: { title: 'Newroz', story: 'Tepelerde ateş, her elde nergis ve yeni yılın ilk günü.' },
    ar: { title: 'نوروز', story: 'النار على التلال، والنرجس في كل يد، وأول يوم في السنة الجديدة.' },
  },
};

/**
 * A bundle's words in `locale` (English where the locale is not an interface language): the title says what its name
 * means, and is null where it would only repeat the name. Null for a bundle an admin made without words.
 */
export function bundleWords(id: string, name: string, locale: string): { title: string | null; story: string } | null {
  const all = WORDS[id];
  if (!all) return null;
  const words = (all as Partial<Record<string, BundleWords>>)[locale] ?? all.en;
  return { title: words.title.trim().toLowerCase() === name.trim().toLowerCase() ? null : words.title, story: words.story };
}

/** The languages a bundle's words are written in, for the tests. */
export function bundleWordLocales(id: string): string[] {
  return Object.keys(WORDS[id] ?? {});
}

/** The bundles the words are written for. */
export const WORDED_BUNDLES: readonly string[] = Object.keys(WORDS);

/** The colour a bundle's light glows in as it is opened, after what it holds: tea, wheat, roses, snow, starlight, fire. */
const GLOW: Readonly<Record<string, string>> = {
  cayxane: '#e0a15a',
  gund: '#e6bf5c',
  baxce: '#e2607a',
  zagros: '#8fb8de',
  'seva-sterkan': '#a3aefc',
  newroz: '#f58747',
};

/** A bundle's glow, by its id; a warm gold for one without its own. */
export function bundleGlow(id: string): string {
  return GLOW[id] ?? '#e6bf5c';
}
