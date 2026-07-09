import { describe, expect, it } from 'vitest';
import {
  InvalidExercisePayloadError,
  checkAnswer,
  sanitizeExercise,
  validateExercisePayload,
} from './exercises.js';

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

  it('grades the right and wrong choice server-side', () => {
    expect(checkAnswer('multiple_choice', payload, { choice: 0 })).toEqual({
      verdict: 'correct',
      accepted: true,
      correction: undefined,
    });
    const wrong = checkAnswer('multiple_choice', payload, { choice: 2 });
    expect(wrong.accepted).toBe(false);
    expect(wrong.correction).toBe('Apple');
  });

  it('treats a malformed answer as wrong, never a crash', () => {
    expect(checkAnswer('multiple_choice', payload, { nope: true }).accepted).toBe(false);
    expect(checkAnswer('multiple_choice', payload, null).accepted).toBe(false);
  });
});

describe('checkAnswer — translate (diacritic tolerance)', () => {
  const payload = { prompt: 'apple', accepted: ['sêv', 'sêvek'] };

  it('accepts an exact match', () => {
    expect(checkAnswer('translate', payload, { text: 'sêv' })).toEqual({
      verdict: 'correct',
      accepted: true,
    });
  });

  it('accepts case/whitespace variants', () => {
    expect(checkAnswer('translate', payload, { text: '  SÊV  ' }).verdict).toBe('correct');
  });

  it('accepts any of the listed answers', () => {
    expect(checkAnswer('translate', payload, { text: 'sêvek' }).accepted).toBe(true);
  });

  it('flags a diacritic slip as an accepted typo, not wrong', () => {
    const res = checkAnswer('translate', payload, { text: 'sev' }); // missing ê
    expect(res.verdict).toBe('typo');
    expect(res.accepted).toBe(true);
    expect(res.correction).toBe('sêv');
  });

  it('marks a genuinely wrong answer wrong with the canonical correction', () => {
    const res = checkAnswer('translate', payload, { text: 'banana' });
    expect(res.verdict).toBe('wrong');
    expect(res.accepted).toBe(false);
    expect(res.correction).toBe('sêv');
  });

  it('empty answer is wrong (not a phantom typo match)', () => {
    expect(checkAnswer('translate', payload, { text: '' }).accepted).toBe(false);
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
    const res = checkAnswer('match_pairs', payload, {
      matches: [
        { left: 'nan', right: 'bread' },
        { left: 'sêv', right: 'apple' },
        { left: 'av', right: 'water' },
      ],
    });
    expect(res).toEqual({ verdict: 'correct', accepted: true });
  });

  it('rejects any wrong pairing', () => {
    const res = checkAnswer('match_pairs', payload, {
      matches: [
        { left: 'sêv', right: 'water' },
        { left: 'av', right: 'apple' },
        { left: 'nan', right: 'bread' },
      ],
    });
    expect(res.accepted).toBe(false);
  });

  it('rejects incomplete matches', () => {
    const res = checkAnswer('match_pairs', payload, {
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
    expect(checkAnswer('listening', payload, { text: 'sêv' })).toMatchObject({ verdict: 'correct', accepted: true });
    expect(checkAnswer('listening', payload, { text: 'sev' })).toMatchObject({ verdict: 'typo', accepted: true, correction: 'sêv' });
    expect(checkAnswer('listening', payload, { text: 'av' })).toMatchObject({ verdict: 'wrong', accepted: false });
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
    expect(checkAnswer('speaking', payload, { audioKey: 'speaking/abc.m4a' })).toMatchObject({
      verdict: 'correct',
      accepted: true,
    });
  });

  it('an empty audioKey is wrong, not a silent pass', () => {
    // schema requires a non-empty key, so a blank submission is rejected → wrong
    expect(checkAnswer('speaking', payload, { audioKey: '' })).toMatchObject({ accepted: false });
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
    expect(checkAnswer('writing', payload, { text: '  ez fêrî  kurdî dibim. ' })).toMatchObject({
      verdict: 'correct',
      accepted: true,
    });
  });

  it('flags a diacritic slip as an accepted typo', () => {
    expect(checkAnswer('writing', payload, { text: 'Ez feri kurdi dibim' })).toMatchObject({
      verdict: 'typo',
      accepted: true,
      correction: 'Ez fêrî kurdî dibim',
    });
  });

  it('gives no credit for pasting the prompt back', () => {
    expect(checkAnswer('writing', payload, { text: 'Translate: I am learning Kurdish' })).toMatchObject({
      verdict: 'wrong',
      accepted: false,
    });
  });

  it('marks a genuinely wrong answer wrong', () => {
    expect(checkAnswer('writing', payload, { text: 'Ez nizanim' })).toMatchObject({ accepted: false });
  });
});
