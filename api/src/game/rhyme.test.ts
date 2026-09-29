import { describe, expect, it } from 'vitest';
import { POINTS_BASE, SPEED_BONUS } from './scoring.js';
import {
  classifyRhyme,
  sharedEnding,
  rhymeKey,
  rhymePrefix,
  evaluateSubmission,
  InMemoryLexicon,
  normalizeWord,
  rhymePoints,
  RHYME_QUALITY_MULTIPLIER,
  type Dialect,
} from './rhyme.js';

// A small Kurmancî lexicon for tests. roj = day, soj = burn, koj?, gul = rose,
// dil = heart, dur = far, jîn = life, şîn = blue/mourning.
const KURMANCI_WORDS = ['roj', 'soj', 'gul', 'kul', 'dil', 'gîn', 'jîn', 'şîn', 'av', 'hev', 'dar'];
const lexicon = new InMemoryLexicon(
  KURMANCI_WORDS.map((word) => ({ word, dialect: 'kurmanci' as Dialect })),
);

describe('normalizeWord', () => {
  it('lowercases and strips punctuation, spaces, and digits', () => {
    expect(normalizeWord('  Roj! ')).toBe('roj');
    expect(normalizeWord('gul-2')).toBe('gul');
  });

  it('keeps Kurmancî letters ê î û ç ş as single letters', () => {
    expect(normalizeWord('JÎN')).toBe('jîn');
    expect(normalizeWord('Şîn')).toBe('şîn');
  });

  it('strips Arabic combining vowel marks (harakat) but keeps letters', () => {
    // fatha (U+064E) is a combining mark → removed; the base letters remain.
    expect(normalizeWord('کوردی')).toBe('کوردی');
    expect(normalizeWord('کَوردی')).toBe('کوردی');
  });
});

describe('sharedEnding', () => {
  /** The worked example the rule is written from: kurdistan, read backwards. */
  it('counts backwards from the last letter and stops at the first difference', () => {
    expect(sharedEnding('kurdistan', 'baran')).toBe(2); // n, a, then t vs r
    expect(sharedEnding('kurdistan', 'kurdistan')).toBe(9);
    expect(sharedEnding('kurdistan', 'stan')).toBe(4);
  });

  it('never looks past a letter that differs', () => {
    // -an- runs through both, but the last letters are d and t
    expect(sharedEnding('hand', 'want')).toBe(0);
  });

  it('is zero against an empty word, and symmetric', () => {
    expect(sharedEnding('roj', '')).toBe(0);
    expect(sharedEnding('', '')).toBe(0);
    expect(sharedEnding('mal', 'sal')).toBe(sharedEnding('sal', 'mal'));
  });
});

describe('rhymeKey and rhymePrefix', () => {
  it('writes a word backwards, normalized', () => {
    expect(rhymeKey('Kurdistan')).toBe('natsidruk');
    expect(rhymeKey(' baran! ')).toBe('narab');
    expect(rhymeKey('kurdistanê')).toBe('ênatsidruk');
  });

  /**
   * The equivalence the whole scheme rests on: two words rhyme perfectly iff
   * their rhyme keys share a two-character prefix, and at all iff they share
   * one. Asserted directly rather than trusted.
   */
  it('agrees with classifyRhyme', () => {
    const pairs: Array<[string, string]> = [
      ['kurdistan', 'baran'],
      ['gul', 'kul'],
      ['dil', 'gîl'],
      ['roj', 'soz'],
      ['av', 'dil'],
    ];
    for (const [a, b] of pairs) {
      const quality = classifyRhyme(a, b);
      const sharesTwo = rhymePrefix(a, 2) !== null && rhymeKey(b).startsWith(rhymePrefix(a, 2)!);
      const sharesOne = rhymePrefix(a, 1) !== null && rhymeKey(b).startsWith(rhymePrefix(a, 1)!);
      expect(sharesTwo, `${a}/${b} perfect`).toBe(quality === 'perfect');
      expect(sharesOne, `${a}/${b} rhymes at all`).toBe(quality !== 'none');
    }
  });

  /**
   * A one-letter word has no perfect rhymes — nothing can share two final
   * letters with it. A one-character prefix would have matched every word
   * ending in that letter and called them all perfect.
   */
  it('has no two-letter prefix for a one-letter word', () => {
    expect(rhymePrefix('a', 2)).toBeNull();
    expect(rhymePrefix('a', 1)).toBe('a');
    expect(rhymePrefix('', 1)).toBeNull();
    expect(rhymePrefix('roj', 0)).toBeNull();
  });

  it('reads Arabic script the same way', () => {
    expect(rhymePrefix('کوردستان', 2)).toBe(rhymePrefix('باران', 2));
  });
});

