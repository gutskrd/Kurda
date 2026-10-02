/**
 * Rendering the public dictionary pages: the pure half of the build script.
 *
 * Split out so it can be tested without fetching 65 MB and writing 3,000
 * files. Everything here is a string in and a string out — no network, no
 * filesystem, no clock — which is what makes the escaping testable, and the
 * escaping is the part that has to be right.
 *
 * ── the house style ──────────────────────────────────────────────────────
 *
 * Hevalo is a Zagrosian product, and these pages are set the way zagrosian.com
 * is set, because a reader who follows a search result here and then follows
 * the footer there should not feel handed between two companies. Read off the
 * live site rather than guessed at: #0a0a0a under #f2f2f2, Inter for running
 * text, a monospace at 13px for labels and counts, a Palatino-class serif for
 * Kurdish, 0.8px hairlines, pills at 999px, and whitespace between sections
 * measured in whole screens rather than in pixels.
 *
 * Two things are deliberately not borrowed. There is no gold here — the app
 * uses it for Zêr and XP, which mean nothing in a dictionary. And the display
 * sizes are a step down from the marketing site's, because these pages are for
 * reading rather than for arriving at.
 *
 * ── why it is not a wall of letter buttons ───────────────────────────────
 *
 * The first version of the A–Z was 53 bordered boxes with a letter in each,
 * and the letter pages were more of the same with ranges in them. That is a
 * table of contents pretending to be a page: nothing on it to read, and no
 * reason to be on it except to leave. So the front page now opens with actual
 * entries, the index is set as a printed dictionary's thumb index rather than
 * as a grid of controls, and a letter's ranges are named by the words they
 * start and end at instead of by the folded prefix the build happens to use.
 */
import { dictionaryKey } from '@kurda/shared';
import { escapeHtml as escape } from './escape.js';
import { isInflected, type Entry } from './ferheng-entries.js';

export const ORIGIN = 'https://hevalo.app';

/**
 * How many words a page holds before it is split by taking another letter.
 *
 * 150 is a page of about 35 KB — small enough to open on a phone over a slow
 * connection, large enough that the whole dictionary stays near 3,000 files
 * rather than tens of thousands, against a 20,000-file deployment limit.
 */
export const WORDS_PER_PAGE = 150;

/**
 * The typefaces, copied out of node_modules at build time and served from
 * /ferheng/fonts/.
 *
 * Self-hosted rather than fetched from a font CDN for three reasons, in order
 * of how much they matter: these pages are served under `default-src 'none'`,
 * and a third-party font would need a hole in it; a file on Cloudflare's edge
 * is unmetered, where a third party's is a request a reader makes to a company
 * that did not ask them; and it is what zagrosian.com does.
 *
 * Four subsets, each with its `unicode-range`, so a page of Kurmancî fetches
 * the two Latin files and a page of Soranî fetches the Arabic one. Nothing
 * downloads a script it does not set.
 */
export const FONTS = [
  { from: '@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2', as: 'inter-latin.woff2' },
  { from: '@fontsource-variable/inter/files/inter-latin-ext-opsz-normal.woff2', as: 'inter-latin-ext.woff2' },
  { from: '@fontsource-variable/inter/files/inter-cyrillic-opsz-normal.woff2', as: 'inter-cyrillic.woff2' },
  { from: '@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2', as: 'vazirmatn-arabic.woff2' },
] as const;

/**
 * An entry, plus where this build decided to file it.
 *
 * `Entry` is what the corpus said. `key` is the folded form the word sorts
 * under and the anchor it is addressed by, which is a decision made here and
 * nowhere in the source.
 */
