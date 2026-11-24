/**
 * Holds the road's word list to its lessons: every Kurdish word a lesson shows has an entry, so a new line cannot bring
 * in a word a learner taps and finds empty, and every entry reads as the lessons read it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEANINGS_MAX, tokenize } from './prompt-tokens.js';
import { ROAD_GLOSSARY_FILE, glossaryKey, kurdishShown, parseGlossary, roadGlossary, roadKurdishTexts } from './road-glossary.js';

/** A text's words as a lesson lets them be tapped, by the key they are filed under; numbers are no words. */
const keysIn = (text: string): string[] => tokenize(text).flatMap((t) => (t.word && glossaryKey(t.text) !== '' ? [glossaryKey(t.text)] : []));

describe('the road’s glossary', () => {
  it('has an entry for every Kurdish word the lessons show', () => {
    const { words } = roadGlossary();
    const shown = new Set(roadKurdishTexts().flatMap(keysIn));
    expect(shown.size).toBeGreaterThan(1000);
    expect([...shown].filter((key) => !words.has(key)).sort()).toEqual([]);
  });

  it('parses, files each form under its own key, and gives it one to three meanings', () => {
    const raw = JSON.parse(readFileSync(ROAD_GLOSSARY_FILE, 'utf8')) as { dialect: string; words: Record<string, { en: unknown; base?: unknown }> };
    const glossary = parseGlossary(raw);
    expect(glossary.dialect).toBe('kurmanji');
    expect(glossary.words.size).toBe(Object.keys(raw.words).length);
    const bad = Object.entries(raw.words).filter(([form, entry]) => {
      const en = Array.isArray(entry.en) ? entry.en : [];
      const meaningful = en.length >= 1 && en.length <= MEANINGS_MAX && en.every((m) => typeof m === 'string' && m.trim() !== '' && !m.includes("'"));
      const base = entry.base === undefined || (typeof entry.base === 'string' && glossaryKey(entry.base) !== '' && glossaryKey(entry.base) !== form);
      return form !== glossaryKey(form) || !meaningful || !base;
    });
    expect(bad.map(([form]) => form)).toEqual([]);
  });
});

describe('kurdishShown', () => {
  it('reads the Kurdish of each kind of exercise and leaves its English alone', () => {
    expect(kurdishShown('multiple_choice', { ask: 'meaning', say: 'Silav!', prompt: 'Silav!', options: ['Hello!', 'Thanks!'] })).toEqual(['Silav!', 'Silav!']);
    expect(kurdishShown('multiple_choice', { ask: 'choose-kurdish', prompt: 'Hello!', options: ['Silav!', 'Spas!'] })).toEqual(['Silav!', 'Spas!']);
    expect(kurdishShown('translate', { ask: 'to-english', say: 'Ez baş im.', prompt: 'Ez baş im.', accepted: ['I’m fine.'] })).toEqual(['Ez baş im.', 'Ez baş im.']);
    expect(kurdishShown('translate', { ask: 'to-kurdish', prompt: 'I’m fine.', accepted: ['Ez baş im.'], new: [{ ku: 'baş', en: 'good' }] })).toEqual([
      'baş',
      'Ez baş im.',
    ]);
    expect(kurdishShown('match_pairs', { pairs: [{ left: 'sêv', right: 'apple' }] })).toEqual(['sêv']);
    expect(kurdishShown('conversation', { title: 'Silav!', lines: [{ speaker: 0, text: 'Tu çawa yî?', en: 'How are you?' }], prompt: 'Why?' })).toEqual([
      'Silav!',
      'Tu çawa yî?',
    ]);
  });
});