describe('classifyRhyme (Kurmancî)', () => {
  it('perfect on two shared letters or more', () => {
    expect(classifyRhyme('gul', 'kul')).toBe('perfect'); // -ul
    expect(classifyRhyme('jîn', 'şîn')).toBe('perfect'); // -în
    expect(classifyRhyme('kurdistan', 'baran')).toBe('perfect'); // -an
  });

  it('near on exactly one', () => {
    expect(classifyRhyme('dil', 'gîl')).toBe('near'); // -l, then i vs î
    expect(classifyRhyme('roj', 'baj')).toBe('near'); // -j, then o vs a
  });

  /**
   * The narrowing this rule makes. The old engine compared the final vowel and
   * the coda separately, so `roj`/`soz` counted as a slant rhyme on the shared
   * -o-. A rhyme now has to reach the end of the word: if the last letters
   * differ there is no rhyme, whatever the words share further back.
   */
  it('none when the last letters differ, however much precedes them', () => {
    expect(classifyRhyme('roj', 'soz')).toBe('none');
    expect(classifyRhyme('roj', 'gul')).toBe('none');
    expect(classifyRhyme('av', 'dil')).toBe('none');
  });

  it('is case- and punctuation-insensitive', () => {
    expect(classifyRhyme('GUL', ' kul! ')).toBe('perfect');
  });

  /**
   * Letters, not sounds, so it needs no vowel table per dialect and reads
   * Soranî's script the same way it reads Kurmancî's.
   */
  it('works the same in Arabic script', () => {
    // کوردستان / باران — ن, ا, then ت against ر: two shared letters
    expect(classifyRhyme('کوردستان', 'باران')).toBe('perfect');
    // کوردی / فارسی — ی, then د against س: one
    expect(classifyRhyme('کوردی', 'فارسی')).toBe('near');
  });

  it('is none when either side has no letters at all', () => {
    expect(classifyRhyme('roj', '123')).toBe('none');
    expect(classifyRhyme('', 'roj')).toBe('none');
  });
});

describe('rhymePoints', () => {
  it('is zero for a non-rhyme regardless of speed', () => {
    expect(rhymePoints({ quality: 'none', elapsedMs: 0, windowMs: 10000 })).toBe(0);
  });

  it('gives a perfect rhyme the full #053 curve', () => {
    // answered instantly → base + full speed bonus
    expect(rhymePoints({ quality: 'perfect', elapsedMs: 0, windowMs: 10000 })).toBe(
      POINTS_BASE + SPEED_BONUS,
    );
    // answered at the deadline → base only
    expect(rhymePoints({ quality: 'perfect', elapsedMs: 10000, windowMs: 10000 })).toBe(
      POINTS_BASE,
    );
  });

  it('halves the score for a near rhyme', () => {
    const perfect = rhymePoints({ quality: 'perfect', elapsedMs: 4000, windowMs: 10000 });
    const near = rhymePoints({ quality: 'near', elapsedMs: 4000, windowMs: 10000 });
    expect(near).toBe(Math.round(perfect * RHYME_QUALITY_MULTIPLIER.near));
  });

  it('rewards a faster answer more than a slower one', () => {
    const fast = rhymePoints({ quality: 'perfect', elapsedMs: 1000, windowMs: 10000 });
    const slow = rhymePoints({ quality: 'perfect', elapsedMs: 8000, windowMs: 10000 });
    expect(fast).toBeGreaterThan(slow);
  });

  it('clamps out-of-range elapsed instead of going negative', () => {
    expect(rhymePoints({ quality: 'perfect', elapsedMs: 99999, windowMs: 10000 })).toBe(
      POINTS_BASE,
    );
  });
});

describe('evaluateSubmission', () => {
  const base = { prompt: 'gul', elapsedMs: 2000, windowMs: 10000, dialect: 'kurmanci' as Dialect };

  it('accepts a real, unused, rhyming word and scores it', () => {
    const r = evaluateSubmission({ ...base, submission: 'kul' }, { lexicon });
    expect(r.accepted).toBe(true);
    expect(r.quality).toBe('perfect');
    expect(r.points).toBeGreaterThan(0);
    expect(r.normalized).toBe('kul');
  });

  it('rejects a word that is not in the lexicon', () => {
    const r = evaluateSubmission({ ...base, submission: 'zzz' }, { lexicon });
    expect(r).toMatchObject({ accepted: false, reason: 'not-a-word', points: 0 });
  });

  it('rejects submitting the prompt word itself', () => {
    const r = evaluateSubmission({ ...base, submission: 'GUL' }, { lexicon });
    expect(r).toMatchObject({ accepted: false, reason: 'is-prompt' });
  });

  it('rejects a word already used this round (normalized compare)', () => {
    const r = evaluateSubmission(
      { ...base, submission: 'kul', usedWords: [' Kul! '] },
      { lexicon },
    );
    expect(r).toMatchObject({ accepted: false, reason: 'already-used' });
  });

  it('rejects a real word that does not rhyme', () => {
    const r = evaluateSubmission({ ...base, submission: 'av' }, { lexicon });
    expect(r).toMatchObject({ accepted: false, reason: 'no-rhyme' });
  });

  it('rejects an empty submission', () => {
    const r = evaluateSubmission({ ...base, submission: '   ' }, { lexicon });
    expect(r).toMatchObject({ accepted: false, reason: 'not-a-word' });
  });

  it('rejects a profane submission before scoring (#086 hook)', () => {
    const r = evaluateSubmission(
      { ...base, submission: 'kul' },
      { lexicon, isProfane: (w) => w === 'kul' },
    );
    expect(r).toMatchObject({ accepted: false, reason: 'profane' });
  });

  it('scores identical inputs identically (deterministic)', () => {
    const input = { ...base, submission: 'kul' };
    expect(evaluateSubmission(input, { lexicon })).toEqual(evaluateSubmission(input, { lexicon }));
  });

  it('a faster valid rhyme beats a slower one', () => {
    const fast = evaluateSubmission({ ...base, submission: 'kul', elapsedMs: 500 }, { lexicon });
    const slow = evaluateSubmission({ ...base, submission: 'kul', elapsedMs: 9000 }, { lexicon });
    expect(fast.points).toBeGreaterThan(slow.points);
  });
});
