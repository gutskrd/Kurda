import { describe, expect, it } from 'vitest';
import { chapterAt, hasIntroduction, metaFor, noteIn, questionIn, reflectionIn, translatedHeading } from './legend';

const sections = [
  { title: 'Kela Dimdimê', paragraph: 2 },
  { title: 'Şer', paragraph: 5 },
];

describe('a legend’s chapters', () => {
  it('finds the chapter a paragraph is in, the introduction before the first heading', () => {
    expect(chapterAt(sections, 0)).toBe(-1);
    expect(chapterAt(sections, 1)).toBe(-1);
    expect(chapterAt(sections, 2)).toBe(0);
    expect(chapterAt(sections, 4)).toBe(0);
    expect(chapterAt(sections, 9)).toBe(1);
    expect(chapterAt([], 3)).toBe(-1);
  });

  it('has an introduction only when paragraphs come before the first heading', () => {
    expect(hasIntroduction(sections)).toBe(true);
    expect(hasIntroduction([{ title: 'A', paragraph: 0 }])).toBe(false);
    expect(hasIntroduction([])).toBe(false);
  });

  it('reads a translated heading without its marks', () => {
    expect(translatedHeading('## The fortress')).toBe('The fortress');
    expect(translatedHeading(undefined)).toBeNull();
  });
});

describe('a legend in the reader’s language', () => {
  const story = { dialect: 'kurmanci' as const, title: 'Kela Dimdimê', metaTranslations: { en: { title: 'The Fortress of Dimdim', summary: 'A siege.' }, de: { title: 'Die Festung Dimdim' } } };

  it('gives the title and summary in the reader’s language, else English, and never in the story’s own', () => {
    expect(metaFor(story, 'de')).toEqual({ title: 'Die Festung Dimdim', summary: null, lang: 'de' });
    expect(metaFor(story, 'fr')).toEqual({ title: 'The Fortress of Dimdim', summary: 'A siege.', lang: 'en' });
    expect(metaFor(story, 'ku')).toBeNull();
    expect(metaFor({ ...story, dialect: 'sorani' }, 'ckb')).toBeNull();
    expect(metaFor({ ...story, metaTranslations: {} }, 'de')).toBeNull();
  });

  it('gives a reflection and a note in the reader’s language, else English', () => {
    const k = { dialect: 'kurmanci' as const };
    expect(reflectionIn({ text: 'Tu çi difikirî?', translations: { en: 'What do you think?' } }, k, 'tr')).toEqual({ text: 'What do you think?', lang: 'en' });
    expect(reflectionIn({ text: 'Tu çi difikirî?', translations: { en: 'What do you think?' } }, k, 'ku')).toBeNull();
    expect(noteIn({ kind: 'history', title: 'Dîrok', body: 'B', translations: { ar: { title: 'التاريخ', body: 'ب' } } }, k, 'ar')).toEqual({ title: 'التاريخ', body: 'ب', lang: 'ar' });
  });

  it('gives a question in the reader’s language, else its English', () => {
    const q = { promptEn: 'How was it?', explanationEn: 'Warm.', translations: { de: { prompt: 'Wie war es?', options: ['Kalt', 'Warm'], explanation: 'Warm.' } } };
    expect(questionIn(q, 'de')).toEqual({ prompt: 'Wie war es?', options: ['Kalt', 'Warm'], explanation: 'Warm.', lang: 'de' });
    expect(questionIn(q, 'fr')).toEqual({ prompt: 'How was it?', options: null, explanation: 'Warm.', lang: 'en' });
    expect(questionIn({ translations: {} }, 'fr')).toBeNull();
  });
});
