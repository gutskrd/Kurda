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

import type { AppLocale } from '@kurda/shared';

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

/**
 * The pages' own words — everything that is not the bar or the footer — in all
 * nine of the app's languages.
 *
 * Only Kurmancî and English are published as files (see the top of this file
 * for why). The other seven are what chrome.js swaps in for a reader using the
 * app in them, so that clicking Dictionary from German or Arabic does not turn
 * the page English around the words. The definitions themselves stay as the
 * corpus has them — in English on these pages, in Kurmancî on the others —
 * because no translation of them exists; everything around them is the
 * reader's.
 *
 * Kurmancî and English are read off the two published copies rather than
 * written out a second time, so the files and the swap cannot disagree. The
 * spellings follow the app's catalogues: Kurmandschi and Sorani in German,
 * kurmanji and sorani in Spanish, and so on.
 */
export type PageText = Pick<Copy, 'alphabets' | 'index' | 'letter' | 'words' | 'notFound' | 'pos' | 'rows' | 'root' | 'titleSuffix'> & {
  /** the CC BY-SA sentence, with {wiki} and {licence} as the two link slots */
  licence: string;
};

function pageTextOf(c: Copy): PageText {
  const { alphabets, index, letter, words, notFound, pos, rows, root, titleSuffix } = c;
  return { alphabets, index, letter, words, notFound, pos, rows, root, titleSuffix, licence: c.footer.licence };
}

const DE: PageText = {
  alphabets: { hawar: 'Hawar-Alphabet', sorani: 'Sorani-Alphabet', other: 'Weitere Buchstaben' },
  index: {
    eyebrow: 'Kurdisches Wörterbuch',
    headline: 'Jedes Wort auf Kurmandschi,<br>an einem Ort.',
    lead: 'Bedeutungen, Formen auf Sorani und Arabisch und die Synonyme jedes Wortes — offen für alle. Kein Konto, keine Werbung, nichts wird aufgezeichnet.',
    statWords: 'Wörter',
    statLetters: 'Buchstaben',
    statPages: 'Seiten',
    selected: 'Ausgewählte Wörter',
    about: 'Über das Wörterbuch',
    aboutBody:
      'Dieses Wörterbuch stammt aus dem kurdischen Wiktionary, und jedes Wort hier ist als statische Seite veröffentlicht — deshalb bleibt es kostenlos, ganz gleich, wie viele Menschen es lesen.',
    description: (total) => `${total} kurdische Wörter und ihre Bedeutungen. Kostenlos, ohne Konto, ohne Werbung.`,
  },
  letter: {
    title: (letter) => `Kurdische Wörter, die mit ${letter} beginnen`,
    description: (words, letter) => `${words} kurdische Wörter, die mit ${letter} beginnen, und ihre Bedeutungen.`,
    count: (words, total) => `${words} von ${total} Wörtern`,
  },
  words: {
    count: (n) => `${n} Wörter`,
    all: (letter) => `Alle mit ${letter}`,
    description: (n, first, last) => `${n} kurdische Wörter von ${first} bis ${last} und ihre Bedeutungen — kostenlos und ohne Konto.`,
  },
  notFound: {
    title: 'Diese Seite wurde nicht gefunden',
    heading: 'Diese Seite wurde nicht gefunden.',
    body: 'Vielleicht ist die Adresse veraltet: Wenn das Wörterbuch neu eingelesen wird, wandern Wörter von einer Seite auf eine andere. Die Buchstaben bleiben immer, wo sie sind.',
    action: 'Zum Wörterbuch',
    here: 'Nicht gefunden',
    description: 'Diese Adresse gibt es im Wörterbuch nicht.',
  },
  pos: {
    'Navdêr': 'Substantiv',
    'Formeke navdêrê': 'Substantivform',
    'Lêker': 'Verb',
    'Formeke lêkerê': 'Verbform',
    'Rengdêr': 'Adjektiv',
    'Formeke rengdêrê': 'Adjektivform',
    'Hoker': 'Adverb',
    'Cînav': 'Pronomen',
    'Daçek': 'Adposition',
    'Bazinedaçek': 'Zirkumposition',
    'Girêdek': 'Konjunktion',
    'Baneşan': 'Interjektion',
    'Hejmar': 'Numerale',
    'Pêşgir': 'Präfix',
    'Paşgir': 'Suffix',
    'Serenav': 'Eigenname',
    'Formeke serenavê': 'Eigennamenform',
    'Biwêj': 'Redewendung',
    'Gotineke pêşiyan': 'Sprichwort',
    'Hevok': 'Satz',
    'Kurtenav': 'Abkürzung',
    'Tîp': 'Buchstabe',
    'Pirtik': 'Partikel',
    'Sembol': 'Symbol',
    'Mane': 'Bedeutung',
  },
  rows: { sorani: 'Sorani', arabic: 'Arabisch', synonyms: 'Synonyme' },
  root: 'Wörterbuch',
  titleSuffix: 'Kurdisches Wörterbuch',
  licence: 'Wörter aus {wiki}, lizenziert unter {licence}.',
};