export interface Word extends Entry {
  /** what it is grouped and sorted by: letters only, diacritics folded */
  key: string;
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

/** What a page of words spans, in words rather than in folded prefixes. */
function span(page: Page): string {
  const first = page.words[0]!.headword;
  const last = page.words[page.words.length - 1]!.headword;
  return first === last ? first : `${first} – ${last}`;
}

/**
 * Whether a string is written in the Arabic script, tested per value.
 *
 * Needed because the fields do not say. `sorani_equivalents` holds "ساڵ" for
 * `sal` and "rojjmêrî zayînî" for `salnameya zayînî` — the same field, two
 * scripts — and marking a Latin string rtl reverses the punctuation around it.
 */
function isArabic(s: string): boolean {
  return /\p{Script=Arabic}/u.test(s);
}

/** `dir` and `lang`, for a value whose script is not known until it is read. */
function scriptAttrs(value: string, lang: string): string {
  return ` lang="${lang}"${isArabic(value) ? ' dir="rtl"' : ''}`;
}

/**
 * A trail, as microdata a search engine reads and as a line a reader clicks.
 *
 * `BreadcrumbList` is what turns a bare URL in a search result into
 * "hevalo.app › Ferheng › S". It is attributes rather than a JSON-LD script,
 * for the same reason everything else here is: these pages are served under a
 * policy that forbids scripts, and markup that needs an exception is markup
 * that will eventually get one.
 */
function breadcrumb(trail: Array<{ name: string; url: string }>, here: string): string {
  const items = [...trail, { name: here, url: '' }]
    .map((step, i) => {
      const inner = step.url
        ? `<a itemprop="item" href="${escape(step.url)}"><span itemprop="name">${escape(step.name)}</span></a>`
        : `<span itemprop="name">${escape(step.name)}</span>`;
      return (
        `<li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">` +
        `${inner}<meta itemprop="position" content="${i + 1}"></li>`
      );
    })
    .join('');
  return `<nav class="crumbs"><ol itemscope itemtype="https://schema.org/BreadcrumbList">${items}</ol></nav>`;
}

/** The shell every page shares: no scripts, nothing fetched off this origin. */
export function document_(opts: {
  title: string;
  description: string;
  canonical: string;
  body: string;
  /** the steps above this page; the page itself is added as the last one */
  breadcrumb?: Array<{ name: string; url: string }>;
  /** what the trail calls this page, when it is not the title */
  here?: string;
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
<header class="top">
<a class="wordmark" href="/">Hevalo</a>
<nav class="topnav">
<a href="/ferheng/">Ferheng</a>
<a href="/app/civak">Civak</a>
<a href="/app/games">Lîstik</a>
<a class="pill" href="/register">Hesab veke</a>
</nav>
</header>
<main>
${opts.breadcrumb ? breadcrumb(opts.breadcrumb, opts.here ?? opts.title.split(' · ')[0]!) : ''}
${opts.body}
</main>
<footer>
<p class="mono">Hevalo — berhemeke <a href="https://zagrosian.com" rel="noopener">Zagrosian</a></p>
<p>Peyv ji <a href="https://ku.wiktionary.org/" rel="noopener">Wîkîferheng</a>, bi lîsansa
<a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>.</p>
</footer>
</body>
</html>
`;
}

/**
 * One sense, as a dictionary prints one: numbered within its part of speech.
 *
 * Grouping first and numbering second is what makes an entry read like an
 * entry. A word that is a noun twice and a verb once has two numbered noun
 * senses and one verb sense, not three undifferentiated lines.
 *
 * The labels are the source's own and therefore Kurdish — "Navdêr", "Lêker",
 * "Formeke navdêrê" — which is both what a reader of a Kurdish dictionary
 * expects and finer than the importer's thirteen-value enum. Half the corpus
 * is inflected forms, and only this label says so, so the ones that are get a
 * class and are set back from the words that stand on their own.
 *
 * Regrouping here rather than trusting the converter's order is deliberate: a
 * page entry can be two spellings of one folded key merged together, and their
 * senses arrive concatenated rather than interleaved.
 */
function senseList(senses: Word['senses']): string {
  const byPos = new Map<string, string[]>();
  for (const s of senses) {
    const list = byPos.get(s.pos) ?? [];
    if (!list.includes(s.definition)) list.push(s.definition);
    byPos.set(s.pos, list);
  }
  return [...byPos]
    .map(([pos, definitions]) => {
      const items = definitions.map((d) => `<li itemprop="description" dir="auto">${escape(d)}</li>`).join('');
      const kind = isInflected(pos) ? 'row sense form' : 'row sense';
      return `<div class="${kind}"><span class="label">${escape(pos)}</span><ol>${items}</ol></div>`;
    })
    .join('');
}

/**
 * The same word in the other Kurdish, and in Arabic.
 *
 * This is the row a Kurdish dictionary is asked for most and the one no
 * single-dialect dictionary prints: Kurmancî and Soranî are written in
 * different scripts by readers who often cannot read the other, and the corpus
 * states the pairing outright rather than leaving it to be inferred.
 *
 * `alternateName` is claimed only for Soranî. It is the same word in the same
 * language, which is what the property means; the Arabic is a translation, and
 * saying otherwise in markup a search engine reads would be a small lie that
 * costs nothing to avoid.
 */
function equivalents(word: Word): string {
  const row = (label: string, values: string[], lang: string, prop: string | null): string => {
    if (values.length === 0) return '';
    const items = values
      .map((v) => `<span${scriptAttrs(v, lang)}${prop ? ` itemprop="${prop}"` : ''}>${escape(v)}</span>`)
      .join('<span class="sep">·</span>');
    return `<p class="row"><span class="label">${escape(label)}</span><span class="vals">${items}</span></p>`;
  };
  return row('Soranî', word.sorani, 'ckb', 'alternateName') + row('Erebî', word.arabic, 'ar', null);
}

/**
 * The words this one points at, as links.
 *
 * These come from the source's own `synonyms` field rather than from reading
 * the prose, so a link is a fact the corpus stated and not a guess at what a
 * definition meant. A synonym whose page does not exist is printed without a
 * link: the word is still worth showing, and a link to nothing is worse than
 * no link.
 */
function synonymList(words: string[], pageOf: Map<string, string>): string {
  if (words.length === 0) return '';
  const links = words
    .map((w) => {
      const key = pageKey(w);
      const page = pageOf.get(key);
      const attrs = isArabic(w) ? ' dir="rtl"' : '';
      return page
        ? `<a href="/ferheng/${escape(page)}/#${escape(key)}"${attrs}>${escape(w)}</a>`
        : `<span${attrs}>${escape(w)}</span>`;
    })
    .join('<span class="sep">·</span>');
  return `<p class="row"><span class="label">Hevmane</span><span class="vals">${links}</span></p>`;
}

/** One entry, headword and all. */
function entry(w: Word, pageOf: Map<string, string>): string {
  return (
    `<article class="entry" id="${escape(w.key)}" itemscope itemtype="https://schema.org/DefinedTerm">` +
    // the headword links to its own anchor, so a reader who wants to send
    // somebody one word has an address for exactly that word
    `<h2 class="hw" itemprop="name" dir="auto"><a href="#${escape(w.key)}">${escape(w.headword)}</a></h2>` +
    `<div class="body">${senseList(w.senses)}${equivalents(w)}${synonymList(w.synonyms, pageOf)}</div>` +
    `</article>`
  );
}

/**
 * One page of words.
 *
 * `pageOf` maps a word's key to the page holding it, which is what lets a
 * synonym become a link. It is built once for the whole dictionary and passed
 * in; a page cannot know on its own where another word lives.
 *
 * The microdata — `DefinedTermSet` and `DefinedTerm` — is schema.org as plain
 * attributes rather than as a JSON-LD `<script>`, which keeps these pages
 * exactly as script-free as the policy serving them claims. Search engines read
 * both; only one of them survives `script-src 'none'` without an argument.
 */
export function wordsPage(
  page: Page,
  prev: string | null,
  next: string | null,
  pageOf: Map<string, string> = new Map(),
): string {
  const entries = page.words.map((w) => entry(w, pageOf)).join('\n');
  const letter = letterOf(page.prefix);

  const nav = [
    prev ? `<a class="pill" rel="prev" href="/ferheng/${escape(prev)}/">←</a>` : '',
    `<a class="pill" href="/ferheng/${escape(letter)}/">Hemû ${escape(letter.toUpperCase())}</a>`,
    next ? `<a class="pill" rel="next" href="/ferheng/${escape(next)}/">→</a>` : '',
  ]
    .filter(Boolean)
    .join('');

  const here = span(page);
  const first = page.words[0]!.headword;
  const last = page.words[page.words.length - 1]!.headword;
  return document_({
    title: `${here} · Ferhenga kurdî`,
    description: `${page.words.length} peyvên kurdî ji ${first} heta ${last}, bi wateyên wan — belaş û bê hesab.`,
    canonical: `${ORIGIN}/ferheng/${page.prefix}/`,
    breadcrumb: [
      { name: 'Ferheng', url: `${ORIGIN}/ferheng/` },
      { name: letter.toUpperCase(), url: `${ORIGIN}/ferheng/${letter}/` },
    ],
    here,
    body: `<header class="head">
<p class="eyebrow">${escape(letter.toUpperCase())}</p>
<h1 class="running" dir="auto">${escape(here)}</h1>
<p class="eyebrow">${page.words.length} peyv</p>
</header>
<div class="entries" itemscope itemtype="https://schema.org/DefinedTermSet">
<meta itemprop="name" content="Ferhenga kurdî">
<meta itemprop="inLanguage" content="ku">
${entries}
</div>
<nav class="pager">${nav}</nav>`,
  });
}

/** Which letter a page files under: the first character of its first bound. */
export function letterOf(prefix: string): string {
  return prefix.split('-')[0]!.slice(0, 1);
}

/**
 * One letter's pages, named by the words in them.
 *
 * A row used to read `sa-sc · 150`, which is the build's own filing system
 * showing through: `sa-sc` is where the pagination happened to cut, and it
 * tells a reader looking for a word nothing about whether the word is in
 * there. Printed dictionaries solved this centuries ago with the running head,
 * so a row names the first and last word on the page it leads to.
 */
export function letterPage(letter: string, pages: Page[], total: number): string {
  const rows = pages
    .map(
      (p) =>
        `<a class="range" href="/ferheng/${escape(p.prefix)}/">` +
        `<span class="range-span" dir="auto">${escape(span(p))}</span>` +
        `<span class="range-n">${p.words.length}</span></a>`,
    )
    .join('');
  const words = pages.reduce((n, p) => n + p.words.length, 0);
  return document_({
    title: `Peyvên kurdî bi tîpa ${letter.toUpperCase()} · Ferhenga kurdî`,
    description: `${words.toLocaleString('en')} peyvên kurdî ku bi ${letter.toUpperCase()} dest pê dikin, bi wateyên wan.`,
    canonical: `${ORIGIN}/ferheng/${letter}/`,
    breadcrumb: [{ name: 'Ferheng', url: `${ORIGIN}/ferheng/` }],
    here: letter.toUpperCase(),
    body: `<header class="head">
<p class="eyebrow">Tîp</p>
<h1 class="letter" dir="auto">${escape(letter.toUpperCase())}</h1>
<p class="eyebrow">${words.toLocaleString('en')} peyv ji ${total.toLocaleString('en')}</p>
</header>
<div class="ranges">${rows}</div>`,
  });
}

/**
 * Words worth opening the dictionary with.
 *
 * A front page whose whole content is a list of letters gives a reader nothing
 * to read and a crawler nothing to index. These are real entries, chosen for
 * being the kind that shows what the dictionary holds: a word in its own right
 * rather than an inflection, a definition that is a sentence rather than a list
 * of six near-synonyms, and at least one of a Soranî form, an Arabic form or a
 * cross-reference, so that the shape of a full entry is visible from the front.
 *
 * Taken one per letter, in order, so the selection is a spread across the
 * alphabet and is the same on every build — a front page that reshuffles
 * whenever the corpus is re-imported is a front page nobody can cite.
 */
export function featured(words: Word[], count: number): Word[] {
  /** 0 disqualifies; above that, how much of a full entry the word shows. */
  const score = (w: Word): number => {
    // a single character is a letter of the alphabet, not a word — the first
    // run of this picked a, b, c, d and e, because they sort first and the
    // corpus does gloss them
    if ([...w.headword].length < 2) return 0;
    const main = w.senses.find((s) => !isInflected(s.pos));
    if (!main) return 0;
    if (main.definition.length < 30 || main.definition.length > 140) return 0;
    if (w.sorani.length + w.arabic.length + w.synonyms.length === 0) return 0;
    return (
      (w.sorani.length > 0 ? 4 : 0) +
      (w.arabic.length > 0 ? 3 : 0) +
      Math.min(w.synonyms.length, 3) +
      (w.senses.some((s) => s.pos === 'Navdêr') ? 1 : 0)
    );
  };

  const best = new Map<string, { word: Word; score: number }>();
  for (const word of words) {
    const n = score(word);
    if (n === 0) continue;
    const letter = word.key.slice(0, 1);
    const at = best.get(letter);
    // ties go to the earlier word, so the choice does not depend on iteration
    if (!at || n > at.score) best.set(letter, { word, score: n });
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.word.key.localeCompare(b.word.key))
    .slice(0, count)
    .map((x) => x.word)
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * The front page: what this is, a few words of it, and the way in.
 *
 * The thumb index at the bottom is the A–Z, set as a printed dictionary sets
 * one — letters at reading size with their counts under them, no boxes and no
 * borders. It was 53 bordered buttons, which made the most-used page on the
 * site look like a control panel.
 */
export function indexPage(
  letters: Array<{ letter: string; words: number }>,
  total: number,
  pages: number,
  samples: Word[],
  pageOf: Map<string, string>,
): string {
  const index = letters
    .map(
      (l) =>
        `<a class="thumb" href="/ferheng/${escape(l.letter)}/">` +
        `<span class="thumb-t" dir="auto">${escape(l.letter.toUpperCase())}</span>` +
        `<span class="thumb-n">${l.words.toLocaleString('en')}</span></a>`,
    )
    .join('');

  return document_({
    title: 'Ferhenga kurdî — Hevalo',
    description: `${total.toLocaleString('en')} peyvên kurdî bi wateyên wan. Belaş, bê hesab û bê reklam.`,
    canonical: `${ORIGIN}/ferheng/`,
    body: `<section class="hero">
<p class="eyebrow">Ferhenga kurdî</p>
<h1 class="display">Hemû peyvên<br>kurmancî, li vir.</h1>
<p class="lead">Wate, formên soranî û erebî, û hevmaneyên her peyvê — vekirî ji her kesî re.
Ne hesab, ne reklam, ne tomarkirin.</p>
<p class="stats mono">${total.toLocaleString('en')} peyv<span class="sep">·</span>${pages.toLocaleString(
      'en',
    )} rûpel<span class="sep">·</span>belaş</p>
</section>

<section class="section">
<p class="eyebrow">Peyvên hilbijartî</p>
<div class="entries">${samples.map((w) => entry(w, pageOf)).join('\n')}</div>
</section>

<section class="section">
<p class="eyebrow">Tîp</p>
<div class="thumbs">${index}</div>
</section>

<section class="section">
<p class="eyebrow">Derbarê</p>
<p class="prose">Ev ferheng ji Wîkîferhenga kurdî tê, û her peyv li vir wekî rûpeleke
statîk tê weşandin — ji ber vê yekê ew her û her belaş e, çiqas kes jî wê bixwîne.</p>
</section>`,
  });
}

/**
 * The stylesheet, which is the whole design: there is no script to lean on.
 *
 * The custom properties are zagrosian.com's, read off the running site rather
 * than matched by eye — the neutrals, the type scale, the easing curves and
 * the gutter formula are the same values. What differs is noted where it
 * differs.
 */
export const STYLE = `@font-face { font-family: 'Inter'; font-style: normal; font-display: swap; font-weight: 100 900; src: url(/ferheng/fonts/inter-latin.woff2) format('woff2-variations'); unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
@font-face { font-family: 'Inter'; font-style: normal; font-display: swap; font-weight: 100 900; src: url(/ferheng/fonts/inter-latin-ext.woff2) format('woff2-variations'); unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
@font-face { font-family: 'Inter'; font-style: normal; font-display: swap; font-weight: 100 900; src: url(/ferheng/fonts/inter-cyrillic.woff2) format('woff2-variations'); unicode-range: U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116; }
@font-face { font-family: 'Vazirmatn'; font-style: normal; font-display: swap; font-weight: 100 900; src: url(/ferheng/fonts/vazirmatn-arabic.woff2) format('woff2-variations'); unicode-range: U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E; }

:root {
  color-scheme: dark;
  --ink: #f2f2f2;
  --dim: #bdbdbd;
  --muted: #8f8f8f;
  --line: #242424;
  --line-soft: #1a1a1a;
  /* lighter than a rule, because this one sits between words and has to be
     seen: at --line it was invisible and the synonyms read as one phrase */
  --sep: #4a4a4a;
  --paper: #0a0a0a;
  --surface: #121212;

  --font-sans: 'Inter', 'Vazirmatn', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  /* the same serif zagrosian.com sets Kurdish in, and the app's --font-display */
  --font-kurdish: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif;

  --text-xs: .8125rem;
  --text-sm: .9375rem;
  --text-base: 1.0625rem;
  --gutter: clamp(1.25rem, .75rem + 2.5vw, 3rem);
  --measure: 60rem;
  --ease-out: cubic-bezier(.22, 1, .36, 1);
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  /* the backstop: clip, never hidden — hidden on body makes every in-page
     anchor jump land in a scroll container instead of on the entry, and these
     pages are nothing but anchors */
  overflow-x: clip;
}
a { color: inherit; }

/* ── the bar ──────────────────────────────────────────────────────────── */
.top {
  display: flex; align-items: center; gap: 24px;
  max-width: var(--measure); margin: 0 auto; padding: 20px var(--gutter);
  border-bottom: .8px solid var(--line);
}
.wordmark { font-weight: 600; letter-spacing: -.02em; text-decoration: none; }
.topnav { margin-left: auto; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.topnav a { font-size: var(--text-sm); color: var(--dim); text-decoration: none; padding: 7px 12px; border-radius: 999px; transition: color .2s var(--ease-out), background-color .2s var(--ease-out); }
.topnav a:hover { color: var(--ink); background: #ffffff0d; }
.pill { border: .8px solid var(--line); }
.topnav .pill { color: var(--ink); }
.topnav .pill:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }

main { max-width: var(--measure); margin: 0 auto; padding: 0 var(--gutter); }

/* ── the small print that labels everything ───────────────────────────── */
.eyebrow, .mono, .label, .thumb-n, .range-n, .stats {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--muted);
}
.sep { color: var(--sep); }
.stats .sep { margin: 0 .55em; }

/* ── the front page ───────────────────────────────────────────────────── */
.hero { padding: clamp(3rem, 1.5rem + 6vw, 7rem) 0 0; }
.hero .eyebrow { margin: 0 0 20px; }
.display {
  font-size: clamp(2.5rem, 1.2rem + 4.6vw, 5rem);
  line-height: .98; letter-spacing: -.045em; font-weight: 500;
  margin: 0 0 24px;
}
.lead { max-width: 34rem; font-size: clamp(1.0625rem, 1rem + .35vw, 1.3rem); color: var(--dim); margin: 0 0 28px; }
.stats { text-transform: none; letter-spacing: .02em; margin: 0; }

.section { padding: clamp(3.5rem, 2rem + 6vw, 7rem) 0 0; }
.section > .eyebrow { margin: 0 0 28px; padding-bottom: 14px; border-bottom: .8px solid var(--line); }
.prose { max-width: 34rem; color: var(--dim); margin: 0; }

/* the thumb index: type, not controls */
.thumbs { display: flex; flex-wrap: wrap; gap: 4px 2px; }
.thumbs .thumb {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  min-width: 3.4rem; padding: 10px 8px; border-radius: 12px;
  text-decoration: none; transition: background-color .2s var(--ease-out);
}
.thumb:hover { background: #ffffff0d; }
.thumb-t { font-family: var(--font-kurdish); font-size: 1.6rem; line-height: 1; color: var(--ink); }
.thumb-n { font-size: .6875rem; letter-spacing: .04em; }

/* ── a letter's ranges ────────────────────────────────────────────────── */
.ranges { display: flex; flex-direction: column; }
.range {
  display: flex; align-items: baseline; gap: 16px;
  padding: 15px 4px; border-bottom: .8px solid var(--line-soft);
  text-decoration: none; transition: padding-left .25s var(--ease-out), border-color .2s var(--ease-out);
}
.range:hover { padding-left: 12px; border-color: var(--line); }
.range-span { font-family: var(--font-kurdish); font-size: 1.15rem; color: var(--ink); }
.range-n { margin-left: auto; }

/* ── the page heading ─────────────────────────────────────────────────── */
.head { padding: clamp(2rem, 1rem + 4vw, 4rem) 0 0; }
.head .eyebrow { margin: 0; }
.running { font-family: var(--font-kurdish); font-size: clamp(1.75rem, 1.1rem + 2.4vw, 3rem); font-weight: 400; line-height: 1.1; margin: 14px 0; }
.letter { font-family: var(--font-kurdish); font-size: clamp(4rem, 2rem + 9vw, 8rem); font-weight: 400; line-height: 1; margin: 8px 0 14px; letter-spacing: -.02em; }

.crumbs ol { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 22px 0 0; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--muted); }
.crumbs li + li::before { content: "/"; margin-right: 8px; color: var(--line); }
.crumbs a { color: var(--muted); text-decoration: none; }
.crumbs a:hover { color: var(--ink); }

/* ── the entries ──────────────────────────────────────────────────────── */
.entries { margin-top: 32px; }
.entry { padding: 26px 0; border-top: .8px solid var(--line); scroll-margin-top: 24px; }
.entry:target { background: #ffffff08; box-shadow: inset 2px 0 0 var(--ink); padding-left: 14px; }
.hw { font-family: var(--font-kurdish); font-size: clamp(1.5rem, 1.2rem + 1vw, 2rem); font-weight: 400; line-height: 1.15; margin: 0 0 14px; letter-spacing: -.01em; }
.hw a { text-decoration: none; }
.hw a:hover { text-decoration: underline; text-underline-offset: .18em; text-decoration-thickness: 1px; }

/* one grid for every labelled row, so the parts of speech and the Soranî
   line up — two numbers for one column is how they drift apart */
.row { display: grid; grid-template-columns: 8.5rem 1fr; gap: 6px 20px; align-items: baseline; margin: 0 0 9px; }
.row .label { text-align: right; line-height: 1.7; }
.sense ol { margin: 0; padding-left: 1.15rem; color: var(--dim); }
.sense ol li { margin-bottom: 4px; }
.sense ol li::marker { color: var(--muted); font-family: var(--font-mono); font-size: .82em; }
.sense ol:not(:has(li + li)) { list-style: none; padding-left: 0; }

/* an inflected form is not a word in its own right, and reads as one if it is
   given the same weight — half the corpus is these */
.sense.form ol { color: var(--muted); font-size: var(--text-sm); }

/*
 * Flex rather than a run of inline text, because the separator is a glyph and
 * not a space. The word "bab" lists thirty synonyms, and joined with a "·" they
 * were one unbreakable 2,296px token: inline margins are not break
 * opportunities, so the row never wrapped and the whole page scrolled
 * sideways. Wrapping flex items need no whitespace to break between.
 */
.vals { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 .5em; color: var(--dim); }
.vals a { color: var(--dim); text-decoration: none; border-bottom: .8px solid var(--line); }
.vals a:hover { color: var(--ink); border-color: var(--ink); }
[lang="ar"], [lang="ckb"][dir="rtl"], [dir="rtl"] { font-family: 'Vazirmatn', var(--font-sans); font-size: 1.08em; }

/* ── paging ───────────────────────────────────────────────────────────── */
.pager { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin: 56px 0 0; }
.pager .pill { padding: 9px 18px; font-size: var(--text-sm); color: var(--dim); text-decoration: none; border-radius: 999px; transition: color .2s var(--ease-out), border-color .2s var(--ease-out); }
.pager .pill:hover { color: var(--ink); border-color: var(--ink); }

footer {
  max-width: var(--measure); margin: clamp(4rem, 2rem + 7vw, 8rem) auto 0;
  padding: 28px var(--gutter) 56px; border-top: .8px solid var(--line);
  color: var(--muted); font-size: var(--text-sm);
}
footer p { margin: 0 0 6px; }
footer .mono { text-transform: none; letter-spacing: .02em; }
footer a { color: var(--dim); }

@media (max-width: 40rem) {
  .row { grid-template-columns: 1fr; gap: 2px; }
  .row .label { text-align: left; }
  .range { gap: 10px; }
  .topnav { gap: 0; }
  .topnav a { padding: 7px 9px; }
}
`;
