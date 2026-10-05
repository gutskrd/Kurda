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
import { letterKey } from '@kurda/shared';
import { escapeHtml as escape } from './escape.js';
import { ZAGROSIAN_MARK, ZAGROSIAN_URL, ZAGROSIAN_VIEWBOX } from '../src/brand/zagrosian.js';
import { alphabetOf, compareKeys, foldLetter } from './ferheng-alphabet.js';
import { COPY, type Copy } from './ferheng-copy.js';
import { CHROME_FILE, copyHook, type ChromeKey, type PageKey } from './ferheng-chrome.js';
import { formOf, isInflected, type Entry } from './ferheng-entries.js';

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
 * The one typeface these pages load, copied out of node_modules at build time
 * and served from /ferheng/fonts/.
 *
 * Only Arabic. Latin text is set in the app's own `--font-sans`, which is the
 * system stack and downloads nothing — these pages carried a Latin webfont for
 * a while and it was part of why they did not look like the rest of Hevalo.
 * The Arabic script has no system face worth relying on across platforms, and
 * a quarter of this dictionary is written in it.
 *
 * Self-hosted rather than fetched from a font CDN for two reasons: these pages
 * are served under `default-src 'none'`, so a third party would need a hole in
 * it, and a file on Cloudflare's edge is unmetered where a third party's is a
 * request a reader makes to a company that did not ask them.
 *
 * Its `unicode-range` means a page of Kurmancî never fetches it at all.
 */
