/**
 * The Hevalo book from the road's own files: what a chapter holds, the word
 * list's Kurdish order, and a PDF that is one — with the alphabet, the
 * chapter and its story inside, and nothing of a chapter not asked for.
 */
import { describe, expect, it } from 'vitest';
import { kurdishCompare, roadBookChapters, roadBookWordList } from './road-book.js';
import { renderRoadBook } from './pdf.js';
import { loadRoadBookSources } from './sources.js';

describe('the Hevalo book', () => {
  it('gathers a chapter: its four parts with their words, grammar and conversation with Hamo, its story, and practice', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const [one] = roadBookChapters(plan, docs, stories, [1]);
    expect(one).toMatchObject({ number: 1, titleKu: 'Silav', cefr: 'A1', land: { landmark: 'gate' } });
    expect(one!.parts.map((p) => p.titleKu)).toEqual(plan.units[0]!.skills.map((s) => s.titleKu));
    const words = plan.units[0]!.skills[0]!.lessons.flatMap((l) => l.new.map((w) => w.ku));
    expect(one!.parts[0]!.words.map((w) => w.ku)).toEqual(words);
    expect(one!.parts[0]!.grammarMd).toContain('Ez baş im');
    // chapter 1's conversations are Hamo talking with the learner, who is "You" in the book
    expect(one!.parts[0]!.dialogue!.lines.slice(0, 2).map((l) => [l.who, l.text])).toEqual([
      ['Hamo', 'Silav!'],
      ['You', 'Silav!'],
    ]);
    expect(one!.tale).toMatchObject({ title: 'Sêv tune!' });
    expect(one!.tale!.paragraphs).toHaveLength(one!.tale!.english.length);
    expect(one!.practice.some((p) => p.direction === 'to-kurdish')).toBe(true);
    expect(one!.practice.some((p) => p.direction === 'to-english')).toBe(true);
    // a word that explains grammar, or offers two forms, is not asked for
    expect(one!.practice.filter((p) => p.direction === 'to-kurdish').every((p) => !p.answer.includes('/'))).toBe(true);
  });

  it('lists every word once, in the Kurdish alphabet’s order', () => {
    expect(['ç', 'c', 'ê', 'e', 'z', 'a'].sort(kurdishCompare)).toEqual(['a', 'c', 'ç', 'e', 'ê', 'z']);
    const list = roadBookWordList([
      { parts: [{ words: [{ ku: 'çay', en: 'tea', gender: 'f' }, { ku: 'cîran', en: 'neighbour', gender: 'm' }] }], number: 1 },
      { parts: [{ words: [{ ku: 'Çay', en: 'tea again', gender: 'f' }, { ku: 'av', en: 'water', gender: 'f' }] }], number: 2 },
    ] as never);
    expect(list.map((w) => [w.ku, w.chapter])).toEqual([
      ['av', 2],
      ['cîran', 1],
      ['çay', 1],
    ]);
  });

  it('prints a PDF of the chapters asked for, and only those', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const pdf = await renderRoadBook({ chapters: roadBookChapters(plan, docs, stories, [1]), characters: plan.characters });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
    expect(pages).toBeGreaterThan(15);
    expect(pages).toBeLessThan(60);
  }, 30_000);
});
