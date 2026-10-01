/**
 * Rendering the public dictionary pages: the pure half of the build script.
 *
 * Split out so it can be tested without fetching 65 MB and writing 3,000
 * files. Everything here is a string in and a string out — no network, no
 * filesystem, no clock — which is what makes the escaping testable, and the
 * escaping is the part that has to be right.
 */
import { dictionaryKey } from '@kurda/shared';
import { escapeHtml as escape } from './escape.js';

export const ORIGIN = 'https://hevalo.app';

/**
 * How many words a page holds before it is split by taking another letter.
 *
 * 150 is a page of about 35 KB — small enough to open on a phone over a slow
 * connection, large enough that the whole dictionary stays near 3,000 files
 * rather than tens of thousands, against a 20,000-file deployment limit.
 */
export const WORDS_PER_PAGE = 150;

export interface Word {
  /** as written, with its diacritics */
  headword: string;
  /** what it is grouped and sorted by: letters only, diacritics folded */
  key: string;
  senses: Array<{ pos: string; definition: string }>;
}

export interface Page {
  /** the address: /ferheng/<prefix>/ */
  prefix: string;
  words: Word[];
}

/**
 * The prefix tree, flattened into pages, then put back together again.
 *
 * Splitting alone is not enough, and the first version that only split made the
 * point: 391,757 words became **17,652 pages** against a 20,000-file deployment
 * limit, because splitting "a" because it is too big also splits every rare
 * two-letter prefix under it into a page holding four words. Tiny pages are the
 * expensive ones — they cost a file each and the limit counts files.
 *
 * So after a group splits, its children are walked in order and merged back
 * while they fit. A merged page is named for the range it covers — `aa-ac` —
 * which is still an address a person can read and a crawler can keep. That
 * takes the same corpus to roughly 2,600 pages, an order of magnitude under the
 * limit, with every page a useful size.
 *
 * A run that cannot be split further — every word in it sharing the whole key —
 * is kept whole and oversized, because splitting it would produce a page with
 * no address of its own.
 */
export function paginate(words: Word[], depth = 1): Page[] {
  const groups = new Map<string, Word[]>();
  for (const w of words) {
    const prefix = w.key.slice(0, depth) || w.key;
    const list = groups.get(prefix) ?? [];
    list.push(w);
    groups.set(prefix, list);
  }

  const parts: Page[] = [];
  for (const [prefix, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const splittable = list.some((w) => w.key.length > depth);
    if (list.length > WORDS_PER_PAGE && splittable) {
      parts.push(...paginate(list, depth + 1));
    } else {
      parts.push({ prefix, words: list });
    }
  }
  return coalesce(parts);
}

/**
 * What a word is filed under: its lookup key, with the stretches taken out.
 *
 * `dictionaryKey` keeps anything Unicode calls a letter, and the *modifier*
 * letters are letters — among them Arabic tatweel (U+0640), which is a
 * typographic elongation rather than a sound. It carries no meaning, so it must
 * not decide where a word is filed: a headword beginning with one was sorting
 * ahead of the whole Latin alphabet and opening the A–Z with a section called
 * `ـ`. Stripping it files the word under its first real letter instead.
 *
 * Returns an empty string for a headword that is nothing but stretches, which
 * the caller skips. Scripts other than Latin stay — Kurmancî has a Cyrillic
 * orthography and the Arabic-script entries are Soranî; those are real pages.
 */
export function pageKey(headword: string): string {
  return dictionaryKey(headword).replace(/\p{Lm}/gu, '');
}

/** Adjacent pages joined while they fit, named for the range they cover. */
function coalesce(parts: Page[]): Page[] {
  const merged: Page[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && last.words.length + part.words.length <= WORDS_PER_PAGE) {
      /*
       * Either side may already be a range, because coalescing happens at every
       * depth and a child can arrive merged. Widening has to take the low end
       * of one and the high end of the other — reading `-` as "to" rather than
       * as a separator — or a page ends up called `a-ab-abb`, which is three
       * bounds for a thing that has two.
       */
      const from = last.prefix.split('-')[0]!;
      const ends = part.prefix.split('-');
      const to = ends[ends.length - 1]!;
      last.prefix = from === to ? from : `${from}-${to}`;
      last.words = last.words.concat(part.words);
    } else {
      merged.push({ prefix: part.prefix, words: part.words });
    }
  }
  return merged;
}

