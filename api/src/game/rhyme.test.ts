import { describe, expect, it } from 'vitest';
import { POINTS_BASE, SPEED_BONUS } from './scoring.js';
import {
  classifyRhyme,
  inflectionStems,
  rhymePattern,
  rhymeWordKey,
  rimeOf,
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
   * The equivalence Soranî's rule rests on: two words rhyme perfectly iff their rhyme keys share a two-character
   * prefix, and at all iff they share one.
   */
  it('agrees with classifyRhyme for Soranî', () => {
    const pairs: Array<[string, string]> = [
      ['باران', 'نان'],
      ['دار', 'شار'],
      ['باران', 'هاوین'],
      ['ئاو', 'دار'],
    ];
    for (const [a, b] of pairs) {
      const quality = classifyRhyme(a, b, 'sorani');
      const sharesTwo = rhymePrefix(a, 2) !== null && rhymeKey(b).startsWith(rhymePrefix(a, 2)!);
      const sharesOne = rhymePrefix(a, 1) !== null && rhymeKey(b).startsWith(rhymePrefix(a, 1)!);
      expect(sharesTwo, `${a}/${b} perfect`).toBe(quality === 'perfect');
      expect(sharesOne, `${a}/${b} rhymes at all`).toBe(quality !== 'none');
    }
  });

  /**
   * A one-letter word has no perfect rhymes: nothing shares two final letters with it, and a one-character prefix would
   * wrongly match every word ending in it.
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

describe('rimeOf', () => {
  it('is the last vowel and what follows it, with the consonants after it as the coda', () => {
    expect(rimeOf('bajar')).toEqual({ rime: 'ar', coda: 'r', vowel: 'a' });
    expect(rimeOf('derî')).toEqual({ rime: 'î', coda: '', vowel: 'î' });
    expect(rimeOf('dest')).toEqual({ rime: 'est', coda: 'st', vowel: 'e' });
    expect(rimeOf('şîrîn')).toEqual({ rime: 'în', coda: 'n', vowel: 'î' });
  });

  it('reads w and y as consonants, and has nothing for a word with no vowel', () => {
    expect(rimeOf('kew')?.rime).toBe('ew');
    expect(rimeOf('çay')?.rime).toBe('ay');
    expect(rimeOf('xwş')).toBeNull();
  });
});

describe('classifyRhyme (Kurmancî, by the rime)', () => {
  it('is perfect on the same last vowel and everything after it', () => {
    expect(classifyRhyme('dar', 'bajar')).toBe('perfect');
    expect(classifyRhyme('dar', 'êvar')).toBe('perfect');
    expect(classifyRhyme('baran', 'şivan')).toBe('perfect');
    expect(classifyRhyme('baran', 'ziman')).toBe('perfect');
    expect(classifyRhyme('gul', 'kul')).toBe('perfect');
  });

  /** Kurdish verse rhymes derî with azadî: one shared î and nothing after it is a full rhyme, not half of one. */
  it('takes words ending on the same vowel as a perfect rhyme', () => {
    expect(classifyRhyme('derî', 'kanî')).toBe('perfect');
    expect(classifyRhyme('derî', 'azadî')).toBe('perfect');
    expect(classifyRhyme('masî', 'kurmancî')).toBe('perfect');
  });

  it('is near on the same final consonants after a different vowel', () => {
    expect(classifyRhyme('dar', 'dêr')).toBe('near');
    expect(classifyRhyme('dil', 'gul')).toBe('near');
    expect(classifyRhyme('dest', 'mast')).toBe('near');
    expect(classifyRhyme('roj', 'baj')).toBe('near');
  });

  /** The old rule called any shared last letter a rhyme; derî and bira end on a vowel each, and not the same one. */
  it('is none when the words share neither the rime nor the consonants it ends in', () => {
    expect(classifyRhyme('derî', 'bira')).toBe('none');
    expect(classifyRhyme('derî', 'dar')).toBe('none');
    expect(classifyRhyme('roj', 'soz')).toBe('none');
    expect(classifyRhyme('av', 'dil')).toBe('none');
  });

  it('tells ê from e and î from i, which rhyme differently', () => {
    expect(classifyRhyme('şev', 'sêv')).toBe('near');
    expect(classifyRhyme('dil', 'gîl')).toBe('near');
  });

  it('is case- and punctuation-insensitive', () => {
    expect(classifyRhyme('GUL', ' kul! ')).toBe('perfect');
  });

  it('is none when either side has no letters at all', () => {
    expect(classifyRhyme('roj', '123')).toBe('none');
    expect(classifyRhyme('', 'roj')).toBe('none');
  });
});

