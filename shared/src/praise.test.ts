import { describe, expect, it } from 'vitest';
import { PRAISE, praiseFor, praiseWords } from './praise.js';

describe('praiseWords', () => {
  it('praises in the course variety: Soranî for Soranî, Kurmancî otherwise', () => {
    expect(praiseWords('sorani')).toBe(PRAISE.ckb);
    expect(praiseWords('ckb')).toBe(PRAISE.ckb);
    expect(praiseWords('kurmanji')).toBe(PRAISE.kmr);
    expect(praiseWords(null)).toBe(PRAISE.kmr);
  });
});

describe('praiseFor', () => {
  it('chooses by the turn and the run, the same each time', () => {
    expect(praiseFor('kurmanji', { index: 0, run: 0 })).toBe('Aferîn!');
    expect(praiseFor('kurmanji', { index: 2, run: 1 })).toBe('Gelek baş!');
    expect(praiseFor('kurmanji', { index: 5, run: 3 })).toBe(praiseFor('kurmanji', { index: 5, run: 3 }));
    expect(praiseFor('sorani', { index: 1, run: 0 })).toBe('زۆر باشە!');
  });

  it('never says the same word twice in a row', () => {
    let previous: string | null = null;
    for (let index = 0, run = 0; index < 40; index++, run = index % 7 === 0 ? 0 : run + 1) {
      const word = praiseFor('kurmanji', { index, run, previous });
      expect(word).not.toBe(previous);
      previous = word;
    }
    expect(praiseFor('kurmanji', { index: 0, run: 0, previous: 'Aferîn!' })).toBe('Pir baş!');
  });
});