/** The shell every page shares: no scripts, no fonts, nothing fetched. */
export function document_(opts: {
  title: string;
  description: string;
  canonical: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="ku">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(opts.title)}</title>
<meta name="description" content="${escape(opts.description)}">
<link rel="canonical" href="${escape(opts.canonical)}">
<link rel="icon" href="/favicon.png" type="image/png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hevalo">
<meta property="og:url" content="${escape(opts.canonical)}">
<meta property="og:title" content="${escape(opts.title)}">
<meta property="og:description" content="${escape(opts.description)}">
<link rel="stylesheet" href="/ferheng/ferheng.css">
</head>
<body>
<header class="top"><a class="home" href="/">Hevalo</a> <a href="/ferheng/">Ferheng</a></header>
<main>
${opts.body}
</main>
<footer>
<p>Peyv ji <a href="https://ku.wiktionary.org/" rel="noopener">Wîkîferheng</a>, bi lîsansa
<a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>.</p>
</footer>
</body>
</html>
`;
}

/** One page of words. */
export function wordsPage(page: { prefix: string; words: Word[] }, prev: string | null, next: string | null): string {
  const rows = page.words
    .map((w) => {
      const senses = w.senses
        .map((s) => `<dd><span class="pos">${escape(s.pos)}</span> ${escape(s.definition)}</dd>`)
        .join('\n');
      return `<dt id="${escape(w.key)}">${escape(w.headword)}</dt>\n${senses}`;
    })
    .join('\n');

  const nav = [
    prev ? `<a rel="prev" href="/ferheng/${escape(prev)}/">← ${escape(prev)}</a>` : '',
    `<a href="/ferheng/">A–Z</a>`,
    next ? `<a rel="next" href="/ferheng/${escape(next)}/">${escape(next)} →</a>` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const first = page.words[0]!.headword;
  const last = page.words[page.words.length - 1]!.headword;
  return document_({
    title: `Peyvên kurdî bi “${page.prefix}” — Ferhenga Hevalo`,
    description: `${page.words.length} peyvên kurdî ji ${first} heta ${last}, bi wateyên wan.`,
    canonical: `${ORIGIN}/ferheng/${page.prefix}/`,
    body: `<h1>Peyvên bi “${escape(page.prefix)}”</h1>
<p class="count">${page.words.length} peyv</p>
<dl>
${rows}
</dl>
<nav class="pager">${nav}</nav>`,
  });
}

/** The A–Z, which is the only page that links to all the others. */
export function indexPage(pages: Array<{ prefix: string; words: Word[] }>, total: number): string {
  const byLetter = new Map<string, string[]>();
  for (const p of pages) {
    const letter = p.prefix.slice(0, 1);
    const list = byLetter.get(letter) ?? [];
    list.push(p.prefix);
    byLetter.set(letter, list);
  }
  const sections = [...byLetter]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([letter, prefixes]) =>
        `<section><h2>${escape(letter.toUpperCase())}</h2><p class="prefixes">${prefixes
          .map((p) => `<a href="/ferheng/${escape(p)}/">${escape(p)}</a>`)
          .join(' ')}</p></section>`,
    )
    .join('\n');

  return document_({
    title: 'Ferhenga kurdî — Hevalo',
    description: `${total.toLocaleString('en')} peyvên kurdî bi wateyên wan, belaş û bê hesab.`,
    canonical: `${ORIGIN}/ferheng/`,
    body: `<h1>Ferhenga kurdî</h1>
<p class="count">${total.toLocaleString('en')} peyv</p>
${sections}`,
  });
}


/** Inlined as a file rather than a <style>, so the policy can forbid inline CSS too. */
export const STYLE = `:root { color-scheme: dark; --bg: #0b0d10; --ink: #fff; --dim: rgba(255,255,255,.62); --line: rgba(255,255,255,.14); --gold: #f0c24a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
main, .top, footer { max-width: 56rem; margin: 0 auto; padding: 0 16px; }
.top { display: flex; gap: 14px; align-items: center; padding-top: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
.top a { color: var(--ink); text-decoration: none; font-weight: 600; }
.top .home { color: var(--gold); }
h1 { font-size: clamp(1.5rem, 4vw, 2.1rem); margin: 28px 0 4px; }
h2 { font-size: 1.1rem; margin: 22px 0 6px; color: var(--gold); }
.count { color: var(--dim); margin: 0 0 18px; }
dl { margin: 0; }
dt { font-weight: 700; margin-top: 18px; scroll-margin-top: 20px; }
dd { margin: 2px 0 0; color: var(--dim); }
.pos { font-style: italic; opacity: .75; margin-right: 6px; }
.prefixes { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 0; }
.prefixes a, .pager a { color: var(--ink); text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; font-size: .9rem; }
.prefixes a:hover, .pager a:hover { border-color: var(--ink); }
.pager { display: flex; gap: 10px; justify-content: center; margin: 32px 0; }
footer { border-top: 1px solid var(--line); margin-top: 32px; padding-top: 16px; padding-bottom: 32px; color: var(--dim); font-size: .85rem; }
footer a { color: var(--dim); }
`;
