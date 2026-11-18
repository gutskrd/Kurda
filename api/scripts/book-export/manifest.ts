/**
 * Where everything is in the Hevalo book, by page, and the edition its pages make. Only the page numbers are taken
 * from the contents page (page 3), by their fixed order; each is checked against the pages themselves, so a contents
 * page that no longer matches the book stops the export instead of misleading a reader. A chapter runs to the page
 * before whatever begins next; a part begins on the first page with its name as a heading.
 */
import { createHash } from 'node:crypto';
import { MARGIN, PAGE, TEXT } from '../../src/books/sheet.js';
import type { BookChapter } from '../../src/books/road-book.js';
import { blockText, type PageText } from './blocks.js';
import type { TextRun } from './capture.js';

export const SECTION_KEYS = ['cover', 'letter', 'contents', 'passport', 'alphabet', 'people', 'answers', 'words', 'author', 'farewell'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface Section {
  key: SectionKey;
  start: number;
  end: number;
}

export interface ChapterPlace {
  number: number;
  cefr: string;
  titleKu: string;
  titleEn: string;
  start: number;
  end: number;
  parts: Array<{ titleKu: string; start: number }>;
}

export interface Places {
  sections: Section[];
  chapters: ChapterPlace[];
}

/** The page the contents page is: after the cover and Hamo's letter. */
const CONTENTS_PAGE = 3;

/** The contents page's numbers, top to bottom: those set flush right, except the page's own at its foot. */
export function contentsNumbers(runs: readonly TextRun[]): number[] {
  const right = TEXT.x + TEXT.w;
  const folio = (r: TextRun): boolean => r.text === String(CONTENTS_PAGE) && r.y > PAGE.h - MARGIN.bottom;
  return runs
    .filter((r) => r.page === CONTENTS_PAGE && r.align === 'right' && /^\d+$/.test(r.text) && Math.abs(r.x + r.width - right) < 1 && !folio(r))
    .sort((a, b) => a.y - b.y)
    .map((r) => Number(r.text));
}

/** The first heading of a page, as text. */
const firstHeading = (page: PageText | undefined): string | undefined => {
  const block = page?.blocks.find((b) => b.kind === 'heading');
  return block ? blockText(block) : undefined;
};

/** Where everything is, from the contents page, checked against the pages. */
export function placesOf(runs: readonly TextRun[], text: readonly PageText[], chapters: readonly BookChapter[]): Places {
  const pageCount = text.length;
  const numbers = contentsNumbers(runs);
  const expected = 3 + chapters.length + 3;
  if (numbers.length !== expected) {
    throw new Error(`the contents page (page ${CONTENTS_PAGE}) gives ${numbers.length} page numbers; the book has ${expected} entries`);
  }
  const [passport, alphabet, people] = numbers as [number, number, number];
  const openers = numbers.slice(3, 3 + chapters.length);
  const [answers, words, author] = numbers.slice(3 + chapters.length) as [number, number, number];

  chapters.forEach((c, i) => {
    const page = openers[i]!;
    const heading = firstHeading(text[page - 1]);
    if (heading !== c.titleKu) {
      throw new Error(`chapter ${c.number}: the contents send it to page ${page}, which opens with ${heading === undefined ? 'no heading' : `“${heading}”`}, not “${c.titleKu}”`);
    }
  });

  const placed: ChapterPlace[] = chapters.map((c, i) => {
    const start = openers[i]!;
    const end = (openers[i + 1] ?? answers) - 1;
    const parts = c.parts.map((p) => {
      let found = -1;
      for (let n = start + 1; n <= end && found < 0; n++) {
        if (text[n - 1]!.blocks.some((b) => b.kind === 'heading' && blockText(b) === p.titleKu)) found = n;
      }
      if (found < 0) throw new Error(`chapter ${c.number}: no page from ${start} to ${end} opens part “${p.titleKu}”`);
      return { titleKu: p.titleKu, start: found };
    });
    return { number: c.number, cefr: c.cefr, titleKu: c.titleKu, titleEn: c.titleEn, start, end, parts };
  });

  // the word list may begin on the answers' last page, below them: that page is then both's
  const firstChapter = openers[0] ?? answers;
  const sections: Section[] = [
    { key: 'cover', start: 1, end: 1 },
    { key: 'letter', start: 2, end: 2 },
    { key: 'contents', start: 3, end: passport - 1 },
    { key: 'passport', start: passport, end: alphabet - 1 },
    { key: 'alphabet', start: alphabet, end: people - 1 },
    { key: 'people', start: people, end: firstChapter - 1 },
    { key: 'answers', start: answers, end: Math.max(answers, words - 1) },
    { key: 'words', start: words, end: author - 1 },
    { key: 'author', start: author, end: pageCount - 1 },
    { key: 'farewell', start: pageCount, end: pageCount },
  ];
  for (const s of sections) {
    if (s.start < 1 || s.end > pageCount || s.end < s.start) throw new Error(`the ${s.key} pages do not make sense: ${s.start} to ${s.end} of ${pageCount}`);
  }
  return { sections, chapters: placed };
}

/** A hash of a PDF without the dates the writer stamps in it (`(D:20261117034813Z)`) and the ID made from them. */
export function pdfFingerprint(pdf: Buffer): string {
  const timeless = pdf
    .toString('latin1')
    .replace(/\(D:\d{14}(?:Z|[+-]\d\d'\d\d')?\)/g, '()')
    .replace(/\/ID \[<[0-9a-f]+> ?<[0-9a-f]+>\]/gi, '/ID []');
  return createHash('sha256').update(timeless, 'latin1').digest('hex');
}

/**
 * The edition: the day and a short hash of what a reader gets (the text, every page image in order, the dateless PDF).
 * The same book makes the same edition whenever it is exported; a change to the PDF alone makes a new one.
 */
export function editionId(date: string, textJson: string, imageHashes: readonly string[], pdf: string): string {
  const hash = createHash('sha256').update(textJson);
  for (const h of imageHashes) hash.update(h);
  hash.update(pdf);
  return `${date}.${hash.digest('hex').slice(0, 12)}`;
}
