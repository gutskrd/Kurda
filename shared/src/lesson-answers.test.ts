import { describe, expect, it } from 'vitest';
import {
  KURMANJI_KEYS,
  MIN_RECORDING_BYTES,
  MIN_RECORDING_MS,
  SORANI_KEYS,
  emptyDraft,
  emptyLiveMatch,
  emptyMatch,
  encodeAnswer,
  insertAtSelection,
  isArabicScript,
  isDraftComplete,
  isLeftMatched,
  isRightMatched,
  isSoraniDialect,
  letterDiff,
  liftTile,
  pairKey,
  placeTile,
  recordingProblem,
  tapLeft,
  tapLive,
  tapRight,
  tileAnswer,
  typedHint,
  typingKeys,
  type DiffSegment,
} from './lesson-answers.js';

describe('typedHint', () => {
  it('says when only the marks differ, each pair of letters once', () => {
    expect(typedHint('Xwiska min li male ye', 'Xwişka min li malê ye.', 'kurmanji')).toEqual({
      kind: 'marks',
      pairs: [
        ['s', 'ş'],
        ['e', 'ê'],
      ],
    });
    expect(typedHint('sev', 'sêv')).toEqual({ kind: 'marks', pairs: [['e', 'ê']] });
  });

  it('says when a Soranî letter was written without its mark', () => {
    expect(typedHint('روژ', 'ڕۆژ', 'sorani')).toEqual({
      kind: 'lookalike',
      pairs: [
        ['ر', 'ڕ'],
        ['و', 'ۆ'],
      ],
    });
    // an answer in Arabic script is Soranî, even where a review item does not say its variety
    expect(typedHint('گول', 'گوڵ')).toEqual({ kind: 'lookalike', pairs: [['ل', 'ڵ']] });
  });

  it('never calls a keyboard variant a slip: grading reads it as the same letter', () => {
    expect(typedHint('كوڕ', 'کوڕ', 'sorani')).toBeNull();
  });

  it('says when the words are right and only their order is not', () => {
    expect(typedHint('li malê xwişka min ye', 'Xwişka min li malê ye.')).toEqual({ kind: 'order' });
  });

  it('names the one word missing or not needed', () => {
    expect(typedHint('Xwişka min li malê', 'Xwişka min li malê ye.')).toEqual({ kind: 'missing', word: 'ye' });
    expect(typedHint('min li malê ye', 'Xwişka min li malê ye.')).toEqual({ kind: 'missing', word: 'Xwişka' });
    expect(typedHint('Xwişka min jî li malê ye', 'Xwişka min li malê ye.')).toEqual({ kind: 'extra', word: 'jî' });
  });

  it('says nothing of more than one slip, of an empty answer, or of an answer that is right', () => {
    expect(typedHint('Xwiska min li male', 'Xwişka min li malê ye.')).toBeNull();
    expect(typedHint('Bira min li dibistanê ye', 'Xwişka min li malê ye.')).toBeNull();
    expect(typedHint('  ', 'sêv')).toBeNull();
    expect(typedHint('Sêv', 'sêv.')).toBeNull();
  });
});

describe('drafts', () => {
  it('start empty for every type', () => {
    expect(emptyDraft('multiple_choice')).toEqual({ type: 'multiple_choice', choice: null });
    expect(emptyDraft('listening')).toEqual({ type: 'listening', text: '' });
    expect(emptyDraft('speaking')).toEqual({ type: 'speaking', recorded: false });
    expect(emptyDraft('match_pairs')).toEqual({ type: 'match_pairs', matches: [] });
  });

  it('are complete once there is something to grade', () => {
    expect(isDraftComplete({ type: 'writing', text: '  ' }, 0)).toBe(false);
    expect(isDraftComplete({ type: 'writing', text: 'av' }, 0)).toBe(true);
    expect(isDraftComplete({ type: 'speaking', recorded: false }, 0)).toBe(false);
    // recorded but not yet rated: the rating is the answer
    expect(isDraftComplete({ type: 'speaking', recorded: true }, 0)).toBe(false);
    expect(isDraftComplete({ type: 'speaking', recorded: true, selfRating: 'good' }, 0)).toBe(true);
    expect(isDraftComplete({ type: 'match_pairs', matches: [{ left: 'a', right: 'b' }] }, 2)).toBe(false);
  });

  it('encode to the wire shape, a spoken answer with the learner’s own rating', () => {
    expect(encodeAnswer({ type: 'translate', text: ' sêv ' })).toEqual({ text: 'sêv' });
    expect(encodeAnswer({ type: 'multiple_choice', choice: 1 })).toEqual({ choice: 1 });
    expect(encodeAnswer({ type: 'speaking', recorded: true, selfRating: 'close' })).toEqual({ selfRating: 'close' });
    // with no rating there is nothing to send: the server reads that as no answer
    expect(encodeAnswer({ type: 'speaking', recorded: true })).toEqual({});
  });
});

