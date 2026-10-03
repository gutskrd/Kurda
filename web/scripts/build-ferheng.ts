/**
 * The dictionary, as pages anyone can read without an account.
 *
 *   npx tsx scripts/build-ferheng.ts        (run by `npm run build`, after vite)
 *
 * ── why these are files and not an API ───────────────────────────────────
 *
 * Every other way of serving this is metered. A request that reaches Render is
 * billed per gigabyte; a request that invokes the Worker is billed per million.
 * Cloudflare's own documentation is unambiguous about the one path that is
 * neither: "Requests to static assets are free and unlimited. There is no
 * additional cost for storing Assets."
 *
 * So the dictionary is written out as ordinary files at build time. A reader —
 * or a crawler, or a million bots — gets a file off Cloudflare's edge. Render
 * never hears about it, the Worker is never invoked, and nothing counts. That
 * is the whole design, and everything below follows from it.
 *
 * ── why there is no JavaScript on these pages ────────────────────────────
 *
 * The definitions are Wiktionary text: written by strangers, and the one thing
 * on these pages that an attacker controls. It is escaped on the way in (see
 * `escape`), and then the page is served under a policy that forbids scripts
 * outright (`script-src 'none'`, in web/public/_headers). Two independent
 * failures would have to line up for anything to execute, and the second one
 * does not depend on this file being right.
 *
 * It also means the pages work with JavaScript off, which is how a crawler
 * reads them.
 *
 * ── how they are split ───────────────────────────────────────────────────
 *
 * 447,139 words will not fit in one page, and Cloudflare caps a deployment at
 * 20,000 files on the free plan (100,000 on paid). Both ends matter, so the
 * words are grouped by their folded prefix and a group that grows past
 * `WORDS_PER_PAGE` is split by taking one more letter — "a" becomes "ab", "ac",
 * and "ser" keeps going until each page is a sensible size. Measured on the real
 * corpus: about 94 bytes of text per word, so a page of 150 is roughly 35 KB of
 * HTML and the whole set lands near 3,000 files.
 *
 * The prefix is in the URL, so the address of a page is predictable and stable:
 * /ferheng/ab/ holds every word whose folded form begins "ab".
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { publishedFerheng } from '@kurda/shared';
import { compareKeys } from './ferheng-alphabet.js';
import { COPY, FERHENG_LOCALES } from './ferheng-copy.js';
import { toEntries } from './ferheng-entries.js';
import {
  FONTS,
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

/* each language writes to its own folder under here — see ferheng-copy.ts */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Finding the font files where npm actually put them, hoisted or not. */
const require_ = createRequire(import.meta.url);

/** Which published set. Kurmancî is the one with 447,000 words in it. */
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
       * Two writings of one key share a page entry rather than each claiming
       * the same anchor: `Kurd` and `kurd`, or `كا` and `کا`, which are the
       * same letters typed two ways.
       *
       * It used to catch far more than that, because the key folded the
       * diacritics and `zabit` and `zabît` collided. They are separate words
       * and have separate entries now — see `pageKey`. Senses are concatenated
       * and regrouped when the page is rendered; the rest is a set union.
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

  /*
   * Where every word lives, so a synonym can become a link. A page cannot
   * work this out alone — the word it points at is almost always on a
   * different page — so it is built once, for the whole dictionary, first.
   */
  const pageOf = new Map<string, string>();
  for (const page of pages) for (const w of page.words) pageOf.set(w.key, page.prefix);

  // one page per letter, between the A–Z and the words
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
   * Published once per language.
   *
   * The words are Kurdish in both; what differs is the bar, the footer and the
   * labels, which belong to whoever is reading rather than to the dictionary.
   * See ferheng-copy.ts for why there are two languages and not nine, and why
   * they are sibling paths rather than one nested under the other.
   *
   * Everything above this loop — the corpus, the pagination, which word sits
   * on which page — is worked out once and shared, so a second language costs
   * the writing and not the thinking.
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
        wordsPage(page, pages[i - 1]?.prefix ?? null, pages[i + 1]?.prefix ?? null, pageOf, copy),
      );
    }
    for (const { letter } of letters) {
      write(path.join(letter, 'index.html'), letterPage(letter, byLetter.get(letter)!, words.length, copy));
    }
    write('index.html', indexPage(letters, words.length, pages.length, samples, pageOf, copy));
    write('ferheng.css', STYLE);
    // what the Worker serves for an address with no page behind it; see
    // notFoundPage() for why the app's own 404 screen cannot do this job
    write('404.html', notFoundPage(copy));

    /*
     * The typefaces, out of node_modules and onto the edge.
     *
     * Copied rather than linked because these pages are served under
     * `default-src 'none'` and a font from anywhere else would need a hole in
     * it. Its `unicode-range` means a page of Kurmancî never fetches it.
     */
    const fonts = path.join(out, 'fonts');
    fs.mkdirSync(fonts, { recursive: true });
    for (const font of FONTS) {
      const from = require_.resolve(font.from);
      fs.copyFileSync(from, path.join(fonts, font.as));
      bytes += fs.statSync(from).size;
      files += 1;
    }

    // its own sitemap, announced from robots.txt alongside the app’s
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

  console.log(
    `ferheng: ${FERHENG_LOCALES.length} languages, ` +
      `${files} files, ${(bytes / 1024 / 1024).toFixed(0)} MB  (free limit is 20,000 files)`,
  );
  /*
   * The limit that actually binds is files, not bytes. Stopping well short
   * of it leaves room for the app’s own assets and for the dictionary to
   * grow, and a build that fails here is a far better outcome than a deploy
   * Cloudflare refuses halfway through.
   *
   * It is also what decides how many languages this can be published in: a
   * third would be another ~3,360 files.
   */
  if (files > 18_000) {
    throw new Error(`${files} files is too close to the 20,000 limit — raise WORDS_PER_PAGE`);
  }
}

main().catch((err) => {
  console.error('ferheng:', err instanceof Error ? err.message : err);
  process.exit(1);
});
