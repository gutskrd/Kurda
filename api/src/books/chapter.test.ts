/**
 * A chapter set into pages (chapter.ts) on the road's own chapters: practice always opens a page and keeps its matching
 * task whole; a part never opens at a page foot with its lessons overleaf; a lesson's lines never open a page cut off
 * from its words, and a last word never heads a page alone; the closing pictures never give away "Name the pictures";
 * and asides sit at the foot of short pages, at most two per chapter and never two on one spread.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { asidePages, chapterBlocks, chapterPictures, lessonBlocks } from './chapter.js';
import { paginate, type FlowPage } from './flow.js';
import type { Block } from './page.js';
import { roadBookChapters, type BookChapter, type BookLesson } from './road-book.js';
import { Press, TEXT } from './sheet.js';
import { loadRoadBookSources } from './sources.js';

const press = new Press('a test of the chapters');
const places = new Map<string, number>([['passport', 4]]);
let chapters: BookChapter[] = [];

beforeAll(async () => {
  const { plan, docs, stories } = await loadRoadBookSources();
  chapters = roadBookChapters(plan, docs, stories, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

/** A chapter's run and its pages, and which page a block of it is on. */
function laidOut(c: BookChapter): { blocks: Block[]; pages: FlowPage[]; pageOf: (index: number) => number } {
  const blocks = chapterBlocks(press, c, places);
  const pages = paginate(blocks, TEXT.room);
  return { blocks, pages, pageOf: (index) => pages.findIndex((p) => index >= p.from && index < p.to) };
}

/** A lesson with these many words and two lines to read, in a chapter of the road's. */
function lessonWith(count: number, long = 0): BookLesson {
  const words = Array.from({ length: count }, (_, i) => ({ ku: `peyv${i}`, en: 'a word', gender: null, pos: null, picture: null }));
  const longs = Array.from({ length: long }, (_, i) => ({ ku: `gotin${i}`, en: 'a word whose meaning takes a good deal of explaining, as a phrase learnt whole does, so it is set across the page', gender: null, pos: null, picture: null }));
  return {
    key: 'u99s1l1',
    position: 1,
    titleKu: 'Ceribandin',
    titleEn: 'A test',
    focus: 'meet',
    beat: 'Hamo tries the book.',
    words: [...words, ...longs],
    say: null,
    sentences: [
      { ku: 'Ev ceribandin e.', en: 'This is a test.' },
      { ku: 'Ev jî.', en: 'So is this.' },
    ],
    dialogue: null,
  } as BookLesson;
}

describe('a chapter of the book', () => {
  it('opens every chapter’s practice on a page of its own, with “Join them up” whole on it', () => {
    for (const c of chapters) {
      const { blocks, pages, pageOf } = laidOut(c);
      const banner = blocks.findIndex((b) => b.section === 'With a pencil');
      expect(banner, `chapter ${c.number}`).toBeGreaterThan(0);
      expect(pages.some((p) => p.from === banner), `chapter ${c.number}`).toBe(true);
      // the banner, the task's heading and every row of the task but the last are kept, so all of them share the banner's page
      let end = banner;
      while (blocks[end]!.keep) end += 1;
      expect(pageOf(end), `chapter ${c.number}`).toBe(pageOf(banner));
    }
  });

  it('never opens a part at the foot of a page with its first lesson overleaf', () => {
    for (const c of chapters) {
      const { blocks, pageOf } = laidOut(c);
      blocks.forEach((b, i) => {
        if (!b.anchor || !/:part\d+$/.test(b.anchor)) return;
        // the part's band, its grammar note and its first lesson's scene are one kept run, which goes over whole with what follows it
        let end = i;
        while (blocks[end]!.keep) end += 1;
        expect(end - i, `${b.anchor}`).toBeGreaterThan(2);
        expect(pageOf(end), `${b.anchor}`).toBe(pageOf(i));
      });
    }
  });

  it('holds a lesson’s last words to its lines, and never lets a lone last word open a page', () => {
    const c = chapters[0]!;
    // four words are two rows of two, not three and one
    const four = lessonBlocks(press, c, lessonWith(4));
    expect(four.words).toHaveLength(2);
    expect(four.words.at(-1)!.hold).toBe(true);
    expect(four.words[0]!.hold).toBe(true);
    // seven are three, three and one: the one is kept with the row before it, whatever that costs the page
    const seven = lessonBlocks(press, c, lessonWith(7));
    expect(seven.words).toHaveLength(3);
    expect(seven.words[1]!.keep).toBe(true);
    // six are two full rows, which only hold together
    const six = lessonBlocks(press, c, lessonWith(6));
    expect(six.words).toHaveLength(2);
    expect(six.words[0]!.keep ?? false).toBe(false);
    // a word set across the page is a row of one, kept with the row before it
    const long = lessonBlocks(press, c, lessonWith(3, 1));
    expect(long.words).toHaveLength(2);
    expect(long.words[0]!.keep).toBe(true);
    // the scene goes over with the first row of words
    expect(four.strip.keep).toBe(true);
  });

  it('shows none of the answers to “Name the pictures” among the chapter’s pictures at its end', () => {
    let shown = 0;
    for (const c of chapters) {
      const asked = new Set(c.practice.pictures.map((p) => p.picture));
      const pictures = chapterPictures(c);
      for (const p of pictures) if (p.picture.kind === 'word') expect(asked.has(p.picture.id), `${c.number}: ${p.ku}`).toBe(false);
      // and never the same drawing twice
      expect(new Set(pictures.map((p) => JSON.stringify(p.picture))).size).toBe(pictures.length);
      shown += pictures.length;
    }
    expect(shown).toBeGreaterThan(0);
  });

  it('puts at most two asides in a chapter: the roomiest pages, never two on one spread, never its last page', () => {
    // the run starts on page 11 here: its second and third pages are 12 and 13, which face each other, so the second roomiest gives way
    expect([...asidePages([100, 300, 280, 95, 40, 400], 11)].sort()).toEqual([0, 1]);
    // starting on page 10, the same two pages are 11 and 12, back to back, and both have one
    expect([...asidePages([100, 300, 280, 95, 40], 10)].sort()).toEqual([1, 2]);
    // a page too short for one is left plain, and so is the last, which ends on the chapter's pictures
    expect([...asidePages([60, 80, 400], 10)]).toEqual([]);
    expect([...asidePages([95, 60, 120, 60, 200, 10], 10)].sort()).toEqual([2, 4]);
    // on the road's own chapters
    for (const c of chapters) {
      const { pages } = laidOut(c);
      const slack = pages.map((p) => TEXT.room - p.used);
      const chosen = asidePages(slack, 10);
      expect(chosen.size).toBeLessThanOrEqual(2);
      expect(chosen.has(pages.length - 1)).toBe(false);
    }
  });
});
