import type { AppLocale } from '@kurda/shared';

/**
 * The two Kurdish alphabets, for somebody meeting them for the first time.
 *
 * ── how it teaches, and why ───────────────────────────────────────────────
 *
 * Not as thirty-one letters of equal weight. A beginner already reads most of
 * Kurmancî: the letters are Latin and most of them sound the way the reader's
 * own language says them. What trips people up is a small set — the letters
 * they know that sound different (Kurmancî `c` is English "j") and the few
 * they have never seen. So the letters are sorted against the reader's own
 * language: the ones that work the same, the false friends, and the new ones
 * (contrastive analysis; attention goes where the difference is, which is the
 * "noticing" a learner needs before a sound sticks).
 *
 * Every letter is tied to something already known: a word in the reader's
 * language with the same sound in it, and one Kurdish word to remember the
 * letter by — the keyword mnemonic that letter–sound teaching has used for
 * decades because it works. The Kurdish word marks the letter, so the eye
 * meets the shape and the sound together.
 *
 * The two scripts are bridged letter by letter. A great many Kurds read one
 * and not the other — Kurmancî in Latin letters, Soranî in Arabic script —
 * and the shortest way in to the second is through the partner of each letter
 * in the first.
 *
 * Sounds are described, never faked: there is no Kurdish voice in any
 * browser's speech synthesis, and a Turkish or Persian voice reading Kurdish
 * would teach the wrong sound with confidence.
 *
 * ── the data ──────────────────────────────────────────────────────────────
 *
 * A comparison is a word with the sound in square brackets — `[j]am` — or, where
 * the reader's language has no such sound, a short description of how to make
 * it. The Kurdish example words are ordinary, everyday words chosen so the
 * letter is easy to find in them.
 */

/** Languages a sound is compared against. Kurdish readers are shown the other script instead. */
export type CompareLocale = 'en' | 'de' | 'nl' | 'fr' | 'es' | 'tr' | 'ar';
export const COMPARE_LOCALES: readonly CompareLocale[] = ['en', 'de', 'nl', 'fr', 'es', 'tr', 'ar'];

export function compareLocaleOf(locale: AppLocale): CompareLocale | null {
  return (COMPARE_LOCALES as readonly string[]).includes(locale) ? (locale as CompareLocale) : null;
}

/** How a Kurmancî letter sits against the reader's own language. */
export type Band = 'same' | 'watch' | 'new';

export type Meaning =
  | 'water' | 'father' | 'neighbour' | 'eye' | 'hand' | 'i' | 'evening' | 'fruit' | 'rose' | 'horse'
  | 'heart' | 'today' | 'woman' | 'boy' | 'lip' | 'home' | 'bread' | 'day' | 'book' | 'pen' | 'road'
  | 'apple' | 'milk' | 'sunshine' | 'two' | 'face' | 'love' | 'homeland' | 'sister' | 'one' | 'language'
  | 'tree' | 'cat' | 'you' | 'beautiful' | 'seven' | 'city' | 'garden' | 'elephant' | 'video' | 'wing'
  | 'friend' | 'far' | 'sun';

/** Sounds that only the Soranî alphabet writes with a letter of their own. */
export type ExtraSound = 'ḧ' | 'ʿ' | 'ẍ' | 'ł' | 'ř' | 'hamza';

export interface LatinLetter {
  /** the lowercase letter, which is also its id */
  id: string;
  upper: string;
  ipa: string;
  vowel: boolean;
  /** its partner in Soranî; null for the short i, which Soranî does not write */
  sorani: string | null;
  word: string;
  meaning: Meaning;
  /** a second thing worth knowing about this letter */
  note?: 'rolled' | 'long' | 'notInSorani';
}

export interface SoraniLetter {
  id: string;
  char: string;
  /** its Kurmancî partner, whose sound it shares; null for the vowel carrier */
  latin: string | null;
  /** for the sounds Kurmancî writes only in its extended spelling */
  extra?: ExtraSound;
  ipa: string;
  kind: 'vowel' | 'consonant' | 'throat';
  /** whether it joins the letter after it; the rest join only the one before */
  joins: boolean;
  /** only in Kurdish, not in the Arabic alphabet */
  kurdishOnly?: boolean;
  word: string;
  meaning: Meaning;
  /** و and ی are vowels as well as consonants */
  alsoVowel?: { latin: string; word: string };
}

