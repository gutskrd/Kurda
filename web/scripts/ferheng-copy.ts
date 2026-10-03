/**
 * The dictionary's chrome, in the two languages it is published in.
 *
 * ── why the pages were only Kurmancî, and why that was wrong ─────────────
 *
 * The words in this dictionary are Kurdish and always will be — that is the
 * dictionary. The bar above them, the footer below them and the labels around
 * them are not: they belong to whoever is reading. Clicking Ferheng in an app
 * set to English turned the whole screen Kurmancî, which reads as having left
 * the product rather than having opened a page of it.
 *
 * ── why two languages and not nine ──────────────────────────────────────
 *
 * The app speaks nine. These pages are files, and there are 3,360 of them per
 * language: nine would be 30,240 against a 20,000-file deployment limit, so the
 * choice is not between two and nine, it is between two and none.
 *
 * Which two follows the precedent already set for email in
 * `api/src/email/templates.ts`: Kurmancî for a reader who chose Kurmancî,
 * English for everyone else, because English is the catalogue every other
 * locale falls back to anyway. A reader of Soranî is not served by Kurmancî in
 * a script they may not read. Each becomes its own set the day the file budget
 * and the copy both exist.
 *
 * ── why the paths differ rather than nesting ────────────────────────────
 *
 * `/ferheng/` and `/dictionary/`, two siblings, rather than `/ferheng/en/`.
 * Everything one level under `/ferheng/` is a letter or a range of words, and
 * those names come from the corpus: `ku` and `en` are both plausible range
 * names, so a locale segment there is a collision waiting for the next import
 * to produce it. A sibling path cannot collide with anything.
 *
 * It also keeps every `/ferheng/` URL already indexed, linked or bookmarked
 * exactly where it was.
 */

export const FERHENG_LOCALES = ['ku', 'en'] as const;
export type FerhengLocale = (typeof FERHENG_LOCALES)[number];

export interface Copy {
  /** the single path segment these pages live under */
  base: string;
  /** what `<html lang>` says; the words themselves are marked Kurdish inline */
  htmlLang: string;
  nav: {
    home: string;
    dictionary: string;
    games: string;
    rankings: string;
    login: string;
    register: string;
    menu: string;
  };
  footer: {
    tagline: string;
    learn: string;
    lessons: string;
    community: string;
    join: string;
    app: string;
    ios: string;
    android: string;
    /** the CC BY-SA sentence, with {wiki} and {licence} as the two link slots */
    licence: string;
    /** the imprint beside the copyright line */
    byZagrosian: string;
  };
  /** the three alphabets, in the order they are listed */
  alphabets: { hawar: string; sorani: string; other: string };
  index: {
    eyebrow: string;
    headline: string;
    lead: string;
    statWords: string;
    statLetters: string;
    statPages: string;
    selected: string;
    about: string;
    aboutBody: string;
    description: (total: string) => string;
  };
  letter: {
    title: (letter: string) => string;
    description: (words: string, letter: string) => string;
    count: (words: string, total: string) => string;
  };
  words: {
    count: (n: number) => string;
    all: (letter: string) => string;
    description: (n: number, first: string, last: string) => string;
  };
  notFound: { title: string; heading: string; body: string; action: string; here: string; description: string };
  /**
   * The corpus's own part-of-speech labels, turned into this language.
   *
   * These come from the source as Kurmancî — `Navdêr`, `Formeke navdêrê` — and
   * on a Kurmancî page that is exactly right. On an English page it is the one
   * piece of chrome left in the wrong language, sitting in the margin of every
   * entry. Anything not listed falls through as the source wrote it, which is
   * better than guessing at a label nobody has translated.
   */
  pos: Record<string, string>;
  /** the labelled rows under an entry that are ours rather than the corpus's */
  rows: { sorani: string; arabic: string; synonyms: string };
  /** what the breadcrumb calls the dictionary's own root */
  root: string;
  /** the `· Ferhenga kurdî` tail every page title carries */
  titleSuffix: string;
}

const KU: Copy = {
  base: 'ferheng',
  htmlLang: 'ku',
  nav: {
    home: 'Mal',
    dictionary: 'Ferheng',
    games: 'Lîstik',
    rankings: 'Rêzbendî',
    login: 'Têkeve',
    register: 'Dest pê bike',
    menu: 'Menû',
  },
  footer: {
    tagline: 'Fêrî kurdî bibe — ders, çîrok, helbest û lîstik.',
    learn: 'Fêrbûn',
    lessons: 'Ders',
    community: 'Civak',
    join: 'Tevlî Hevalo bibe',
    app: 'Sepan',
    ios: 'iOS (di rê de)',
    android: 'Android (di rê de)',
    licence: 'Peyv ji {wiki}, bi lîsansa {licence}.',
    byZagrosian: 'Berhemeke Zagrosian',
  },
  alphabets: { hawar: 'Alfabeya Hawarê', sorani: 'Alfabeya Soranî', other: 'Tîpên din' },
  index: {
    eyebrow: 'Ferhenga kurdî',
    headline: 'Hemû peyvên<br>kurmancî, li vir.',
    lead: 'Wate, formên soranî û erebî, û hevmaneyên her peyvê — vekirî ji her kesî re. Ne hesab, ne reklam, ne tomarkirin.',
    statWords: 'peyv',
    statLetters: 'tîp',
    statPages: 'rûpel',
    selected: 'Peyvên hilbijartî',
    about: 'Derbarê',
    aboutBody:
      'Ev ferheng ji Wîkîferhenga kurdî tê, û her peyv li vir wekî rûpeleke statîk tê weşandin — ji ber vê yekê ew her û her belaş e, çiqas kes jî wê bixwîne.',
    description: (total) => `${total} peyvên kurdî bi wateyên wan. Belaş, bê hesab û bê reklam.`,
  },
  letter: {
    title: (letter) => `Peyvên kurdî bi tîpa ${letter}`,
    description: (words, letter) => `${words} peyvên kurdî ku bi ${letter} dest pê dikin, bi wateyên wan.`,
    count: (words, total) => `${words} peyv ji ${total}`,
  },
  words: {
    count: (n) => `${n} peyv`,
    all: (letter) => `Hemû ${letter}`,
    description: (n, first, last) =>
      `${n} peyvên kurdî ji ${first} heta ${last}, bi wateyên wan — belaş û bê hesab.`,
  },
  notFound: {
    title: 'Ev rûpel nehat dîtin',
    heading: 'Ev rûpel nehat dîtin.',
    body: 'Dibe ku ev navnîşan kevn be: gava ferheng ji nû ve tê barkirin, peyv ji rûpelekê diçin rûpeleke din. Tîp her tim li cihê xwe dimînin.',
    action: 'Here ferhengê',
    here: 'Nehat dîtin',
    description: 'Ev navnîşan di ferhengê de nîne.',
  },
  // the source already writes them in Kurmancî
  pos: {},
  rows: { sorani: 'Soranî', arabic: 'Erebî', synonyms: 'Hevmane' },
  root: 'Ferheng',
  titleSuffix: 'Ferhenga kurdî',
};

