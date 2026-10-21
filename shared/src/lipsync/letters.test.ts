import { describe, expect, it } from 'vitest';
import { LONG_PAUSE_WEIGHT, SHORT_PAUSE_WEIGHT, detectScript, textToSounds, type Sound } from './letters.js';

/** The shapes of a text, pauses as "|" — the easiest form to read a mistake in. */
const shapes = (text: string, script?: 'latin' | 'arabic'): string[] =>
  textToSounds(text, script ? { script } : {}).map((s) => (s.kind === 'pause' ? '|' : s.viseme));

const only = (text: string): Sound => {
  const sounds = textToSounds(text);
  expect(sounds).toHaveLength(1);
  return sounds[0]!;
};

describe('Kurmancî letters', () => {
  it('maps every letter of the alphabet to its mouth shape', () => {
    const expected: Record<string, string> = {
      a: 'a',
      e: 'e',
      ê: 'e',
      i: 'i',
      î: 'i',
      o: 'o',
      u: 'u',
      û: 'u',
      w: 'u',
      b: 'mbp',
      m: 'mbp',
      p: 'mbp',
      f: 'fv',
      v: 'fv',
      l: 'l',
      n: 'l',
      t: 'l',
      d: 'l',
    };
    for (const ch of 'cçghjkqrsşxyzẍḧ') expected[ch] = 'etc';
    for (const [letter, viseme] of Object.entries(expected)) {
      expect(only(letter).viseme, letter).toBe(viseme);
      expect(only(letter.toUpperCase()).viseme, letter.toUpperCase()).toBe(viseme);
    }
  });

  it('reads a sentence in order, with its vowels and consonants', () => {
    expect(shapes('Silav')).toEqual(['etc', 'i', 'l', 'a', 'fv']);
    expect(shapes('xwarin')).toEqual(['etc', 'u', 'a', 'etc', 'i', 'l']);
    const sounds = textToSounds('Bav');
    expect(sounds.map((s) => s.kind)).toEqual(['consonant', 'vowel', 'consonant']);
  });

  it('holds long vowels longer than short ones, and both longer than a stop', () => {
    const weight = (letter: string): number => only(letter).weight;
    expect(weight('a')).toBeGreaterThan(weight('e'));
    expect(weight('î')).toBeGreaterThan(weight('i'));
    expect(weight('û')).toBeGreaterThan(weight('u'));
    expect(weight('e')).toBeGreaterThan(weight('t'));
    expect(weight('s')).toBeGreaterThan(weight('t'));
    expect(weight('i')).toBeGreaterThan(weight('r'));
  });

  it('reads a keyboard digraph as one sound and a doubled letter as one longer sound', () => {
    expect(shapes('shev')).toEqual(['etc', 'e', 'fv']);
    expect(textToSounds('shev')[0]!.letters).toBe('sh');
    const single = textToSounds('kur')[2]!;
    const doubled = textToSounds('kurr')[2]!;
    expect(textToSounds('kurr')).toHaveLength(3);
    expect(doubled.letters).toBe('rr');
    expect(doubled.weight).toBeGreaterThan(single.weight);
  });

  it('folds letter variants and accents onto the letters they stand for', () => {
    // a Turkish keyboard's dotless ı and dotted İ
    expect(shapes('dıl')).toEqual(['l', 'i', 'l']);
    expect(shapes('İSTANBUL')).toEqual(['i', 'etc', 'l', 'a', 'l', 'mbp', 'u', 'l']);
    expect(shapes('café')).toEqual(['etc', 'a', 'fv', 'e']);
    // decomposed ê is still ê
    expect(shapes('sêv')).toEqual(shapes('sêv'));
  });

  it('numbers its words, keeping an apostrophe or a hyphen from confusing them', () => {
    const words = (text: string): number[] => [...new Set(textToSounds(text).map((s) => s.word))];
    expect(words('Ez baş im')).toEqual([0, 1, 2]);
    expect(words("Kurdistan'ê")).toEqual([0]);
    expect(words('rojê-rojê')).toEqual([0, 1]);
    expect(textToSounds('Ez baş im').filter((s) => s.word === 1).map((s) => s.letters)).toEqual(['b', 'a', 'ş']);
  });
});

