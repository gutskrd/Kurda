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
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { publishedFerheng, toLexicon, type ConvertedEntry } from '@kurda/shared';
import { ORIGIN, STYLE, indexPage, pageKey, paginate, wordsPage, type Word } from './ferheng-pages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'ferheng');

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
    for (const entry of toLexicon(rows) as ConvertedEntry[]) {
      const key = pageKey(entry.headword);
      if (!key) continue;
      const existing = seen.get(key);
      if (existing) {
        // two spellings of one folded key — zabit and zabît — share a page
        // entry rather than each claiming the same anchor
        existing.senses.push(...entry.senses.map((s) => ({ pos: s.pos, definition: s.definitionKu })));
        continue;
      }
      seen.set(key, {
        headword: entry.headword,
        key,
        senses: entry.senses.map((s) => ({ pos: s.pos, definition: s.definitionKu })),
      });
    }
    if ((i + 1) % 20 === 0 || i + 1 === manifest.files.length) {
      console.log(`  ${i + 1}/${manifest.files.length} files, ${seen.size.toLocaleString('en')} words`);
    }
  }

  if (seen.size === 0) throw new Error('the corpus produced no words — refusing to publish an empty dictionary');

  const words = [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
  const pages = paginate(words);
  console.log(`ferheng: ${words.length.toLocaleString('en')} words across ${pages.length} pages`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  let bytes = 0;
  for (const [i, page] of pages.entries()) {
    const dir = path.join(OUT, page.prefix);
    fs.mkdirSync(dir, { recursive: true });
    const html = wordsPage(page, pages[i - 1]?.prefix ?? null, pages[i + 1]?.prefix ?? null);
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    bytes += Buffer.byteLength(html);
  }
  fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(pages, words.length));
  fs.writeFileSync(path.join(OUT, 'ferheng.css'), STYLE);

  // its own sitemap, listed from the worker's sitemap index
  const urls = ['', ...pages.map((p) => `${p.prefix}/`)]
    .map((p) => `<url><loc>${ORIGIN}/ferheng/${p}</loc></url>`)
    .join('');
  fs.writeFileSync(
    path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`,
  );

  console.log(
    `ferheng: wrote ${pages.length + 3} files, ${(bytes / 1024 / 1024).toFixed(0)} MB` +
      `  (Cloudflare's free limit is 20,000 files)`,
  );
  if (pages.length > 19_000) {
    throw new Error(`${pages.length} pages is too close to the 20,000-file limit — raise WORDS_PER_PAGE`);
  }
}

main().catch((err) => {
  console.error('ferheng:', err instanceof Error ? err.message : err);
  process.exit(1);
});
