import { describe, expect, it } from 'vitest';
import {
  CKB_LETTERS,
  KMR_LETTERS,
  asLetterDialect,
  beginsWith,
  chainLetter,
  dictionaryDialect,
  firstLetter,
  followsOn,
  lastLetter,
  lookupSpellings,
  nextLetter,
  startSpellings,
  wordKey,
  wordLetters,
} from './letters.js';

// explicit code points where two letters look alike
const HEH = 'ه'; // ه arabic heh
const HEH_DO = 'ھ'; // ھ heh doachashmee (the Kurdish h)
const AE = 'ە'; // ە the Kurdish vowel e
const ZWNJ = '‌';
const ARABIC_KAF = 'ك'; // ك
const ARABIC_YEH = 'ي'; // ي

describe('the alphabets', () => {
  it('has the 31 Hawar letters, with ç ê î ş û as letters of their own', () => {
    expect(KMR_LETTERS).toHaveLength(31);
    for (const l of ['ç', 'ê', 'î', 'ş', 'û']) expect(KMR_LETTERS).toContain(l);
  });

  it('has the Soranî letters, ڕ and ڵ among them', () => {
    expect(CKB_LETTERS).toHaveLength(33);
    for (const l of ['ڕ', 'ڵ', 'ێ', 'ۆ', AE, HEH_DO, 'ئ']) expect(CKB_LETTERS).toContain(l);
    expect(CKB_LETTERS).not.toContain(HEH);
  });

  it('reads every older spelling of a dialect', () => {
    expect(asLetterDialect('kurmanji')).toBe('kmr');
    expect(asLetterDialect('kurmanci')).toBe('kmr');
    expect(asLetterDialect('kmr')).toBe('kmr');
    expect(asLetterDialect('sorani')).toBe('ckb');
    expect(asLetterDialect('ckb')).toBe('ckb');
    expect(asLetterDialect('zazaki')).toBeNull();
    expect(dictionaryDialect('kmr')).toBe('kurmanji');
    expect(dictionaryDialect('ckb')).toBe('sorani');
  });
});

describe('Kurmancî words', () => {
  it('keeps the letters with marks, lower-cased and composed', () => {
    expect(wordKey('kmr', 'Şêr')).toBe('şêr');
    expect(wordKey('kmr', 'sêv')).toBe('sêv');
    expect(wordLetters('kmr', 'çîrok')).toEqual(['ç', 'î', 'r', 'o', 'k']);
  });

  it('reads a Turkish keyboard’s dotted and dotless i as i', () => {
    expect(wordKey('kmr', 'İro')).toBe('iro');
    expect(wordKey('kmr', 'dıl')).toBe('dil');
  });

  it('forgives punctuation around the word, never inside it', () => {
    expect(wordKey('kmr', '  mal. ')).toBe('mal');
    expect(wordKey('kmr', 'mal mezin')).toBeNull();
    expect(wordKey('kmr', 'mal-a')).toBeNull();
    expect(wordKey('kmr', 'mal3')).toBeNull();
  });

  it('refuses another script and words too short to chain', () => {
    expect(wordKey('kmr', 'ئاو')).toBeNull();
    expect(wordKey('kmr', 'a')).toBeNull();
    expect(wordKey('kmr', '')).toBeNull();
    expect(wordKey('kmr', 'x'.repeat(25))).toBeNull();
  });

  it('chains on the exact last letter, ê not being e', () => {
    expect(firstLetter('kmr', 'êvar')).toBe('ê');
    expect(lastLetter('kmr', 'çêlekê')).toBe('ê');
    expect(followsOn('kmr', 'dê', 'êvar')).toBe(true);
    expect(followsOn('kmr', 'dê', 'evîn')).toBe(false);
    expect(followsOn('kmr', 'sêv', 'vexwarin')).toBe(true);
    expect(followsOn('kmr', 'mas', 'şev')).toBe(false);
    expect(nextLetter('kmr', 'Kurmancî')).toBe('î');
    expect(startSpellings('kmr', 'ş')).toEqual(['ş']);
  });
});