const NL: PageText = {
  alphabets: { hawar: 'Hawar-alfabet', sorani: 'Sorani-alfabet', other: 'Overige letters' },
  index: {
    eyebrow: 'Koerdisch woordenboek',
    headline: 'Elk Kurmanci-woord<br>op één plek.',
    lead: 'Betekenissen, Sorani- en Arabische vormen en de synoniemen van elk woord — open voor iedereen. Geen account, geen advertenties, er wordt niets bijgehouden.',
    statWords: 'woorden',
    statLetters: 'letters',
    statPages: 'pagina’s',
    selected: 'Uitgelichte woorden',
    about: 'Over het woordenboek',
    aboutBody:
      'Dit woordenboek komt uit het Koerdische Wiktionary, en elk woord staat hier als statische pagina — daarom blijft het gratis, hoeveel mensen het ook lezen.',
    description: (total) => `${total} Koerdische woorden en hun betekenis. Gratis, zonder account, zonder advertenties.`,
  },
  letter: {
    title: (letter) => `Koerdische woorden die beginnen met ${letter}`,
    description: (words, letter) => `${words} Koerdische woorden die beginnen met ${letter}, en hun betekenis.`,
    count: (words, total) => `${words} van ${total} woorden`,
  },
  words: {
    count: (n) => `${n} woorden`,
    all: (letter) => `Alles met ${letter}`,
    description: (n, first, last) => `${n} Koerdische woorden van ${first} tot ${last}, en hun betekenis — gratis en zonder account.`,
  },
  notFound: {
    title: 'Deze pagina is niet gevonden',
    heading: 'Deze pagina is niet gevonden.',
    body: 'Misschien is het adres verouderd: als het woordenboek opnieuw wordt ingelezen, verhuizen woorden naar een andere pagina. De letters blijven altijd op hun plek.',
    action: 'Naar het woordenboek',
    here: 'Niet gevonden',
    description: 'Dit adres staat niet in het woordenboek.',
  },
  pos: {
    'Navdêr': 'Zelfstandig naamwoord',
    'Formeke navdêrê': 'Vorm van een zelfstandig naamwoord',
    'Lêker': 'Werkwoord',
    'Formeke lêkerê': 'Werkwoordsvorm',
    'Rengdêr': 'Bijvoeglijk naamwoord',
    'Formeke rengdêrê': 'Vorm van een bijvoeglijk naamwoord',
    'Hoker': 'Bijwoord',
    'Cînav': 'Voornaamwoord',
    'Daçek': 'Adpositie',
    'Bazinedaçek': 'Circumpositie',
    'Girêdek': 'Voegwoord',
    'Baneşan': 'Tussenwerpsel',
    'Hejmar': 'Telwoord',
    'Pêşgir': 'Voorvoegsel',
    'Paşgir': 'Achtervoegsel',
    'Serenav': 'Eigennaam',
    'Formeke serenavê': 'Vorm van een eigennaam',
    'Biwêj': 'Uitdrukking',
    'Gotineke pêşiyan': 'Spreekwoord',
    'Hevok': 'Zin',
    'Kurtenav': 'Afkorting',
    'Tîp': 'Letter',
    'Pirtik': 'Partikel',
    'Sembol': 'Symbool',
    'Mane': 'Betekenis',
  },
  rows: { sorani: 'Sorani', arabic: 'Arabisch', synonyms: 'Synoniemen' },
  root: 'Woordenboek',
  titleSuffix: 'Koerdisch woordenboek',
  licence: 'Woorden uit {wiki}, onder licentie {licence}.',
};