export const LATIN: readonly LatinLetter[] = [
  { id: 'a', upper: 'A', ipa: 'aː', vowel: true, sorani: 'ا', word: 'av', meaning: 'water' },
  { id: 'b', upper: 'B', ipa: 'b', vowel: false, sorani: 'ب', word: 'bav', meaning: 'father' },
  { id: 'c', upper: 'C', ipa: 'dʒ', vowel: false, sorani: 'ج', word: 'cîran', meaning: 'neighbour' },
  { id: 'ç', upper: 'Ç', ipa: 'tʃ', vowel: false, sorani: 'چ', word: 'çav', meaning: 'eye' },
  { id: 'd', upper: 'D', ipa: 'd', vowel: false, sorani: 'د', word: 'dest', meaning: 'hand' },
  { id: 'e', upper: 'E', ipa: 'ɛ', vowel: true, sorani: 'ە', word: 'ez', meaning: 'i' },
  { id: 'ê', upper: 'Ê', ipa: 'eː', vowel: true, sorani: 'ێ', word: 'êvar', meaning: 'evening' },
  { id: 'f', upper: 'F', ipa: 'f', vowel: false, sorani: 'ف', word: 'fêkî', meaning: 'fruit' },
  { id: 'g', upper: 'G', ipa: 'g', vowel: false, sorani: 'گ', word: 'gul', meaning: 'rose' },
  { id: 'h', upper: 'H', ipa: 'h', vowel: false, sorani: 'ھ', word: 'hesp', meaning: 'horse' },
  { id: 'i', upper: 'I', ipa: 'ɨ', vowel: true, sorani: null, word: 'dil', meaning: 'heart', note: 'notInSorani' },
  { id: 'î', upper: 'Î', ipa: 'iː', vowel: true, sorani: 'ی', word: 'îro', meaning: 'today', note: 'long' },
  { id: 'j', upper: 'J', ipa: 'ʒ', vowel: false, sorani: 'ژ', word: 'jin', meaning: 'woman' },
  { id: 'k', upper: 'K', ipa: 'k', vowel: false, sorani: 'ک', word: 'kur', meaning: 'boy' },
  { id: 'l', upper: 'L', ipa: 'l', vowel: false, sorani: 'ل', word: 'lêv', meaning: 'lip' },
  { id: 'm', upper: 'M', ipa: 'm', vowel: false, sorani: 'م', word: 'mal', meaning: 'home' },
  { id: 'n', upper: 'N', ipa: 'n', vowel: false, sorani: 'ن', word: 'nan', meaning: 'bread' },
  { id: 'o', upper: 'O', ipa: 'oː', vowel: true, sorani: 'ۆ', word: 'roj', meaning: 'day' },
  { id: 'p', upper: 'P', ipa: 'p', vowel: false, sorani: 'پ', word: 'pirtûk', meaning: 'book' },
  { id: 'q', upper: 'Q', ipa: 'q', vowel: false, sorani: 'ق', word: 'qelem', meaning: 'pen' },
  { id: 'r', upper: 'R', ipa: 'ɾ', vowel: false, sorani: 'ر', word: 'rê', meaning: 'road', note: 'rolled' },
  { id: 's', upper: 'S', ipa: 's', vowel: false, sorani: 'س', word: 'sêv', meaning: 'apple' },
  { id: 'ş', upper: 'Ş', ipa: 'ʃ', vowel: false, sorani: 'ش', word: 'şîr', meaning: 'milk' },
  { id: 't', upper: 'T', ipa: 't', vowel: false, sorani: 'ت', word: 'tav', meaning: 'sunshine' },
  { id: 'u', upper: 'U', ipa: 'ʊ', vowel: true, sorani: 'و', word: 'du', meaning: 'two' },
  { id: 'û', upper: 'Û', ipa: 'uː', vowel: true, sorani: 'وو', word: 'rû', meaning: 'face', note: 'long' },
  { id: 'v', upper: 'V', ipa: 'v', vowel: false, sorani: 'ڤ', word: 'evîn', meaning: 'love' },
  { id: 'w', upper: 'W', ipa: 'w', vowel: false, sorani: 'و', word: 'welat', meaning: 'homeland' },
  { id: 'x', upper: 'X', ipa: 'x', vowel: false, sorani: 'خ', word: 'xwişk', meaning: 'sister' },
  { id: 'y', upper: 'Y', ipa: 'j', vowel: false, sorani: 'ی', word: 'yek', meaning: 'one' },
  { id: 'z', upper: 'Z', ipa: 'z', vowel: false, sorani: 'ز', word: 'ziman', meaning: 'language' },
];

