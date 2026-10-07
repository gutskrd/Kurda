import { describe, expect, it } from 'vitest';
import {
  answerKey,
  dictionaryKey,
  foldDiacritics,
  foldLetter,
  letterCount,
  letterKey,
  normalizeKurdish,
} from './kurdish-text.js';

// Explicit code points so precomposed vs. decomposed intent is unambiguous.
const E_CIRC = String.fromCharCode(0xea); // precomposed e-circumflex
const E_CIRC_DECOMPOSED = 'e' + String.fromCharCode(0x302); // e + combining circumflex
const S_CEDILLA_DECOMPOSED = 's' + String.fromCharCode(0x327); // s + combining cedilla

describe('normalizeKurdish', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeKurdish('  jiyan   bi  kurdî ')).toBe('jiyan bi kurdî');
  });

  it('normalizes decomposed characters to NFC', () => {
    expect(normalizeKurdish(E_CIRC_DECOMPOSED)).toBe(E_CIRC);
  });

  it('preserves Kurdish diacritics', () => {
    expect(normalizeKurdish('şêr û çem')).toBe('şêr û çem');
  });
});

describe('foldDiacritics', () => {
  it('folds all Kurdish diacritics to base letters', () => {
    expect(foldDiacritics('êîûçş ÊÎÛÇŞ')).toBe(
      'eiucs EIUCS',
    );
  });

  it('folds decomposed input the same as precomposed', () => {
    const decomposed = `${S_CEDILLA_DECOMPOSED}${E_CIRC_DECOMPOSED}v`;
    expect(foldDiacritics(decomposed)).toBe('sev');
    expect(foldDiacritics(decomposed)).toBe(foldDiacritics('şêv'));
  });

  it('leaves plain Latin text untouched', () => {
    expect(foldDiacritics('kurda')).toBe('kurda');
  });
});

describe('letterCount', () => {
  it('counts letters, not characters', () => {
    expect(letterCount('roj')).toBe(3);
    expect(letterCount("av'a")).toBe(3);
    expect(letterCount('bi rê')).toBe(4);
    expect(letterCount('xwe-bi-xwe')).toBe(8);
  });

  /**
   * A decomposed ê is two code points and one letter. Counting it as two puts
   * the word in the wrong Wordle band, where it becomes a target the grid has
   * no room for.
   */
  it('counts a decomposed diacritic once', () => {
    expect(letterCount('sêv')).toBe(3);
    expect(letterCount('sêv')).toBe(3);
    expect(letterCount('şûşe')).toBe(4);
  });

  it('is zero for a word with no letters in it', () => {
    expect(letterCount('')).toBe(0);
    expect(letterCount('— 42 —')).toBe(0);
  });
});

describe('letterKey and dictionaryKey', () => {
  it('both reduce a word to its letters', () => {
    for (const key of [letterKey, dictionaryKey]) {
      expect(key('Bi Roj!')).toBe('biroj');
      expect(key("av'a")).toBe('ava');
      expect(key('xwe-bi-xwe')).toBe('xwebixwe');
    }
  });

  /**
   * The whole reason there are two. A game compares a typed guess, where ê and
   * e are different letters in different squares; a search and an importer look
   * a word *up*, where somebody typing "sev" means sêv.
   */
  it('differ on exactly one thing: the diacritics', () => {
    expect(letterKey('sêv')).toBe('sêv');
    expect(dictionaryKey('sêv')).toBe('sev');
    expect(letterKey('pirtûk')).toBe('pirtûk');
    expect(dictionaryKey('pirtûk')).toBe('pirtuk');
    expect(letterKey('çîrok')).toBe('çîrok');
    expect(dictionaryKey('çîrok')).toBe('cirok');
  });

  /**
   * The games hand `wordExists` a value that has already been through
   * `letterKey`, so the lookup key is computed from a key rather than from the
   * raw word. Applying it twice has to mean the same as applying it once.
   */
  it('dictionaryKey is idempotent, and agrees whichever order it is reached by', () => {
    for (const word of ['sêv', 'Bi Rê!', 'ŞÛŞE', 'xwe-bi-xwe']) {
      const once = dictionaryKey(word);
      expect(dictionaryKey(once), word).toBe(once);
      expect(dictionaryKey(letterKey(word)), word).toBe(once);
    }
  });

  it('leaves a word with no diacritics alone', () => {
    expect(dictionaryKey('roj')).toBe('roj');
    expect(letterKey('roj')).toBe('roj');
  });
});

