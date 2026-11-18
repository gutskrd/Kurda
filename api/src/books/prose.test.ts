/**
 * The book's own prose (prose.ts): Hamo's letter, the three friends on the people pages, and the author's note. Held to
 * the owner's brief: nothing the reader already knows, no families the course does not introduce, Sêvan plainly made
 * up, and the author's note in the author's own words and name.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTHOR, FRIENDS, LETTER } from './prose.js';

const letter = LETTER.map((p) => p.map((s) => s.text).join('')).join('\n');

describe('the book’s own words', () => {
  it('says plainly that Sêvan is a made-up village, drawn from the villages of the Kurdish countryside', () => {
    expect(letter).toContain('Sêvan is a made-up village');
    expect(letter).toMatch(/villages of the Kurdish countryside/);
    // the letter no longer gives Hamo thirty years in a village that is not on any map
    expect(letter).not.toMatch(/thirty years/);
  });

  it('introduces Hamo as the one who created the Hevalo app, from the author’s own note, and names none of his family', () => {
    expect(FRIENDS.hamo).toMatch(/^Hamo was born in Kobanî/);
    // what he made is the app, not the deer who walks the road with him
    for (const fact of ['Kurdish roots', 'the Netherlands', 'he created the Hevalo app']) expect(FRIENDS.hamo).toContain(fact);
    for (const family of ['Ibrahîm', 'Edûl', 'Evdila', 'Lorîn', 'Cîhan', 'father', 'mother', 'brother', 'sister', 'aunt']) {
      expect(FRIENDS.hamo, family).not.toContain(family);
    }
  });

  it('says nothing of Xezal being talked about rather than talked to, and nothing the reader is told elsewhere', () => {
    for (const text of Object.values(FRIENDS)) expect(text).not.toMatch(/talked (about|to)/);
    // the letter has already said who the young deer is, so his page does not say it again
    expect(letter).toContain('your guide');
    expect(FRIENDS.hevalo).not.toMatch(/guide|young (male )?deer/);
    // his name’s meaning ends its sentence by itself, and the “O” is never left alone at a line’s end
    expect(FRIENDS.hevalo).toContain('His name means “O\u00a0friend!” Curious');
    expect(FRIENDS.xezo).toMatch(/^Xezal is the young teacher at the village school\./);
  });

  it('prints the author’s note in the author’s own words, signed with the author’s name', () => {
    expect(AUTHOR.name).toBe('Mohamad Saleh Abdulrahman');
    expect(AUTHOR.paragraphs[0]).toBe(`My name is ${AUTHOR.name}. I was born in Kobanê and grew up with Kurdish roots, and later built my life in the Netherlands.`);
    expect(AUTHOR.paragraphs).toHaveLength(5);
    expect(AUTHOR.paragraphs.join(' ')).toContain('This book is one small contribution to keeping that heritage alive');
  });

  it('uses no Kurdish but the road’s own names', () => {
    const dir = new URL('../../content/lessons/road/', import.meta.url);
    const course = readdirSync(dir)
      .map((name) => readFileSync(new URL(name, dir), 'utf8'))
      .join('\n');
    const words = [letter, ...Object.values(FRIENDS)].join(' ');
    // every word with a Kurdish letter in it is one the course itself has
    const kurdish = [...new Set(words.match(/[\p{L}’-]*[çêîşûÇÊÎŞÛ][\p{L}’-]*/gu) ?? [])];
    expect(kurdish.length).toBeGreaterThan(0);
    for (const w of kurdish) expect(course, w).toContain(w);
  });
});