/** In the order Soranî primers teach them. */
export const SORANI: readonly SoraniLetter[] = [
  { id: 'hamza', char: 'ئ', latin: null, extra: 'hamza', ipa: 'ʔ', kind: 'vowel', joins: true, word: 'ئاو', meaning: 'water' },
  { id: 'alif', char: 'ا', latin: 'a', ipa: 'aː', kind: 'vowel', joins: false, word: 'دار', meaning: 'tree' },
  { id: 'be', char: 'ب', latin: 'b', ipa: 'b', kind: 'consonant', joins: true, word: 'باوک', meaning: 'father' },
  { id: 'pe', char: 'پ', latin: 'p', ipa: 'p', kind: 'consonant', joins: true, kurdishOnly: true, word: 'پشیلە', meaning: 'cat' },
  { id: 'te', char: 'ت', latin: 't', ipa: 't', kind: 'consonant', joins: true, word: 'تۆ', meaning: 'you' },
  { id: 'cîm', char: 'ج', latin: 'c', ipa: 'dʒ', kind: 'consonant', joins: true, word: 'جوان', meaning: 'beautiful' },
  { id: 'çîm', char: 'چ', latin: 'ç', ipa: 'tʃ', kind: 'consonant', joins: true, kurdishOnly: true, word: 'چاو', meaning: 'eye' },
  { id: 'ḧe', char: 'ح', latin: 'ḧ', extra: 'ḧ', ipa: 'ħ', kind: 'throat', joins: true, word: 'حەوت', meaning: 'seven' },
  { id: 'xe', char: 'خ', latin: 'x', ipa: 'x', kind: 'throat', joins: true, word: 'خوشک', meaning: 'sister' },
  { id: 'dal', char: 'د', latin: 'd', ipa: 'd', kind: 'consonant', joins: false, word: 'دەست', meaning: 'hand' },
  { id: 're', char: 'ر', latin: 'r', ipa: 'ɾ', kind: 'consonant', joins: false, word: 'شار', meaning: 'city' },
  { id: 'ře', char: 'ڕ', latin: 'rr', extra: 'ř', ipa: 'r', kind: 'consonant', joins: false, kurdishOnly: true, word: 'ڕۆژ', meaning: 'day' },
  { id: 'ze', char: 'ز', latin: 'z', ipa: 'z', kind: 'consonant', joins: false, word: 'زمان', meaning: 'language' },
  { id: 'je', char: 'ژ', latin: 'j', ipa: 'ʒ', kind: 'consonant', joins: false, kurdishOnly: true, word: 'ژن', meaning: 'woman' },
  { id: 'sîn', char: 'س', latin: 's', ipa: 's', kind: 'consonant', joins: true, word: 'سێو', meaning: 'apple' },
  { id: 'şîn', char: 'ش', latin: 'ş', ipa: 'ʃ', kind: 'consonant', joins: true, word: 'شیر', meaning: 'milk' },
  { id: 'eyn', char: 'ع', latin: 'ʿ', extra: 'ʿ', ipa: 'ʕ', kind: 'throat', joins: true, word: 'عەشق', meaning: 'love' },
  { id: 'xeyn', char: 'غ', latin: 'ẍ', extra: 'ẍ', ipa: 'ɣ', kind: 'throat', joins: true, word: 'باغ', meaning: 'garden' },
  { id: 'fe', char: 'ف', latin: 'f', ipa: 'f', kind: 'consonant', joins: true, word: 'فیل', meaning: 'elephant' },
  { id: 've', char: 'ڤ', latin: 'v', ipa: 'v', kind: 'consonant', joins: true, kurdishOnly: true, word: 'ڤیدیۆ', meaning: 'video' },
  { id: 'qaf', char: 'ق', latin: 'q', ipa: 'q', kind: 'throat', joins: true, word: 'قەڵەم', meaning: 'pen' },
  { id: 'kaf', char: 'ک', latin: 'k', ipa: 'k', kind: 'consonant', joins: true, word: 'کوڕ', meaning: 'boy' },
  { id: 'gaf', char: 'گ', latin: 'g', ipa: 'g', kind: 'consonant', joins: true, kurdishOnly: true, word: 'گوڵ', meaning: 'rose' },
  { id: 'lam', char: 'ل', latin: 'l', ipa: 'l', kind: 'consonant', joins: true, word: 'لێو', meaning: 'lip' },
  { id: 'łam', char: 'ڵ', latin: 'll', extra: 'ł', ipa: 'ɫ', kind: 'consonant', joins: true, kurdishOnly: true, word: 'باڵ', meaning: 'wing' },
  { id: 'mîm', char: 'م', latin: 'm', ipa: 'm', kind: 'consonant', joins: true, word: 'ماڵ', meaning: 'home' },
  { id: 'nûn', char: 'ن', latin: 'n', ipa: 'n', kind: 'consonant', joins: true, word: 'نان', meaning: 'bread' },
  { id: 'he', char: 'ھ', latin: 'h', ipa: 'h', kind: 'consonant', joins: true, word: 'ھاوڕێ', meaning: 'friend' },
  { id: 'e', char: 'ە', latin: 'e', ipa: 'ɛ', kind: 'vowel', joins: false, kurdishOnly: true, word: 'ئێوارە', meaning: 'evening' },
  { id: 'waw', char: 'و', latin: 'w', ipa: 'w', kind: 'vowel', joins: false, word: 'وڵات', meaning: 'homeland', alsoVowel: { latin: 'u', word: 'کوڕ' } },
  { id: 'ww', char: 'وو', latin: 'û', ipa: 'uː', kind: 'vowel', joins: false, kurdishOnly: true, word: 'دوور', meaning: 'far' },
  { id: 'o', char: 'ۆ', latin: 'o', ipa: 'oː', kind: 'vowel', joins: false, kurdishOnly: true, word: 'خۆر', meaning: 'sun' },
  { id: 'ye', char: 'ی', latin: 'y', ipa: 'j', kind: 'vowel', joins: true, word: 'یەک', meaning: 'one', alsoVowel: { latin: 'î', word: 'شیر' } },
  { id: 'ê', char: 'ێ', latin: 'ê', ipa: 'eː', kind: 'vowel', joins: true, kurdishOnly: true, word: 'ڕێ', meaning: 'road' },
];

