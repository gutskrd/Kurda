import { describe, expect, it } from 'vitest';
import { emptyDraft, encodeAnswer, isDraftComplete } from './answers';

describe('emptyDraft', () => {
  it('creates a blank draft per exercise type', () => {
    expect(emptyDraft('multiple_choice')).toEqual({ type: 'multiple_choice', choice: null });
    expect(emptyDraft('translate')).toEqual({ type: 'translate', text: '' });
    expect(emptyDraft('match_pairs')).toEqual({ type: 'match_pairs', matches: [] });
  });
});

describe('isDraftComplete', () => {
  it('multiple choice needs a selection', () => {
    expect(isDraftComplete({ type: 'multiple_choice', choice: null }, 0)).toBe(false);
    expect(isDraftComplete({ type: 'multiple_choice', choice: 0 }, 0)).toBe(true);
  });

  it('translate needs non-whitespace text', () => {
    expect(isDraftComplete({ type: 'translate', text: '   ' }, 0)).toBe(false);
    expect(isDraftComplete({ type: 'translate', text: 'sêv' }, 0)).toBe(true);
  });

  it('match pairs needs every pair matched', () => {
    const two = { type: 'match_pairs' as const, matches: [{ left: 'a', right: 'b' }] };
    expect(isDraftComplete(two, 2)).toBe(false);
    expect(isDraftComplete({ ...two, matches: [...two.matches, { left: 'c', right: 'd' }] }, 2)).toBe(true);
  });
});

describe('encodeAnswer', () => {
  it('encodes each type to the server wire shape', () => {
    expect(encodeAnswer({ type: 'multiple_choice', choice: 2 })).toEqual({ choice: 2 });
    expect(encodeAnswer({ type: 'translate', text: '  sêv ' })).toEqual({ text: 'sêv' });
    const matches = [{ left: 'sêv', right: 'apple' }];
    expect(encodeAnswer({ type: 'match_pairs', matches })).toEqual({ matches });
  });
});