describe('Soranî words', () => {
  it('reads the Arabic keyboard’s letters as Kurdish ones', () => {
    expect(wordKey('ckb', `${ARABIC_KAF}ور`)).toBe('کور');
    expect(wordKey('ckb', `${ARABIC_YEH}ار${ARABIC_YEH}`)).toBe('یاری');
  });

  it('reads a bare ه as the vowel at the end and the consonant elsewhere', () => {
    expect(wordKey('ckb', `${HEH}ات`)).toBe(`${HEH_DO}ات`);
    expect(wordKey('ckb', `ما${HEH}`)).toBe(`ما${AE}`);
    expect(wordKey('ckb', `ب${HEH}${ZWNJ}رد`)).toBe(`ب${AE}رد`);
    // the Kurdish h stays h even at the end
    expect(lastLetter('ckb', `شا${HEH_DO}`)).toBe(HEH_DO);
  });

  it('drops tatweel, short-vowel marks and invisible marks', () => {
    expect(wordKey('ckb', 'کـــور')).toBe('کور');
    expect(wordKey('ckb', 'کُور')).toBe('کور');
    expect(wordKey('ckb', '‏کور‏')).toBe('کور');
  });

  it('folds presentation forms to their letters', () => {
    // ﻛﻮﺭ: kaf initial, waw final, reh isolated, as some keyboards send them
    expect(wordKey('ckb', 'ﻛﻮﺭ')).toBe('کور'.replace('ک', 'ك').normalize('NFKC').replace('ك', 'ک'));
  });

  it('refuses Latin letters, digits and two words', () => {
    expect(wordKey('ckb', 'kur')).toBeNull();
    expect(wordKey('ckb', 'کور ٣')).toBeNull();
    expect(wordKey('ckb', 'ئاو و نان')).toBeNull();
  });

  it('begins a word that starts with a vowel at the vowel after ئ', () => {
    expect(firstLetter('ckb', 'ئاو')).toBe('ا');
    expect(firstLetter('ckb', 'ئێمە')).toBe('ێ');
    expect(firstLetter('ckb', 'ئیش')).toBe('ی');
    expect(firstLetter('ckb', 'یاری')).toBe('ی');
    expect(firstLetter('ckb', 'باران')).toBe('ب');
  });

  it('lets ئا follow a word ending in ا, and ی or ئی follow one ending in ی', () => {
    expect(followsOn('ckb', 'چرا', 'ئاو')).toBe(true);
    expect(followsOn('ckb', 'ماسی', 'یاری')).toBe(true);
    expect(followsOn('ckb', 'ماسی', 'ئیش')).toBe(true);
    expect(followsOn('ckb', 'ماسی', 'ئاو')).toBe(false);
  });

  it('treats r and the trilled r as one letter to chain on, and l and the dark l', () => {
    expect(chainLetter('ckb', 'ڕ')).toBe('ر');
    expect(chainLetter('ckb', 'ڵ')).toBe('ل');
    expect(followsOn('ckb', 'دار', 'ڕۆژ')).toBe(true);
    expect(followsOn('ckb', 'باڵ', 'لێو')).toBe(true);
    expect(followsOn('ckb', 'باڵ', 'ڕۆژ')).toBe(false);
    expect(beginsWith('ckb', 'ڕۆژ', 'ڕ')).toBe(true);
  });

  it('says how a word beginning with each letter is written at its start', () => {
    expect(startSpellings('ckb', 'ا')).toEqual(['ئا']);
    expect(startSpellings('ckb', 'ی')).toEqual(['ی', 'ئی']);
    expect(startSpellings('ckb', 'ڕ')).toEqual(['ڕ', 'ر']);
    expect(startSpellings('ckb', 'ب')).toEqual(['ب']);
  });

  it('looks a word up under the Arabic look-alikes an older text may have used', () => {
    const spellings = lookupSpellings('ckb', `${HEH_DO}اتە`);
    expect(spellings).toContain(`${HEH_DO}اتە`);
    expect(spellings).toContain(`${HEH}اتە`);
    expect(spellings).toContain(`${HEH_DO}ات${HEH}`);
    expect(spellings).toContain(`${HEH}ات${HEH}`);
    // and every spelling reads back as the same word
    for (const s of spellings) expect(wordKey('ckb', s)).toBe(`${HEH_DO}اتە`);
    expect(lookupSpellings('kmr', 'sêv')).toEqual(['sêv']);
  });

  it('caps the spellings tried for one word', () => {
    expect(lookupSpellings('ckb', 'کیکیکیکیکیکی').length).toBeLessThanOrEqual(32);
  });
});