const ES: PageText = {
  alphabets: { hawar: 'Alfabeto hawar', sorani: 'Alfabeto sorani', other: 'Otras letras' },
  index: {
    eyebrow: 'Diccionario kurdo',
    headline: 'Cada palabra en kurmanji,<br>en un solo lugar.',
    lead: 'Significados, formas en sorani y en árabe, y los sinónimos de cada palabra — abierto a todo el mundo. Sin cuenta, sin anuncios, sin registros.',
    statWords: 'palabras',
    statLetters: 'letras',
    statPages: 'páginas',
    selected: 'Palabras destacadas',
    about: 'Sobre el diccionario',
    aboutBody:
      'Este diccionario procede del Wikcionario kurdo, y cada palabra se publica aquí como una página estática; por eso sigue siendo gratis, la lea quien la lea.',
    description: (total) => `${total} palabras kurdas y su significado. Gratis, sin cuenta y sin anuncios.`,
  },
  letter: {
    title: (letter) => `Palabras kurdas que empiezan por ${letter}`,
    description: (words, letter) => `${words} palabras kurdas que empiezan por ${letter}, y su significado.`,
    count: (words, total) => `${words} de ${total} palabras`,
  },
  words: {
    count: (n) => `${n} palabras`,
    all: (letter) => `Todas con ${letter}`,
    description: (n, first, last) => `${n} palabras kurdas de ${first} a ${last}, y su significado — gratis y sin cuenta.`,
  },
  notFound: {
    title: 'No se ha encontrado esta página',
    heading: 'No se ha encontrado esta página.',
    body: 'Puede que la dirección sea antigua: cuando el diccionario se vuelve a importar, las palabras pasan de una página a otra. Las letras nunca cambian de sitio.',
    action: 'Ir al diccionario',
    here: 'No encontrada',
    description: 'Esta dirección no está en el diccionario.',
  },
  pos: {
    'Navdêr': 'Sustantivo',
    'Formeke navdêrê': 'Forma de sustantivo',
    'Lêker': 'Verbo',
    'Formeke lêkerê': 'Forma verbal',
    'Rengdêr': 'Adjetivo',
    'Formeke rengdêrê': 'Forma de adjetivo',
    'Hoker': 'Adverbio',
    'Cînav': 'Pronombre',
    'Daçek': 'Adposición',
    'Bazinedaçek': 'Circumposición',
    'Girêdek': 'Conjunción',
    'Baneşan': 'Interjección',
    'Hejmar': 'Numeral',
    'Pêşgir': 'Prefijo',
    'Paşgir': 'Sufijo',
    'Serenav': 'Nombre propio',
    'Formeke serenavê': 'Forma de nombre propio',
    'Biwêj': 'Locución',
    'Gotineke pêşiyan': 'Refrán',
    'Hevok': 'Oración',
    'Kurtenav': 'Abreviatura',
    'Tîp': 'Letra',
    'Pirtik': 'Partícula',
    'Sembol': 'Símbolo',
    'Mane': 'Significado',
  },
  rows: { sorani: 'Sorani', arabic: 'Árabe', synonyms: 'Sinónimos' },
  root: 'Diccionario',
  titleSuffix: 'Diccionario kurdo',
  licence: 'Palabras de {wiki}, con licencia {licence}.',
};

