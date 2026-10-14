import { describe, expect, it } from 'vitest';
import type { StoryGlossEntry } from '@kurda/shared';
import { evidenceText, paragraphSegments } from './segments';

const sûk: StoryGlossEntry = { term: 'sûkê', meanings: { en: 'the market' } };
const sêv: StoryGlossEntry = { term: 'sêv', meanings: { en: 'apples' } };

describe('paragraphSegments', () => {
  it('keeps every character, in order, split by sentence', () => {
    const p = 'Rojda çû sûkê. Ew sêv kirî!';
    const segs = paragraphSegments(p, []);
    expect(segs.map((s) => s.text).join('')).toBe(p);
    expect(segs.map((s) => s.sentence)).toEqual([0, null, 1]);
  });

  it('marks the first time each glossary word appears, inside its sentence', () => {
    const p = 'Rojda çû sûkê. Li sûkê sêv hebûn.';
    const segs = paragraphSegments(p, [sûk, sêv]);
    const marked = segs.filter((s) => s.gloss);
    expect(marked.map((s) => [s.text, s.sentence])).toEqual([
      ['sûkê', 0],
      ['sêv', 1],
    ]);
    expect(segs.map((s) => s.text).join('')).toBe(p);
  });

  it('marks a Soranî word as a whole word only', () => {
    const p = 'بەردار لە دار دەکەوێت.';
    const segs = paragraphSegments(p, [{ term: 'دار', meanings: { en: 'tree' } }]);
    expect(segs.filter((s) => s.gloss).map((s) => s.text)).toEqual(['دار']);
  });
});

describe('evidenceText', () => {
  const paragraphs = ['Yek. Du.', 'Sê.'];
  it('quotes the named sentence, else the whole paragraph, else nothing', () => {
    expect(evidenceText(paragraphs, 0, 1)).toBe('Du.');
    expect(evidenceText(paragraphs, 1, null)).toBe('Sê.');
    expect(evidenceText(paragraphs, 0, 9)).toBe('Yek. Du.');
    expect(evidenceText(paragraphs, null, null)).toBeNull();
    expect(evidenceText(paragraphs, 5, null)).toBeNull();
  });
});