export const FONTS = [
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
  for (const [prefix, list] of [...groups].sort(([a], [b]) => compareKeys(a, b))) {
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
 * What a word is filed under: its own letters, in their own alphabet.
 *
 * `letterKey` and not `dictionaryKey`. The second folds the diacritics — ş to
 * s, ê to e — which is right for a search box, where somebody typing "sev"
 * should find "sêv", and wrong for an index: Ş is a letter of the Kurdish
 * alphabet and not a decoration on S. Filed by the folded key, five of
 * Kurmancî's thirty-one letters had no section at all and `şev` sorted in among
 * the s-words.
 *
 * Three things are still folded, because they are one letter written two ways
 * rather than two letters: `ك`/`ک`, `ي`/`ی` and `ه`/`ھ`. NFKC first, which
 * turns the Arabic presentation forms (`ﻛ`, `ﻫ`, `ﻋ`) into the ordinary ones.
 *
 * Modifier letters go. Unicode counts Arabic tatweel (U+0640) as a letter, but
 * it is a typographic stretch rather than a sound, and a headword starting with
 * one was sorting ahead of the entire Latin alphabet and opening the A–Z with a
 * section called `ـ`.
 *
 * Returns an empty string for a headword that is nothing but stretches, which
 * the caller skips.
 */
export function pageKey(headword: string): string {
  return (
    letterKey(headword.normalize('NFKC'))
      .replace(/\p{Lm}/gu, '')
      // ك and ک are one letter in Kurdish, as are ي and ی, ه and ھ
      .replace(/./gu, (ch) => foldLetter(ch))
  );
}

/** Adjacent pages joined while they fit, named for the range they cover. */
function coalesce(parts: Page[]): Page[] {
  const merged: Page[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    /*
     * A page never spans two letters, however much room is left on it.
     *
     * Merging purely by size produced `چە-ح`: ninety-three ح words on a page
     * named for چ, so `letterOf` filed them under چ and ح got no section in the
     * index at all. Thirteen letters disappeared that way. It read badly even
     * where it was harmless — `şablon – sabotortî` is a page that begins in one
     * letter and ends in another, which is not how a dictionary is divided.
     */
    const sameLetter = last !== undefined && letterOf(last.prefix) === part.prefix.slice(0, 1);
    if (last && sameLetter && last.words.length + part.words.length <= WORDS_PER_PAGE) {
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
 * policy that allows no inline script at all (only chrome.js, a file of ours),
 * and markup that needs an exception is markup that will eventually get one.
 */
/** One step of the trail; `copy` when its name is a word chrome.js may relabel. */
interface Crumb {
  name: string;
  url: string;
  copy?: PageKey;
}

function breadcrumb(trail: Crumb[], here: string, hereCopy?: PageKey): string {
  const items = [...trail, { name: here, url: '', copy: hereCopy }]
    .map((step, i) => {
      const hook = step.copy ? copyHook(step.copy) : '';
      const inner = step.url
        ? `<a itemprop="item" href="${escape(step.url)}"><span itemprop="name"${hook}>${escape(step.name)}</span></a>`
        : `<span itemprop="name"${hook}>${escape(step.name)}</span>`;
      return (
        `<li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">` +
        `${inner}<meta itemprop="position" content="${i + 1}"></li>`
      );
    })
    .join('');
  return `<nav class="crumbs"><ol itemscope itemtype="https://schema.org/BreadcrumbList">${items}</ol></nav>`;
}

/**
 * The four glyphs the app's nav draws, as markup.
 *
 * The same Phosphor icons at the same weight the app imports — House,
 * BookOpenText, PuzzlePiece, Trophy — because a bar with four words and no
 * glyphs beside them is one of the things that made this read as a different
 * site. Inline SVG rather than a sprite or an icon font: `default-src 'none'`
 * means nothing can be fetched to draw them, and inline SVG is markup rather
 * than script, so it needs no exception at all.
 *
 * Repeated on every page, which sounds wasteful and is not: it is the same
 * 1.8 KB on all 3,363 of them, and it compresses to nothing on the wire.
 */
const NAV_ICONS: Record<string, string> = {
  mal: 'M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z',
  ferheng:
    'M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64ZM160,88h40a8,8,0,0,1,0,16H160a8,8,0,0,1,0-16Zm48,40a8,8,0,0,1-8,8H160a8,8,0,0,1,0-16h40A8,8,0,0,1,208,128Zm0,32a8,8,0,0,1-8,8H160a8,8,0,0,1,0-16h40A8,8,0,0,1,208,160Z',
  listik:
    'M220.27,158.54a8,8,0,0,0-7.7-.46,20,20,0,1,1,0-36.16A8,8,0,0,0,224,114.69V72a16,16,0,0,0-16-16H171.78a35.36,35.36,0,0,0,.22-4,36.11,36.11,0,0,0-11.36-26.24,36,36,0,0,0-60.55,23.62,36.56,36.56,0,0,0,.14,6.62H64A16,16,0,0,0,48,72v32.22a35.36,35.36,0,0,0-4-.22,36.12,36.12,0,0,0-26.24,11.36,35.7,35.7,0,0,0-9.69,27,36.08,36.08,0,0,0,33.31,33.6,35.68,35.68,0,0,0,6.62-.14V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V165.31A8,8,0,0,0,220.27,158.54ZM208,208H64V165.31a8,8,0,0,0-11.43-7.23,20,20,0,1,1,0-36.16A8,8,0,0,0,64,114.69V72h46.69a8,8,0,0,0,7.23-11.43,20,20,0,1,1,36.16,0A8,8,0,0,0,161.31,72H208v32.23a35.68,35.68,0,0,0-6.62-.14A36,36,0,0,0,204,176a35.36,35.36,0,0,0,4-.22Z',
  rezbendi:
    'M232,64H208V48a8,8,0,0,0-8-8H56a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80V96a40,40,0,0,0,40,40h3.65A80.13,80.13,0,0,0,120,191.61V216H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V191.58c31.94-3.23,58.44-25.64,68.08-55.58H208a40,40,0,0,0,40-40V80A16,16,0,0,0,232,64ZM48,120A24,24,0,0,1,24,96V80H48v32q0,4,.39,8Zm144-8.9c0,35.52-29,64.64-64,64.9a64,64,0,0,1-64-64V56H192ZM232,96a24,24,0,0,1-24,24h-.5a81.81,81.81,0,0,0,.5-8.9V80h24Z',
};

/**
 * The app's footer, in Kurmancî, with the dictionary's own licence line added.
 *
 * Section for section and link for link the same as `web/src/components/
 * Footer.tsx`: the brand and its tagline, the Kurdish motto, the three columns,
 * the bottom bar. These pages had a two-column footer of their own for a while,
 * which is the kind of difference a reader cannot name and can see.
 *
 * The strings are the `ku` catalogue's, read from web/src/i18n/ku.ts rather
 * than translated again — these pages are `lang="ku"` and have no reader whose
 * language to follow, so they are Kurmancî always.
 *
 * The motto is deliberately not translated anywhere in the app: it is the
 * app's own line, the way a masthead keeps its motto.
 *
 * The year is the build's. A static page cannot read a clock, and a copyright
 * line one year stale is a smaller wrong than a line that says nothing.
 */
function footer(c: Copy): string {
  const licence = `<span${copyHook('page.licence')} data-copy-slots>${escape(c.footer.licence)
    .replace('{wiki}', '<a data-slot="wiki" href="https://ku.wiktionary.org/" rel="noopener">Wîkîferheng</a>')
    .replace(
      '{licence}',
      '<a data-slot="licence" href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>',
    )}</span>`;
  return `<footer class="footer">
<div class="container">
<div class="footer-grid">
<div class="footer-brand">
<a class="brand" href="/"><img class="brand-mark" src="/logo.png" alt="" aria-hidden="true"><span>Hevalo</span></a>
<p class="muted">${labelled('footer.tagline', c.footer.tagline)}</p>
${/* not translated anywhere in the app: it is the app's own line, the way a
      masthead keeps its motto */ ''}
<p class="kurdish" lang="ku">Jiyan bi kurdî xweştire.</p>
</div>
<div class="footer-col">
<h4>${labelled('nav.learn', c.footer.learn)}</h4>
<a href="/learn">${labelled('learn.title', c.footer.lessons)}</a>
<a href="/app">${labelled('nav.home', c.nav.home)}</a>
<a href="/games">${labelled('nav.games', c.nav.games)}</a>
<a href="/${c.base}/">${labelled('nav.dictionary', c.nav.dictionary)}</a>
</div>
<div class="footer-col">
<h4>${labelled('nav.community', c.footer.community)}</h4>
<a href="/rankings">${labelled('nav.rankings', c.nav.rankings)}</a>
<a href="/register">${labelled('footer.join', c.footer.join)}</a>
<a href="/login">${labelled('nav.login', c.nav.login)}</a>
</div>
<div class="footer-col">
<h4>${labelled('footer.app', c.footer.app)}</h4>
<a href="https://apps.apple.com/" target="_blank" rel="noreferrer noopener">${labelled('footer.iosSoon', c.footer.ios)}</a>
<a href="https://play.google.com/" target="_blank" rel="noreferrer noopener">${labelled('footer.androidSoon', c.footer.android)}</a>
</div>
</div>
<div class="footer-bottom">
<span class="footer-bottom-left"><span>© ${new Date().getFullYear()} Hevalo</span><span class="muted">${licence}</span></span>
${/* the imprint, drawn exactly as the app draws it — see ZagrosianCredit.tsx */ ''}
<a class="by-zagrosian" href="${ZAGROSIAN_URL}" target="_blank" rel="noreferrer noopener">${labelled('footer.byZagrosian', c.footer.byZagrosian)}<svg class="by-zagrosian-mark" viewBox="${ZAGROSIAN_VIEWBOX}" fill="currentColor" focusable="false" aria-hidden="true"><path fill-rule="evenodd" d="${ZAGROSIAN_MARK}"></path></svg></a>
</div>
</div>
</footer>`;
}

/**
 * A word in the bar or footer that chrome.js may put into the reader's language.
 *
 * Always an inline span of its own, never the link or heading around it: the
 * script sets `dir` on what it relabels, and on a block that would also flip
 * the block's alignment — Arabic links hard right in an otherwise left-hand
 * column. On a span it orders the letters and leaves the layout alone.
 */
function labelled(key: ChromeKey, text: string, vars?: Record<string, string | number>): string {
  return `<span${copyHook(key, undefined, vars)}>${escape(text)}</span>`;
}

/**
 * One nav entry, drawn the way the app draws one: glyph, then word.
 *
 * The word is in a span of its own (see `labelled`) so chrome.js can relabel it
 * without taking the glyph with it.
 */
function navLink(key: string, href: string, label: string, copy: ChromeKey, current = false): string {
  return (
    `<a class="nav-link${current ? ' active' : ''}" href="${escape(href)}"${current ? ' aria-current="page"' : ''}>` +
    `<svg class="nav-link-icon" viewBox="0 0 256 256" width="18" height="18" fill="currentColor" aria-hidden="true">` +
    `<path d="${NAV_ICONS[key]!}"></path></svg>` +
    `${labelled(copy, label)}</a>`
  );
}

/**
 * The shell every page shares: nothing fetched off this origin, and one script
 * — chrome.js, which only relabels the bar and footer. See ferheng-chrome.ts.
 */
export function document_(opts: {
  title: string;
  description: string;
  canonical: string;
  body: string;
  /** which of chrome.js's title templates this title is, and what fills it */
  titleCopy?: { key: PageKey; vars?: Record<string, string | number> };
  /** the steps above this page; the page itself is added as the last one */
  breadcrumb?: Crumb[];
  /** what the trail calls this page, when it is not the title */
  here?: string;
  /** the template for `here`, when it is a word of ours rather than the corpus's */
  hereCopy?: PageKey;
  /** which of the published languages this page is one of */
  copy: Copy;
}): string {
  const c = opts.copy;
  return `<!doctype html>
<html lang="${c.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title${opts.titleCopy ? copyHook(opts.titleCopy.key, undefined, opts.titleCopy.vars) : ''}>${escape(opts.title)}</title>
<meta name="description" content="${escape(opts.description)}">
<link rel="canonical" href="${escape(opts.canonical)}">
<link rel="icon" href="/favicon.png" type="image/png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hevalo">
<meta property="og:url" content="${escape(opts.canonical)}">
<meta property="og:title" content="${escape(opts.title)}">
<meta property="og:description" content="${escape(opts.description)}">
<link rel="stylesheet" href="/${c.base}/ferheng.css">
${/* each language points at the other, so a search engine indexes them as one
      page in two languages rather than as two competing pages */ ''}
<link rel="alternate" hreflang="ku" href="${ORIGIN}/ferheng/">
<link rel="alternate" hreflang="en" href="${ORIGIN}/dictionary/">
</head>
<body>
<header class="nav">
<div class="container nav-inner">
<a class="brand" href="/"><img class="brand-mark" src="/logo.png" alt="" aria-hidden="true"><span>Hevalo</span></a>
<input class="nav-toggle-state" type="checkbox" id="nav-open" aria-label="${escape(c.nav.menu)}"${copyHook('nav.menu', 'aria-label')}>
<nav class="nav-links">
${navLink('mal', '/app', c.nav.home, 'nav.home')}
${navLink('ferheng', `/${c.base}/`, c.nav.dictionary, 'nav.dictionary', true)}
${navLink('listik', '/app/games', c.nav.games, 'nav.games')}
${navLink('rezbendi', '/app/rankings', c.nav.rankings, 'nav.rankings')}
<span class="nav-mobile-actions">
<a class="nav-link" href="/login">${labelled('nav.login', c.nav.login)}</a>
<a class="nav-link nav-cta" href="/register">${labelled('nav.register', c.nav.register)}</a>
</span>
</nav>
<span class="nav-spacer"></span>
${/* the app's right-hand group: the two buttons and the menu, 14px apart, not the bar's 28px */ ''}
<div class="nav-actions">
<a class="btn-sm btn-ghost nav-desktop-only" href="/login">${labelled('nav.login', c.nav.login)}</a>
<a class="btn-sm nav-desktop-only" href="/register">${labelled('nav.register', c.nav.register)}</a>
<label class="nav-toggle" for="nav-open"><svg class="nav-toggle-open" viewBox="0 0 256 256" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z"></path></svg><svg class="nav-toggle-close" viewBox="0 0 256 256" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path></svg></label>
</div>
</div>
</header>
${/* straight after the bar, so the bar is in the reader's language before it is first painted */ ''}
<script src="/${c.base}/${CHROME_FILE}"></script>
<main class="container">
${opts.breadcrumb ? breadcrumb(opts.breadcrumb, opts.here ?? opts.title.split(' · ')[0]!, opts.hereCopy) : ''}
${opts.body}
</main>
${footer(c)}
${/* the search box; hidden in the markup, so without this nothing pretends to search */ ''}
<script src="/ferheng/search.js" defer></script>
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
 * page entry can be two writings of one key merged together — `Kurd` and
 * `kurd`, `كا` and `کا` — and their senses arrive concatenated rather than
 * interleaved.
 */
function senseList(senses: Word['senses'], copy: Copy): string {
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
      const label = copy.pos[pos] ?? pos;
      return `<div class="${kind}"><span class="label" data-copy-pos="${escape(pos)}">${escape(label)}</span><ol>${items}</ol></div>`;
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
function equivalents(word: Word, copy: Copy): string {
  const row = (key: PageKey, label: string, values: string[], lang: string, prop: string | null): string => {
    if (values.length === 0) return '';
    const items = values
      .map((v) => `<span${scriptAttrs(v, lang)}${prop ? ` itemprop="${prop}"` : ''}>${escape(v)}</span>`)
      .join('<span class="sep">·</span>');
    return `<p class="row"><span class="label"${copyHook(key)}>${escape(label)}</span><span class="vals">${items}</span></p>`;
  };
  return (
    row('page.rows.sorani', copy.rows.sorani, word.sorani, 'ckb', 'alternateName') +
    row('page.rows.arabic', copy.rows.arabic, word.arabic, 'ar', null)
  );
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
function synonymList(words: string[], pageOf: Map<string, string>, copy: Copy): string {
  if (words.length === 0) return '';
  const link = (w: string): string => {
    const key = pageKey(w);
    const page = pageOf.get(key);
    const attrs = isArabic(w) ? ' dir="rtl"' : '';
    return page
      ? `<a href="/${copy.base}/${escape(page)}/#${escape(key)}"${attrs}>${escape(w)}</a>`
      : `<span${attrs}>${escape(w)}</span>`;
  };
  const sep = '<span class="sep">·</span>';
  // some words list forty; eight are enough to read, the rest wait behind a tap
  const shown = words.slice(0, SYNONYMS_SHOWN).map(link).join(sep);
  const rest = words.slice(SYNONYMS_SHOWN);
  const more = rest.length
    ? `<details class="more"><summary>+${rest.length}</summary>${sep}${rest.map(link).join(sep)}</details>`
    : '';
  return `<p class="row"><span class="label"${copyHook('page.rows.synonyms')}>${escape(copy.rows.synonyms)}</span><span class="vals">${shown}${more}</span></p>`;
}

/** How many synonyms an entry shows before "+N". */
export const SYNONYMS_SHOWN = 8;

/**
 * A word that is only a grammatical form of another, with nothing else to say.
 *
 * Over half the corpus: `dadana`, `dadanan`, `dadane`… each printed as a full
 * entry whose one line is "Rewşa îzafeyî ya yekjimar a binavkirî ya dadan." A
 * page of those reads as a wall, and the thing a reader wants from one is the
 * word it is a form of. So it is one line — the kind of form, an arrow, the
 * base word as a link — and the grammar is a tap away rather than gone.
 */
export function isFormOnly(w: Word): boolean {
  return (
    w.senses.length > 0 &&
    w.senses.every((s) => isInflected(s.pos)) &&
    w.synonyms.length + w.sorani.length + w.arabic.length === 0
  );
}

function formEntry(w: Word, pageOf: Map<string, string>, here: string, copy: Copy): string {
  const first = w.senses[0]!;
  const base = formOf(first.definition);
  const label = copy.pos[first.pos] ?? first.pos;
  let target = '';
  if (base) {
    const key = pageKey(base);
    const page = pageOf.get(key);
    const href = page === here ? `#${key}` : page ? `/${copy.base}/${page}/#${key}` : null;
    target = href
      ? ` <span class="arrow" aria-hidden="true">→</span> <a href="${escape(href)}" lang="ku" dir="auto">${escape(base)}</a>`
      : ` <span class="arrow" aria-hidden="true">→</span> <span lang="ku" dir="auto">${escape(base)}</span>`;
  }
  const grammar = [...new Set(w.senses.map((s) => s.definition))]
    .map((d) => `<li itemprop="description" dir="auto">${escape(d)}</li>`)
    .join('');
  return (
    `<article class="entry form-entry" id="${escape(w.key)}" itemscope itemtype="https://schema.org/DefinedTerm">` +
    `<h2 class="hw" itemprop="name" dir="auto"><a href="#${escape(w.key)}">${escape(w.headword)}</a></h2>` +
    `<details class="form-of"><summary><span class="label" data-copy-pos="${escape(first.pos)}">${escape(label)}</span>${target}</summary>` +
    `<ol>${grammar}</ol></details></article>`
  );
}

/** Entries in page order, with each run of bare forms gathered into one compact block. */
function entriesOf(words: Word[], pageOf: Map<string, string>, here: string, copy: Copy): string {
  const out: string[] = [];
  let run: string[] = [];
  const flush = (): void => {
    if (run.length) out.push(`<div class="forms">${run.join('')}</div>`);
    run = [];
  };
  for (const w of words) {
    if (isFormOnly(w)) run.push(formEntry(w, pageOf, here, copy));
    else {
      flush();
      out.push(entry(w, pageOf, copy));
    }
  }
  flush();
  return out.join('\n');
}

/**
 * The search box. Hidden until search.js shows it, so a browser that runs no
 * script never sees a box that does nothing. Its words are hooked like the
 * rest of the page, so chrome.js puts them in the reader's language.
 */
export function searchBox(copy: Copy, total: number, id: string, big = false): string {
  const n = total.toLocaleString('en');
  const placeholder = total
    ? ` placeholder="${escape(copy.search.placeholder(n))}"${copyHook('page.search.placeholder', 'placeholder', { n })}`
    : ` placeholder="${escape(copy.search.label)}"`;
  return `<form class="search${big ? ' search--big' : ''}" id="${id}" data-base="${copy.base}" role="search" hidden>
<label class="search-field"><svg viewBox="0 0 256 256" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"></path></svg><span class="sr-only">${labelled('page.search.label', copy.search.label)}</span><input type="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list"${placeholder}></label>
<ul class="search-list" id="${id}-list" role="listbox" hidden></ul>
<p class="search-msg" data-msg="more" hidden>${labelled('page.search.more', copy.search.more)}</p>
<p class="search-msg" data-msg="none" hidden>${labelled('page.search.none', copy.search.none)}</p>
<p class="search-msg" data-msg="letter" hidden><a href="/${copy.base}/">${labelled('page.search.letter', copy.search.letter)} <b data-letter></b> →</a></p>
</form>`;
}

/** One entry, headword and all. */
function entry(w: Word, pageOf: Map<string, string>, copy: Copy): string {
  return (
    `<article class="entry" id="${escape(w.key)}" itemscope itemtype="https://schema.org/DefinedTerm">` +
    // the headword links to its own anchor, so a reader who wants to send
    // somebody one word has an address for exactly that word
    `<h2 class="hw" itemprop="name" dir="auto"><a href="#${escape(w.key)}">${escape(w.headword)}</a></h2>` +
    `<div class="body">${senseList(w.senses, copy)}${equivalents(w, copy)}${synonymList(w.synonyms, pageOf, copy)}</div>` +
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
  copy: Copy = COPY.ku,
  /** every word in the dictionary, for the search box's placeholder */
  total = 0,
): string {
  const entries = entriesOf(page.words, pageOf, page.prefix, copy);
  const letter = letterOf(page.prefix);
  const base = copy.base;

  const nav = [
    prev ? `<a class="pill" rel="prev" href="/${base}/${escape(prev)}/">←</a>` : '',
    `<a class="pill" href="/${base}/${escape(letter)}/">${labelled('page.words.all', copy.words.all(letter.toUpperCase()), { letter: letter.toUpperCase() })}</a>`,
    next ? `<a class="pill" rel="next" href="/${base}/${escape(next)}/">→</a>` : '',
  ]
    .filter(Boolean)
    .join('');

  const here = span(page);
  const first = page.words[0]!.headword;
  const last = page.words[page.words.length - 1]!.headword;
  return document_({
    copy,
    title: `${here} · ${copy.titleSuffix}`,
    titleCopy: { key: 'page.title.words', vars: { here } },
    description: copy.words.description(page.words.length, first, last),
    canonical: `${ORIGIN}/${base}/${page.prefix}/`,
    breadcrumb: [
      { name: copy.root, url: `${ORIGIN}/${base}/`, copy: 'page.root' },
      { name: letter.toUpperCase(), url: `${ORIGIN}/${base}/${letter}/` },
    ],
    here,
    body: `<header class="head">
<p class="eyebrow">${escape(letter.toUpperCase())}</p>
<h1 class="running" dir="auto" lang="ku">${escape(here)}</h1>
<p class="eyebrow">${labelled('page.words.count', copy.words.count(page.words.length), { n: page.words.length })}</p>
</header>
${searchBox(copy, total, 'search-top')}
<div class="entries" itemscope itemtype="https://schema.org/DefinedTermSet">
<meta itemprop="name" content="${escape(copy.titleSuffix)}">
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
export function letterPage(letter: string, pages: Page[], total: number, copy: Copy = COPY.ku): string {
  const rows = pages
    .map(
      (p) =>
        `<a class="range" href="/${copy.base}/${escape(p.prefix)}/">` +
        `<span class="range-span" dir="auto" lang="ku">${escape(span(p))}</span>` +
        `<span class="range-n">${p.words.length}</span></a>`,
    )
    .join('');
  const words = pages.reduce((n, p) => n + p.words.length, 0);
  const up = letter.toUpperCase();
  return document_({
    copy,
    title: `${copy.letter.title(up)} · ${copy.titleSuffix}`,
    titleCopy: { key: 'page.title.letter', vars: { letter: up } },
    description: copy.letter.description(words.toLocaleString('en'), up),
    canonical: `${ORIGIN}/${copy.base}/${letter}/`,
    breadcrumb: [{ name: copy.root, url: `${ORIGIN}/${copy.base}/`, copy: 'page.root' }],
    here: up,
    body: `<header class="head">
<p class="eyebrow">${labelled(`page.alphabets.${alphabetOf(letter)}`, alphabetName(letter, copy))}</p>
<h1 class="letter" dir="auto" lang="ku">${escape(up)}</h1>
<p class="eyebrow">${labelled('page.letter.count', copy.letter.count(words.toLocaleString('en'), total.toLocaleString('en')), {
  words: words.toLocaleString('en'),
  total: total.toLocaleString('en'),
})}</p>
</header>
${searchBox(copy, total, 'search-top')}
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
    .sort((a, b) => b.score - a.score || compareKeys(a.word.key, b.word.key))
    .slice(0, count)
    .map((x) => x.word)
    .sort((a, b) => compareKeys(a.key, b.key));
}

/**
 * The page for a dictionary address that has nothing behind it.
 *
 * It has to exist, and it has to be a file here rather than the app's own
 * not-found screen, because of how the two overlap. Cloudflare answers an
 * unmatched path with the SPA shell, and `_headers` applies this directory's
 * policy by URL rather than by file — so the shell arrived under
 * `default-src 'none'`, its own bundle was refused, React never booted, and the
 * reader got a white page with nothing on it. Measured live on
 * /ferheng/sa-sc/: "Loading the script … violates the following Content
 * Security Policy directive: default-src 'none'".
 *
 * These addresses are not rare. Page boundaries are a property of how the words
 * divide, so a re-import moves them: every range URL from the previous build —
 * bookmarked, linked, or sitting in somebody's history — becomes one of these.
 * The letters never move, which is why this page sends a reader to them.
 */
export function notFoundPage(copy: Copy = COPY.ku): string {
  return document_({
    copy,
    title: `${copy.notFound.title} · ${copy.titleSuffix}`,
    titleCopy: { key: 'page.title.notFound' },
    description: copy.notFound.description,
    canonical: `${ORIGIN}/${copy.base}/`,
    breadcrumb: [{ name: copy.root, url: `${ORIGIN}/${copy.base}/`, copy: 'page.root' }],
    here: copy.notFound.here,
    hereCopy: 'page.notFound.here',
    body: `<header class="head">
<p class="eyebrow">404</p>
<h1 class="running">${labelled('page.notFound.heading', copy.notFound.heading)}</h1>
</header>
<p class="prose">${labelled('page.notFound.body', copy.notFound.body)}</p>
<nav class="pager"><a class="pill" href="/${copy.base}/">${labelled('page.notFound.action', copy.notFound.action)}</a></nav>`,
  });
}

/**
 * The three blocks the index is shown in, in order.
 *
 * Kurdish is written in two alphabets, and a reader of one frequently cannot
 * read the other — so an index that runs A, B, C … Z and then straight into
 * ئ, ب, پ is not one alphabet with an odd tail. It is two, and saying which is
 * which is the difference between a reader finding their own letters and
 * scrolling past a block of script they do not use.
 *
 * The third block is for the letters that are in neither: the Latin `ḧ` and
 * `ẍ` some Kurmancî orthographies use, the Arabic `ط ص ظ` of unassimilated
 * loanwords, the handful of Cyrillic. They are shown rather than hidden —
 * 250 words begin with `ḧ` and somebody looking for one needs to find it —
 * but they are not claimed as Hawar's or Soranî's. Which letters belong to
 * which is in ferheng-alphabet.ts.
 */
const ALPHABETS = ['hawar', 'sorani', 'other'] as const;

/** What to call the alphabet a letter is in. */
export function alphabetName(letter: string, copy: Copy = COPY.ku): string {
  return copy.alphabets[alphabetOf(letter)];
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
  copy: Copy = COPY.ku,
): string {
  const thumbs = (group: Array<{ letter: string; words: number }>): string =>
    group
      .map(
        (l) =>
          `<a class="thumb" href="/${copy.base}/${escape(l.letter)}/">` +
          `<span class="thumb-t" dir="auto" lang="ku">${escape(l.letter.toUpperCase())}</span>` +
          `<span class="thumb-n">${l.words.toLocaleString('en')}</span></a>`,
      )
      .join('');

  const index = ALPHABETS.map((id) => {
    const group = letters.filter((l) => alphabetOf(l.letter) === id);
    if (group.length === 0) return '';
    // the letters in neither alphabet are a handful of words each; findable, but not a third block to read past
    if (id === 'other') {
      return `<details class="other-letters"><summary class="eyebrow">${labelled('page.alphabets.other', copy.alphabets.other)} · ${group.length}</summary>\n<div class="thumbs">${thumbs(group)}</div></details>`;
    }
    return `<p class="eyebrow">${labelled(`page.alphabets.${id}`, copy.alphabets[id])}</p>\n<div class="thumbs">${thumbs(group)}</div>`;
  })
    .filter(Boolean)
    .join('\n');

  return document_({
    copy,
    title: `${copy.titleSuffix} — Hevalo`,
    titleCopy: { key: 'page.title.index' },
    description: copy.index.description(total.toLocaleString('en')),
    canonical: `${ORIGIN}/${copy.base}/`,
    body: `<section class="hero">
<div class="hero-grid">
<div class="hero-inner">
<p class="eyebrow">${labelled('page.index.eyebrow', copy.index.eyebrow)}</p>
${/* the headline is the one piece of copy with markup in it — a line break — and it is our own string, not the corpus's */ ''}
<h1 class="display"><span${copyHook('page.index.headline')}>${copy.index.headline}</span></h1>
<p class="lead">${labelled('page.index.lead', copy.index.lead)}</p>
</div>
<div class="hero-art"><img src="/logo.png" alt="" width="512" height="512"></div>
</div>
${/* the first thing to do on a dictionary is to look a word up, so the box comes before everything else */ ''}
${searchBox(copy, total, 'search-hero', true)}
</section>

<section class="section">
<p class="eyebrow">${labelled('page.index.selected', copy.index.selected)}</p>
<div class="cards">${samples.map((w) => card(w, pageOf, copy)).join('\n')}</div>
</section>

<section class="section">
${index}
${/* how each of these letters sounds lives in the app, which explains it against the reader's own language */ ''}
<p class="pager alphabet-link"><a class="pill" href="/app/alphabet">${labelled('page.index.alphabet', copy.index.alphabet)}</a></p>
</section>

<section class="section">
<p class="eyebrow">${labelled('page.index.about', copy.index.about)}</p>
<p class="prose">${labelled('page.index.aboutBody', copy.index.aboutBody)}</p>
</section>`,
  });
}

/**
 * A word on the front page, as a card: the word, what kind, and its first
 * meaning. The full entry is one tap away; the front page is for wanting to.
 */
function card(w: Word, pageOf: Map<string, string>, copy: Copy): string {
  const main = w.senses.find((s) => !isInflected(s.pos)) ?? w.senses[0]!;
  const page = pageOf.get(w.key);
  const href = page ? `/${copy.base}/${escape(page)}/#${escape(w.key)}` : `/${copy.base}/`;
  return (
    `<a class="word-card" href="${href}">` +
    `<span class="word-card-hw" lang="ku" dir="auto">${escape(w.headword)}</span>` +
    `<span class="label" data-copy-pos="${escape(main.pos)}">${escape(copy.pos[main.pos] ?? main.pos)}</span>` +
    `<span class="word-card-def" dir="auto">${escape(main.definition)}</span>` +
    `</a>`
  );
}

/**
 * The stylesheet, which is the whole design: the one script, chrome.js, only
 * relabels, so there is nothing else to lean on.
 *
 * The custom properties are zagrosian.com's, read off the running site rather
 * than matched by eye — the neutrals, the type scale, the easing curves and
 * the gutter formula are the same values. What differs is noted where it
 * differs.
 */
/**
 * The stylesheet, which is the whole design: the one script, chrome.js, only
 * relabels, so there is nothing else to lean on.
 *
 * These are the app's own tokens and its own nav, footer and surfaces, copied
 * from web/src/styles/. They were a separate monochrome design for a while, and
 * the verdict on that was "the whole site changes when I click on the
 * dictionary" — which it did: different background, different type, a different
 * bar along the top. A reader should not be able to tell they have left the app.
 *
 * Copied rather than imported because these pages load no bundle, which is the
 * point of them. The duty that comes with copying is to stay in step.
 */
/**
 * The stylesheet: the app's, then the dictionary's.
 *
 * Everything above the second banner is web/src/styles/tokens.css, base.css
 * and the nav and footer rules out of layout.css, value for value. Copied and
 * not imported because these pages load no bundle, which is what makes them
 * free to serve; the duty that comes with copying is to stay in step.
 *
 * The one that mattered most and was missed twice: the app sets h1-h4 in
 * --font-display, the Palatino serif. A page whose headings are bold sans is
 * not the same site, however well its colours match.
 */
export const STYLE = `@font-face { font-family: 'Vazirmatn'; font-style: normal; font-display: swap; font-weight: 100 900; src: url(/ferheng/fonts/vazirmatn-arabic.woff2) format('woff2-variations'); unicode-range: U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E; }

/* ======================================================================== *
 * Copied from the app, value for value. Everything down to "the dictionary"
 * below is web/src/styles/tokens.css + base.css + the nav and footer rules
 * out of layout.css, and it is copied rather than imported because these
 * pages load no bundle — that is what makes them free to serve.
 *
 * So the duty is to stay in step. If a token or either of those two
 * components moves there, move it here: a reader who clicks Ferheng must not
 * be able to tell they have left the app.
 * ======================================================================== */

/* ---- tokens.css -------------------------------------------------------- */
:root {
  color-scheme: dark;
  --app-bg: #0b0d10;
  --ink: #ffffff;
  --ink-2: rgba(255, 255, 255, 0.84);
  --ink-3: rgba(255, 255, 255, 0.6);
  --ink-4: rgba(255, 255, 255, 0.42);
  --bg: rgba(255, 255, 255, 0.06);
  --surface: rgba(255, 255, 255, 0.05);
  --surface-2: rgba(255, 255, 255, 0.11);
  --border: rgba(255, 255, 255, 0.14);
  --border-strong: rgba(255, 255, 255, 0.28);
  --primary: #ffffff;
  --primary-hover: rgba(255, 255, 255, 0.88);
  --primary-ink: #141414;
  --gold: #f0c24a;
  --gold-ink: #f6d68b;
  --focus: rgba(255, 255, 255, 0.55);
  --glass-blur: 20px;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-display: 'Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Georgia', 'Times New Roman', serif;
  --r-xs: 6px;
  --r-sm: 8px;
  --r-md: 12px;
  --r-lg: 18px;
  --r-pill: 999px;
  --shadow-sm: 0 2px 10px rgba(0, 0, 0, 0.3);
  --shadow: 0 10px 34px rgba(0, 0, 0, 0.4);
  --container: 1120px;
  --nav-h: 66px;
}

/* ---- base.css ---------------------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
/* clip, not hidden: hidden makes the element a scroll container, which breaks
   the sticky nav inside it */
html, body { overflow-x: clip; max-width: 100%; }
body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.6;
  color: var(--ink);
  background: var(--app-bg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
/* the app sets every heading in the display serif — this is most of why a page
   looks like Hevalo rather than like a generic dark site */
h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: 600;
  line-height: 1.12;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--ink);
}
p { margin: 0; }
a { color: inherit; text-decoration: none; }
img { max-width: 100%; display: block; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--r-xs); }

.container { width: 100%; max-width: var(--container); margin: 0 auto; padding-inline: 24px; }
@media (max-width: 640px) { .container { padding-inline: 18px; } }
.muted { color: var(--ink-3); }
.eyebrow {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.kurdish { font-family: var(--font-display); font-style: italic; color: var(--ink-2); }
.display { font-size: clamp(2.4rem, 5vw, 3.75rem); letter-spacing: -0.022em; }
.h-section { font-size: clamp(1.6rem, 3vw, 2.2rem); }
.lead { font-size: 1.175rem; line-height: 1.6; color: var(--ink-2); }

/* ---- layout.css: the nav ----------------------------------------------- */
/*
 * The bar is allowed wider than the page it sits over — 1440px against the
 * content column's 1120px.
 *
 * This rule was missed when the rest of the nav was copied, and it is the one
 * a reader can see without being able to name: above 1180px the app's bar
 * reaches 1440px and the dictionary's stopped at 1120px, so clicking Ferheng
 * made the navigation visibly narrow. The bar is not a column of text and does
 * not want a column of text's cap.
 */
@media (min-width: 1180px) {
  .nav .container.nav-inner { max-width: 1440px; }
}
.nav {
  position: sticky; top: 0; z-index: 40; height: var(--nav-h);
  background: rgba(10, 12, 16, 0.4);
  -webkit-backdrop-filter: saturate(1.2) blur(20px);
  backdrop-filter: saturate(1.2) blur(20px);
  border-bottom: 1px solid var(--border);
}
.nav-inner { height: 100%; display: flex; align-items: center; gap: 28px; }
.brand {
  display: inline-flex; align-items: center; gap: 9px; flex: none;
  font-family: var(--font-display); font-size: 1.22rem; font-weight: 600;
  letter-spacing: -0.01em; color: var(--ink);
}
.brand-mark { flex: none; width: 30px; height: 30px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); }
.nav-links { display: flex; align-items: center; gap: 4px; }
.nav-link {
  display: inline-flex; align-items: center; height: 36px; padding: 0 12px;
  border-radius: var(--r-sm); font-size: 0.92rem; font-weight: 500;
  color: var(--ink-2); transition: color 0.15s ease, background 0.15s ease;
}
.nav-link:hover { color: var(--ink); background: var(--surface-2); }
.nav-link.active { color: var(--ink); background: var(--surface-2); }
.nav-link-icon { flex: none; margin-inline-end: 7px; color: var(--ink-4); }
.nav-link:hover .nav-link-icon, .nav-link.active .nav-link-icon { color: var(--gold-ink); }
.nav-spacer { flex: 1; }
.nav-actions { display: flex; align-items: center; gap: 14px; }
/* ui.css's .btn + .btn-sm, folded together: the bar's two buttons are the app's two buttons */
.btn-sm {
  display: inline-flex; align-items: center; justify-content: center; height: 38px; padding: 0 14px;
  border: 1px solid transparent; border-radius: var(--r-sm);
  font-size: 0.9rem; font-weight: 550; line-height: 1; white-space: nowrap;
  background: var(--primary); color: var(--primary-ink);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.btn-sm:hover { background: var(--primary-hover); }
.btn-ghost { background: transparent; color: var(--ink-2); }
.btn-ghost:hover { background: var(--surface-2); color: var(--ink); }
/*
 * The toggle is a checkbox and a label, because these pages run no app code.
 *
 * The app opens its mobile menu with React state; here the only script is
 * chrome.js, which relabels and nothing else, so the menu must work without
 * any — the open/closed state is a checkbox the label flips and the
 * panel reads with ":checked ~". Same breakpoint, same panel, same behaviour —
 * the bar was keeping its glyphs on a phone while the app showed a hamburger,
 * which is a difference a reader meets on the device most of them are on.
 *
 * The checkbox is moved off-screen rather than "hidden", so it keeps its place
 * in the tab order and can still be operated from the keyboard; the focus ring
 * is drawn on the label instead.
 */
.nav-toggle-state { position: absolute; width: 1px; height: 1px; opacity: 0; margin: 0; }
.nav-toggle {
  display: none; width: 40px; height: 40px; flex: none;
  border: 1px solid var(--border-strong); border-radius: var(--r-sm);
  background: var(--bg); color: var(--ink);
  align-items: center; justify-content: center; cursor: pointer;
}
.nav-toggle-state:focus-visible ~ .nav-actions .nav-toggle { outline: 2px solid var(--focus); outline-offset: 2px; }
/* the app's toggle turns into a cross while the menu is open; so does this one */
.nav-toggle-close { display: none; }
.nav-toggle-state:checked ~ .nav-actions .nav-toggle-open { display: none; }
.nav-toggle-state:checked ~ .nav-actions .nav-toggle-close { display: block; }
.nav-mobile-actions { display: none; }

/* between 861 and 1179 the app drops the words and keeps the glyphs */
@media (min-width: 861px) and (max-width: 1179px) {
  .nav-link span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .nav-link-icon { margin-inline-end: 0; }
  .nav-inner { gap: 14px; }
  .nav-link { padding: 0 9px; }
}

@media (max-width: 860px) {
  .nav-toggle { display: inline-flex; }
  .nav-links {
    position: fixed; inset: var(--nav-h) 0 auto 0;
    flex-direction: column; align-items: stretch; gap: 2px;
    padding: 12px 18px 18px;
    background: rgba(6, 8, 11, 0.98);
    -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border-strong);
    box-shadow: var(--shadow);
    transform: translateY(-8px); opacity: 0; pointer-events: none;
    transition: opacity 0.16s ease, transform 0.16s ease;
  }
  .nav-toggle-state:checked ~ .nav-links { transform: translateY(0); opacity: 1; pointer-events: auto; }
  .nav-link { height: 44px; font-size: 1rem; }
  /* the app's links sit in list items and are as wide as their words; these are the panel's own children, so say so */
  .nav-links > .nav-link { align-self: flex-start; }
  .nav-desktop-only { display: none; }
  .nav-mobile-actions {
    display: flex; flex-direction: column; gap: 2px;
    margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--border);
  }
  /* in the menu, Get started is the button it is on the bar, not one more link */
  .nav-mobile-actions .nav-cta {
    justify-content: center; margin-top: 8px;
    background: var(--primary); color: var(--primary-ink); font-weight: 600;
  }
  .nav-mobile-actions .nav-cta:hover { background: var(--primary-hover); color: var(--primary-ink); }
}

/* ---- layout.css: the footer -------------------------------------------- */
.footer {
  border-top: 1px solid var(--border);
  background: rgba(10, 12, 16, 0.4);
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
  padding: 48px 0 40px;
  margin-top: 64px;
}
.footer-grid { display: flex; flex-wrap: wrap; gap: 40px; justify-content: space-between; }
.footer-brand { max-width: 280px; }
.footer-brand .muted { margin-top: 12px; font-size: 0.92rem; }
.footer-brand .kurdish { margin-top: 10px; }
.footer-col h4 { font-family: var(--font-sans); font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 12px; font-weight: 600; }
.footer-col a { display: block; color: var(--ink-2); font-size: 0.95rem; padding: 4px 0; }
.footer-col a:hover { color: var(--ink); }
.footer-bottom {
  margin-top: 36px; padding-top: 20px; border-top: 1px solid var(--border);
  display: flex; flex-wrap: wrap; gap: 10px 20px; align-items: center;
  justify-content: space-between; color: var(--ink-3); font-size: 0.88rem;
}
.footer-bottom-left { display: flex; flex-wrap: wrap; gap: 4px 20px; align-items: center; }
/* who made this — an imprint, not an advertisement. It sits at the weight of
   the copyright line beside it and only lifts when somebody reaches for it;
   the mark is drawn in currentColor so it brightens with the words rather than
   staying lit while they move */
.by-zagrosian { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-3); white-space: nowrap; transition: color 0.18s ease; }
.by-zagrosian:hover { color: var(--ink); }
.by-zagrosian-mark { height: 17px; width: auto; flex: none; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45)); }

/* ======================================================================== *
 * The dictionary's own, below here. Nothing above this line is invented.
 * ======================================================================== */

main { padding-bottom: 8px; }

.crumbs ol {
  list-style: none; display: flex; flex-wrap: wrap; gap: 8px;
  padding: 0; margin: 20px 0 0; font-size: 0.82rem; color: var(--ink-4);
}
.crumbs li + li::before { content: "›"; margin-right: 8px; color: var(--ink-4); }
.crumbs a { color: var(--ink-3); }
.crumbs a:hover { color: var(--ink); }

.head { padding: 28px 0 0; }
.running { font-size: clamp(1.6rem, 3vw, 2.2rem); margin: 10px 0; }
.letter { font-size: clamp(3.5rem, 2rem + 8vw, 7rem); line-height: 1; margin: 6px 0 10px; }

/* ---- the front page ---------------------------------------------------- */
.hero { padding: 48px 0 0; }
.hero .eyebrow { margin-bottom: 16px; }
.hero .display { margin-bottom: 18px; }
.hero .lead { max-width: 36rem; }

/* the same two-column hero the app's landing page has, so the two front pages
   are the same shape and the deer appears on both — see pages.css */
.hero-grid { display: grid; gap: clamp(28px, 5vw, 64px); align-items: center; }
@media (min-width: 900px) { .hero-grid { grid-template-columns: minmax(0, 1fr) auto; } }
.hero-art { position: relative; display: flex; justify-content: center; }
.hero-art img {
  width: clamp(168px, 30vw, 300px); height: auto;
  filter: drop-shadow(0 22px 44px rgba(0, 0, 0, 0.55));
}
.hero-art::before {
  content: ''; position: absolute; inset: -14%; z-index: -1; border-radius: 50%;
  background: radial-gradient(circle at 50% 45%, rgba(184, 116, 240, 0.3), transparent 68%);
  filter: blur(26px);
}

.section { padding: 52px 0 0; }
.section > .eyebrow { margin-bottom: 16px; }
.prose { max-width: 36rem; color: var(--ink-3); margin: 0; }
.sep { color: var(--ink-4); }

.thumbs { display: flex; flex-wrap: wrap; gap: 6px; }
.thumbs .thumb {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  min-width: 3.6rem; padding: 10px;
  border: 1px solid var(--border); border-radius: var(--r-sm);
  background: var(--surface);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.thumb:hover { background: var(--surface-2); border-color: var(--ink-4); }
.thumb-t { font-family: var(--font-display); font-size: 1.5rem; line-height: 1; color: var(--ink); }
.thumb-n { font-size: 0.7rem; color: var(--ink-4); }
.thumbs + .eyebrow { margin-top: 32px; }

/* ---- a letter's pages -------------------------------------------------- */
.ranges { display: grid; gap: 6px; margin-top: 20px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); }
.range {
  display: flex; align-items: baseline; gap: 14px;
  padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--r-sm);
  background: var(--surface);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.range:hover { background: var(--surface-2); border-color: var(--ink-4); }
.range-span { font-family: var(--font-display); font-size: 1.05rem; color: var(--ink); }
.range-n { margin-left: auto; font-size: 0.8rem; color: var(--ink-4); }

/* ---- the entries ------------------------------------------------------- */
.entries { margin-top: 20px; }
.entry { padding: 20px 0; border-top: 1px solid var(--border); scroll-margin-top: calc(var(--nav-h) + 12px); }
.entry:target { background: rgba(240, 194, 74, 0.07); box-shadow: inset 2px 0 0 var(--gold); padding-left: 14px; }
.hw { font-size: clamp(1.4rem, 1.1rem + 1vw, 1.9rem); margin: 0 0 10px; }
.hw a:hover { color: var(--gold); }

/* one grid for every labelled row, so the parts of speech and the Soranî line
   up — two numbers for one column is how they drift apart */
.row { display: grid; grid-template-columns: 7.5rem 1fr; gap: 4px 18px; align-items: baseline; margin: 0 0 8px; }
/* the app sets a part of speech in italics at 0.78rem (.dict-pos), not in
   uppercase — which also stops "Formeke navdêrê", the commonest label in the
   corpus, from wrapping onto two lines in the column */
.row .label { font-size: 0.78rem; font-style: italic; color: var(--ink-3); text-align: right; line-height: 1.9; }
.sense ol { margin: 0; padding-left: 1.2rem; color: var(--ink-2); }
.sense ol li { margin-bottom: 4px; }
.sense ol li::marker { color: var(--ink-4); font-size: 0.85em; }
.sense ol:not(:has(li + li)) { list-style: none; padding-left: 0; }

/* an inflected form is not a word in its own right, and reads as one if it is
   given the same weight — half the corpus is these */
.sense.form ol { color: var(--ink-3); font-size: 0.94rem; }

/*
 * Flex rather than a run of inline text, because the separator is a glyph and
 * not a space. The word "bab" lists thirty synonyms, and joined with a "·" they
 * were one unbreakable 2,296px token: inline margins are not break
 * opportunities, so the row never wrapped and the whole page scrolled
 * sideways. Wrapping flex items need no whitespace to break between.
 */
.vals { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 0.5em; color: var(--ink-2); }
.vals a { border-bottom: 1px solid var(--border); }
.vals a:hover { color: var(--ink); border-color: var(--ink); }
/* the corpus's Soranî and Arabic forms — not the bar, the footer or chrome.js's words, which keep the app's own type */
:is([lang="ar"], [dir="rtl"]):not(.nav, .footer, [data-copy], [data-copy-pos]) { font-family: 'Vazirmatn', var(--font-sans); font-size: 1.06em; }

.pager { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin: 40px 0 0; }
.pager .pill {
  display: inline-flex; align-items: center; height: 36px; padding: 0 16px;
  border: 1px solid var(--border); border-radius: var(--r-pill);
  background: var(--surface); color: var(--ink-2); font-size: 0.92rem;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.pager.alphabet-link { justify-content: flex-start; margin: 22px 0 0; }
.pager .pill:hover { background: var(--surface-2); border-color: var(--ink-4); color: var(--ink); }

@media (max-width: 40rem) {
  .row { grid-template-columns: 1fr; gap: 2px; }
  .row .label { text-align: left; line-height: 1.6; }
}

/* ======================================================================== *
 * Calmer pages: a search box first, one line per grammatical form, and the
 * long lists folded behind a tap.
 * ======================================================================== */
[hidden] { display: none !important; }
/* on a phone the search box is the first thing, not the deer above it */
@media (max-width: 899px) { .hero-art { display: none; } .hero { padding-top: 28px; } }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* ---- the search box ---------------------------------------------------- */
.search { position: relative; max-width: 40rem; margin: 22px 0 0; }
.search--big { margin-top: 36px; }
.search-field {
  display: flex; align-items: center; gap: 10px;
  height: 48px; padding: 0 16px;
  border: 1px solid var(--border); border-radius: var(--r-pill);
  background: var(--surface); color: var(--ink-3);
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.search--big .search-field { height: 58px; padding: 0 20px; font-size: 1.08rem; }
.search-field:focus-within { border-color: var(--ink-3); background: var(--surface-2); box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.06); }
.search-field input {
  flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent;
  color: var(--ink); font: inherit; font-size: 1em;
}
.search-field input::placeholder { color: var(--ink-4); }
.search-field input::-webkit-search-cancel-button { filter: invert(1) opacity(0.5); }
.search-list {
  position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; right: 0;
  margin: 0; padding: 6px; list-style: none;
  border: 1px solid var(--border); border-radius: var(--r-lg);
  background: #15161b; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  max-height: min(70vh, 26rem); overflow-y: auto;
}
.search-list a {
  display: flex; align-items: baseline; gap: 12px; padding: 10px 12px; border-radius: var(--r-sm);
  color: var(--ink-2);
}
.search-list [aria-selected="true"] a, .search-list a:hover { background: var(--surface-2); color: var(--ink); }
.search-word { flex: none; font-family: var(--font-display); font-size: 1.15rem; color: var(--ink); }
.search-gloss { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.88rem; color: var(--ink-3); }
.search-msg { margin: 10px 4px 0; font-size: 0.88rem; color: var(--ink-3); }
.search-msg a { color: var(--ink-2); border-bottom: 1px solid var(--border); }

/* ---- the front page's words, as cards ---------------------------------- */
.cards { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); }
.word-card {
  display: flex; flex-direction: column; gap: 4px; padding: 16px 18px;
  border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.word-card:hover { background: var(--surface-2); border-color: var(--ink-4); transform: translateY(-1px); }
.word-card-hw { font-family: var(--font-display); font-size: 1.45rem; color: var(--ink); }
.word-card .label { font-size: 0.78rem; font-style: italic; color: var(--ink-3); }
.word-card-def {
  color: var(--ink-2); font-size: 0.93rem; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.other-letters { margin-top: 28px; }
.other-letters summary { cursor: pointer; list-style: none; margin-bottom: 12px; }
.other-letters summary::-webkit-details-marker { display: none; }
.other-letters summary::after { content: " +"; }
.other-letters[open] summary::after { content: " −"; }

/* ---- grammatical forms, one line each ---------------------------------- */
.forms { border-top: 1px solid var(--border); padding: 6px 0; }
.forms .entry.form-entry {
  display: grid; grid-template-columns: minmax(7rem, 14rem) 1fr; gap: 2px 18px; align-items: baseline;
  padding: 7px 0; border-top: 0;
}
.form-entry .hw { font-size: 1.12rem; margin: 0; overflow-wrap: anywhere; }
.form-of { color: var(--ink-3); font-size: 0.92rem; }
.form-of summary { cursor: pointer; list-style: none; }
.form-of summary::-webkit-details-marker { display: none; }
.form-of summary .label { font-style: italic; font-size: 0.82rem; }
.form-of summary a { color: var(--ink-2); border-bottom: 1px solid var(--border); }
.form-of summary a:hover { color: var(--ink); border-color: var(--ink); }
.form-of .arrow { color: var(--ink-4); }
.form-of ol { margin: 6px 0 2px; padding-left: 1.1rem; font-size: 0.88rem; color: var(--ink-3); }
.form-of ol:not(:has(li + li)) { list-style: none; padding-left: 0; }
.forms .entry.form-entry:target { padding-left: 12px; }
@media (max-width: 560px) {
  .forms .entry.form-entry { grid-template-columns: 1fr; }
}

/* ---- "+N" more synonyms ------------------------------------------------ */
.more { display: contents; }
.more summary {
  cursor: pointer; list-style: none; padding: 0 8px; border-radius: var(--r-pill);
  border: 1px solid var(--border); font-size: 0.8rem; color: var(--ink-3); line-height: 1.6;
}
.more summary::-webkit-details-marker { display: none; }
.more[open] summary { display: none; }
@media (prefers-reduced-motion: reduce) {
  .word-card, .search-field { transition: none; }
  .word-card:hover { transform: none; }
}
`;
