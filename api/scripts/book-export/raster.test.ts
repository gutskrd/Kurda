/**
 * The book's pages as pictures (raster.ts), and the words the export reads
 * from the press (capture.ts) checked against what a PDF reader finds on the
 * page. Both need poppler's tools, which a machine without them skips.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRoadBookSources } from '../../src/books/sources.js';
import { roadBookCast, roadBookChapters } from '../../src/books/road-book.js';
import { PAGE } from '../../src/books/sheet.js';
import { captureRoadBook, type Capture } from './capture.js';
import { hasPdftocairo, missingWords, pageFile, rasterize } from './raster.js';

let book: Capture;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'book-raster-test-'));
  if (!hasPdftocairo()) return;
  const sources = await loadRoadBookSources();
  const chapters = roadBookChapters(sources.plan, sources.docs, sources.stories, [1]);
  book = await captureRoadBook({ chapters, people: roadBookCast(sources.plan, chapters) });
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe.skipIf(!hasPdftocairo())('the pages as pictures', () => {
  it('draws each page as WebP at 720 and 1440 pixels wide, in the page’s proportions, the same every time', async () => {
    const images = await rasterize(book.pdf, dir, 1, 2);
    expect(images.map((i) => [i.page, i.width])).toEqual([
      [1, 720],
      [1, 1440],
      [2, 720],
      [2, 1440],
    ]);
    for (const image of images) {
      const meta = await sharp(await readFile(join(dir, pageFile(image.page, image.width)))).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(image.width);
      expect(Math.abs(meta.height! - (image.width * PAGE.h) / PAGE.w)).toBeLessThanOrEqual(1);
    }
    const again = await rasterize(book.pdf, dir, 1, 1);
    expect(again.map((i) => i.sha256)).toEqual(images.filter((i) => i.page === 1).map((i) => i.sha256));
  }, 120_000);

  it('has in its words every word a PDF reader finds on each page', async () => {
    expect(await missingWords(book.pdf, book.runs, book.pages)).toEqual([]);
  }, 120_000);
});