describe('punctuation and the rest', () => {
  it('makes a comma a short pause and a full stop or question a long one', () => {
    expect(shapes('Silav, heval')).toEqual(['etc', 'i', 'l', 'a', 'fv', '|', 'etc', 'e', 'fv', 'a', 'l']);
    const pauses = (text: string): Sound[] => textToSounds(text).filter((s) => s.kind === 'pause');
    expect(pauses('a, b')[0]).toMatchObject({ viseme: 'rest', pause: 'short', weight: SHORT_PAUSE_WEIGHT });
    expect(pauses('a. b')[0]).toMatchObject({ pause: 'long', weight: LONG_PAUSE_WEIGHT });
    expect(pauses('a? b')[0]!.pause).toBe('long');
    expect(pauses('a! b')[0]!.pause).toBe('long');
    expect(pauses('a; b')[0]!.pause).toBe('short');
    expect(pauses('a: b')[0]!.pause).toBe('short');
    expect(pauses('a — b')[0]!.pause).toBe('short');
    expect(LONG_PAUSE_WEIGHT).toBeGreaterThan(SHORT_PAUSE_WEIGHT);
  });

  it('makes one pause of a run of punctuation, as long as the longest of it', () => {
    expect(shapes('Çi?! Na')).toEqual(['etc', 'i', '|', 'l', 'a']);
    expect(textToSounds('Erê, . na').filter((s) => s.kind === 'pause')).toEqual([
      expect.objectContaining({ pause: 'long' }),
    ]);
    expect(shapes('Erê... na')).toEqual(['e', 'etc', 'e', '|', 'l', 'a']);
  });

  it('puts no pause before the first word or after the last', () => {
    expect(shapes('"Silav!"')).toEqual(['etc', 'i', 'l', 'a', 'fv']);
    expect(shapes('… Silav.')).toEqual(['etc', 'i', 'l', 'a', 'fv']);
    expect(textToSounds('?!')).toEqual([]);
    expect(textToSounds('')).toEqual([]);
  });

  it('a pause belongs to the word before it', () => {
    const sounds = textToSounds('Ez, tu');
    expect(sounds.find((s) => s.kind === 'pause')!.word).toBe(0);
  });

  it('ignores what says nothing: quotes, symbols, emoji, invisible formatting', () => {
    expect(shapes('« Silav » 😀 #')).toEqual(shapes('Silav'));
    expect(shapes('Si​lav‎')).toEqual(shapes('Silav'));
    expect(textToSounds('😀 ★ % +')).toEqual([]);
  });

  it('reads digits out as the numbers they are, with no pause inside a number', () => {
    expect(shapes('3')).toEqual(shapes('sê'));
    expect(shapes('Ez 15 salî me')).toEqual(shapes('Ez yek pênc salî me'));
    expect(shapes('2.5')).toEqual(shapes('du pênc'));
    expect(shapes('٣', 'arabic')).toEqual(shapes('سێ'));
    expect(shapes('۳')).toEqual(shapes('سێ'));
    expect(shapes('3', 'arabic')).toEqual(shapes('سێ'));
  });
});