const FR: PageText = {
  alphabets: { hawar: 'Alphabet hawar', sorani: 'Alphabet sorani', other: 'Autres lettres' },
  index: {
    eyebrow: 'Dictionnaire kurde',
    headline: 'Chaque mot kurmandji,<br>au même endroit.',
    lead: 'Les sens, les formes en sorani et en arabe, et les synonymes de chaque mot — ouvert à tous. Pas de compte, pas de publicité, rien n’est enregistré.',
    statWords: 'mots',
    statLetters: 'lettres',
    statPages: 'pages',
    selected: 'Mots choisis',
    about: 'À propos du dictionnaire',
    aboutBody:
      'Ce dictionnaire provient du Wiktionnaire kurde, et chaque mot y est publié sous forme de page statique — c’est pourquoi il reste gratuit, quel que soit le nombre de lecteurs.',
    description: (total) => `${total} mots kurdes et leur sens. Gratuit, sans compte, sans publicité.`,
  },
  letter: {
    title: (letter) => `Mots kurdes commençant par ${letter}`,
    description: (words, letter) => `${words} mots kurdes commençant par ${letter}, et leur sens.`,
    count: (words, total) => `${words} mots sur ${total}`,
  },
  words: {
    count: (n) => `${n} mots`,
    all: (letter) => `Tous les mots en ${letter}`,
    description: (n, first, last) => `${n} mots kurdes de ${first} à ${last}, et leur sens — gratuit et sans compte.`,
  },
  notFound: {
    title: 'Page introuvable',
    heading: 'Cette page est introuvable.',
    body: 'L’adresse est peut-être ancienne : quand le dictionnaire est réimporté, les mots changent de page. Les lettres, elles, ne bougent jamais.',
    action: 'Aller au dictionnaire',
    here: 'Introuvable',
    description: 'Cette adresse n’existe pas dans le dictionnaire.',
  },
  pos: {
    'Navdêr': 'Nom',
    'Formeke navdêrê': 'Forme nominale',
    'Lêker': 'Verbe',
    'Formeke lêkerê': 'Forme verbale',
    'Rengdêr': 'Adjectif',
    'Formeke rengdêrê': 'Forme adjectivale',
    'Hoker': 'Adverbe',
    'Cînav': 'Pronom',
    'Daçek': 'Adposition',
    'Bazinedaçek': 'Circumposition',
    'Girêdek': 'Conjonction',
    'Baneşan': 'Interjection',
    'Hejmar': 'Numéral',
    'Pêşgir': 'Préfixe',
    'Paşgir': 'Suffixe',
    'Serenav': 'Nom propre',
    'Formeke serenavê': 'Forme de nom propre',
    'Biwêj': 'Locution',
    'Gotineke pêşiyan': 'Proverbe',
    'Hevok': 'Phrase',
    'Kurtenav': 'Abréviation',
    'Tîp': 'Lettre',
    'Pirtik': 'Particule',
    'Sembol': 'Symbole',
    'Mane': 'Sens',
  },
  rows: { sorani: 'Sorani', arabic: 'Arabe', synonyms: 'Synonymes' },
  root: 'Dictionnaire',
  titleSuffix: 'Dictionnaire kurde',
  licence: 'Mots issus de {wiki}, sous licence {licence}.',
};

const TR: PageText = {
  alphabets: { hawar: 'Hawar alfabesi', sorani: 'Soranice alfabesi', other: 'Diğer harfler' },
  index: {
    eyebrow: 'Kürtçe sözlük',
    headline: 'Bütün Kurmanci kelimeler<br>tek bir yerde.',
    lead: 'Her kelimenin anlamları, Soranice ve Arapça biçimleri ve eş anlamlıları — herkese açık. Hesap yok, reklam yok, hiçbir şey kaydedilmez.',
    statWords: 'kelime',
    statLetters: 'harf',
    statPages: 'sayfa',
    selected: 'Seçme kelimeler',
    about: 'Sözlük hakkında',
    aboutBody:
      'Bu sözlük Kürtçe Vikisözlük’ten gelir ve buradaki her kelime statik bir sayfa olarak yayımlanır — bu yüzden kaç kişi okursa okusun ücretsiz kalır.',
    description: (total) => `${total} Kürtçe kelime ve anlamları. Ücretsiz, hesapsız, reklamsız.`,
  },
  letter: {
    title: (letter) => `${letter} ile başlayan Kürtçe kelimeler`,
    description: (words, letter) => `${letter} ile başlayan ${words} Kürtçe kelime ve anlamları.`,
    count: (words, total) => `${total} kelimeden ${words}`,
  },
  words: {
    count: (n) => `${n} kelime`,
    all: (letter) => `${letter} harfinin tümü`,
    description: (n, first, last) => `${first} ile ${last} arasındaki ${n} Kürtçe kelime ve anlamları — ücretsiz ve hesapsız.`,
  },
  notFound: {
    title: 'Bu sayfa bulunamadı',
    heading: 'Bu sayfa bulunamadı.',
    body: 'Adres eski olabilir: sözlük yeniden içe aktarıldığında kelimeler bir sayfadan diğerine taşınır. Harfler ise hep yerinde kalır.',
    action: 'Sözlüğe git',
    here: 'Bulunamadı',
    description: 'Bu adres sözlükte yok.',
  },
  pos: {
    'Navdêr': 'İsim',
    'Formeke navdêrê': 'İsim biçimi',
    'Lêker': 'Fiil',
    'Formeke lêkerê': 'Fiil biçimi',
    'Rengdêr': 'Sıfat',
    'Formeke rengdêrê': 'Sıfat biçimi',
    'Hoker': 'Zarf',
    'Cînav': 'Zamir',
    'Daçek': 'İlgeç',
    'Bazinedaçek': 'Çevreleyen ilgeç',
    'Girêdek': 'Bağlaç',
    'Baneşan': 'Ünlem',
    'Hejmar': 'Sayı',
    'Pêşgir': 'Önek',
    'Paşgir': 'Sonek',
    'Serenav': 'Özel isim',
    'Formeke serenavê': 'Özel isim biçimi',
    'Biwêj': 'Deyim',
    'Gotineke pêşiyan': 'Atasözü',
    'Hevok': 'Cümle',
    'Kurtenav': 'Kısaltma',
    'Tîp': 'Harf',
    'Pirtik': 'Parçacık',
    'Sembol': 'Sembol',
    'Mane': 'Anlam',
  },
  rows: { sorani: 'Soranice', arabic: 'Arapça', synonyms: 'Eş anlamlılar' },
  root: 'Sözlük',
  titleSuffix: 'Kürtçe sözlük',
  licence: 'Kelimeler {wiki} kaynaklıdır, {licence} lisanslıdır.',
};

