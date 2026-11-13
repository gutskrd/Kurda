/**
 * Dizê Bîrê's rules: easier rounds study longer and lose fewer words,
 * always between two and six, only the advanced round is typed, and the
 * passage is studied with every word that will vanish in its place.
 */
import { describe, expect, it } from 'vitest';
import { GAME_DIFFICULTIES, SOLO_ROUND_ITEMS } from '../solo.js';
import { PASSAGE_HIDDEN } from '../content.js';
import { MEMORY_DECOYS, MEMORY_HIDDEN, MEMORY_ROUND_PASSAGES, memoryAnswerMode, memoryStudyLines, memoryTextLines, studySeconds } from './rules.js';

describe('Dizê Bîrê’s rules', () => {
  it('takes two to six words, more as the difficulty rises', () => {
    for (const d of GAME_DIFFICULTIES) {
      const { min, max } = MEMORY_HIDDEN[d];
      expect(min).toBeGreaterThanOrEqual(PASSAGE_HIDDEN.min);
      expect(max).toBeLessThanOrEqual(PASSAGE_HIDDEN.max);
      expect(min).toBeLessThanOrEqual(max);
    }
    expect(MEMORY_HIDDEN.beginner.max).toBeLessThan(MEMORY_HIDDEN.advanced.max);
  });

  it('gives longer to study at the easier difficulties, and more for a longer passage', () => {
    for (const words of [12, 40, 90]) {
      expect(studySeconds(words, 'beginner')).toBeGreaterThan(studySeconds(words, 'intermediate'));
      expect(studySeconds(words, 'intermediate')).toBeGreaterThan(studySeconds(words, 'advanced'));
    }
    expect(studySeconds(60, 'beginner')).toBeGreaterThan(studySeconds(20, 'beginner'));
    // within its bounds however long the passage
    expect(studySeconds(10_000, 'beginner')).toBe(75);
    expect(studySeconds(0, 'advanced')).toBe(12);
  });

  it('hands out tiles with decoys until the advanced round, which is typed', () => {
    expect(memoryAnswerMode('beginner')).toBe('tiles');
    expect(memoryAnswerMode('intermediate')).toBe('tiles');
    expect(memoryAnswerMode('advanced')).toBe('type');
    expect(MEMORY_DECOYS.beginner).toBeGreaterThan(0);
    expect(MEMORY_DECOYS.advanced).toBe(0);
  });

  it('is a shorter round than a sentence round, each passage being longer', () => {
    expect(MEMORY_ROUND_PASSAGES).toBeLessThan(SOLO_ROUND_ITEMS);
  });
});

// stand-in passages for the layout, never shown to a learner
describe('the passage as it is studied', () => {
  it('puts every word that will vanish back in its place', () => {
    const lines = memoryStudyLines('Gund li ber çiya ye, ne dûr.', [{ line: 0 }, { gap: 0 }, { text: ' li ber ' }, { gap: 1 }, { text: ' ye, ne dûr.' }]);
    expect(lines).toEqual([[{ gap: 0, word: 'Gund' }, { text: ' li ber ' }, { gap: 1, word: 'çiya' }, { text: ' ye, ne dûr.' }]]);
  });

  it('leaves the punctuation around a gap outside it, and keeps a conversation’s lines', () => {
    const lines = memoryStudyLines('Tu diçî ku?\n«Bajar», ez dibêjim.', [{ line: 0 }, { text: 'Tu diçî ku?' }, { line: 1 }, { text: '«' }, { gap: 0 }, { text: '», ez dibêjim.' }]);
    expect(lines[1]).toEqual([{ text: '«' }, { gap: 0, word: 'Bajar' }, { text: '», ez dibêjim.' }]);
    expect(lines).toHaveLength(2);
  });

  it('reads a Soranî line the same way', () => {
    const lines = memoryStudyLines('گوندەکە لە بەر چیایە.', [{ line: 0 }, { gap: 0 }, { text: ' لە بەر ' }, { gap: 1 }, { text: '.' }]);
    expect(lines[0]!.filter((p) => 'gap' in p)).toEqual([
      { gap: 0, word: 'گوندەکە' },
      { gap: 1, word: 'چیایە' },
    ]);
  });
});

describe('the passage without its text', () => {
  it('lays out its gaps with nothing in them, for a round come back to after the words vanished', () => {
    const lines = memoryStudyLines(null, [{ line: 0 }, { gap: 0 }, { text: ' li ber ' }, { gap: 1 }, { line: 1 }, { text: 'Erê.' }]);
    expect(lines).toEqual([[{ gap: 0, word: '' }, { text: ' li ber ' }, { gap: 1, word: '' }], [{ text: 'Erê.' }]]);
  });

  it('is studied line by line before anything is known of what will vanish', () => {
    expect(memoryTextLines('Tu diçî ku?\nBajar.')).toEqual([[{ text: 'Tu diçî ku?' }], [{ text: 'Bajar.' }]]);
  });
});
