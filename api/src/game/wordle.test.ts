import { describe, expect, it } from 'vitest';
import {
  applyGuess,
  initGame,
  InMemoryDictionary,
  keyboardFromGuesses,
  MAX_ATTEMPTS,
  mergeKeyboard,
  normalizeWord,
  scoreGuess,
  toLetters,
  validateGuess,
  type LetterFeedback,
} from './wordle.js';

// A small Kurdish dictionary for tests (5- and 6-letter words).
const dict = new InMemoryDictionary([
  'pirtûk', // book (6)
  'perdek', // curtain-ish (6) — for the P-green example
  'mala', // house (4)
  'kerpîç', // brick (6)
  'salan', // years (5)
  'gulan', // May / roses (5)
  'çîrok', // story (5)
  'şîrîn', // sweet (5)
]);

describe('normalizeWord / toLetters', () => {
  it('lowercases, NFC-normalizes, and strips non-letters', () => {
    expect(normalizeWord('  Pirtûk! ')).toBe('pirtûk');
  });

  it('splits Kurdish letters (ê î û ç ş) as single letters', () => {
    expect(toLetters('KERPÎÇ')).toEqual(['k', 'e', 'r', 'p', 'î', 'ç']);
    expect(toLetters('pirtûk')).toHaveLength(6);
  });

  it('treats equivalent Unicode encodings as equal', () => {
    // û composed (NFC) vs decomposed (u + combining circumflex, NFD)
    const composed = 'pirtûk';
    const decomposed = 'pirtûk'.normalize('NFD');
    expect(normalizeWord(decomposed)).toBe(normalizeWord(composed));
  });
});

describe('scoreGuess — basic coloring', () => {
  it('greens a correct letter in the correct position', () => {
    // pirtûk vs perdek → p_r__k are exact matches
    expect(scoreGuess('pirtûk', 'perdek')).toEqual<LetterFeedback[]>([
      'green', // p
      'gray', // e vs i
      'green', // r
      'gray', // d vs t
      'gray', // e vs û
      'green', // k
    ]);
  });

  it('yellows a letter that exists but is in the wrong position', () => {
    // kerpîç vs pirtûk share p (wrong spot) and k... check p is yellow
    const fb = scoreGuess('pirtûk', 'kerpîç');
    // k(0) and p(3) exist in the target but in the wrong spot → yellow.
    // î(4) is a distinct letter from the target's i → gray (not present).
    expect(fb[0]).toBe('yellow'); // k
    expect(fb[3]).toBe('yellow'); // p
    expect(fb[4]).toBe('gray'); // î is not the same letter as i
  });

  it('grays letters that do not exist in the target', () => {
    // salan vs (target) gulan: s gray, then a/l/a/n line up
    expect(scoreGuess('gulan', 'salan')[0]).toBe('gray'); // s not in gulan
  });
});

describe('scoreGuess — official duplicate-letter algorithm', () => {
  it('AAAA vs MALA colors only the two real As (as green), rest gray — never all yellow', () => {
    // mala = m a l a ; guess a a a a
    expect(scoreGuess('mala', 'aaaa')).toEqual<LetterFeedback[]>([
      'gray', // pos0 a vs m
      'green', // pos1 a vs a
      'gray', // pos2 a vs l
      'green', // pos3 a vs a
    ]);
  });

  it('does not over-award yellows beyond the count in the target', () => {
    // target has one â? use gulan (one a). guess salan has two a's.
    // gulan = g u l a n ; salan = s a l a n
    const fb = scoreGuess('gulan', 'salan');
    // pos1 a (target a is at pos3) → yellow; pos3 a → exact match green.
    // Only one non-green a should be yellow; there is exactly one a left after green.
    const greens = fb.filter((f) => f === 'green').length;
    const yellows = fb.filter((f) => f === 'yellow').length;
    expect(fb[3]).toBe('green'); // a exact
    expect(fb[2]).toBe('green'); // l exact
    expect(fb[4]).toBe('green'); // n exact
    // the extra a at pos1 has no remaining a (only one a, consumed by the green) → gray
    expect(fb[1]).toBe('gray');
    expect(greens).toBe(3);
    expect(yellows).toBe(0);
  });
});

