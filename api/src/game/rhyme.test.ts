import { describe, expect, it } from 'vitest';
import { POINTS_BASE, SPEED_BONUS } from './scoring.js';
import {
  classifyRhyme,
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

describe('classifyRhyme (Kurmancî)', () => {
  it('perfect when the rime (final vowel + coda) matches', () => {
    expect(classifyRhyme('gul', 'kul', 'kurmanci')).toBe('perfect'); // -ul / -ul
    expect(classifyRhyme('jîn', 'şîn', 'kurmanci')).toBe('perfect'); // -în / -în
  });

  it('near (slant) when the final vowel matches but the coda differs', () => {
    expect(classifyRhyme('roj', 'soz', 'kurmanci')).toBe('near'); // -oj vs -oz
  });

  it('near when the coda matches with a close long/short vowel', () => {
    expect(classifyRhyme('dil', 'gîl', 'kurmanci')).toBe('near'); // i~î, shared -l
  });

  it('none when neither vowel nor coda lines up', () => {
    expect(classifyRhyme('roj', 'gul', 'kurmanci')).toBe('none');
    expect(classifyRhyme('av', 'dil', 'kurmanci')).toBe('none');
  });

  it('is case- and punctuation-insensitive', () => {
    expect(classifyRhyme('GUL', ' kul! ', 'kurmanci')).toBe('perfect');
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
