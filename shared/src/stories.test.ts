import { describe, expect, it } from 'vitest';
import {
  MIN_QUESTION_BANK,
  QUESTION_COUNTS,
  QUESTION_COUNTS_BY_LENGTH,
  STORY_DIALECTS,
  STORY_LENGTHS,
  STORY_WORD_BANDS,
  countStoryWords,
  glossFor,
  isAllowedQuestionCount,
  normalizeJoinCode,
  readingHardCapSeconds,
  readingMinutes,
  readingSoftCapSeconds,
  storyLengthFor,
  storyParagraphs,
  storySentences,
  storyTextDirection,
} from './stories.js';

describe('story presets', () => {
  it('gives every length a band that does not touch the next one', () => {
    for (const dialect of STORY_DIALECTS) {
      const bands = STORY_LENGTHS.map((l) => STORY_WORD_BANDS[dialect][l]);
      for (let i = 0; i < bands.length; i++) {
        expect(bands[i]!.min).toBeLessThan(bands[i]!.max);
        if (i > 0) expect(bands[i]!.min).toBeGreaterThan(bands[i - 1]!.max);
      }
    }
  });

  it('names one length for a count inside a band and none between bands', () => {
    expect(storyLengthFor('kurmanci', 60)).toBe('short');
    expect(storyLengthFor('kurmanci', 120)).toBe('short');
    expect(storyLengthFor('kurmanci', 121)).toBeNull();
    expect(storyLengthFor('kurmanci', 200)).toBe('medium');
    expect(storyLengthFor('kurmanci', 450)).toBe('long');
    expect(storyLengthFor('kurmanci', 451)).toBeNull();
    expect(storyLengthFor('sorani', 50)).toBe('short');
    expect(storyLengthFor('sorani', 49)).toBeNull();
  });

  it('only offers counts from the preset list, and a bank larger than the largest', () => {
    for (const length of STORY_LENGTHS) {
      const counts = QUESTION_COUNTS_BY_LENGTH[length];
      expect(counts.length).toBeGreaterThan(0);
      for (const c of counts) expect(QUESTION_COUNTS).toContain(c);
      expect(MIN_QUESTION_BANK[length]).toBeGreaterThan(Math.max(...counts));
    }
    expect(isAllowedQuestionCount('short', 10)).toBe(false);
    expect(isAllowedQuestionCount('long', 3)).toBe(false);
    expect(isAllowedQuestionCount('medium', 10)).toBe(true);
    expect(isAllowedQuestionCount('medium', 4)).toBe(false);
  });

  it('reads Soranî right to left and Kurmancî left to right', () => {
    expect(storyTextDirection('sorani')).toEqual({ lang: 'ckb', dir: 'rtl' });
    expect(storyTextDirection('kurmanci')).toEqual({ lang: 'ku', dir: 'ltr' });
  });
});

describe('reading time', () => {
  it('rounds up to whole minutes and is never zero', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(60)).toBe(1);
    expect(readingMinutes(61)).toBe(2);
    expect(readingMinutes(400)).toBe(7);
  });

  it('gives a slow reader time before the host can cut in, and always ends', () => {
    expect(readingSoftCapSeconds(20)).toBe(60);
    expect(readingSoftCapSeconds(400)).toBe(600);
    expect(readingHardCapSeconds(400)).toBe(1260);
    expect(readingHardCapSeconds(100_000)).toBe(1800);
  });
});

describe('cutting a story up', () => {
  it('splits paragraphs on blank lines and joins wrapped lines', () => {
    const body = 'Rojek ji rojan,\nkurikek hebû.\n\n\nEw li gund dijiya.\r\n\r\n  ';
    expect(storyParagraphs(body)).toEqual(['Rojek ji rojan, kurikek hebû.', 'Ew li gund dijiya.']);
  });

  it('splits sentences after their punctuation and keeps it', () => {
    expect(storySentences('Navê wî Azad e. Ew çend salî ye? Heft salî ye!')).toEqual([
      'Navê wî Azad e.',
      'Ew çend salî ye?',
      'Heft salî ye!',
    ]);
  });

  it('keeps closing quotes with their sentence and handles the Arabic question mark', () => {
    expect(storySentences('Got: “Were!” Û çû.')).toEqual(['Got: “Were!”', 'Û çû.']);
    expect(storySentences('ناوت چییە؟ ناوم ئازادە.')).toEqual(['ناوت چییە؟', 'ناوم ئازادە.']);
  });

  it('keeps a last sentence that has no full stop', () => {
    expect(storySentences('Yek. Du')).toEqual(['Yek.', 'Du']);
  });

  it('counts words with letters in them, not dashes or numbers', () => {
    expect(countStoryWords('Rojek ji rojan — 3 kurik hebûn.')).toBe(5);
    expect(countStoryWords('  ')).toBe(0);
  });
});

describe('join codes and glosses', () => {
  it('accepts a code however it was typed, and refuses look-alikes', () => {
    expect(normalizeJoinCode('abc-234')).toBe('ABC234');
    expect(normalizeJoinCode(' ab c2 34 ')).toBe('ABC234');
    expect(normalizeJoinCode('ABC23O')).toBeNull();
    expect(normalizeJoinCode('ABC23')).toBeNull();
  });

  it('shows the meaning in the reader’s language, else English', () => {
    const entry = { term: 'gund', meanings: { en: 'village', de: 'Dorf' } };
    expect(glossFor(entry, 'de')).toBe('Dorf');
    expect(glossFor(entry, 'tr')).toBe('village');
  });
});