const EN: Copy = {
  base: 'dictionary',
  htmlLang: 'en',
  nav: {
    home: 'Home',
    dictionary: 'Dictionary',
    games: 'Games',
    rankings: 'Rankings',
    login: 'Log in',
    register: 'Get started',
    menu: 'Menu',
  },
  footer: {
    tagline: 'Learn Kurdish — lessons, stories, poems and play.',
    learn: 'Learn',
    lessons: 'Lessons',
    community: 'Community',
    join: 'Join Hevalo',
    app: 'App',
    ios: 'iOS (coming soon)',
    android: 'Android (coming soon)',
    licence: 'Words from {wiki}, licensed {licence}.',
    byZagrosian: 'A Zagrosian product',
  },
  alphabets: { hawar: 'Hawar alphabet', sorani: 'Sorani alphabet', other: 'Other letters' },
  index: {
    eyebrow: 'Kurdish dictionary',
    headline: 'Every Kurmancî<br>word, in one place.',
    lead: 'Meanings, Soranî and Arabic forms, and the synonyms of every word — open to everyone. No account, no adverts, nothing recorded.',
    statWords: 'words',
    statLetters: 'letters',
    statPages: 'pages',
    selected: 'Selected words',
    about: 'About',
    aboutBody:
      'This dictionary comes from the Kurdish Wiktionary, and every word here is published as a static page — which is why it stays free however many people read it.',
    description: (total) => `${total} Kurdish words and what they mean. Free, no account, no adverts.`,
  },
  letter: {
    title: (letter) => `Kurdish words beginning with ${letter}`,
    description: (words, letter) => `${words} Kurdish words beginning with ${letter}, and what they mean.`,
    count: (words, total) => `${words} words of ${total}`,
  },
  words: {
    count: (n) => `${n} words`,
    all: (letter) => `All ${letter}`,
    description: (n, first, last) =>
      `${n} Kurdish words from ${first} to ${last}, and what they mean — free and without an account.`,
  },
  notFound: {
    title: 'This page was not found',
    heading: 'This page was not found.',
    body: 'The address may be an old one: when the dictionary is re-imported, words move from one page to another. The letters never move.',
    action: 'Go to the dictionary',
    here: 'Not found',
    description: 'This address is not in the dictionary.',
  },
  /* every label the corpus used across a 44,000-row sample; the two "Formeke"
     ones alone are 55% of it */
  pos: {
    'Navdêr': 'Noun',
    'Formeke navdêrê': 'Noun form',
    'Lêker': 'Verb',
    'Formeke lêkerê': 'Verb form',
    'Rengdêr': 'Adjective',
    'Formeke rengdêrê': 'Adjective form',
    'Hoker': 'Adverb',
    'Cînav': 'Pronoun',
    'Daçek': 'Adposition',
    'Bazinedaçek': 'Circumposition',
    'Girêdek': 'Conjunction',
    'Baneşan': 'Interjection',
    'Hejmar': 'Numeral',
    'Pêşgir': 'Prefix',
    'Paşgir': 'Suffix',
    'Serenav': 'Proper noun',
    'Formeke serenavê': 'Proper-noun form',
    'Biwêj': 'Idiom',
    'Gotineke pêşiyan': 'Proverb',
    'Hevok': 'Sentence',
    'Kurtenav': 'Abbreviation',
    'Tîp': 'Letter',
    'Pirtik': 'Particle',
    'Sembol': 'Symbol',
    'Mane': 'Meaning',
  },
  rows: { sorani: 'Sorani', arabic: 'Arabic', synonyms: 'Synonyms' },
  root: 'Dictionary',
  titleSuffix: 'Kurdish dictionary',
};

export const COPY: Record<FerhengLocale, Copy> = { ku: KU, en: EN };

/**
 * Which published set a reader gets, from the nine the app speaks.
 *
 * The same rule `emailLocaleFor` uses, and for the same reason: Kurmancî for a
 * reader who chose Kurmancî, English for everyone else, because English is what
 * every other locale already falls back to.
 */
export function ferhengLocaleFor(locale: string | null | undefined): FerhengLocale {
  return locale === 'ku' ? 'ku' : 'en';
}
