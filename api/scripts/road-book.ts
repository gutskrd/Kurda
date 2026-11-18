/**
 * Prints the Hevalo book from the course files for a look before it goes out, including chapters not yet online
 * (the API serves the online ones, books/routes.ts).
 *
 *   tsx scripts/road-book.ts out.pdf            every chapter written so far
 *   tsx scripts/road-book.ts out.pdf 1 2        chapters 1 and 2
 */
import { writeFile } from 'node:fs/promises';
import { loadRoadBookSources } from '../src/books/sources.js';
import { roadBookCast, roadBookChapters } from '../src/books/road-book.js';
import { renderRoadBook } from '../src/books/pdf.js';

async function main(): Promise<void> {
  const [out, ...rest] = process.argv.slice(2);
  if (!out) {
    console.error('usage: tsx scripts/road-book.ts out.pdf [chapter …]');
    process.exit(2);
  }
  const sources = await loadRoadBookSources();
  const wanted = rest.length > 0 ? rest.map(Number) : [...sources.docs.keys()];
  const chapters = roadBookChapters(sources.plan, sources.docs, sources.stories, wanted);
  const pdf = await renderRoadBook({ chapters, people: roadBookCast(sources.plan, chapters) });
  await writeFile(out, pdf);
  console.log(`${out}: chapters ${chapters.map((c) => c.number).join(', ')}, ${Math.round(pdf.length / 1024)} KB`);
}

void main();
