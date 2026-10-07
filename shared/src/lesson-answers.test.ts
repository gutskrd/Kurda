import { describe, expect, it } from 'vitest';
import {
  KURMANJI_KEYS,
  MIN_RECORDING_BYTES,
  MIN_RECORDING_MS,
  SORANI_KEYS,
  emptyDraft,
  emptyMatch,
  encodeAnswer,
  insertAtSelection,
  isArabicScript,
  isDraftComplete,
  isLeftMatched,
  isRightMatched,
  isSoraniDialect,
  letterDiff,
  recordingProblem,
  tapLeft,
  tapRight,
  typingKeys,
  type DiffSegment,
} from './lesson-answers.js';

describe('drafts', () => {
  it('start empty for every type', () => {
    expect(emptyDraft('multiple_choice')).toEqual({ type: 'multiple_choice', choice: null });
    expect(emptyDraft('listening')).toEqual({ type: 'listening', text: '' });
    expect(emptyDraft('speaking')).toEqual({ type: 'speaking', audioKey: null });
    expect(emptyDraft('match_pairs')).toEqual({ type: 'match_pairs', matches: [] });
  });

  it('are complete once there is something to grade', () => {
    expect(isDraftComplete({ type: 'writing', text: '  ' }, 0)).toBe(false);
    expect(isDraftComplete({ type: 'writing', text: 'av' }, 0)).toBe(true);
    expect(isDraftComplete({ type: 'speaking', audioKey: null }, 0)).toBe(false);
    expect(isDraftComplete({ type: 'speaking', audioKey: 'speaking/x' }, 0)).toBe(true);
    expect(isDraftComplete({ type: 'match_pairs', matches: [{ left: 'a', right: 'b' }] }, 2)).toBe(false);
  });

  it('encode to the wire shape, a spoken answer with the learner’s own rating', () => {
    expect(encodeAnswer({ type: 'translate', text: ' sêv ' })).toEqual({ text: 'sêv' });
    expect(encodeAnswer({ type: 'multiple_choice', choice: 1 })).toEqual({ choice: 1 });
    expect(encodeAnswer({ type: 'speaking', audioKey: 'k', selfRating: 'close' })).toEqual({ audioKey: 'k', selfRating: 'close' });
    // a client with no rating sends none, which the server reads as a legacy answer
    expect(encodeAnswer({ type: 'speaking', audioKey: 'k' })).toEqual({ audioKey: 'k' });
  });
});

describe('recordingProblem', () => {
  it('turns away a slipped tap and a silent capture before the upload', () => {
    expect(recordingProblem({ durationMs: MIN_RECORDING_MS - 1, byteSize: 5000 })).toBe('tooShort');
    expect(recordingProblem({ durationMs: 3000, byteSize: MIN_RECORDING_BYTES - 1 })).toBe('silent');
    expect(recordingProblem({ durationMs: MIN_RECORDING_MS, byteSize: MIN_RECORDING_BYTES })).toBeNull();
  });
});

describe('match pairs', () => {
  it('pairs a left then a right, and unpairs on a second tap', () => {
    let s = tapRight(tapLeft(emptyMatch, 'sêv'), 'apple');
    expect(s.matches).toEqual([{ left: 'sêv', right: 'apple' }]);
    expect(isLeftMatched(s, 'sêv')).toBe(true);
    expect(isRightMatched(s, 'apple')).toBe(true);
    s = tapRight(s, 'apple');
    expect(s.matches).toEqual([]);
  });

  it('needs a left before a right', () => {
    expect(tapRight(emptyMatch, 'apple')).toEqual(emptyMatch);
  });
});

describe('the key bar', () => {
  it('offers Kurmancî letters, or Soranî ones for a Soranî course', () => {
    expect(typingKeys('kurmanji')).toBe(KURMANJI_KEYS);
    expect(typingKeys(null)).toBe(KURMANJI_KEYS);
    expect(typingKeys('sorani')).toBe(SORANI_KEYS);
    expect(typingKeys('CKB')).toBe(SORANI_KEYS);
    expect(isSoraniDialect('kmr')).toBe(false);
    expect(SORANI_KEYS).toContain('ڕ');
    expect(SORANI_KEYS).toContain('ێ');
  });

  it('inserts at the caret, replacing a selection', () => {
    expect(insertAtSelection('sv', { start: 1, end: 1 }, 'ê')).toEqual({ text: 'sêv', caret: 2 });
    expect(insertAtSelection('sev', { start: 1, end: 2 }, 'ê')).toEqual({ text: 'sêv', caret: 2 });
    expect(insertAtSelection('ab', { start: 9, end: 9 }, 'ş')).toEqual({ text: 'abş', caret: 3 });
  });

  it('tells Arabic script from Latin', () => {
    expect(isArabicScript('سڵاو')).toBe(true);
    expect(isArabicScript('Silav')).toBe(false);
  });
});

describe('letterDiff', () => {
  const marked = (segments: DiffSegment[]): string =>
    segments.map((s) => (s.differs ? `[${s.text}]` : s.text)).join('');

  it('marks the letter that is wrong in one and right in the other', () => {
    const d = letterDiff('sev', 'sêv');
    expect(marked(d.given)).toBe('s[e]v');
    expect(marked(d.expected)).toBe('s[ê]v');
  });

  it('marks a missing letter, an extra one and a missing space', () => {
    expect(marked(letterDiff('Rojbaş', 'Roj baş').expected)).toBe('Roj[ ]baş');
    expect(marked(letterDiff('Spass', 'Spas').given)).toBe('Spas[s]');
  });

  it('does not count case or a keyboard’s variant letters as different', () => {
    expect(marked(letterDiff('silav', 'Silav').given)).toBe('silav');
    // an Arabic kaf typed for the Kurdish one is the same letter
    expect(marked(letterDiff('كورد', 'کورد').given)).toBe('كورد');
  });

  it('keeps every letter, in order, on both sides', () => {
    const d = letterDiff('Ez başim', 'Ez baş im');
    expect(d.given.map((s) => s.text).join('')).toBe('Ez başim');
    expect(d.expected.map((s) => s.text).join('')).toBe('Ez baş im');
  });

  it('compares composed and decomposed letters alike', () => {
    const decomposed = 's' + 'ê' + 'v';
    expect(letterDiff(decomposed, 'sêv').given).toEqual([{ text: 'sêv', differs: false }]);
  });
});
