/**
 * Where everything is in the book (manifest.ts), on a book of chapters 1 and
 * 2: the chapters follow each other without a gap, each opens on a page under
 * its own name, the front and back matter are all there, and the same book
 * makes the same edition.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRoadBookSources } from '../../src/books/sources.js';
import { roadBookCast, roadBookChapters, type BookChapter } from '../../src/books/road-book.js';
import { blockText, bookText, lexiconOf, type PageText } from './blocks.js';
import { captureRoadBook } from './capture.js';
import { SECTION_KEYS, editionId, pdfFingerprint, placesOf, type Places } from './manifest.js';

let chapters: BookChapter[];
let text: PageText[];
let places: Places;
let pdf: Buffer;

/** The book of these chapters, printed and read. */
async function read(numbers: number[]) {
  const sources = await loadRoadBookSources();
  const chosen = roadBookChapters(sources.plan, sources.docs, sources.stories, numbers);
  const people = roadBookCast(sources.plan, chosen);
  const book = await captureRoadBook({ chapters: chosen, people });
  const pages = bookText(book.runs, book.pages, lexiconOf(chosen, people));
  return { chosen, book, pages };
}

beforeAll(async () => {
  const made = await read([1, 2]);
  chapters = made.chosen;
  text = made.pages;
  pdf = made.book.pdf;
  places = placesOf(made.book.runs, made.pages, chapters);
}, 60_000);

describe('the book’s places', () => {
  it('has chapters that start in order and end where the next begins', () => {
    const list = places.chapters;
    expect(list.map((c) => c.number)).toEqual([1, 2]);
    for (let i = 1; i < list.length; i++) {
      expect(list[i]!.start).toBeGreaterThan(list[i - 1]!.start);
      expect(list[i - 1]!.end).toBe(list[i]!.start - 1);
    }
    const answers = places.sections.find((s) => s.key === 'answers')!;
    expect(list.at(-1)!.end).toBe(answers.start - 1);
  });

  it('opens each chapter on a page that carries its name, and each part on a page after it', () => {
    for (const c of places.chapters) {
      const first = text[c.start - 1]!.blocks.find((b) => b.kind === 'heading');
      expect(first && blockText(first), `chapter ${c.number}`).toBe(c.titleKu);
      expect(c.parts).toHaveLength(4);
      for (const p of c.parts) {
        expect(p.start).toBeGreaterThan(c.start);
        expect(p.start).toBeLessThanOrEqual(c.end);
        expect(text[p.start - 1]!.blocks.some((b) => b.kind === 'heading' && blockText(b) === p.titleKu), p.titleKu).toBe(true);
      }
    }
  });

  it('covers the front and the back of the book, page after page', () => {
    const sections = places.sections;
    expect(sections.map((s) => s.key)).toEqual([...SECTION_KEYS]);
    const front = sections.slice(0, 6);
    expect(front[0]!.start).toBe(1);
    for (let i = 1; i < front.length; i++) expect(front[i]!.start).toBe(front[i - 1]!.end + 1);
    expect(front.at(-1)!.end).toBe(places.chapters[0]!.start - 1);
    const back = sections.slice(6);
    for (let i = 1; i < back.length; i++) expect(back[i]!.start).toBeGreaterThanOrEqual(back[i - 1]!.end);
    expect(back.at(-1)).toEqual({ key: 'farewell', start: text.length, end: text.length });
  });

  it('makes the same edition from the same book, and a new one when only its PDF changes', async () => {
    const again = await read([1, 2]);
    const hashes = ['a'.repeat(64), 'b'.repeat(64)];
    // printed twice, a second or more apart, the PDF differs in its dates only
    expect(pdfFingerprint(again.book.pdf)).toBe(pdfFingerprint(pdf));
    const first = editionId('2026-01-01', JSON.stringify({ pages: text }), hashes, pdfFingerprint(pdf));
    const second = editionId('2026-01-01', JSON.stringify({ pages: again.pages }), hashes, pdfFingerprint(again.book.pdf));
    expect(second).toBe(first);
    expect(first).toMatch(/^2026-01-01\.[0-9a-f]{12}$/);
    expect(editionId('2026-01-01', JSON.stringify({ pages: text }), [...hashes].reverse(), pdfFingerprint(pdf))).not.toBe(first);
    const touched = Buffer.concat([pdf, Buffer.from('%\n', 'latin1')]);
    expect(editionId('2026-01-01', JSON.stringify({ pages: text }), hashes, pdfFingerprint(touched))).not.toBe(first);
  }, 60_000);
});
