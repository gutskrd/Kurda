/**
 * Every sound on the alphabet page, by key — one list for the three places
 * that need it: the website plays them, the admin panel records them, and the
 * API refuses to store a recording under any key not on it.
 *
 * Each sound ships with a synthesised clip (web/scripts/alphabet-audio). A
 * recording made in the admin panel takes its place for that key, and removing
 * the recording brings the synthesised clip back.
 *
 * `say` is exactly what to say into the microphone; `hint` is how, where the
 * text alone could be read two ways.
 */
export type AlphabetClipGroup = 'kmr-sound' | 'kmr-word' | 'ckb-sound' | 'ckb-word' | 'pair';

export interface AlphabetClip {
  key: string;
  group: AlphabetClipGroup;
  /** the letter (or word) the clip belongs to, as the page shows it */
  letter: string;
  say: string;
  script: 'kmr' | 'ckb';
  hint?: string;
}

export const ALPHABET_CLIP_GROUPS: ReadonlyArray<{ group: AlphabetClipGroup; title: string }> = [
  { group: 'kmr-sound', title: 'Kurmancî letters' },
  { group: 'kmr-word', title: 'Kurmancî example words' },
  { group: 'ckb-sound', title: 'Soranî-only sounds' },
  { group: 'ckb-word', title: 'Soranî example words' },
  { group: 'pair', title: 'Minimal pairs' },
];

