/**
 * The page text (blocks.ts) on a book of chapter 1 alone: running heads, page numbers and number badges are left
 * out, Kurmanji and English are told apart but never inside a word, speakers read as names, and one row reads as one line.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRoadBookSources } from '../../src/books/sources.js';
import { roadBookCast, roadBookChapters, type BookChapter } from '../../src/books/road-book.js';
import { blockText, bookText, kurmanjiWithin, lexiconOf, sentenceCase, type Lexicon, type PageText } from './blocks.js';
import { captureRoadBook } from './capture.js';

let chapter: BookChapter;
let pages: PageText[];
let lexicon: Lexicon;

beforeAll(async () => {
  const sources = await loadRoadBookSources();
  const chapters = roadBookChapters(sources.plan, sources.docs, sources.stories, [1]);
  chapter = chapters[0]!;
  const people = roadBookCast(sources.plan, chapters);
  const book = await captureRoadBook({ chapters, people });
  lexicon = lexiconOf(chapters, people);
  pages = bookText(book.runs, book.pages, lexicon);
}, 60_000);

const blocksOn = (n: number) => pages[n - 1]!.blocks;
const allBlocks = () => pages.flatMap((p) => p.blocks);

describe('the words of each page', () => {
  it('finds words on every page, and leaves out the running head and the page number', () => {
    expect(pages.length).toBeGreaterThan(15);
    for (const page of pages) expect(page.blocks.length, `page ${page.n}`).toBeGreaterThan(0);
    // the chapter's pages after its opener carry its name and their number in the furniture only
    const opener = pages.find((p) => p.blocks.some((b) => b.kind === 'heading' && blockText(b) === chapter.titleKu))!;
    for (const page of pages.filter((p) => p.n > opener.n && p.n < pages.length - 6)) {
      const texts = page.blocks.map(blockText);
      expect(texts, `page ${page.n}`).not.toContain(String(page.n));
      expect(texts, `page ${page.n}`).not.toContain(chapter.titleKu);
    }
  });

  it('reads the cover’s title as one heading in Kurmanji', () => {
    const title = blocksOn(1).find((b) => b.kind === 'heading');
    expect(title).toEqual({ kind: 'heading', spans: [{ lang: 'ku', text: 'Rêya Kurmancî' }] });
  });

  it('marks the chapter’s Kurmanji lines as Kurmanji and their English as English', () => {
    const lessons = chapter.parts.flatMap((p) => p.lessons);
    const pairs = lessons.flatMap((l) => l.sentences).slice(0, 6);
    expect(pairs.length).toBeGreaterThan(3);
    const blocks = allBlocks();
    // a line and its English stand on one row: "Ez sêvê dixwim. · I’m eating the apple."
    const spans = blocks.flatMap((b) => b.spans.map((s) => ({ lang: s.lang, text: s.text.replace(/^\s*·\s*|\s*·\s*$/g, '').trim() })));
    for (const pair of pairs) {
      expect(spans.find((s) => s.text === pair.ku)?.lang, pair.ku).toBe('ku');
      expect(spans.find((s) => s.text === pair.en)?.lang, pair.en).toBe('en');
    }
  });

  it('never changes language inside a word, and marks the alphabet’s letters as Kurmanji', () => {
    for (const block of allBlocks()) {
      block.spans.slice(1).forEach((span, i) => {
        expect(/[\p{L}\p{M}]$/u.test(block.spans[i]!.text) && /^[\p{L}\p{M}]/u.test(span.text), blockText(block)).toBe(false);
      });
    }
    const letters = allBlocks().filter((b) => b.kind === 'heading' && /^\p{Lu}\p{Ll}$/u.test(blockText(b)));
    expect(letters).toHaveLength(31);
    for (const letter of letters) expect(letter.spans.map((s) => s.lang), blockText(letter)).toEqual(['ku']);
    expect(allBlocks().map(blockText)).toContain('as in bed');
  });

  it('marks the chapters’ Kurmanji sentences where an English line quotes them', () => {
    for (const block of allBlocks()) {
      for (const span of block.spans.filter((s) => s.lang === 'en')) {
        expect(kurmanjiWithin(span.text, lexicon).map(({ from, to }) => span.text.slice(from, to)), span.text).toEqual([]);
      }
    }
    // the farewell Hamo teaches, quoted in the English of its answer
    const quoted = allBlocks().flatMap((b) => b.spans).find((s) => s.lang === 'ku' && s.text === 'Bi xatirê te!');
    expect(quoted).toBeDefined();
  });

  it('reads what stands on one row as one line, and leaves the number badges out', () => {
    const texts = allBlocks().map(blockText);
    // the contents: the chapter's number, its name, its English and its page
    expect(texts.some((t) => /^1 · Silav · Hello · \d+$/.test(t)), 'the contents').toBe(true);
    // an exercise's number before its sentence, and a gap to fill
    expect(texts).toContain('1 · Yes, thanks!');
    expect(texts.some((t) => t.includes('Ez sêvê ….'))).toBe(true);
    // a word, its gender and its English
    expect(texts).toContain('sêv (f) · apple');
    // no block is only figures: the badges, the pictures’ numbers, a page’s number alone
    expect(texts.filter((t) => /^[\d\s.,·–-]+$/u.test(t))).toEqual([]);
  });

  it('names speakers in sentence case, with a colon, before their Kurmanji line', () => {
    const blocks = allBlocks();
    const speakers = blocks.filter((b) => b.kind === 'speaker');
    expect(speakers.length).toBeGreaterThan(5);
    for (const s of speakers) expect(blockText(s)).toMatch(/^\p{Lu}\p{Ll}+:$/u);
    expect(speakers.map(blockText)).toContain('Hamo:');
    const i = blocks.indexOf(speakers[0]!);
    expect(blocks[i + 1]!.spans[0]!.lang).toBe('ku');
  });

  it('keeps the space between words set in two faces', () => {
    const letter = blocksOn(2).map(blockText);
    expect(letter.some((t) => t.startsWith('I am Hamo, and every line'))).toBe(true);
    expect(letter.join(' ')).not.toMatch(/amHamo/);
  });

  it('reads small capitals as a sentence, keeping the capital of a name', () => {
    expect(sentenceCase('PART 1 OF 4')).toBe('Part 1 of 4');
    expect(sentenceCase('INTO KURDISH', new Set(['kurdish']))).toBe('Into Kurdish');
    // set on the part's row, after its English name
    expect(allBlocks().map(blockText)).toContain('Hello! · Part 1 of 4');
    expect(allBlocks().filter((b) => b.kind === 'label').map(blockText)).toContain('Grammar');
  });
});