/**
 * Which letters are false friends, and which are new, for a reader of each
 * language. Everything else works the way that language already says it.
 */
export const BANDS: Record<CompareLocale, { watch: readonly string[]; new: readonly string[] }> = {
  en: { watch: ['a', 'c', 'e', 'i', 'j', 'o', 'q', 'r', 'u', 'x'], new: ['ç', 'ê', 'î', 'ş', 'û'] },
  de: { watch: ['c', 'j', 'q', 'r', 's', 'v', 'w', 'x', 'y', 'z'], new: ['ç', 'ê', 'î', 'ş', 'û'] },
  nl: { watch: ['c', 'g', 'j', 'q', 'r', 'u', 'x', 'y'], new: ['ç', 'ê', 'î', 'ş', 'û'] },
  fr: { watch: ['c', 'ç', 'e', 'ê', 'g', 'h', 'q', 'r', 's', 'u', 'û', 'x'], new: ['ş'] },
  es: { watch: ['c', 'g', 'h', 'i', 'j', 'q', 'v', 'x', 'z'], new: ['ç', 'ê', 'î', 'ş', 'û'] },
  tr: { watch: ['i'], new: ['ê', 'î', 'q', 'û', 'w', 'x'] },
  // read by sound: Arabic has most of these sounds, writes its short vowels rarely, and lacks a handful
  ar: { watch: ['e', 'i', 'u'], new: ['ç', 'ê', 'g', 'j', 'o', 'p', 'v'] },
};

export function bandOf(letter: string, locale: CompareLocale): Band {
  const b = BANDS[locale];
  if (b.new.includes(letter)) return 'new';
  if (b.watch.includes(letter)) return 'watch';
  return 'same';
}

type SoundKey = string; // a Latin letter id, or an ExtraSound

/**
 * What each sound is like, in each language. `[x]` marks the sound inside a
 * word; text with no brackets is a description, for a sound the language has
 * no word for.
 */
