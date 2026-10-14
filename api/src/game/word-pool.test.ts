import { describe, expect, it } from 'vitest';
import { isWordleWord } from './word-pool.js';

describe('isWordleWord', () => {
  it('takes a word made of the Kurmancî alphabet, accents and all', () => {
    for (const w of ['welat', 'çîrok', 'şev', 'xwendin', 'Kurmancî', 'pirtûk']) expect(isWordleWord(w), w).toBe(true);
  });

  it('reads a word the way the game does: decomposed letters, case, and the odd hyphen', () => {
    expect(isWordleWord('çi\u0302rok')).toBe(true);
    expect(isWordleWord('ser-av')).toBe(true);
  });

  it('refuses a letter the keyboard does not have, and a word in another script', () => {
    for (const w of ['kafé', 'öz', 'straße', 'کوردی', '']) expect(isWordleWord(w), w).toBe(false);
  });
});
