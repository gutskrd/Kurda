/**
 * An edition of the Hevalo book for reading on the web: the PDF, every page
 * as a picture in two sizes, the words of every page as text, and a
 * manifest of where everything is. zagrosian.com imports the folder and
 * shows the book page by page, with the download beside it.
 *
 *   npm run book:export --workspace api -- --out <dir>          every chapter written so far
 *   npm run book:export --workspace api -- --out <dir> 1 2 3    chapters 1 to 3
 *
 * The folder it writes:
 *
 *   Reya-Kurmanci-Pirtuka-Hevalo.pdf   the book, as hevalo.app serves it
 *   pages/p001-720.webp …              each page 720 and 1440 pixels wide
 *   book.json                          the edition, its pages, sections and chapters
 *   text.json                          each page's words, as blocks marked Kurmanji or English
 *
 * The same chapters make the same edition (book.json's `edition` changes with
 * the date and with what a reader sees or downloads, nothing else), so
 * exporting again after the book is unchanged changes nothing on the site.
 * The pictures are the same bytes only with the same poppler and WebP
 * encoder, so export each edition on one machine.
 *
 * Before it writes anything, the export checks that every word a PDF reader
 * finds on each page is among the words it read from the press.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadRoadBookSources } from '../src/books/sources.js';
import { roadBookCast, roadBookChapters } from '../src/books/road-book.js';
import { PAGE } from '../src/books/sheet.js';
import { bookText, lexiconOf } from './book-export/blocks.js';
import { captureRoadBook, sha256 } from './book-export/capture.js';
import { editionId, pdfFingerprint, placesOf } from './book-export/manifest.js';
import { RENDITIONS, hasPdftocairo, missingWords, rasterize } from './book-export/raster.js';

const PDF_FILE = 'Reya-Kurmanci-Pirtuka-Hevalo.pdf';

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const out = at >= 0 ? args[at + 1] : undefined;
  const wanted = args.filter((_, i) => at < 0 || (i !== at && i !== at + 1)).map(Number);
  if (!out || wanted.some((n) => !Number.isInteger(n) || n < 1)) {
    console.error('usage: npm run book:export --workspace api -- --out <dir> [chapter …]');
    process.exit(2);
  }
  if (!hasPdftocairo()) {
    console.error('book:export draws the pages with pdftocairo, which is not installed. On Ubuntu: sudo apt-get install poppler-utils; on macOS: brew install poppler.');
    process.exit(1);
  }

  const sources = await loadRoadBookSources();
  const chapters = roadBookChapters(sources.plan, sources.docs, sources.stories, wanted.length > 0 ? wanted : [...sources.docs.keys()]);
  const unwritten = wanted.filter((n) => !chapters.some((c) => c.number === n));
  if (unwritten.length > 0) console.warn(`not written yet, so not in this edition: chapter ${unwritten.join(', ')}`);
  if (chapters.length === 0) {
    console.error('none of those chapters is written yet');
    process.exit(1);
  }
  const people = roadBookCast(sources.plan, chapters);
  const book = await captureRoadBook({ chapters, people });
  const text = bookText(book.runs, book.pages, lexiconOf(chapters, people));
  const empty = text.filter((p) => p.blocks.length === 0).map((p) => p.n);
  if (empty.length > 0) throw new Error(`pages without any text: ${empty.join(', ')}`);
  const places = placesOf(book.runs, text, chapters);
  const missing = await missingWords(book.pdf, book.runs, book.pages);
  if (missing.length > 0) {
    throw new Error(`words a PDF reader finds that the export did not read from the press (${missing.length}): ${missing.slice(0, 20).join('; ')}`);
  }

  const dir = resolve(out);
  const pagesDir = join(dir, 'pages');
  // the folder is the edition: nothing of an older one may stay in it
  await rm(pagesDir, { recursive: true, force: true });
  await mkdir(pagesDir, { recursive: true });
  await writeFile(join(dir, PDF_FILE), book.pdf);
  const images = await rasterize(book.pdf, pagesDir, 1, book.pages);

  const textJson = `${JSON.stringify({ pages: text })}\n`;
  await writeFile(join(dir, 'text.json'), textJson);
  const date = new Date().toISOString().slice(0, 10);
  const manifest = {
    edition: editionId(date, textJson, images.map((i) => i.sha256), pdfFingerprint(book.pdf)),
    date,
    title: { ku: 'Rêya Kurmancî', en: 'The Kurmanji Road' },
    pageCount: book.pages,
    pagePt: { w: PAGE.w, h: PAGE.h },
    renditions: [...RENDITIONS],
    pdf: { file: PDF_FILE, bytes: book.pdf.length, sha256: sha256(book.pdf) },
    sections: places.sections,
    chapters: places.chapters,
  };
  await writeFile(join(dir, 'book.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`${dir}: chapters ${chapters.map((c) => c.number).join(', ')}, ${book.pages} pages`);
  console.log(`  PDF ${mb(book.pdf.length)}`);
  for (const width of RENDITIONS) {
    const set = images.filter((i) => i.width === width);
    console.log(`  ${width} px: ${set.length} pages, ${mb(set.reduce((sum, i) => sum + i.bytes, 0))}`);
  }
  console.log(`  edition ${manifest.edition}`);
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