export const LIKE: Record<CompareLocale | 'ku', Record<SoundKey, string>> = {
  en: {
    a: 'f[a]ther', b: '[b]ed', c: '[j]am', ç: '[ch]urch', d: '[d]og', e: 'b[e]d', ê: 'd[ay], held steady',
    f: '[f]ish', g: '[g]o', h: '[h]at', i: 'b[i]t, but shorter', î: 's[ee]', j: 'mea[s]ure', k: '[k]ite',
    l: '[l]amp', m: '[m]oon', n: '[n]ose', o: 'm[o]re', p: '[p]en', q: 'a k made deep in the throat',
    r: 'be[tt]er, said the American way', s: '[s]un', ş: '[sh]oe', t: '[t]en', u: 'p[u]t', û: 'm[oo]n',
    v: '[v]an', w: '[w]e', x: 'lo[ch], the Scottish way', y: '[y]es', z: '[z]oo',
    ḧ: 'a breathy h from deep in the throat', ʿ: 'a squeeze deep in the throat, like the start of a gulp',
    ẍ: 'the French r in Pa[r]is', ł: 'fu[ll], a heavy l', ř: 'a rolled r, like Spanish pe[rr]o',
    hamza: 'no sound of its own: it carries the vowel at the start of a word',
  },
  de: {
    a: 'V[a]ter', b: '[B]all', c: '[Dsch]ungel', ç: '[Tsch]üss', d: '[D]ach', e: 'B[e]tt', ê: 'S[ee]',
    f: '[F]isch', g: '[G]arten', h: '[H]aus', i: 'b[i]tte, nur kürzer', î: 'L[ie]be', j: '[J]ournal',
    k: '[K]atze', l: '[L]ampe', m: '[M]ond', n: '[N]ase', o: '[O]fen', p: '[P]ost',
    q: 'ein k ganz hinten im Rachen', r: 'mit der Zungenspitze kurz angeschlagen, wie im Italienischen',
    s: 'Fu[ß], immer stimmlos', ş: '[Sch]ule', t: '[T]isch', u: 'M[u]tter', û: '[U]hr', v: '[W]asser',
    w: 'das englische [w] in „well“', x: 'Ba[ch]', y: '[J]a', z: '[S]onne, summend',
    ḧ: 'ein gehauchtes h tief aus dem Rachen', ʿ: 'ein Pressen tief im Rachen', ẍ: 'das Zäpfchen-[R] in „Rose“',
    ł: 'ein dunkles l, wie im englischen „fu[ll]“', ř: 'ein gerolltes r, wie im italienischen „te[rr]a“',
    hamza: 'kein eigener Laut: Es trägt den Vokal am Wortanfang',
  },
  nl: {
    a: '[aa]p', b: '[b]al', c: '[j]eans', ç: '[Tsj]echië', d: '[d]ak', e: 'b[e]d', ê: 'z[ee]', f: '[f]iets',
    g: 'een harde g, zoals in [g]oal', h: '[h]uis', i: 'p[i]t, maar korter', î: 'z[ie]', j: '[g]enre',
    k: '[k]at', l: '[l]amp', m: '[m]aan', n: '[n]eus', o: 'b[oo]m', p: '[p]en',
    q: 'een k diep achter in de keel', r: 'een korte, gerolde r met de tongpunt', s: '[s]ok', ş: '[sj]aal',
    t: '[t]afel', u: 'p[oe]t, maar kort', û: 'b[oe]k', v: '[v]is', w: 'de Engelse [w] in „water“',
    x: 'la[ch]en', y: '[j]as', z: '[z]on',
    ḧ: 'een hese h diep uit de keel', ʿ: 'een knijpen diep in de keel', ẍ: 'de Franse r in „Pa[r]is“',
    ł: 'een donkere l, zoals in ba[l]', ř: 'een lange, gerolde r',
    hamza: 'geen eigen klank: hij draagt de klinker aan het begin van een woord',
  },
  fr: {
    a: 'p[â]te', b: '[b]ateau', c: '[dj]inn', ç: 'ma[tch]', d: '[d]ent', e: 'm[è]re', ê: '[é]té', f: '[f]eu',
    g: '[g]are, toujours dur', h: 'un h qui se prononce, comme dans l’anglais [h]ello', i: 'l[e], très bref',
    î: '[î]le', j: '[j]our', k: '[k]ilo', l: '[l]une', m: '[m]er', n: '[n]ez', o: 'r[o]se', p: '[p]ain',
    q: 'un k prononcé au fond de la gorge', r: 'un r roulé d’un seul coup de langue, comme en espagnol',
    s: '[s]el, jamais comme un z', ş: '[ch]at', t: '[t]able', u: 'f[ou], bref', û: 'r[ou]te',
    v: '[v]in', w: '[ou]i', x: 'le ch allemand de Ba[ch]', y: '[y]eux', z: '[z]éro',
    ḧ: 'un h soufflé du fond de la gorge', ʿ: 'une contraction au fond de la gorge', ẍ: 'le r français de [r]ue',
    ł: 'un l sombre, comme l’anglais fu[ll]', ř: 'un r roulé, comme l’espagnol pe[rr]o',
    hamza: 'pas de son propre : elle porte la voyelle en début de mot',
  },
  es: {
    a: 'c[a]sa', b: '[b]arco', c: 'la [j] inglesa de jeans', ç: '[ch]ocolate', d: '[d]edo', e: 'm[e]sa',
    ê: 'm[e]s, más larga y cerrada', f: '[f]oca', g: '[g]ato, siempre así', h: 'una h que suena, como en inglés [h]ello',
    i: 'una i muy corta, casi sin sonar', î: 's[í]', j: 'ca[ll]e, como en Argentina', k: '[k]ilo', l: '[l]una',
    m: '[m]ar', n: '[n]ariz', o: 's[o]l', p: '[p]an', q: 'una k pronunciada al fondo de la garganta',
    r: 'pe[r]o', s: '[s]ol', ş: 'la [sh] inglesa de show', t: '[t]ren', u: 's[u]r, más corta', û: 'l[u]na',
    v: 'una v de verdad, con los dientes sobre el labio', w: '[hu]evo', x: '[j]amón', y: '[y]a',
    z: 'una s sonora que zumba, como la [z] inglesa de zoo',
    ḧ: 'una h aspirada desde el fondo de la garganta', ʿ: 'una contracción al fondo de la garganta',
    ẍ: 'la r francesa de Pa[r]is', ł: 'una l oscura, como en inglés fu[ll]', ř: 'pe[rr]o',
    hamza: 'no suena: lleva la vocal al principio de una palabra',
  },
  tr: {
    a: '[a]rı', b: '[b]alık', c: '[c]am', ç: '[ç]ay', d: '[d]ağ', e: '[e]l', ê: 'e’nin uzun ve kapalı hali',
    f: '[f]il', g: '[g]öl', h: '[h]alı', i: 'k[ı]z, kısa', î: 'uzatılmış bir i', j: '[j]ilet', k: '[k]edi',
    l: '[l]imon', m: '[m]asa', n: '[n]ar', o: '[o]da', p: '[p]ara', q: 'boğazın gerisinden söylenen bir k',
    r: '[r]enk', s: '[s]u', ş: '[ş]eker', t: '[t]op', u: '[u]n', û: 'uzatılmış bir u', v: '[v]ar',
    w: 'dudaklar yuvarlanarak: İngilizce [w]ater', x: 'boğazdan gelen hırıltılı bir h, Arapçadaki خ gibi',
    y: '[y]ol', z: '[z]il',
    ḧ: 'boğazın derininden gelen nefesli bir h', ʿ: 'boğazda bir sıkışma, Arapçadaki ع gibi',
    ẍ: 'ğ’nin hırıltılı hali, Fransızca r gibi', ł: 'ka[l]ın kelimesindeki gibi kalın bir l',
    ř: 'titreşimli, uzun bir r', hamza: 'kendi sesi yok: kelime başındaki ünlüyü taşır',
  },
  ar: {
    a: 'ب[ا]ب', b: '[ب]اب', c: '[ج]مل', ç: 'صوت «تش» معًا', d: '[د]ار', e: 'فتحة قصيرة مفتوحة', ê: 'ب[ي]ت بالعامية',
    f: '[ف]يل', g: 'الجيم المصرية في [ج]ميل', h: '[ه]واء', i: 'كسرة قصيرة جدًا', î: 'ف[ي]ل', j: 'الجيم الشامية في [ج]ميل',
    k: '[ك]تاب', l: '[ل]يل', m: '[م]اء', n: '[ن]ور', o: 'ي[و]م بالعامية', p: 'باء مهموسة بلا صوت',
    q: '[ق]لم', r: '[ر]أس', s: '[س]مك', ş: '[ش]مس', t: '[ت]مر', u: 'ضمة قصيرة', û: 'ن[و]ر',
    v: 'فاء مجهورة، كما في «ڤ»', w: '[و]لد', x: '[خ]بز', y: '[ي]د', z: '[ز]هرة',
    ḧ: '[ح]ب', ʿ: '[ع]ين', ẍ: '[غ]يم', ł: 'لام مفخمة، كما في ا[ل]له', ř: 'راء مكررة قوية',
    hamza: 'مثل الهمزة: تحمل الحركة في أول الكلمة',
  },
  // for a Kurmancî reader meeting the letters only Soranî writes
  ku: {
    ḧ: 'mîna ḧ ya «ḧeft»: h ya stûr a ji qirikê', ʿ: 'mîna ʿ ya erebî: girtina qirikê',
    ẍ: 'mîna ẍ ya «ẍerîb»', ł: 'l ya stûr', ř: 'r ya bi lerz, mîna «rr»',
    hamza: 'dengê wê tune: dengdêra serê peyvê hildigire',
  },
};