describe('validateGuess', () => {
  it('accepts a dictionary word of the right length', () => {
    expect(validateGuess('perdek', 6, dict)).toMatchObject({ ok: true, normalized: 'perdek' });
  });

  it('rejects a wrong-length guess before dictionary lookup', () => {
    expect(validateGuess('mala', 6, dict)).toEqual({ ok: false, reason: 'wrong-length' });
  });

  it('rejects a right-length word that is not in the dictionary', () => {
    expect(validateGuess('zzzzzz', 6, dict)).toEqual({ ok: false, reason: 'not-a-word' });
  });

  it('counts length in Kurdish letters, not code units', () => {
    // kerpîç is 6 letters even though it contains multibyte î/ç
    expect(validateGuess('KERPÎÇ', 6, dict)).toMatchObject({ ok: true });
  });
});

describe('keyboard state (upgrade-only)', () => {
  it('takes the best status per letter and never downgrades', () => {
    let kb: Record<string, LetterFeedback> = {};
    kb = mergeKeyboard(kb, ['a', 'b'], ['yellow', 'gray']);
    expect(kb).toEqual({ a: 'yellow', b: 'gray' });
    // a later seen green upgrades; b later yellow upgrades from gray
    kb = mergeKeyboard(kb, ['a', 'b'], ['green', 'yellow']);
    expect(kb).toEqual({ a: 'green', b: 'yellow' });
    // a green stays green even if later seen gray/yellow
    kb = mergeKeyboard(kb, ['a'], ['gray']);
    expect(kb.a).toBe('green');
  });

  it('keyboardFromGuesses rebuilds the same state', () => {
    const rows = [
      { guess: 'salan', letters: toLetters('salan'), feedback: scoreGuess('gulan', 'salan'), correct: false },
      { guess: 'gulan', letters: toLetters('gulan'), feedback: scoreGuess('gulan', 'gulan'), correct: true },
    ];
    const kb = keyboardFromGuesses(rows);
    expect(kb.g).toBe('green'); // g is green in the winning guess
    expect(kb.a).toBe('green'); // a exact in gulan
  });
});

describe('applyGuess — game flow', () => {
  it('wins on an all-green guess', () => {
    const g0 = initGame(toLetters('gulan').length);
    const res = applyGuess(g0, 'gulan', 'gulan', dict);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.game.status).toBe('won');
      expect(res.row.correct).toBe(true);
      expect(res.game.guesses).toHaveLength(1);
    }
  });

  it('does not consume an attempt on an invalid guess', () => {
    const g0 = initGame(5);
    const res = applyGuess(g0, 'gulan', 'mala', dict); // wrong length
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('wrong-length');
      expect(res.game.guesses).toHaveLength(0);
      expect(res.game.status).toBe('playing');
    }
  });

  it('loses after MAX_ATTEMPTS non-winning guesses', () => {
    let game = initGame(5);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const res = applyGuess(game, 'gulan', 'çîrok', dict); // valid word, not the answer
      expect(res.ok).toBe(true);
      if (res.ok) game = res.game;
    }
    expect(game.guesses).toHaveLength(MAX_ATTEMPTS);
    expect(game.status).toBe('lost');
  });

  it('is a no-op once the game is over', () => {
    const g0 = initGame(5);
    const won = applyGuess(g0, 'gulan', 'gulan', dict);
    expect(won.ok).toBe(true);
    if (won.ok) {
      const after = applyGuess(won.game, 'gulan', 'çîrok', dict);
      expect(after.ok).toBe(false);
      expect(after.game.guesses).toHaveLength(1);
    }
  });

  it('never stores the target on the game state (safe to send to client)', () => {
    const g0 = initGame(5);
    const res = applyGuess(g0, 'gulan', 'çîrok', dict);
    expect(JSON.stringify(res.game)).not.toContain('gulan');
  });
});