describe('recordingProblem', () => {
  it('turns away a slipped tap and a silent capture before the upload', () => {
    expect(recordingProblem({ durationMs: MIN_RECORDING_MS - 1, byteSize: 5000 })).toBe('tooShort');
    expect(recordingProblem({ durationMs: 3000, byteSize: MIN_RECORDING_BYTES - 1 })).toBe('silent');
    expect(recordingProblem({ durationMs: MIN_RECORDING_MS, byteSize: MIN_RECORDING_BYTES })).toBeNull();
  });
});

describe('pairs answered as they are made', () => {
  const key = pairKey(['sêv', 'av', 'nan'], ['water', 'bread', 'apple'], [2, 0, 1])!;

  it('reads the pairing from pairOf, and refuses one that does not fit the cards', () => {
    expect([...key]).toEqual([
      ['sêv', 'apple'],
      ['av', 'water'],
      ['nan', 'bread'],
    ]);
    expect(pairKey(['sêv'], ['apple'], undefined)).toBeNull();
    expect(pairKey(['sêv', 'av'], ['apple', 'water'], [0])).toBeNull();
    expect(pairKey(['sêv'], ['apple'], [3])).toBeNull();
  });

  it('keeps a right pair whichever side was picked first', () => {
    const one = tapLive(emptyLiveMatch, key, 'left', 'sêv');
    expect(one.outcome).toBe('picked');
    const two = tapLive(one.state, key, 'right', 'apple');
    expect(two).toEqual({ state: { matches: [{ left: 'sêv', right: 'apple' }], picked: null }, outcome: 'matched', pair: { left: 'sêv', right: 'apple' } });
    const three = tapLive(tapLive(two.state, key, 'right', 'water').state, key, 'left', 'av');
    expect(three.outcome).toBe('matched');
    expect(three.state.matches).toHaveLength(2);
  });

  it('tries a wrong pair, keeps nothing and picks nothing', () => {
    const tried = tapLive(tapLive(emptyLiveMatch, key, 'left', 'sêv').state, key, 'right', 'water');
    expect(tried).toEqual({ state: emptyLiveMatch, outcome: 'missed', pair: { left: 'sêv', right: 'water' } });
  });

  it('lets the picked card go, swaps it for another on its side, and ignores spent cards', () => {
    const picked = tapLive(emptyLiveMatch, key, 'left', 'sêv').state;
    expect(tapLive(picked, key, 'left', 'sêv')).toEqual({ state: emptyLiveMatch, outcome: 'unpicked' });
    expect(tapLive(picked, key, 'left', 'av').state.picked).toEqual({ side: 'left', text: 'av' });
    const matched = tapLive(picked, key, 'right', 'apple').state;
    expect(tapLive(matched, key, 'left', 'sêv')).toEqual({ state: matched, outcome: 'ignored' });
    expect(tapLive(matched, key, 'right', 'apple')).toEqual({ state: matched, outcome: 'ignored' });
  });

  it('sends what it found as a match-pairs answer', () => {
    const done = tapLive(tapLive(emptyLiveMatch, key, 'left', 'nan').state, key, 'right', 'bread').state;
    expect(encodeAnswer({ type: 'match_pairs', matches: done.matches })).toEqual({ matches: [{ left: 'nan', right: 'bread' }] });
  });
});

describe('word tiles', () => {
  const bank = ['av', 'nan', 'û', 'sêv', 'av'];

  it('lays tiles in the order tapped and reads them as one answer', () => {
    let placed = placeTile([], 1);
    placed = placeTile(placed, 2);
    placed = placeTile(placed, 0);
    expect(tileAnswer(bank, placed)).toBe('nan û av');
  });

  it('keeps a word that is in the bank twice as two tiles', () => {
    expect(tileAnswer(bank, placeTile(placeTile([], 0), 4))).toBe('av av');
  });

  it('does not lay one tile twice, and closes up when one is taken off', () => {
    expect(placeTile([1, 2], 1)).toEqual([1, 2]);
    expect(liftTile([1, 2, 0], 2)).toEqual([1, 0]);
    expect(tileAnswer(bank, [])).toBe('');
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