/** The meanings of the example words, in every language the app speaks. */
export const MEANINGS: Record<Meaning, Record<AppLocale, string>> = {
  water: { en: 'water', de: 'Wasser', nl: 'water', fr: 'eau', es: 'agua', tr: 'su', ar: 'ماء', ku: 'av', ckb: 'ئاو' },
  father: { en: 'father', de: 'Vater', nl: 'vader', fr: 'père', es: 'padre', tr: 'baba', ar: 'أب', ku: 'bav', ckb: 'باوک' },
  neighbour: { en: 'neighbour', de: 'Nachbar', nl: 'buurman', fr: 'voisin', es: 'vecino', tr: 'komşu', ar: 'جار', ku: 'cîran', ckb: 'دراوسێ' },
  eye: { en: 'eye', de: 'Auge', nl: 'oog', fr: 'œil', es: 'ojo', tr: 'göz', ar: 'عين', ku: 'çav', ckb: 'چاو' },
  hand: { en: 'hand', de: 'Hand', nl: 'hand', fr: 'main', es: 'mano', tr: 'el', ar: 'يد', ku: 'dest', ckb: 'دەست' },
  i: { en: 'I', de: 'ich', nl: 'ik', fr: 'je', es: 'yo', tr: 'ben', ar: 'أنا', ku: 'ez', ckb: 'من' },
  evening: { en: 'evening', de: 'Abend', nl: 'avond', fr: 'soir', es: 'tarde', tr: 'akşam', ar: 'مساء', ku: 'êvar', ckb: 'ئێوارە' },
  fruit: { en: 'fruit', de: 'Obst', nl: 'fruit', fr: 'fruit', es: 'fruta', tr: 'meyve', ar: 'فاكهة', ku: 'fêkî', ckb: 'میوە' },
  rose: { en: 'rose', de: 'Rose', nl: 'roos', fr: 'rose', es: 'rosa', tr: 'gül', ar: 'وردة', ku: 'gul', ckb: 'گوڵ' },
  horse: { en: 'horse', de: 'Pferd', nl: 'paard', fr: 'cheval', es: 'caballo', tr: 'at', ar: 'حصان', ku: 'hesp', ckb: 'ئەسپ' },
  heart: { en: 'heart', de: 'Herz', nl: 'hart', fr: 'cœur', es: 'corazón', tr: 'kalp', ar: 'قلب', ku: 'dil', ckb: 'دڵ' },
  today: { en: 'today', de: 'heute', nl: 'vandaag', fr: 'aujourd’hui', es: 'hoy', tr: 'bugün', ar: 'اليوم', ku: 'îro', ckb: 'ئەمڕۆ' },
  woman: { en: 'woman', de: 'Frau', nl: 'vrouw', fr: 'femme', es: 'mujer', tr: 'kadın', ar: 'امرأة', ku: 'jin', ckb: 'ژن' },
  boy: { en: 'boy', de: 'Junge', nl: 'jongen', fr: 'garçon', es: 'chico', tr: 'oğlan', ar: 'ولد', ku: 'kur', ckb: 'کوڕ' },
  lip: { en: 'lip', de: 'Lippe', nl: 'lip', fr: 'lèvre', es: 'labio', tr: 'dudak', ar: 'شفة', ku: 'lêv', ckb: 'لێو' },
  home: { en: 'home', de: 'Zuhause', nl: 'thuis', fr: 'maison', es: 'casa', tr: 'ev', ar: 'بيت', ku: 'mal', ckb: 'ماڵ' },
  bread: { en: 'bread', de: 'Brot', nl: 'brood', fr: 'pain', es: 'pan', tr: 'ekmek', ar: 'خبز', ku: 'nan', ckb: 'نان' },
  day: { en: 'day', de: 'Tag', nl: 'dag', fr: 'jour', es: 'día', tr: 'gün', ar: 'يوم', ku: 'roj', ckb: 'ڕۆژ' },
  book: { en: 'book', de: 'Buch', nl: 'boek', fr: 'livre', es: 'libro', tr: 'kitap', ar: 'كتاب', ku: 'pirtûk', ckb: 'کتێب' },
  pen: { en: 'pen', de: 'Stift', nl: 'pen', fr: 'stylo', es: 'bolígrafo', tr: 'kalem', ar: 'قلم', ku: 'qelem', ckb: 'قەڵەم' },
  road: { en: 'road', de: 'Weg', nl: 'weg', fr: 'chemin', es: 'camino', tr: 'yol', ar: 'طريق', ku: 'rê', ckb: 'ڕێ' },
  apple: { en: 'apple', de: 'Apfel', nl: 'appel', fr: 'pomme', es: 'manzana', tr: 'elma', ar: 'تفاحة', ku: 'sêv', ckb: 'سێو' },
  milk: { en: 'milk', de: 'Milch', nl: 'melk', fr: 'lait', es: 'leche', tr: 'süt', ar: 'حليب', ku: 'şîr', ckb: 'شیر' },
  sunshine: { en: 'sunshine', de: 'Sonnenschein', nl: 'zonneschijn', fr: 'soleil', es: 'sol', tr: 'güneş', ar: 'شمس', ku: 'tav', ckb: 'ھەتاو' },
  two: { en: 'two', de: 'zwei', nl: 'twee', fr: 'deux', es: 'dos', tr: 'iki', ar: 'اثنان', ku: 'du', ckb: 'دوو' },
  face: { en: 'face', de: 'Gesicht', nl: 'gezicht', fr: 'visage', es: 'cara', tr: 'yüz', ar: 'وجه', ku: 'rû', ckb: 'ڕوو' },
  love: { en: 'love', de: 'Liebe', nl: 'liefde', fr: 'amour', es: 'amor', tr: 'aşk', ar: 'حب', ku: 'evîn', ckb: 'خۆشەویستی' },
  homeland: { en: 'homeland', de: 'Heimat', nl: 'vaderland', fr: 'patrie', es: 'patria', tr: 'vatan', ar: 'وطن', ku: 'welat', ckb: 'وڵات' },
  sister: { en: 'sister', de: 'Schwester', nl: 'zus', fr: 'sœur', es: 'hermana', tr: 'kız kardeş', ar: 'أخت', ku: 'xwişk', ckb: 'خوشک' },
  one: { en: 'one', de: 'eins', nl: 'een', fr: 'un', es: 'uno', tr: 'bir', ar: 'واحد', ku: 'yek', ckb: 'یەک' },
  language: { en: 'language', de: 'Sprache', nl: 'taal', fr: 'langue', es: 'idioma', tr: 'dil', ar: 'لغة', ku: 'ziman', ckb: 'زمان' },
  tree: { en: 'tree', de: 'Baum', nl: 'boom', fr: 'arbre', es: 'árbol', tr: 'ağaç', ar: 'شجرة', ku: 'dar', ckb: 'دار' },
  cat: { en: 'cat', de: 'Katze', nl: 'kat', fr: 'chat', es: 'gato', tr: 'kedi', ar: 'قطة', ku: 'pisîk', ckb: 'پشیلە' },
  you: { en: 'you', de: 'du', nl: 'jij', fr: 'toi', es: 'tú', tr: 'sen', ar: 'أنت', ku: 'tu', ckb: 'تۆ' },
  beautiful: { en: 'beautiful', de: 'schön', nl: 'mooi', fr: 'beau', es: 'bonito', tr: 'güzel', ar: 'جميل', ku: 'ciwan', ckb: 'جوان' },
  seven: { en: 'seven', de: 'sieben', nl: 'zeven', fr: 'sept', es: 'siete', tr: 'yedi', ar: 'سبعة', ku: 'heft', ckb: 'حەوت' },
  city: { en: 'city', de: 'Stadt', nl: 'stad', fr: 'ville', es: 'ciudad', tr: 'şehir', ar: 'مدينة', ku: 'bajar', ckb: 'شار' },
  garden: { en: 'garden', de: 'Garten', nl: 'tuin', fr: 'jardin', es: 'jardín', tr: 'bahçe', ar: 'حديقة', ku: 'baxçe', ckb: 'باغ' },
  elephant: { en: 'elephant', de: 'Elefant', nl: 'olifant', fr: 'éléphant', es: 'elefante', tr: 'fil', ar: 'فيل', ku: 'fîl', ckb: 'فیل' },
  video: { en: 'video', de: 'Video', nl: 'video', fr: 'vidéo', es: 'vídeo', tr: 'video', ar: 'فيديو', ku: 'vîdyo', ckb: 'ڤیدیۆ' },
  wing: { en: 'wing', de: 'Flügel', nl: 'vleugel', fr: 'aile', es: 'ala', tr: 'kanat', ar: 'جناح', ku: 'bask', ckb: 'باڵ' },
  friend: { en: 'friend', de: 'Freund', nl: 'vriend', fr: 'ami', es: 'amigo', tr: 'arkadaş', ar: 'صديق', ku: 'heval', ckb: 'ھاوڕێ' },
  far: { en: 'far', de: 'weit', nl: 'ver', fr: 'loin', es: 'lejos', tr: 'uzak', ar: 'بعيد', ku: 'dûr', ckb: 'دوور' },
  sun: { en: 'sun', de: 'Sonne', nl: 'zon', fr: 'soleil', es: 'sol', tr: 'güneş', ar: 'شمس', ku: 'roj', ckb: 'خۆر' },
};

