import { describe, expect, it } from 'vitest';
import { foldLookAlikes, guessNames, sameClue, saysBanned, textSlip } from './clues.js';

// stand-in Kurdish for the fixtures, never shown to a learner
const LIMITS = { maxChars: 20, maxWords: 3 };

describe('a text that can be a move', () => {
  it('is written, short enough, and in the variety’s own script', () => {
    expect(textSlip('  ', 'kmr', LIMITS)).toBe('empty');
    expect(textSlip('?!', 'kmr', LIMITS)).toBe('empty');
    expect(textSlip('heywanek e', 'kmr', LIMITS)).toBeNull();
    expect(textSlip('heywanekî pir biçûk e', 'kmr', LIMITS)).toBe('too-long');
    expect(textSlip('yek du sê çar', 'kmr', { maxChars: 40, maxWords: 3 })).toBe('too-many-words');
    expect(textSlip('گیانلەبەر', 'kmr', LIMITS)).toBe('script');
    expect(textSlip('animal', 'ckb', LIMITS)).toBe('script');
    expect(textSlip('گیانلەبەر', 'ckb', LIMITS)).toBeNull();
    // one Latin word in a Soranî clue is not a Soranî clue
    expect(textSlip('گیانلەبەر cat', 'ckb', LIMITS)).toBe('script');
  });
});

describe('saying a banned word', () => {
  it('hears the word itself, without its marks, and with the endings Kurmancî adds', () => {
    expect(saysBanned('pisîk', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('Pisik!', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('pisîka me', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('du pisîkên spî', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('heywanek biçûk', 'kmr', ['pisîk'])).toBeNull();
  });

  it('hears a long word inside a longer one, and the base of a word the card gives with an ending', () => {
    expect(saysBanned('mamosteyan', 'kmr', ['mamoste'])).toBe('mamoste');
    expect(saysBanned('xwendekar', 'kmr', ['kitêban'])).toBeNull();
    expect(saysBanned('kitêb', 'kmr', ['kitêban'])).toBe('kitêban');
  });

  it('matches a short word strictly, so its letters at the start of another word are not refused', () => {
    expect(saysBanned('av', 'kmr', ['av'])).toBe('av');
    expect(saysBanned('ava sar', 'kmr', ['av'])).toBe('av');
    expect(saysBanned('avahî', 'kmr', ['av'])).toBeNull();
  });

  it('hears a banned phrase only with its words in a row', () => {
    expect(saysBanned('roja baş', 'kmr', ['roj baş'])).toBeNull();
    expect(saysBanned('ji te re roj baş', 'kmr', ['roj baş'])).toBe('roj baş');
  });

  it('hears Soranî’s endings, and its letters typed without their marks', () => {
    expect(saysBanned('پشیلەکە', 'ckb', ['پشیلە'])).toBe('پشیلە');
    expect(saysBanned('پشیلەکان', 'ckb', ['پشیلە'])).toBe('پشیلە');
    // ڕ typed as ر
    expect(saysBanned('رووبار', 'ckb', ['ڕووبار'])).toBe('ڕووبار');
    expect(saysBanned('گیانلەبەر', 'ckb', ['پشیلە'])).toBeNull();
  });

  it('names the first banned word it hears, as the card writes it', () => {
    expect(saysBanned('sêva sor', 'kmr', ['fêkî', 'sêv', 'sor'])).toBe('sêv');
  });
});

describe('a guess', () => {
  it('names the word with or without its marks, with a short ending, or among a few words', () => {
    expect(guessNames('pisîk', 'pisîk', 'kmr')).toBe(true);
    expect(guessNames('pisik', 'pisîk', 'kmr')).toBe(true);
    expect(guessNames('pisîkek', 'pisîk', 'kmr')).toBe(true);
    expect(guessNames('ew pisîk e', 'pisîk', 'kmr')).toBe(true);
    expect(guessNames('kûçik', 'pisîk', 'kmr')).toBe(false);
    expect(guessNames('پشیلەکە', 'پشیلە', 'ckb')).toBe(true);
    expect(guessNames('پشیلە', 'سەگ', 'ckb')).toBe(false);
  });

  it('does not take a long word that only begins like a short one', () => {
    expect(guessNames('avahî', 'av', 'kmr')).toBe(false);
  });
});

describe('the same clue', () => {
  it('is the same letters, whatever the case, marks and punctuation', () => {
    expect(sameClue('Heywan!', 'heywan', 'kmr')).toBe(true);
    expect(sameClue('heywan', 'heywanek', 'kmr')).toBe(false);
  });
});

describe('a banned word typed so as not to look like itself', () => {
  it('is heard through spaces and punctuation put inside it', () => {
    expect(saysBanned('pi sîk', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('p i s î k', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('heywan pi-sîk', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('pi.sîka me', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('pisî kên spî', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('kit êb', 'kmr', ['kitêban'])).toBe('kitêban');
    expect(saysBanned('پشی لە', 'ckb', ['پشیلە'])).toBe('پشیلە');
    // a phrase written as one word, or split elsewhere
    expect(saysBanned('rojbaş', 'kmr', ['roj baş'])).toBe('roj baş');
    expect(saysBanned('ro j baş', 'kmr', ['roj baş'])).toBe('roj baş');
  });

  it('is not heard where two real words only meet in the letters of a short one', () => {
    expect(saysBanned('ma li vir e', 'kmr', ['mal'])).toBeNull();
    expect(saysBanned('ma l', 'kmr', ['mal'])).toBe('mal');
    expect(saysBanned('bide stranê', 'kmr', ['dest'])).toBeNull();
  });

  it('is heard through look-alike letters of other alphabets and compatibility forms', () => {
    // a Cyrillic а and о, a Greek ι, fullwidth Latin
    expect(saysBanned('pisîkа', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('mamоste', 'kmr', ['mamoste'])).toBe('mamoste');
    expect(saysBanned('pιsîk', 'kmr', ['pisîk'])).toBe('pisîk');
    expect(saysBanned('ｐｉｓｉｋ', 'kmr', ['pisîk'])).toBe('pisîk');
    // Arabic presentation forms and a stretched word
    expect(saysBanned('ﭘﺸﯿﻠﻪ', 'ckb', ['پشیلە'])).toBe('پشیلە');
    expect(saysBanned('پشـــیلە', 'ckb', ['پشیلە'])).toBe('پشیلە');
    expect(foldLookAlikes('Ρisîk')).toBe('pisîk');
  });

  it('is refused as a slip when it carries a letter of neither script', () => {
    expect(textSlip('pisîkа', 'kmr', LIMITS)).toBe('script');
    expect(textSlip('ｐｉｓｉｋ', 'kmr', LIMITS)).toBe('script');
    expect(textSlip('heywan ɑ', 'kmr', LIMITS)).toBe('script');
    expect(textSlip('pisîk', 'kmr', LIMITS)).toBeNull();
    expect(textSlip('çêlek û şêr', 'kmr', LIMITS)).toBeNull();
    expect(textSlip('ڕووبار و ماڵ', 'ckb', LIMITS)).toBeNull();
  });
});
