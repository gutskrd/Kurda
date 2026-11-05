import { describe, expect, it } from 'vitest';
import { guessNames, sameClue, saysBanned, textSlip } from './clues.js';

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