/** A comparison split into the text around the sound and the sound itself. */
export interface Likeness {
  before: string;
  sound: string | null;
  after: string;
}

export function parseLike(text: string): Likeness {
  const m = /^(.*?)\[(.+?)\](.*)$/.exec(text);
  return m ? { before: m[1]!, sound: m[2]!, after: m[3]! } : { before: text, sound: null, after: '' };
}

/** What a Latin letter's sound is like for this reader, or null where they are shown the other script instead. */
export function likeFor(letter: string, locale: AppLocale): Likeness | null {
  const lang = compareLocaleOf(locale);
  const text = lang ? LIKE[lang][letter] : undefined;
  return text ? parseLike(text) : null;
}

/** The same for a Soranî letter: its own sound if Kurmancî spells it only in the extended way, else its partner's. */
export function soraniLikeFor(letter: SoraniLetter, locale: AppLocale): Likeness | null {
  const lang = locale === 'ku' ? 'ku' : compareLocaleOf(locale);
  if (!lang) return null;
  const key = letter.extra ?? letter.latin;
  const text = key ? LIKE[lang][key] : undefined;
  return text ? parseLike(text) : null;
}

/**
 * The four shapes an Arabic-script letter takes, drawn by the font itself.
 *
 * A zero-width joiner either side asks the font for the joined form, so no
 * presentation form is hard-coded and every shape is the real one. A letter
 * that never joins the next has only two shapes, and says so.
 */
const ZWJ = '‍';
export function formsOf(letter: SoraniLetter): { alone: string; start: string; middle: string; end: string } {
  const c = letter.char;
  if (!letter.joins) return { alone: c, start: c, middle: `${ZWJ}${c}`, end: `${ZWJ}${c}` };
  return { alone: c, start: `${c}${ZWJ}`, middle: `${ZWJ}${c}${ZWJ}`, end: `${ZWJ}${c}` };
}

/** Where in a Kurdish word its letter is, for marking it; -1 where it is not found. */
export function indexInWord(word: string, letter: string): number {
  return word.toLocaleLowerCase('ku').indexOf(letter);
}
