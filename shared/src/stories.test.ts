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
  formatJoinCode,
  glossSpans,
  lengthMinutes,
  readingHardCapSeconds,
  readingMinutes,
  readingSoftCapSeconds,
  storyAudioSentences,
  storyDialectForCourse,
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
    expect(readingMinutes('kurmanci', 0)).toBe(1);
    expect(readingMinutes('kurmanci', 60)).toBe(1);
    expect(readingMinutes('kurmanci', 61)).toBe(2);
    expect(readingMinutes('kurmanci', 400)).toBe(7);
  });

  it('gives Soranî readers as long for the same text as Kurmancî readers', () => {
    // the same content is about 15% fewer Soranî words, so the rate is lower too
    expect(readingMinutes('sorani', 340)).toBe(7);
    expect(readingSoftCapSeconds('sorani', 340)).toBe(600);
  });

  it('labels each length with the minutes its band takes', () => {
    expect(lengthMinutes('kurmanci', 'short')).toEqual({ min: 1, max: 2 });
    expect(lengthMinutes('kurmanci', 'long')).toEqual({ min: 5, max: 8 });
  });

  it('gives a slow reader time before the host can cut in, and always ends', () => {
    expect(readingSoftCapSeconds('kurmanci', 20)).toBe(60);
    expect(readingSoftCapSeconds('kurmanci', 400)).toBe(600);
    expect(readingHardCapSeconds('kurmanci', 400)).toBe(1260);
    expect(readingHardCapSeconds('kurmanci', 100_000)).toBe(1800);
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

  it('ends a sentence at the Arabic full stop too', () => {
    expect(storySentences('یەک۔ دوو.')).toEqual(['یەک۔', 'دوو.']);
  });

  it('keeps a last sentence that has no full stop', () => {
    expect(storySentences('Yek. Du')).toEqual(['Yek.', 'Du']);
  });

  it('leaves out what nobody could record', () => {
    expect(storyAudioSentences('* * * Ew hat. ?!')).toEqual(['* * * Ew hat.']);
    expect(storyAudioSentences('?! …')).toEqual([]);
  });

  it('counts words with letters in them, not dashes or numbers', () => {
    expect(countStoryWords('Rojek ji rojan — 3 kurik hebûn.')).toBe(5);
    expect(countStoryWords('  ')).toBe(0);
  });
});

describe('join codes', () => {
  it('accepts a code however it was typed, and refuses look-alikes', () => {
    expect(normalizeJoinCode('abc-234')).toBe('ABC234');
    expect(normalizeJoinCode(' ab c2 34 ')).toBe('ABC234');
    expect(normalizeJoinCode('ABC23O')).toBeNull();
    expect(normalizeJoinCode('ABC23')).toBeNull();
  });

  it('reads the digits Arabic and Soranî keyboards type', () => {
    expect(normalizeJoinCode('abc٢٣٤')).toBe('ABC234');
    expect(normalizeJoinCode('abc۲۳۴')).toBe('ABC234');
  });

  it('shows a code in two halves', () => {
    expect(formatJoinCode('ABC234')).toBe('ABC 234');
  });
});

describe('glosses', () => {
  it('shows the meaning in the reader’s language, else English, and says which', () => {
    const entry = { term: 'gund', meanings: { en: 'village', de: 'Dorf', fr: ' ' } };
    expect(glossFor(entry, 'de')).toEqual({ text: 'Dorf', lang: 'de' });
    expect(glossFor(entry, 'tr')).toEqual({ text: 'village', lang: 'en' });
    expect(glossFor(entry, 'fr')).toEqual({ text: 'village', lang: 'en' });
    expect(glossFor(entry, 'toString')).toEqual({ text: 'village', lang: 'en' });
  });

  it('marks the first whole-word occurrence of each term, ignoring case', () => {
    const gund = { term: 'gund', meanings: { en: 'village' } };
    const text = 'Gundê me mezin e. Gund xweş e, gund.';
    const spans = glossSpans(text, [gund]);
    // "Gundê" is a different word; the first whole "Gund" is the second sentence's
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0]!.start, spans[0]!.end)).toBe('Gund');
  });

  it('does not mark a word inside a longer one, in Arabic script either', () => {
    const dar = { term: 'دار', meanings: { en: 'tree' } };
    expect(glossSpans('بەردار هەیە.', [dar])).toEqual([]);
    const spans = glossSpans('ئەو دار گەورەیە.', [dar]);
    expect(spans).toHaveLength(1);
  });

  it('matches a term typed with the Arabic kaf or yeh against the Kurdish letters', () => {
    const kitab = { term: 'كتێب', meanings: { en: 'book' } };
    expect(glossSpans('ئەم کتێبە نییە، کتێب هەیە.', [kitab])).toHaveLength(1);
  });

  it('prefers the longer term and never overlaps', () => {
    const a = { term: 'çem', meanings: { en: 'river' } };
    const b = { term: 'çem mezin', meanings: { en: 'big river' } };
    const text = 'Li wir çem mezin bû.';
    const spans = glossSpans(text, [a, b]);
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0]!.start, spans[0]!.end)).toBe('çem mezin');
  });
});

describe('course dialects', () => {
  it('maps the course spellings onto the story ones', () => {
    expect(storyDialectForCourse('kurmanji')).toBe('kurmanci');
    expect(storyDialectForCourse('sorani')).toBe('sorani');
    expect(storyDialectForCourse(null)).toBe('kurmanci');
  });
});