describe('Soranî letters', () => {
  it('maps the letters with one reading', () => {
    const expected: Record<string, string> = {
      ب: 'mbp',
      م: 'mbp',
      پ: 'mbp',
      ف: 'fv',
      ڤ: 'fv',
      ل: 'l',
      ڵ: 'l',
      ن: 'l',
      ت: 'l',
      د: 'l',
    };
    for (const ch of 'جچحخرڕزژسشعغقکگھ') expected[ch] = 'etc';
    for (const [letter, viseme] of Object.entries(expected)) {
      // a vowel on either side, so no i is supplied
      expect(shapes(`ا${letter}ا`), letter).toEqual(['a', viseme, 'a']);
    }
    expect(shapes('با')).toEqual(['mbp', 'a']);
    expect(shapes('بە')).toEqual(['mbp', 'e']);
    expect(shapes('بێ')).toEqual(['mbp', 'e']);
    expect(shapes('بۆ')).toEqual(['mbp', 'o']);
    expect(shapes('بوو')).toEqual(['mbp', 'u']);
    expect(textToSounds('بوو')[1]).toMatchObject({ kind: 'vowel', letters: 'وو' });
  });

  it('reads ی as the vowel î between consonants and as y beside a vowel', () => {
    expect(shapes('شیر')).toEqual(['etc', 'i', 'etc']);
    expect(textToSounds('شیر')[1]!.kind).toBe('vowel');
    expect(shapes('یەک')).toEqual(['etc', 'e', 'etc']);
    expect(textToSounds('یەک')[0]!.kind).toBe('consonant');
    expect(shapes('چای')).toEqual(['etc', 'a', 'etc']);
    // nîye: the first ی the vowel, the second the glide before ە
    expect(textToSounds('نییە').map((s) => `${s.viseme}/${s.kind}`)).toEqual(['l/consonant', 'i/vowel', 'etc/consonant', 'e/vowel']);
  });

  it('reads و as the vowel u between consonants and as w beside a vowel, rounded either way', () => {
    expect(textToSounds('کورد').map((s) => `${s.viseme}/${s.kind}`)).toEqual([
      'etc/consonant',
      'u/vowel',
      'etc/consonant',
      'l/consonant',
    ]);
    expect(textToSounds('چاو').map((s) => `${s.viseme}/${s.kind}`)).toEqual(['etc/consonant', 'a/vowel', 'u/consonant']);
    expect(textToSounds('و').map((s) => `${s.viseme}/${s.kind}`)).toEqual(['u/vowel']);
    // the vowel a hamza seat carries
    expect(textToSounds('ئیش').map((s) => `${s.viseme}/${s.kind}`)).toEqual(['i/vowel', 'etc/consonant']);
    expect(shapes('ئاو')).toEqual(['a', 'u']);
    expect(shapes('ئێوە')).toEqual(['e', 'u', 'e']);
  });

  it('supplies the short i the script leaves unwritten, where a Kurdish syllable needs it', () => {
    const read = (word: string): string =>
      textToSounds(word)
        .map((s) => (s.letters === '' ? '(i)' : s.letters))
        .join('');
    // no word starts with two consonants
    expect(read('من')).toBe('م(i)ن');
    expect(read('سپاس')).toBe('س(i)پاس');
    expect(read('کچ')).toBe('ک(i)چ');
    expect(read('دڵ')).toBe('د(i)ڵ');
    // no syllable ends in two that rise in loudness, or in three
    expect(read('بزانم')).toBe('ب(i)زان(i)م');
    expect(read('دەستم')).toBe('دەست(i)م');
    expect(read('باشتر')).toBe('باشت(i)ر');
    // where the letters already make syllables, nothing is added
    expect(read('دەست')).toBe('دەست');
    expect(read('کورد')).toBe('کورد');
    expect(read('گەرم')).toBe('گەرم');
    expect(read('دەستمان')).toBe('دەستمان');
    // a consonant and w start a word together
    expect(read('خوا')).toBe('خوا');
    expect(read('خواردن')).toBe('خوارد(i)ن');
    const unwritten = textToSounds('من')[1]!;
    expect(unwritten).toMatchObject({ viseme: 'i', kind: 'vowel' });
    expect(unwritten.weight).toBeLessThan(textToSounds('شیر')[1]!.weight);
  });

  it('reads the letters other keyboards type as the Kurdish ones', () => {
    expect(shapes('كتێب')).toEqual(shapes('کتێب'));
    expect(shapes('يەك')).toEqual(shapes('یەک'));
    // ه: h at the start of a word, the vowel ە at its end or before a non-joiner
    expect(shapes('هات')).toEqual(['etc', 'a', 'l']);
    expect(shapes('خانه')).toEqual(['etc', 'a', 'l', 'e']);
    expect(shapes('ده‌ست')).toEqual(shapes('دەست'));
    // marks that only stretch or decorate a letter say nothing
    expect(shapes('بـــا')).toEqual(['mbp', 'a']);
  });

  it('pauses at Arabic punctuation', () => {
    expect(shapes('چۆنی؟ باشم، سوپاس.')).toEqual([
      'etc',
      'o',
      'l',
      'i',
      '|',
      'mbp',
      'a',
      'etc',
      'i',
      'mbp',
      '|',
      'etc',
      'u',
      'mbp',
      'a',
      'etc',
    ]);
    const pauses = textToSounds('چۆنی؟ باشم، سوپاس').filter((s) => s.kind === 'pause');
    expect(pauses.map((p) => p.pause)).toEqual(['long', 'short']);
  });
});

describe('scripts', () => {
  it('tells the scripts apart by their letters', () => {
    expect(detectScript('Ez baş im')).toBe('latin');
    expect(detectScript('من باشم')).toBe('arabic');
    expect(detectScript('من باشم, OK')).toBe('arabic');
    expect(detectScript('123')).toBe('latin');
  });

  it('reads a word in the other script by its own letters', () => {
    expect(shapes('سڵاو Amed')).toEqual([...shapes('سڵاو'), ...shapes('Amed')]);
  });
});
