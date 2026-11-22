/**
 * Builds the public dictionary as static files (run by `npm run build` after vite: npx tsx scripts/build-ferheng.ts).
 *
 * Files, because static assets on the edge are free and unlimited while the API and the Worker are metered. The
 * definitions are strangers' Wiktionary text: escaped on the way in (`escape`) and served under a policy that refuses
 * inline script (web/public/_headers), two independent walls; the pages also work without JavaScript, as crawlers read
 * them.
 *
 * Words are grouped by folded prefix, splitting a group past `WORDS_PER_PAGE` by another letter, so a page is about
 * 35 KB and the set stays near 3,000 files against the 20,000-file deployment limit. The prefix is the URL:
 * /ferheng/ab/ holds every word whose folded form begins "ab".
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { publishedFerheng } from '@kurda/shared';
import { compareKeys } from './ferheng-alphabet.js';
import { CHROME_FILE, chromeScript } from './ferheng-chrome.js';
import { COPY, FERHENG_LOCALES } from './ferheng-copy.js';
import { toEntries } from './ferheng-entries.js';
import { SEARCH_DIR, SEARCH_FILE, fileName, searchScript, shard, shardFile } from './ferheng-search.js';
import {
  ORIGIN,
  STYLE,
  featured,
  indexPage,
  letterOf,
  letterPage,
  notFoundPage,
  pageKey,
  paginate,
  wordsPage,
  type Word,
} from './ferheng-pages.js';

/* Each language writes to its own folder under here; see ferheng-copy.ts. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Finds the font files wherever npm put them, hoisted or not. */

/** Which published set; Kurmancî is the one with the words. */
const LANG = 'ku';

/** An escape hatch for an urgent deploy when the source is unreachable. */
const SKIP = process.env.SKIP_FERHENG === '1';

async function main(): Promise<void> {
  if (SKIP) {
    console.log('ferheng: SKIP_FERHENG=1 — no dictionary pages in this build');
    return;
  }

  console.log('ferheng: reading the published corpus…');
  const manifest = await publishedFerheng.manifest(LANG);

  const seen = new Map<string, Word>();
  for (const [i, chunk] of manifest.files.entries()) {
    const rows = await publishedFerheng.chunk(LANG, chunk.file);
    for (const entry of toEntries(rows)) {
      const key = pageKey(entry.headword);
      if (!key) continue;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, { ...entry, key });
        continue;
      }
      /*
       * Two writings of one key (`Kurd` and `kurd`, `كا` and `کا`) share a page entry rather than both claiming the
       * anchor; senses are concatenated and regrouped at render, the rest is a set union.
       */
      existing.senses.push(...entry.senses);
      existing.synonyms = [...new Set([...existing.synonyms, ...entry.synonyms])];
      existing.sorani = [...new Set([...existing.sorani, ...entry.sorani])];
      existing.arabic = [...new Set([...existing.arabic, ...entry.arabic])];
    }
    if ((i + 1) % 20 === 0 || i + 1 === manifest.files.length) {
      console.log(`  ${i + 1}/${manifest.files.length} files, ${seen.size.toLocaleString('en')} words`);
    }
  }

  if (seen.size === 0) throw new Error('the corpus produced no words — refusing to publish an empty dictionary');

  const words = [...seen.values()].sort((a, b) => compareKeys(a.key, b.key));
  const pages = paginate(words);
  console.log(`ferheng: ${words.length.toLocaleString('en')} words across ${pages.length} pages`);

  /* Where every word lives, built once for the whole dictionary, so a synonym on another page can be a link. */
  const pageOf = new Map<string, string>();
  for (const page of pages) for (const w of page.words) pageOf.set(w.key, page.prefix);

  // One page per letter, between the A–Z and the words.
  const byLetter = new Map<string, typeof pages>();
  for (const page of pages) {
    const letter = letterOf(page.prefix);
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), page]);
  }
  const letters = [...byLetter]
    .sort(([a], [b]) => compareKeys(a, b))
    .map(([letter, ps]) => ({ letter, words: ps.reduce((n, q) => n + q.words.length, 0) }));
  const samples = featured(words, 8);

  /*
   * Published once per language (ferheng-copy.ts says why two). The words are Kurdish in both; the bar, footer and labels
   * differ. Everything above this loop is worked out once and shared.
   */
  let bytes = 0;
  let files = 0;
  for (const locale of FERHENG_LOCALES) {
    const copy = COPY[locale];
    const out = path.join(ROOT, 'dist', copy.base);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });

    const write = (rel: string, html: string): void => {
      const file = path.join(out, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, html);
      bytes += Buffer.byteLength(html);
      files += 1;
    };

    for (const [i, page] of pages.entries()) {
      write(
        path.join(page.prefix, 'index.html'),
        wordsPage(page, pages[i - 1]?.prefix ?? null, pages[i + 1]?.prefix ?? null, pageOf, copy, words.length),
      );
    }
    for (const { letter } of letters) {
      write(path.join(letter, 'index.html'), letterPage(letter, byLetter.get(letter)!, words.length, copy));
    }
    write('index.html', indexPage(letters, words.length, pages.length, samples, pageOf, copy));
    write('ferheng.css', STYLE);
    // The bar and footer in the reader's language; see ferheng-chrome.ts.
    write(CHROME_FILE, chromeScript());
    // What the Worker serves for an address with no page; see notFoundPage() for why the app's 404 cannot.
    write('404.html', notFoundPage(copy));

    // Its own sitemap, announced from robots.txt alongside the app’s.
    const urls = ['', ...letters.map((l) => `${l.letter}/`), ...pages.map((q) => `${q.prefix}/`)]
      .map((u) => `<url><loc>${ORIGIN}/${copy.base}/${u}</loc></url>`)
      .join('');
    write(
      'sitemap.xml',
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>
`,
    );
    console.log(`  /${copy.base}/ — ${pages.length} word pages, ${letters.length} letters`);
  }

  /* The search files, once for both languages, since a word's page has the same name in each; written after the loop, which clears each folder first. */
  const shards = shard(pages);
  const dir = path.join(ROOT, 'dist', SEARCH_DIR);
  fs.mkdirSync(dir, { recursive: true });
  for (const [id, rows] of shards) {
    const body = shardFile(id, rows);
    fs.writeFileSync(path.join(dir, fileName(id)), body);
    bytes += Buffer.byteLength(body);
    files += 1;
  }
  const script = searchScript([...shards.keys()]);
  fs.writeFileSync(path.join(ROOT, 'dist', 'ferheng', SEARCH_FILE), script);
  bytes += Buffer.byteLength(script);
  files += 1;
  console.log(`  search: ${shards.size} files, largest ${Math.max(...[...shards.values()].map((r) => r.length))} words`);

  console.log(
    `ferheng: ${FERHENG_LOCALES.length} languages, ` +
      `${files} files, ${(bytes / 1024 / 1024).toFixed(0)} MB  (free limit is 20,000 files)`,
  );
  /*
   * Files are the limit that binds. Stopping well short leaves room for the app's assets and growth, and failing here
   * beats a deploy refused halfway; it is also why a third language (about 3,360 more files) does not fit.
   */
  if (files > 18_000) {
    throw new Error(`${files} files is too close to the 20,000 limit — raise WORDS_PER_PAGE`);
  }
}

main().catch((err) => {
  console.error('ferheng:', err instanceof Error ? err.message : err);
  process.exit(1);
});
