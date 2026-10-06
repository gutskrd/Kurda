import { describe, expect, it } from 'vitest';
import {
  InvalidExercisePayloadError,
  checkAnswer,
  optionOrder,
  sanitizeExercise,
  validateExercisePayload,
} from './exercises.js';
import type { ExerciseType } from './repository.js';

/** A delivery seed, `${sessionId}:${exerciseId}` in production. */
const SEED = 'session-1:exercise-1';
const grade = (type: ExerciseType, payload: unknown, answer: unknown, seed = SEED) =>
  checkAnswer(type, payload, answer, seed);

describe('validateExercisePayload', () => {
  it('accepts valid payloads for each type', () => {
    expect(() =>
      validateExercisePayload('multiple_choice', {
        prompt: '"Sêv" bi îngilîzî?',
        options: ['Apple', 'Bread', 'Water'],
        correctIndex: 0,
      }),
    ).not.toThrow();
    expect(() =>
      validateExercisePayload('translate', { prompt: 'Ez baş im', accepted: ['I am fine'] }),
    ).not.toThrow();
    expect(() =>
      validateExercisePayload('match_pairs', {
        pairs: [
          { left: 'sêv', right: 'apple' },
          { left: 'av', right: 'water' },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects a correctIndex out of range', () => {
    expect(() =>
      validateExercisePayload('multiple_choice', {
        prompt: 'x',
        options: ['a', 'b'],
        correctIndex: 5,
      }),
    ).toThrow(InvalidExercisePayloadError);
  });

  it('rejects too-few options / empty accepted / single pair', () => {
    expect(() =>
      validateExercisePayload('multiple_choice', { prompt: 'x', options: ['a'], correctIndex: 0 }),
    ).toThrow(InvalidExercisePayloadError);
    expect(() => validateExercisePayload('translate', { prompt: 'x', accepted: [] })).toThrow();
    expect(() =>
      validateExercisePayload('match_pairs', { pairs: [{ left: 'a', right: 'b' }] }),
    ).toThrow();
  });

  it('exposes per-field issues', () => {
    try {
      validateExercisePayload('multiple_choice', { prompt: '', options: [], correctIndex: 0 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidExercisePayloadError);
      expect((err as InvalidExercisePayloadError).issues.length).toBeGreaterThan(0);
    }
  });
});

describe('checkAnswer — multiple_choice', () => {
  const payload = { prompt: 'x', options: ['Apple', 'Bread', 'Water'], correctIndex: 0 };
  /** Where an option is shown for a seed — what a learner taps. */
  const shownAt = (option: string, seed = SEED) =>
    (sanitizeExercise('multiple_choice', payload, seed).options as string[]).indexOf(option);

  it('grades the right and wrong choice server-side, by the position the learner saw', () => {
    expect(grade('multiple_choice', payload, { choice: shownAt('Apple') })).toEqual({
      verdict: 'correct',
      accepted: true,
      correction: undefined,
    });
    const wrong = grade('multiple_choice', payload, { choice: shownAt('Water') });
    expect(wrong.accepted).toBe(false);
    expect(wrong.correction).toBe('Apple');
  });

  it('treats a malformed answer as wrong, never a crash', () => {
    expect(grade('multiple_choice', payload, { nope: true }).accepted).toBe(false);
    expect(grade('multiple_choice', payload, null).accepted).toBe(false);
    expect(grade('multiple_choice', payload, { choice: 9 }).accepted).toBe(false); // past the last option
  });
});

describe('multiple-choice shuffle', () => {
  const payload = { prompt: '"Sêv" bi îngilîzî?', options: ['Apple', 'Bread', 'Water', 'Milk'], correctIndex: 0 };
  const seeds = Array.from({ length: 40 }, (_, i) => `session-${i}:exercise-${i % 7}`);
  const shown = (seed: string) => sanitizeExercise('multiple_choice', payload, seed).options as string[];

  it('shows every option exactly once', () => {
    for (const seed of seeds) expect([...shown(seed)].sort()).toEqual([...payload.options].sort());
  });

  it('is stable for one seed, so a resumed session shows the same order', () => {
    for (const seed of seeds) expect(shown(seed)).toEqual(shown(seed));
    expect(optionOrder(4, SEED)).toEqual(optionOrder(4, SEED));
  });

  it('differs across seeds, and does not leave the answer first', () => {
    const orders = new Set(seeds.map((seed) => shown(seed).join('|')));
    expect(orders.size).toBeGreaterThan(5);
    const answerFirst = seeds.filter((seed) => shown(seed)[0] === 'Apple').length;
    expect(answerFirst).toBeLessThan(seeds.length / 2);
  });

  it('maps every displayed position back to the option shown there', () => {
    for (const seed of seeds) {
      shown(seed).forEach((option, choice) => {
        const result = grade('multiple_choice', payload, { choice }, seed);
        expect(result.accepted, `${seed}: ${option} at ${choice}`).toBe(option === 'Apple');
      });
    }
  });

  /**
   * Every seeded item had its answer first, so tapping the top option scored
   * 100% without recalling anything. With the shuffle that learner scores
   * about one in four.
   */
  it('no longer gives full marks to a learner who always taps the first option', () => {
    const right = seeds.filter((seed) => grade('multiple_choice', payload, { choice: 0 }, seed).accepted).length;
    expect(right).toBeLessThan(seeds.length);
    expect(right / seeds.length).toBeLessThan(0.5);
  });
});

describe('checkAnswer — translate (diacritic tolerance)', () => {
  const payload = { prompt: 'apple', accepted: ['sêv', 'sêvek'] };

  it('accepts an exact match', () => {
    expect(grade('translate', payload, { text: 'sêv' })).toEqual({
      verdict: 'correct',
      accepted: true,
    });
  });

  it('accepts case/whitespace variants', () => {
    expect(grade('translate', payload, { text: '  SÊV  ' }).verdict).toBe('correct');
  });

  it('accepts any of the listed answers', () => {
    expect(grade('translate', payload, { text: 'sêvek' }).accepted).toBe(true);
  });

  it('flags a diacritic slip as an accepted typo, not wrong', () => {
    const res = grade('translate', payload, { text: 'sev' }); // missing ê
    expect(res.verdict).toBe('typo');
    expect(res.accepted).toBe(true);
    expect(res.correction).toBe('sêv');
  });

  it('marks a genuinely wrong answer wrong with the canonical correction', () => {
    const res = grade('translate', payload, { text: 'banana' });
    expect(res.verdict).toBe('wrong');
    expect(res.accepted).toBe(false);
    expect(res.correction).toBe('sêv');
  });

  it('empty answer is wrong (not a phantom typo match)', () => {
    expect(grade('translate', payload, { text: '' }).accepted).toBe(false);
  });
});

describe('checkAnswer — match_pairs', () => {
  const payload = {
    pairs: [
      { left: 'sêv', right: 'apple' },
      { left: 'av', right: 'water' },
      { left: 'nan', right: 'bread' },
    ],
  };

  it('accepts a fully correct matching regardless of order', () => {
    const res = grade('match_pairs', payload, {
      matches: [
        { left: 'nan', right: 'bread' },
        { left: 'sêv', right: 'apple' },
        { left: 'av', right: 'water' },
      ],
    });
    expect(res).toEqual({ verdict: 'correct', accepted: true });
  });

  it('rejects any wrong pairing', () => {
    const res = grade('match_pairs', payload, {
      matches: [
        { left: 'sêv', right: 'water' },
        { left: 'av', right: 'apple' },
        { left: 'nan', right: 'bread' },
      ],
    });
    expect(res.accepted).toBe(false);
  });

  it('rejects incomplete matches', () => {
    const res = grade('match_pairs', payload, {
      matches: [{ left: 'sêv', right: 'apple' }],
    });
    expect(res.accepted).toBe(false);
  });
});

describe('listening (KUR-035)', () => {
  const payload = {
    audioUrl: 'https://cdn.kurda.app/audio/sev.mp3',
    prompt: 'Type what you hear',
    accepted: ['sêv'],
  };

  it('validates a well-formed payload and rejects a missing audioUrl', () => {
    expect(() => validateExercisePayload('listening', payload)).not.toThrow();
    expect(() => validateExercisePayload('listening', { accepted: ['sêv'] })).toThrow();
  });

  it('sanitization exposes the audio + prompt but never the transcription', () => {
    const safe = sanitizeExercise('listening', payload, 'seed');
    expect(safe).toEqual({ audioUrl: payload.audioUrl, prompt: payload.prompt });
    expect(JSON.stringify(safe)).not.toContain('accepted');
    expect(JSON.stringify(safe)).not.toContain('sêv');
  });

  it('grades the transcription diacritic-tolerantly (like translate)', () => {
    expect(grade('listening', payload, { text: 'sêv' })).toMatchObject({ verdict: 'correct', accepted: true });
    expect(grade('listening', payload, { text: 'sev' })).toMatchObject({ verdict: 'typo', accepted: true, correction: 'sêv' });
    expect(grade('listening', payload, { text: 'av' })).toMatchObject({ verdict: 'wrong', accepted: false });
  });
});

describe('speaking (KUR-036)', () => {
  const payload = { prompt: 'Say: Ez baş im', reference: 'Ez baş im' };

  it('validates a well-formed payload and rejects a missing reference', () => {
    expect(() => validateExercisePayload('speaking', payload)).not.toThrow();
    expect(() => validateExercisePayload('speaking', { prompt: 'Say it' })).toThrow();
  });

  it('sanitization exposes the prompt but never the reference', () => {
    const safe = sanitizeExercise('speaking', payload, 'seed');
    expect(safe).toEqual({ prompt: payload.prompt });
    expect(JSON.stringify(safe)).not.toContain('reference');
  });

  it('the v1 stub scorer accepts any uploaded recording', () => {
    expect(grade('speaking', payload, { audioKey: 'speaking/abc.m4a' })).toMatchObject({
      verdict: 'correct',
      accepted: true,
    });
  });

  it('an empty audioKey is wrong, not a silent pass', () => {
    // schema requires a non-empty key, so a blank submission is rejected → wrong
    expect(grade('speaking', payload, { audioKey: '' })).toMatchObject({ accepted: false });
  });
});

describe('writing (KUR-037)', () => {
  const payload = {
    prompt: 'Translate: I am learning Kurdish',
    accepted: ['Ez fêrî kurdî dibim'],
  };

  it('validates payload and sanitization hides the accepted answers', () => {
    expect(() => validateExercisePayload('writing', payload)).not.toThrow();
    const safe = sanitizeExercise('writing', payload, 'seed');
    expect(safe).toEqual({ prompt: payload.prompt });
    expect(JSON.stringify(safe)).not.toContain('Ez fêrî');
  });

  it('accepts despite case, punctuation and extra whitespace', () => {
    expect(grade('writing', payload, { text: '  ez fêrî  kurdî dibim. ' })).toMatchObject({
      verdict: 'correct',
      accepted: true,
    });
  });

  it('flags a diacritic slip as an accepted typo', () => {
    expect(grade('writing', payload, { text: 'Ez feri kurdi dibim' })).toMatchObject({
      verdict: 'typo',
      accepted: true,
      correction: 'Ez fêrî kurdî dibim',
    });
  });

  it('gives no credit for pasting the prompt back', () => {
    expect(grade('writing', payload, { text: 'Translate: I am learning Kurdish' })).toMatchObject({
      verdict: 'wrong',
      accepted: false,
    });
  });

  it('marks a genuinely wrong answer wrong', () => {
    expect(grade('writing', payload, { text: 'Ez nizanim' })).toMatchObject({ accepted: false });
  });
});

/**
 * ê and e, ş and s tell Kurmancî words apart (sêv apple, sev nothing; şer
 * war, ser head). A spelling or dictation item that forgave them would count
 * its target errors as successes, so an item can ask for the letter.
 */
describe('strict spelling', () => {
  const translate = { prompt: 'war', accepted: ['şer'], strict: true };
  const listening = { audioUrl: 'https://cdn.kurda.app/audio/ser.mp3', accepted: ['şer'], strict: true };
  const writing = { prompt: 'Write: I am learning Kurdish', accepted: ['Ez fêrî kurdî dibim'], strict: true };

  it('is accepted by the payload schemas, optional and boolean', () => {
    expect(() => validateExercisePayload('translate', translate)).not.toThrow();
    expect(() => validateExercisePayload('listening', listening)).not.toThrow();
    expect(() => validateExercisePayload('writing', writing)).not.toThrow();
    expect(() => validateExercisePayload('translate', { ...translate, strict: 'yes' })).toThrow();
  });

  it('names a diacritic slip as a typo but does not accept it', () => {
    expect(grade('translate', translate, { text: 'ser' })).toEqual({ verdict: 'typo', accepted: false, correction: 'şer' });
    expect(grade('listening', listening, { text: 'ser' })).toEqual({ verdict: 'typo', accepted: false, correction: 'şer' });
    expect(grade('writing', writing, { text: 'ez feri kurdi dibim' })).toEqual({
      verdict: 'typo',
      accepted: false,
      correction: 'Ez fêrî kurdî dibim',
    });
  });

  it('still accepts the right spelling, whatever its case and spacing', () => {
    expect(grade('translate', translate, { text: ' ŞER ' })).toEqual({ verdict: 'correct', accepted: true });
    expect(grade('writing', writing, { text: 'Ez fêrî kurdî dibim!' })).toEqual({ verdict: 'correct', accepted: true });
  });

  it('leaves the lenient default as it was', () => {
    const lenient = { prompt: 'war', accepted: ['şer'] };
    expect(grade('translate', lenient, { text: 'ser' })).toEqual({ verdict: 'typo', accepted: true, correction: 'şer' });
    expect(grade('translate', { ...lenient, strict: false }, { text: 'ser' })).toMatchObject({ accepted: true });
  });

  it('keeps a wrong word wrong', () => {
    expect(grade('translate', translate, { text: 'av' })).toMatchObject({ verdict: 'wrong', accepted: false });
  });
});

/** Persian-keyboard spelling of ە inside a word: heh + zero-width non-joiner. */
const ZWNJ = '‌';

/**
 * A Soranî answer typed on an Arabic or Persian keyboard is the same word in
 * different code points: ك for ک, ي for ی, ه for ە at the end of a word, ه +
 * ZWNJ for ە inside one. Graded on the letters, it is right.
 */
describe('Soranî answers typed on an Arabic or Persian keyboard', () => {
  it('translate accepts them as correct, not as typos', () => {
    const payload = { prompt: 'Good morning', accepted: ['بەیانی باش'] };
    expect(grade('translate', payload, { text: `به${ZWNJ}ياني باش` })).toEqual({ verdict: 'correct', accepted: true });
    const kurdistan = { prompt: 'Kurdistan', accepted: ['کوردستان'] };
    expect(grade('translate', kurdistan, { text: 'كوردستان' })).toEqual({ verdict: 'correct', accepted: true });
  });

  it('listening accepts them, and strict items too — they are not diacritic slips', () => {
    const payload = { audioUrl: 'https://cdn.kurda.app/audio/ewe.mp3', accepted: ['ئەمە'], strict: true };
    expect(grade('listening', payload, { text: `ئه${ZWNJ}مه` })).toEqual({ verdict: 'correct', accepted: true });
  });

  it('writing accepts them, with Arabic-script punctuation ignored', () => {
    const payload = { prompt: 'How are you?', accepted: ['چۆنی؟'] };
    expect(grade('writing', payload, { text: 'چۆني' })).toEqual({ verdict: 'correct', accepted: true });
    expect(grade('writing', payload, { text: 'چۆنی ؟' })).toEqual({ verdict: 'correct', accepted: true });
  });

  it('match pairs accepts a pair sent back in other code points', () => {
    const payload = {
      pairs: [
        { left: 'خانە', right: 'house' },
        { left: 'کتێب', right: 'book' },
      ],
    };
    expect(
      grade('match_pairs', payload, {
        matches: [
          { left: 'خانه', right: 'house' },
          { left: 'كتێب', right: 'book' },
        ],
      }),
    ).toEqual({ verdict: 'correct', accepted: true });
  });

  it('keeps different letters different: ڕ is not ر', () => {
    const payload = { prompt: 'deaf', accepted: ['کەڕ'] };
    expect(grade('translate', payload, { text: 'کەر' })).toMatchObject({ verdict: 'wrong', accepted: false });
  });
});