const AR: PageText = {
  alphabets: { hawar: 'أبجدية هاوار', sorani: 'الأبجدية السورانية', other: 'حروف أخرى' },
  index: {
    eyebrow: 'قاموس كردي',
    headline: 'كل كلمات الكرمانجية<br>في مكان واحد.',
    lead: 'المعاني، والصيغ السورانية والعربية، ومرادفات كل كلمة — متاح للجميع. لا حساب، ولا إعلانات، ولا يُسجَّل شيء.',
    statWords: 'كلمة',
    statLetters: 'حرف',
    statPages: 'صفحة',
    selected: 'كلمات مختارة',
    about: 'عن القاموس',
    aboutBody: 'هذا القاموس مأخوذ من ويكاموس الكردي، وكل كلمة فيه منشورة كصفحة ثابتة — ولهذا يبقى مجانيًا مهما كثر قرّاؤه.',
    description: (total) => `${total} كلمة كردية ومعانيها. مجاني، بلا حساب ولا إعلانات.`,
  },
  letter: {
    title: (letter) => `كلمات كردية تبدأ بحرف ${letter}`,
    description: (words, letter) => `${words} كلمة كردية تبدأ بحرف ${letter}، ومعانيها.`,
    count: (words, total) => `${words} كلمة من ${total}`,
  },
  words: {
    count: (n) => `${n} كلمة`,
    all: (letter) => `كل كلمات ${letter}`,
    description: (n, first, last) => `${n} كلمة كردية من ${first} إلى ${last}، ومعانيها — مجانًا وبلا حساب.`,
  },
  notFound: {
    title: 'لم يتم العثور على هذه الصفحة',
    heading: 'لم يتم العثور على هذه الصفحة.',
    body: 'ربما يكون العنوان قديمًا: عند إعادة استيراد القاموس تنتقل الكلمات من صفحة إلى أخرى. أما الحروف فلا تتغير أماكنها أبدًا.',
    action: 'اذهب إلى القاموس',
    here: 'غير موجودة',
    description: 'هذا العنوان غير موجود في القاموس.',
  },
  pos: {
    'Navdêr': 'اسم',
    'Formeke navdêrê': 'صيغة اسمية',
    'Lêker': 'فعل',
    'Formeke lêkerê': 'صيغة فعلية',
    'Rengdêr': 'صفة',
    'Formeke rengdêrê': 'صيغة الصفة',
    'Hoker': 'ظرف',
    'Cînav': 'ضمير',
    'Daçek': 'حرف جر',
    'Bazinedaçek': 'حرف جر محيط',
    'Girêdek': 'حرف عطف',
    'Baneşan': 'أداة تعجب',
    'Hejmar': 'عدد',
    'Pêşgir': 'سابقة',
    'Paşgir': 'لاحقة',
    'Serenav': 'اسم علم',
    'Formeke serenavê': 'صيغة اسم العلم',
    'Biwêj': 'تعبير اصطلاحي',
    'Gotineke pêşiyan': 'مثل شعبي',
    'Hevok': 'جملة',
    'Kurtenav': 'اختصار',
    'Tîp': 'حرف',
    'Pirtik': 'أداة',
    'Sembol': 'رمز',
    'Mane': 'معنى',
  },
  rows: { sorani: 'السورانية', arabic: 'العربية', synonyms: 'مرادفات' },
  root: 'القاموس',
  titleSuffix: 'قاموس كردي',
  licence: 'الكلمات من {wiki}، بترخيص {licence}.',
};