describe('foldLetter', () => {
  it('folds the Arabic-script variants of one Kurdish letter together', () => {
    expect(foldLetter('ك')).toBe('ک');
    expect(foldLetter('ي')).toBe('ی');
    expect(foldLetter('ى')).toBe('ی');
    expect(foldLetter('ه')).toBe('ھ');
    expect(foldLetter('ۀ')).toBe('ە');
    expect(foldLetter('ı')).toBe('i');
  });

  it('leaves every other letter alone', () => {
    for (const ch of ['ک', 'ی', 'ھ', 'ە', 'ڕ', 'ر', 'ڵ', 'ل', 'a', 'ê', 'ş']) {
      expect(foldLetter(ch), ch).toBe(ch);
    }
  });
});

/** Persian-keyboard spelling of ە inside a word: heh + zero-width non-joiner. */
const ZWNJ = '‌';

describe('answerKey', () => {
  /**
   * The same Soranî word typed on a Kurdish keyboard and on an Arabic or
   * Persian one. Every pair here is one word, and a learner who typed either
   * half has typed it right.
   */
  it('reads a Soranî word typed on an Arabic or Persian keyboard as the same word', () => {
    const pairs: Array<[kurdish: string, typed: string]> = [
      ['کوردستان', 'كوردستان'], // Arabic kaf
      ['چۆنی', 'چۆني'], // Arabic yeh
      ['چۆنی', 'چۆنى'], // alef maksura
      ['ھات', 'هات'], // the consonant h as Arabic heh
      ['خانە', 'خانه'], // the vowel at the end of a word as heh
      ['ئەمە', `ئه${ZWNJ}مه`], // ە inside a word as heh + ZWNJ
      ['بەیانی باش', `به${ZWNJ}ياني باش`],
      ['ھەڵە', `هه${ZWNJ}ڵه`],
      ['خانەیەک', 'خانۀیەک'], // heh with yeh above
    ];
    for (const [kurdish, typed] of pairs) {
      expect(answerKey(typed), `${typed} should read as ${kurdish}`).toBe(answerKey(kurdish));
    }
  });

  it('keeps letters that are different letters apart', () => {
    expect(answerKey('کەر')).not.toBe(answerKey('کەڕ')); // donkey / deaf
    expect(answerKey('گوڵ')).not.toBe(answerKey('گول'));
    expect(answerKey('ھەر')).not.toBe(answerKey('ئەر'));
  });

  /**
   * Only a word's last letter is ambiguous. A letter standing alone is the
   * letter: "which one is h?" must not accept the vowel.
   */
  it('keeps a lone ھ and a lone ە apart', () => {
    expect(answerKey('ھ')).toBe('ھ');
    expect(answerKey('ە')).toBe('ە');
    expect(answerKey('ھ')).not.toBe(answerKey('ە'));
    expect(answerKey('ه')).toBe('ھ'); // Arabic heh alone is still h
    expect(answerKey(' ھ ')).toBe('ھ');
    expect(answerKey('ھ و ە')).toBe('ھ و ە');
    expect(answerKey(`ه${ZWNJ}`)).toBe('ە'); // how a Persian keyboard types ە alone
    // …while at the end of a word the three are still one
    expect(answerKey('خانھ')).toBe(answerKey('خانە'));
    expect(answerKey('خانه، باش')).toBe(answerKey('خانە، باش'));
  });

  it('drops invisible formatting a phone puts around right-to-left text', () => {
    expect(answerKey('‏سڵاو‏')).toBe('سڵاو');
    expect(answerKey('⁧سڵاو⁩')).toBe('سڵاو');
    expect(answerKey('سـڵاو')).toBe('سڵاو'); // tatweel
    expect(answerKey(`زۆر${ZWNJ} سوپاس`)).toBe('زۆر سوپاس');
  });

  it('reads Persian and Arabic-Indic digits as digits', () => {
    expect(answerKey('۳')).toBe('3');
    expect(answerKey('٣')).toBe('3');
    expect(answerKey('١٠')).toBe('10');
  });

  /**
   * ê and e are different letters in Kurmancî. Whether a missing one is
   * forgiven is the grader's call (lenient or strict), so the key must not
   * make it for the grader.
   */
  it('keeps Kurmancî diacritics', () => {
    expect(answerKey('sêv')).toBe('sêv');
    expect(answerKey('sêv')).not.toBe(answerKey('sev'));
    expect(answerKey('şer')).not.toBe(answerKey('ser'));
  });

  it('lower-cases, collapses whitespace and composes, as before', () => {
    expect(answerKey('  Ez  BAŞ im ')).toBe('ez baş im');
    expect(answerKey('sêv')).toBe('sêv');
  });

  it('reads Turkish-keyboard i letters as Hawar i', () => {
    expect(answerKey('BİR')).toBe('bir');
    expect(answerKey('kurdı')).toBe('kurdi');
  });
});