export const ALPHABET_CLIPS: readonly AlphabetClip[] = [
  { key: 'kmr:sound:a', group: 'kmr-sound', letter: 'A a', say: 'a', script: 'kmr', hint: 'the vowel alone, held briefly' },
  { key: 'kmr:sound:b', group: 'kmr-sound', letter: 'B b', say: 'ba', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:c', group: 'kmr-sound', letter: 'C c', say: 'ca', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:ç', group: 'kmr-sound', letter: 'Ç ç', say: 'ça', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:d', group: 'kmr-sound', letter: 'D d', say: 'da', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:e', group: 'kmr-sound', letter: 'E e', say: 'e', script: 'kmr', hint: 'the vowel alone, held briefly' },
  { key: 'kmr:sound:ê', group: 'kmr-sound', letter: 'Ê ê', say: 'ê', script: 'kmr', hint: 'the vowel alone, held briefly' },
  { key: 'kmr:sound:f', group: 'kmr-sound', letter: 'F f', say: 'fa', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:g', group: 'kmr-sound', letter: 'G g', say: 'ga', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:h', group: 'kmr-sound', letter: 'H h', say: 'ha', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:i', group: 'kmr-sound', letter: 'I i', say: 'i', script: 'kmr', hint: 'the vowel alone, held briefly' },
  { key: 'kmr:sound:î', group: 'kmr-sound', letter: 'Î î', say: 'î', script: 'kmr', hint: 'the vowel alone, held briefly' },
  { key: 'kmr:sound:j', group: 'kmr-sound', letter: 'J j', say: 'ja', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:k', group: 'kmr-sound', letter: 'K k', say: 'ka', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:l', group: 'kmr-sound', letter: 'L l', say: 'la', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:m', group: 'kmr-sound', letter: 'M m', say: 'ma', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:n', group: 'kmr-sound', letter: 'N n', say: 'na', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:o', group: 'kmr-sound', letter: 'O o', say: 'o', script: 'kmr', hint: 'the vowel alone, held briefly' },
  { key: 'kmr:sound:p', group: 'kmr-sound', letter: 'P p', say: 'pa', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:q', group: 'kmr-sound', letter: 'Q q', say: 'qa', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:r', group: 'kmr-sound', letter: 'R r', say: 'ra', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:s', group: 'kmr-sound', letter: 'S s', say: 'sa', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:ş', group: 'kmr-sound', letter: 'Ş ş', say: 'şa', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:t', group: 'kmr-sound', letter: 'T t', say: 'ta', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:u', group: 'kmr-sound', letter: 'U u', say: 'u', script: 'kmr', hint: 'the vowel alone, short — as in “put”' },
  { key: 'kmr:sound:û', group: 'kmr-sound', letter: 'Û û', say: 'û', script: 'kmr', hint: 'the vowel alone, held briefly' },
  { key: 'kmr:sound:v', group: 'kmr-sound', letter: 'V v', say: 'va', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:w', group: 'kmr-sound', letter: 'W w', say: 'wa', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:x', group: 'kmr-sound', letter: 'X x', say: 'xa', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:y', group: 'kmr-sound', letter: 'Y y', say: 'ya', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:sound:z', group: 'kmr-sound', letter: 'Z z', say: 'za', script: 'kmr', hint: 'the sound, then a — the way primers say it' },
  { key: 'kmr:word:a', group: 'kmr-word', letter: 'A a', say: 'av', script: 'kmr' },
  { key: 'kmr:word:b', group: 'kmr-word', letter: 'B b', say: 'bav', script: 'kmr' },
  { key: 'kmr:word:c', group: 'kmr-word', letter: 'C c', say: 'cîran', script: 'kmr' },
  { key: 'kmr:word:ç', group: 'kmr-word', letter: 'Ç ç', say: 'çav', script: 'kmr' },
  { key: 'kmr:word:d', group: 'kmr-word', letter: 'D d', say: 'dest', script: 'kmr' },
  { key: 'kmr:word:e', group: 'kmr-word', letter: 'E e', say: 'ez', script: 'kmr' },
  { key: 'kmr:word:ê', group: 'kmr-word', letter: 'Ê ê', say: 'êvar', script: 'kmr' },
  { key: 'kmr:word:f', group: 'kmr-word', letter: 'F f', say: 'fêkî', script: 'kmr' },
  { key: 'kmr:word:g', group: 'kmr-word', letter: 'G g', say: 'gul', script: 'kmr' },
  { key: 'kmr:word:h', group: 'kmr-word', letter: 'H h', say: 'hesp', script: 'kmr' },
  { key: 'kmr:word:i', group: 'kmr-word', letter: 'I i', say: 'dil', script: 'kmr' },
  { key: 'kmr:word:î', group: 'kmr-word', letter: 'Î î', say: 'îro', script: 'kmr' },
  { key: 'kmr:word:j', group: 'kmr-word', letter: 'J j', say: 'jin', script: 'kmr' },
  { key: 'kmr:word:k', group: 'kmr-word', letter: 'K k', say: 'kur', script: 'kmr' },
  { key: 'kmr:word:l', group: 'kmr-word', letter: 'L l', say: 'lêv', script: 'kmr' },
  { key: 'kmr:word:m', group: 'kmr-word', letter: 'M m', say: 'mal', script: 'kmr' },
  { key: 'kmr:word:n', group: 'kmr-word', letter: 'N n', say: 'nan', script: 'kmr' },
  { key: 'kmr:word:o', group: 'kmr-word', letter: 'O o', say: 'roj', script: 'kmr' },
  { key: 'kmr:word:p', group: 'kmr-word', letter: 'P p', say: 'pirtûk', script: 'kmr' },
  { key: 'kmr:word:q', group: 'kmr-word', letter: 'Q q', say: 'qelem', script: 'kmr' },
  { key: 'kmr:word:r', group: 'kmr-word', letter: 'R r', say: 'rê', script: 'kmr' },
  { key: 'kmr:word:s', group: 'kmr-word', letter: 'S s', say: 'sêv', script: 'kmr' },
  { key: 'kmr:word:ş', group: 'kmr-word', letter: 'Ş ş', say: 'şîr', script: 'kmr' },
  { key: 'kmr:word:t', group: 'kmr-word', letter: 'T t', say: 'tav', script: 'kmr' },
  { key: 'kmr:word:u', group: 'kmr-word', letter: 'U u', say: 'du', script: 'kmr' },
  { key: 'kmr:word:û', group: 'kmr-word', letter: 'Û û', say: 'rû', script: 'kmr' },
  { key: 'kmr:word:v', group: 'kmr-word', letter: 'V v', say: 'evîn', script: 'kmr' },
  { key: 'kmr:word:w', group: 'kmr-word', letter: 'W w', say: 'welat', script: 'kmr' },
  { key: 'kmr:word:x', group: 'kmr-word', letter: 'X x', say: 'xwişk', script: 'kmr' },
  { key: 'kmr:word:y', group: 'kmr-word', letter: 'Y y', say: 'yek', script: 'kmr' },
  { key: 'kmr:word:z', group: 'kmr-word', letter: 'Z z', say: 'ziman', script: 'kmr' },
  { key: 'ckb:sound:ḧe', group: 'ckb-sound', letter: 'ح', say: 'حا', script: 'ckb', hint: 'ḧa — h said with the throat squeezed tight' },
  { key: 'ckb:sound:eyn', group: 'ckb-sound', letter: 'ع', say: 'عا', script: 'ckb', hint: 'ʿa — the throat tightens, as in Arabic ع' },
  { key: 'ckb:sound:xeyn', group: 'ckb-sound', letter: 'غ', say: 'غا', script: 'ckb', hint: 'ẍa — a gargled, voiced x' },
  { key: 'ckb:sound:hamza', group: 'ckb-sound', letter: 'ئ', say: 'ئا', script: 'ckb', hint: 'a with a clean catch in the throat before it' },
  { key: 'ckb:sound:łam', group: 'ckb-sound', letter: 'ڵ', say: 'ڵا', script: 'ckb', hint: 'ła — a dark, heavy l, tongue pulled back' },
  { key: 'ckb:sound:ře', group: 'ckb-sound', letter: 'ڕ', say: 'ڕا', script: 'ckb', hint: 'řa — a strongly rolled r' },
  { key: 'ckb:word:hamza', group: 'ckb-word', letter: 'ئ', say: 'ئاو', script: 'ckb' },
  { key: 'ckb:word:alif', group: 'ckb-word', letter: 'ا', say: 'دار', script: 'ckb' },
  { key: 'ckb:word:be', group: 'ckb-word', letter: 'ب', say: 'باوک', script: 'ckb' },
  { key: 'ckb:word:pe', group: 'ckb-word', letter: 'پ', say: 'پشیلە', script: 'ckb' },
  { key: 'ckb:word:te', group: 'ckb-word', letter: 'ت', say: 'تۆ', script: 'ckb' },
  { key: 'ckb:word:cîm', group: 'ckb-word', letter: 'ج', say: 'جوان', script: 'ckb' },
  { key: 'ckb:word:çîm', group: 'ckb-word', letter: 'چ', say: 'چاو', script: 'ckb' },
  { key: 'ckb:word:ḧe', group: 'ckb-word', letter: 'ح', say: 'حەوت', script: 'ckb' },
  { key: 'ckb:word:xe', group: 'ckb-word', letter: 'خ', say: 'خوشک', script: 'ckb' },
  { key: 'ckb:word:dal', group: 'ckb-word', letter: 'د', say: 'دەست', script: 'ckb' },
  { key: 'ckb:word:re', group: 'ckb-word', letter: 'ر', say: 'شار', script: 'ckb' },
  { key: 'ckb:word:ře', group: 'ckb-word', letter: 'ڕ', say: 'ڕۆژ', script: 'ckb' },
  { key: 'ckb:word:ze', group: 'ckb-word', letter: 'ز', say: 'زمان', script: 'ckb' },
  { key: 'ckb:word:je', group: 'ckb-word', letter: 'ژ', say: 'ژن', script: 'ckb' },
  { key: 'ckb:word:sîn', group: 'ckb-word', letter: 'س', say: 'سێو', script: 'ckb' },
  { key: 'ckb:word:şîn', group: 'ckb-word', letter: 'ش', say: 'شیر', script: 'ckb' },
  { key: 'ckb:word:eyn', group: 'ckb-word', letter: 'ع', say: 'عەشق', script: 'ckb' },
  { key: 'ckb:word:xeyn', group: 'ckb-word', letter: 'غ', say: 'باغ', script: 'ckb' },
  { key: 'ckb:word:fe', group: 'ckb-word', letter: 'ف', say: 'فیل', script: 'ckb' },
  { key: 'ckb:word:ve', group: 'ckb-word', letter: 'ڤ', say: 'ڤیدیۆ', script: 'ckb' },
  { key: 'ckb:word:qaf', group: 'ckb-word', letter: 'ق', say: 'قاوە', script: 'ckb' },
  { key: 'ckb:word:kaf', group: 'ckb-word', letter: 'ک', say: 'کوڕ', script: 'ckb' },
  { key: 'ckb:word:gaf', group: 'ckb-word', letter: 'گ', say: 'گوێ', script: 'ckb' },
  { key: 'ckb:word:lam', group: 'ckb-word', letter: 'ل', say: 'لێو', script: 'ckb' },
  { key: 'ckb:word:łam', group: 'ckb-word', letter: 'ڵ', say: 'باڵ', script: 'ckb' },
  { key: 'ckb:word:mîm', group: 'ckb-word', letter: 'م', say: 'مانگ', script: 'ckb' },
  { key: 'ckb:word:nûn', group: 'ckb-word', letter: 'ن', say: 'نان', script: 'ckb' },
  { key: 'ckb:word:he', group: 'ckb-word', letter: 'ھ', say: 'ھاوڕێ', script: 'ckb' },
  { key: 'ckb:word:e', group: 'ckb-word', letter: 'ە', say: 'ئێوارە', script: 'ckb' },
  { key: 'ckb:word:waw', group: 'ckb-word', letter: 'و', say: 'وشە', script: 'ckb' },
  { key: 'ckb:word:ww', group: 'ckb-word', letter: 'وو', say: 'دوور', script: 'ckb' },
  { key: 'ckb:word:o', group: 'ckb-word', letter: 'ۆ', say: 'خۆر', script: 'ckb' },
  { key: 'ckb:word:ye', group: 'ckb-word', letter: 'ی', say: 'یەک', script: 'ckb' },
  { key: 'ckb:word:ê', group: 'ckb-word', letter: 'ێ', say: 'ڕێ', script: 'ckb' },
  { key: 'pair:kur', group: 'pair', letter: 'kur', say: 'kur', script: 'kmr', hint: 'one of a pair: kur / kûr' },
  { key: 'pair:kûr', group: 'pair', letter: 'kûr', say: 'kûr', script: 'kmr', hint: 'one of a pair: kur / kûr' },
  { key: 'pair:dil', group: 'pair', letter: 'dil', say: 'dil', script: 'kmr', hint: 'one of a pair: dil / dîl' },
  { key: 'pair:dîl', group: 'pair', letter: 'dîl', say: 'dîl', script: 'kmr', hint: 'one of a pair: dil / dîl' },
  { key: 'pair:ker', group: 'pair', letter: 'ker', say: 'ker', script: 'kmr', hint: 'one of a pair: ker / kêr' },
  { key: 'pair:kêr', group: 'pair', letter: 'kêr', say: 'kêr', script: 'kmr', hint: 'one of a pair: ker / kêr' },
  { key: 'pair:şer', group: 'pair', letter: 'şer', say: 'şer', script: 'kmr', hint: 'one of a pair: şer / şêr' },
  { key: 'pair:şêr', group: 'pair', letter: 'şêr', say: 'şêr', script: 'kmr', hint: 'one of a pair: şer / şêr' },
];

const KEYS = new Set(ALPHABET_CLIPS.map((c) => c.key));

export function isAlphabetClipKey(key: string): boolean {
  return KEYS.has(key);
}

/** The longest recording worth keeping: a letter or a word, with a breath either side. */
export const ALPHABET_CLIP_MAX_SECONDS = 4;