describe('classifyRhyme (Soranî, by the last letters)', () => {
  it('is perfect on two shared final letters and near on one', () => {
    // کوردستان / باران: ن, ا, then ت against ر
    expect(classifyRhyme('کوردستان', 'باران', 'sorani')).toBe('perfect');
    // کوردی / فارسی: ی, then د against س
    expect(classifyRhyme('کوردی', 'فارسی', 'sorani')).toBe('near');
    expect(classifyRhyme('دار', 'ئاو', 'sorani')).toBe('none');
  });
});

describe('rhymePattern', () => {
  /**
   * The database finds rhymes by reversed headword (an indexed prefix, then anchored patterns). That must agree exactly
   * with classifyRhyme, or a prompt is offered with partners the round refuses.
   */
  it('agrees with classifyRhyme over a set of Kurmancî words', () => {
    const words = ['dar', 'bajar', 'êvar', 'dêr', 'baran', 'şivan', 'derî', 'kanî', 'bira', 'mal', 'dil', 'gul', 'dest', 'mast', 'av', 'çav', 'kew'];
    for (const prompt of words) {
      const pattern = rhymePattern(prompt, 'kurmanci')!;
      for (const other of words) {
        if (other === prompt) continue;
        const key = rhymeKey(other);
        const any = key.startsWith(pattern.prefix) && new RegExp(pattern.any, 'u').test(key);
        const perfect = key.startsWith(pattern.prefix) && new RegExp(pattern.perfect, 'u').test(key);
        const quality = classifyRhyme(prompt, other);
        expect(perfect, `${prompt}/${other} perfect`).toBe(quality === 'perfect');
        expect(any, `${prompt}/${other} rhymes`).toBe(quality !== 'none');
      }
    }
  });

  it('has nothing for a word with no vowel, and no perfect partner for a one-letter Soranî word', () => {
    expect(rhymePattern('xwş', 'kurmanci')).toBeNull();
    const one = rhymePattern('و', 'sorani')!;
    expect(new RegExp(one.perfect, 'u').test('و')).toBe(false);
  });
});

describe('rhymeWordKey', () => {
  it('keeps the marks, so a word typed without them is another word', () => {
    expect(rhymeWordKey('Şev', 'kurmanci')).toBe('şev');
    expect(rhymeWordKey('sev', 'kurmanci')).toBe('sev');
    expect(rhymeWordKey('sev', 'kurmanci')).not.toBe(rhymeWordKey('şev', 'kurmanci'));
  });

  it('reads the Arabic keyboard’s letters as Soranî ones, and refuses the other script', () => {
    expect(rhymeWordKey('كوردي', 'sorani')).toBe(rhymeWordKey('کوردی', 'sorani'));
    expect(rhymeWordKey('baran', 'sorani')).toBe('');
    expect(rhymeWordKey('باران', 'kurmanci')).toBe('');
  });
});

describe('inflectionStems', () => {
  it('proposes the word without a Kurmancî ending, longest ending first', () => {
    expect(inflectionStems('malan', 'kurmanci')).toContainEqual({ stem: 'mal', ending: 'an' });
    expect(inflectionStems('malên', 'kurmanci')[0]).toEqual({ stem: 'mal', ending: 'ên' });
    // î becomes iy before an ending: deriyê is derî with -ê
    expect(inflectionStems('deriyê', 'kurmanci')).toContainEqual({ stem: 'derî', ending: 'iyê' });
  });

  it('never leaves a stem of one letter', () => {
    expect(inflectionStems('ma', 'kurmanci')).toEqual([]);
  });

  it('knows the Soranî definite and plural endings', () => {
    expect(inflectionStems('دارەکە', 'sorani')).toContainEqual({ stem: 'دار', ending: 'ەکە' });
    expect(inflectionStems('داران', 'sorani')).toContainEqual({ stem: 'دار', ending: 'ان' });
  });
});