const CKB: PageText = {
  alphabets: { hawar: 'ئەلفوبێی هاوار', sorani: 'ئەلفوبێی سۆرانی', other: 'پیتەکانی تر' },
  index: {
    eyebrow: 'فەرهەنگی کوردی',
    headline: 'هەموو وشەکانی کورمانجی<br>لە یەک شوێندا.',
    lead: 'واتاکان، شێوە سۆرانی و عەرەبییەکان، و هاوواتاکانی هەموو وشەیەک — بۆ هەمووان کراوەیە. نە هەژمار، نە ڕیکلام، هیچ شتێک تۆمار ناکرێت.',
    statWords: 'وشە',
    statLetters: 'پیت',
    statPages: 'پەڕە',
    selected: 'وشە هەڵبژێردراوەکان',
    about: 'دەربارەی فەرهەنگ',
    aboutBody:
      'ئەم فەرهەنگە لە ویکیفەرهەنگی کوردییەوە هاتووە، و هەموو وشەیەک لێرە وەک پەڕەیەکی جێگیر بڵاو دەکرێتەوە — بۆیە بێبەرامبەر دەمێنێتەوە، هەرچەند کەس بیخوێنێتەوە.',
    description: (total) => `${total} وشەی کوردی و واتاکانیان. بێبەرامبەر، بێ هەژمار و بێ ڕیکلام.`,
  },
  letter: {
    title: (letter) => `وشە کوردییەکان کە بە ${letter} دەست پێ دەکەن`,
    description: (words, letter) => `${words} وشەی کوردی کە بە ${letter} دەست پێ دەکەن، و واتاکانیان.`,
    count: (words, total) => `${words} وشە لە ${total}`,
  },
  words: {
    count: (n) => `${n} وشە`,
    all: (letter) => `هەموو ${letter}`,
    description: (n, first, last) => `${n} وشەی کوردی لە ${first} تا ${last}، و واتاکانیان — بێبەرامبەر و بێ هەژمار.`,
  },
  notFound: {
    title: 'ئەم پەڕەیە نەدۆزرایەوە',
    heading: 'ئەم پەڕەیە نەدۆزرایەوە.',
    body: 'لەوانەیە ئەم ناونیشانە کۆن بێت: کاتێک فەرهەنگەکە دووبارە هاوردە دەکرێتەوە، وشەکان لە پەڕەیەکەوە دەچنە پەڕەیەکی تر. پیتەکان هەرگیز جێیان ناگۆڕێت.',
    action: 'بڕۆ بۆ فەرهەنگ',
    here: 'نەدۆزرایەوە',
    description: 'ئەم ناونیشانە لە فەرهەنگدا نییە.',
  },
  pos: {
    'Navdêr': 'ناو',
    'Formeke navdêrê': 'شێوەی ناو',
    'Lêker': 'کردار',
    'Formeke lêkerê': 'شێوەی کردار',
    'Rengdêr': 'ئاوەڵناو',
    'Formeke rengdêrê': 'شێوەی ئاوەڵناو',
    'Hoker': 'ئاوەڵکردار',
    'Cînav': 'جێناو',
    'Daçek': 'ئامراز',
    'Bazinedaçek': 'ئامرازی دەوروبەر',
    'Girêdek': 'ئامرازی پەیوەندی',
    'Baneşan': 'ئامرازی سەرسوڕمان',
    'Hejmar': 'ژمارە',
    'Pêşgir': 'پێشگر',
    'Paşgir': 'پاشگر',
    'Serenav': 'ناوی تایبەت',
    'Formeke serenavê': 'شێوەی ناوی تایبەت',
    'Biwêj': 'دەستەواژە',
    'Gotineke pêşiyan': 'پەندی پێشینان',
    'Hevok': 'ڕستە',
    'Kurtenav': 'کورتکراوە',
    'Tîp': 'پیت',
    'Pirtik': 'وردە ئامراز',
    'Sembol': 'هێما',
    'Mane': 'واتا',
  },
  rows: { sorani: 'سۆرانی', arabic: 'عەرەبی', synonyms: 'هاوواتاکان' },
  root: 'فەرهەنگ',
  titleSuffix: 'فەرهەنگی کوردی',
  licence: 'وشەکان لە {wiki}ەوەن، بە مۆڵەتی {licence}.',
};

export const PAGE_TEXT: Record<AppLocale, PageText> = {
  ku: pageTextOf(KU),
  ckb: CKB,
  en: pageTextOf(EN),
  nl: NL,
  de: DE,
  es: ES,
  fr: FR,
  tr: TR,
  ar: AR,
};
