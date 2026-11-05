/**
 * A typed answer in a learning game is taken as a lesson takes one, with each
 * variety's lenient letters as typos: case, punctuation and spacing never
 * matter, a lost mark is accepted as a typo, another word is wrong.
 */
import { describe, expect, it } from 'vitest';
import { typedVerdict, wordsInPlace } from './typed.js';

// stand-in words for the grader, never shown to a learner
describe('a typed answer', () => {
  it('is right as written, whatever its case, spacing and punctuation', () => {
    expect(typedVerdict('mal', 'Mal', 'kmr')).toBe('right');
    expect(typedVerdict('  ez   diçim malê ', 'Ez diçim malê.', 'kmr')).toBe('right');
    expect(typedVerdict('ماڵ', 'ماڵ', 'ckb')).toBe('right');
  });

  it('is a typo, and accepted, when only a Kurmancî mark is lost', () => {
    expect(typedVerdict('male', 'malê', 'kmr')).toBe('typo');
    expect(typedVerdict('ez dicim', 'ez diçim', 'kmr')).toBe('typo');
  });

  it('is a typo, and accepted, when a Soranî keyboard lost a letter’s mark', () => {
    expect(typedVerdict('مال', 'ماڵ', 'ckb')).toBe('typo');
    expect(typedVerdict('دیت', 'دێت', 'ckb')).toBe('typo');
  });

  it('is wrong when it is another word, or nothing', () => {
    expect(typedVerdict('nan', 'mal', 'kmr')).toBe('wrong');
    expect(typedVerdict('', 'mal', 'kmr')).toBe('wrong');
    expect(typedVerdict('mal', [], 'kmr')).toBe('wrong');
  });

  it('may be any of several ways of writing it', () => {
    expect(typedVerdict('ez naçim', ['Ez na çim', 'Ez naçim'], 'kmr')).toBe('right');
  });

  it('marks which typed words stand right, for the nudge', () => {
    expect(wordsInPlace('ez dicim bajar', 'Ez diçim malê', 'kmr')).toEqual([true, true, false]);
    expect(wordsInPlace('ez', 'Ez diçim malê', 'kmr')).toEqual([true]);
    expect(wordsInPlace('ez diçim malê zû', 'Ez diçim malê', 'kmr')).toEqual([true, true, true, false]);
  });
});
