/**
 * The front and back matter (pdf.ts): a meaning shortened only at its joints and never left empty, so the word list and
 * alphabet print meanings whole or at a clause; the people of the road, none of them Hamo's family; and the file's metadata
 * naming the author.
 */
import { describe, expect, it } from 'vitest';
import { glossFor, renderRoadBook } from './pdf.js';
import { AUTHOR } from './prose.js';
import { roadBookCast, roadBookChapters, roadBookWordList } from './road-book.js';
import { loadRoadBookSources } from './sources.js';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('the pages around the chapters', () => {
  it('shortens a meaning only at its joints, and never to nothing', () => {
    const under = (n: number) => (text: string): boolean => text.length <= n;
    // what fits is left whole
    expect(glossFor('here you are; please, go ahead', under(99))).toBe('here you are; please, go ahead');
    // a closing note first, then the last clause after a semicolon, then after a comma
    expect(glossFor('am (im after a consonant, me after a vowel)', under(20))).toBe('am');
    expect(glossFor('here you are; please, go ahead', under(20))).toBe('here you are');
    expect(glossFor('tea house, café', under(12))).toBe('tea house');
    // a comma inside a note is not a joint of the meaning
    expect(glossFor('uncle (your father’s brother, or a man of his age)', under(30))).toBe('uncle');
    // a bracket a meaning opens with is part of it
    expect(glossFor('(not) at all; ever', under(14))).toBe('(not) at all');
    // and where nothing fits, the shortest whole clause is printed rather than nothing
    expect(glossFor('to plant, to sow', under(2))).toBe('to plant');
    expect(glossFor('yes', under(1))).toBe('yes');
  });

  it('gives every word of the road a meaning in the word list, and keeps the uncles and the aunts apart', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const words = roadBookWordList(roadBookChapters(plan, docs, stories, ALL));
    expect(words.length).toBeGreaterThan(400);
    // however short the room, a meaning is never empty and never ends on its own joint
    for (const w of words) {
      const short = glossFor(w.en, () => false);
      expect(short.trim(), w.ku).not.toBe('');
      expect(short, w.ku).not.toMatch(/[;,(]\s*$/);
    }
    // a meaning's note in brackets is all that tells some words apart: it stays where two lines hold it
    const twoLines = (text: string): boolean => text.length <= 40;
    const meaning = (ku: string): string => glossFor(words.find((w) => w.ku === ku)!.en, twoLines);
    expect(meaning('mam')).not.toBe(meaning('xal'));
    expect(meaning('met')).not.toBe(meaning('xaltî'));
  });

  it('introduces the people of the road, and none of Hamo’s own family, whom the road never names', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const cast = roadBookCast(plan, roadBookChapters(plan, docs, stories, ALL));
    expect(cast.filter((p) => /^Hamo’s (father|mother|(\p{L}+ )?(brother|sister))\b/u.test(p.en))).toEqual([]);
    for (const p of cast) expect(['person', 'animal'], p.name).toContain(p.kind);
    // his neighbours, his animals and the people of the tales are all there
    expect(cast.map((p) => p.name)).toEqual(expect.arrayContaining(['Nazê', 'Baran', 'Bozo', 'Şêro', 'Ferhad', 'Kawa']));
  });

  it('names the book’s author in the file’s details', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const pdf = await renderRoadBook({ chapters: roadBookChapters(plan, docs, stories, [1]), people: [] });
    expect(pdf.toString('latin1')).toContain(`(${AUTHOR.name})`);
  });
});
