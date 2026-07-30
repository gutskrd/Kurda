import { describe, expect, it } from 'vitest';
import { toPreview } from './preview.js';

describe('toPreview', () => {
  it('marks the correct option for multiple choice', () => {
    const vm = toPreview('multiple_choice', { prompt: 'Hello?', options: ['Silav', 'Na'], correctIndex: 0 });
    expect(vm).toEqual({
      kind: 'multiple_choice',
      prompt: 'Hello?',
      options: [
        { text: 'Silav', correct: true },
        { text: 'Na', correct: false },
      ],
    });
  });

  it('exposes accepted answers for translate', () => {
    expect(toPreview('translate', { prompt: 'Thank you', accepted: ['Spas'] })).toEqual({
      kind: 'translate',
      prompt: 'Thank you',
      accepted: ['Spas'],
    });
  });

  it('normalizes match pairs', () => {
    const vm = toPreview('match_pairs', { pairs: [{ left: 'Silav', right: 'Hello' }] });
    expect(vm).toEqual({ kind: 'match_pairs', pairs: [{ left: 'Silav', right: 'Hello' }] });
  });

  it('gives a prompt view for listening/speaking/writing', () => {
    expect(toPreview('writing', { prompt: 'Write a sentence' })).toEqual({ kind: 'prompt', type: 'writing', prompt: 'Write a sentence' });
  });

  it('flags unknown types instead of throwing', () => {
    expect(toPreview('mystery', {})).toEqual({ kind: 'unsupported', type: 'mystery' });
    expect(toPreview('multiple_choice', null)).toMatchObject({ kind: 'multiple_choice', options: [] });
  });
});
