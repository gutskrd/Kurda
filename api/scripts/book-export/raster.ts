/**
 * The pages of the Hevalo book as pictures, for reading it page by page on a
 * screen: each page at 1440 pixels wide, sharp on a phone's dense screen or
 * zoomed in, and at 720 for a computer's spread, both WebP.
 *
 * The PDF is drawn by poppler's `pdftocairo`, the same renderer most PDF
 * viewers on Linux use, so the pictures look as the download does; the pages
 * are shared out over the machine's cores in runs of pages, one process
 * each. sharp then makes the two sizes (the smaller with lanczos3, which
 * keeps the type crisp), at the same quality every time: the same book gives
 * the same bytes on the same machine. Another version of poppler or of
 * sharp's WebP encoder draws and packs the pixels a little differently, so an
 * export made elsewhere can change every picture although nothing in the
 * book did.
 *
 * Poppler's `pdftotext` reads the PDF's words back as a PDF reader does,
 * which checks the words the export took from the press (`missingWords`).
 */
import { execFile, spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { promisify } from 'node:util';
import { sha256, type TextRun } from './capture.js';

/** The widths every page is made at, in pixels, smallest first. */
export const RENDITIONS = [720, 1440] as const;
export type Rendition = (typeof RENDITIONS)[number];

/** A page's picture in one size, as it was written. */
export interface PageImage {
  page: number;
  width: Rendition;
  height: number;
  file: string;
  bytes: number;
  sha256: string;
}

/** Whether poppler's renderer is on this machine. */
export const hasPdftocairo = (): boolean => spawnSync('pdftocairo', ['-v'], { stdio: 'ignore' }).error === undefined;

/** The file name a page's picture is published under: p001-720.webp. */
export const pageFile = (page: number, width: Rendition): string => `p${String(page).padStart(3, '0')}-${width}.webp`;

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}: ${err.trim()}`))));
  });
}

/** Pages `from` to `to` of `pdf` (a file), drawn at 1440 pixels wide, as PNG files in `dir`, by page. */
async function draw(pdf: string, dir: string, from: number, to: number): Promise<Map<number, string>> {
  const runs = Math.max(1, Math.min(availableParallelism(), to - from + 1));
  const per = Math.ceil((to - from + 1) / runs);
  const jobs: Promise<void>[] = [];
  for (let a = from; a <= to; a += per) {
    const b = Math.min(to, a + per - 1);
    jobs.push(run('pdftocairo', ['-png', '-scale-to-x', '1440', '-scale-to-y', '-1', '-f', String(a), '-l', String(b), pdf, join(dir, 'page')]));
  }
  await Promise.all(jobs);
  const files = new Map<number, string>();
  for (const name of await readdir(dir)) {
    const m = /^page-0*(\d+)\.png$/.exec(name);
    if (m) files.set(Number(m[1]), join(dir, name));
  }
  return files;
}

/**
 * The book's pages `from` to `to` as WebP pictures in `out` (pages/ of an
 * edition), two sizes each. Returns every picture written, page by page and
 * smallest first.
 */
export async function rasterize(pdfBytes: Buffer, out: string, from: number, to: number): Promise<PageImage[]> {
  const work = await mkdtemp(join(tmpdir(), 'book-pages-'));
  try {
    const pdf = join(work, 'book.pdf');
    await writeFile(pdf, pdfBytes);
    const pngs = await draw(pdf, work, from, to);
    const pages = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const images: PageImage[] = [];
    // a few pages at a time: WebP at this effort is heavy, and each holds its picture in memory
    const lanes = Math.max(1, availableParallelism());
    for (let i = 0; i < pages.length; i += lanes) {
      const batch = await Promise.all(
        pages.slice(i, i + lanes).map(async (page) => {
          const png = pngs.get(page);
          if (!png) throw new Error(`pdftocairo drew no page ${page}`);
          const source = await readFile(png);
          return Promise.all(
            RENDITIONS.map(async (width): Promise<PageImage> => {
              const image = sharp(source);
              const resized = width === 1440 ? image : image.resize({ width, kernel: 'lanczos3' });
              const { data, info } = await resized.webp({ quality: 78, effort: 6, smartSubsample: true }).toBuffer({ resolveWithObject: true });
              const file = join(out, pageFile(page, width));
              await writeFile(file, data);
              return { page, width, height: info.height, file, bytes: data.length, sha256: sha256(data) };
            }),
          );
        }),
      );
      images.push(...batch.flat());
    }
    return images;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * The words a PDF reader finds on a page that are not among the words the
 * press set there ("page 12: sêv"), page by page. Spaced capitals come out of
 * a reader in pieces ("PA RT"), so each piece is looked for in the page's
 * letters run together. Text drawn inside a picture would show here; the
 * book's drawings carry none.
 */
export async function missingWords(pdfBytes: Buffer, runs: readonly TextRun[], pages: number): Promise<string[]> {
  const work = await mkdtemp(join(tmpdir(), 'book-words-'));
  try {
    const pdf = join(work, 'book.pdf');
    await writeFile(pdf, pdfBytes);
    const { stdout } = await promisify(execFile)('pdftotext', ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    // the reader ends every page with a form feed
    const found = stdout.split('\f');
    const words = (text: string): string[] => text.normalize('NFKC').toLocaleLowerCase('ku').match(/\p{L}+|\d+/gu) ?? [];
    const missing: string[] = [];
    for (let n = 1; n <= pages; n++) {
      const captured = runs
        .filter((r) => r.page === n)
        .map((r) => r.text)
        .join('')
        .normalize('NFKC')
        .toLocaleLowerCase('ku')
        .replace(/[^\p{L}\d]/gu, '');
      for (const word of words(found[n - 1] ?? '')) if (!captured.includes(word)) missing.push(`page ${n}: ${word}`);
    }
    return missing;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