describe('rhymePoints', () => {
  it('is zero for a non-rhyme regardless of speed', () => {
    expect(rhymePoints({ quality: 'none', elapsedMs: 0, windowMs: 10000 })).toBe(0);
  });

  it('gives a perfect rhyme the full base and speed curve', () => {
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

  it('rejects a profane submission before scoring', () => {
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

  /**
   * The prompt şev typed as "sev" must not match through the folded key (şev and sêv both fold to it) and score as a
   * rhyme of itself: every check uses the word as written.
   */
  it('does not take the prompt typed without its marks, nor count one word three ways', () => {
    const words = new InMemoryLexicon([{ word: 'şev', dialect: 'kurmanci' }, { word: 'sêv', dialect: 'kurmanci' }, { word: 'dev', dialect: 'kurmanci' }]);
    const at = { prompt: 'şev', elapsedMs: 1000, windowMs: 10000, dialect: 'kurmanci' as Dialect };
    expect(evaluateSubmission({ ...at, submission: 'sev' }, { lexicon: words })).toMatchObject({ accepted: false, reason: 'not-a-word' });
    expect(evaluateSubmission({ ...at, submission: 'ŞEV' }, { lexicon: words })).toMatchObject({ accepted: false, reason: 'is-prompt' });
    const dev = evaluateSubmission({ ...at, submission: 'dev' }, { lexicon: words });
    expect(dev).toMatchObject({ accepted: true, quality: 'perfect', normalized: 'dev' });
    expect(evaluateSubmission({ ...at, submission: 'Dev!', usedWords: [dev.normalized] }, { lexicon: words })).toMatchObject({ reason: 'already-used' });
    // sêv is a word of its own, a near rhyme of şev by its vowel, and not the same word as it
    expect(evaluateSubmission({ ...at, submission: 'sêv' }, { lexicon: words })).toMatchObject({ accepted: true, quality: 'near' });
  });

  describe('an ending doing all the rhyming', () => {
    const words = new InMemoryLexicon(
      ['mal', 'malan', 'mala', 'bira', 'baran', 'şivan', 'şiv', 'gul', 'gulan'].map((word) => ({ word, dialect: 'kurmanci' as Dialect })),
    );
    const at = { prompt: 'baran', elapsedMs: 1000, windowMs: 10000, dialect: 'kurmanci' as Dialect };

    it('refuses a noun given a plural ending to rhyme with it', () => {
      expect(evaluateSubmission({ ...at, submission: 'malan' }, { lexicon: words })).toMatchObject({ accepted: false, reason: 'inflected' });
      expect(evaluateSubmission({ ...at, prompt: 'bira', submission: 'mala' }, { lexicon: words })).toMatchObject({ reason: 'inflected' });
    });

    it('takes it when the stem rhymes too, or when the word was chosen by hand', () => {
      // şiv does not rhyme with baran, but şivan is a word in its own right: somebody chose it
      const chosen = (w: string) => w === 'şivan';
      expect(evaluateSubmission({ ...at, submission: 'şivan' }, { lexicon: words, isChosen: chosen })).toMatchObject({ accepted: true, quality: 'perfect' });
      expect(evaluateSubmission({ ...at, submission: 'şivan' }, { lexicon: words })).toMatchObject({ reason: 'inflected' });
    });

    it('leaves a curator’s ruling alone', () => {
      const overrideQuality = (p: string, s: string) => (p === 'baran' && s === 'gulan' ? ('perfect' as const) : undefined);
      expect(evaluateSubmission({ ...at, submission: 'gulan' }, { lexicon: words, overrideQuality })).toMatchObject({ accepted: true });
    });

    it('takes a word whose stem is not a word at all', () => {
      const few = new InMemoryLexicon([{ word: 'ziman', dialect: 'kurmanci' }]);
      expect(evaluateSubmission({ ...at, submission: 'ziman' }, { lexicon: few })).toMatchObject({ accepted: true });
    });

    it('refuses a Soranî plural the same way, but not a rhyme that reaches into the stem', () => {
      const ckb = new InMemoryLexicon(['کتێب', 'کتێبان', 'دار', 'داران', 'شار', 'باران'].map((word) => ({ word, dialect: 'sorani' as Dialect })));
      const so = { prompt: 'باران', elapsedMs: 1000, windowMs: 10000, dialect: 'sorani' as Dialect };
      expect(evaluateSubmission({ ...so, submission: 'کتێبان' }, { lexicon: ckb })).toMatchObject({ reason: 'inflected' });
      // داران shares ـاران with باران, more than its ending: the stem rhymes into it
      expect(evaluateSubmission({ ...so, submission: 'داران' }, { lexicon: ckb })).toMatchObject({ accepted: true, quality: 'perfect' });
      expect(evaluateSubmission({ ...so, prompt: 'دار', submission: 'شار' }, { lexicon: ckb })).toMatchObject({ accepted: true, quality: 'perfect' });
    });
  });
});
