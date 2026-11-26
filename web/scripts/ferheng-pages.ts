/**
 * Renders the public dictionary pages: the pure half of the build script, strings in and strings out (no network,
 * filesystem or clock), so it, and above all its escaping, can be tested without fetching the corpus.
 *
 * The pages look like the app (its tokens, nav and footer; see `STYLE`). The front page opens with real entries, the
 * A–Z is set as a thumb index, and a letter's ranges are named by their first and last words.
 */
import { PROVIDER, foldLetter, letterKey } from '@kurda/shared';
import { escapeHtml as escape } from './escape.js';
import { ZAGROSIAN_MARK, ZAGROSIAN_URL, ZAGROSIAN_VIEWBOX } from '../src/brand/zagrosian.js';
import { alphabetOf, compareKeys } from './ferheng-alphabet.js';
import { COPY, type Copy } from './ferheng-copy.js';
import { CHROME_FILE, copyHook, type ChromeKey, type PageKey } from './ferheng-chrome.js';
import { formOf, isInflected, type Entry } from './ferheng-entries.js';

export const ORIGIN = 'https://hevalo.app';

/**
 * How many words a page holds before it splits on another letter: about 35 KB, light enough on a slow phone, and the
 * dictionary stays near 3,000 files against a 20,000-file deployment limit.
 */
export const WORDS_PER_PAGE = 150;

/** An entry plus where this build files it: `key` is the folded sort form and anchor, decided here, not in the source. */
export interface Word extends Entry {
  /** What it is grouped and sorted by: letters only, diacritics folded. */
  key: string;
}

export interface Page {
  /** The address: /ferheng/<prefix>/. */
  prefix: string;
  words: Word[];
}

/**
 * The prefix tree flattened into pages. Splitting alone made 17,652 pages from 391,757 words (every rare prefix under a
 * big letter became a tiny page), so after a split the children are merged back in order while they fit, named for their
 * range (`aa-ac`): about 2,600 pages. A run sharing the whole key is kept whole and oversized, since splitting it would
 * leave a page without an address.
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
 * What a word is filed under: its own letters in their own alphabet. `letterKey`, not `dictionaryKey`, because Ş is a
 * letter, not a decorated S; folding diacritics left five Kurmancî letters without a section. Only one letter written two
 * ways is folded (`ك`/`ک`, `ي`/`ی`, `ه`/`ھ`), after NFKC turns presentation forms into ordinary ones. Tatweel (U+0640) is
 * dropped, since it is a stretch, not a sound. Returns '' for a headword of stretches only, which the caller skips.
 */
export function pageKey(headword: string): string {
  return (
    letterKey(headword.normalize('NFKC'))
      .replace(/\p{Lm}/gu, '')
      // ك and ک are one letter in Kurdish, as are ي and ی, ه and ھ.
      .replace(/./gu, (ch) => foldLetter(ch))
  );
}

/** Adjacent pages joined while they fit, named for the range they cover. */
function coalesce(parts: Page[]): Page[] {
  const merged: Page[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    /*
     * A page never spans two letters, however much room is left: merging by size alone filed a page like `چە-ح` under چ
     * and left ح, and twelve other letters, without a section.
     */
    const sameLetter = last !== undefined && letterOf(last.prefix) === part.prefix.slice(0, 1);
    if (last && sameLetter && last.words.length + part.words.length <= WORDS_PER_PAGE) {
      /*
       * Either side may already be a range, since merging happens at every depth, so take the low end of one and the
       * high end of the other, or a page is named `a-ab-abb`.
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

/** What a page spans, in words rather than folded prefixes. */
function span(page: Page): string {
  const first = page.words[0]!.headword;
  const last = page.words[page.words.length - 1]!.headword;
  return first === last ? first : `${first} – ${last}`;
}

/** Whether a string is Arabic script, per value: `sorani_equivalents` mixes scripts, and marking Latin rtl reverses its punctuation. */
function isArabic(s: string): boolean {
  return /\p{Script=Arabic}/u.test(s);
}

/** `dir` and `lang` for a value whose script is known only once read. */
function scriptAttrs(value: string, lang: string): string {
  return ` lang="${lang}"${isArabic(value) ? ' dir="rtl"' : ''}`;
}

/**
 * One step of a breadcrumb trail, drawn as `BreadcrumbList` microdata (attributes, not JSON-LD, since these pages allow no
 * inline script); `copy` when its name is a word chrome.js may relabel.
 */
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
 * The app nav's four glyphs (Phosphor House, BookOpenText, PuzzlePiece, Trophy at the app's weight) as inline SVG, since
 * `default-src 'none'` allows nothing to be fetched; repeated on every page, it compresses to nothing.
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
 * The app's footer in Kurmancî, matching web/src/components/Footer.tsx section for section, plus the dictionary's licence
 * line. Strings come from web/src/i18n/ku.ts, since these pages are `lang="ku"`; the motto is never translated. The year
 * is the build's.
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
<a href="/app/learn">${labelled('learn.title', c.footer.lessons)}</a>
${/* the app's footer has it under Company, beside About and the FAQ */ ''}
<a href="/how-hevalo-teaches">${labelled('footer.teach', c.footer.teach)}</a>
<a href="/app">${labelled('nav.home', c.nav.home)}</a>
<a href="/app/games">${labelled('nav.games', c.nav.games)}</a>
<a href="/${c.base}/">${labelled('nav.dictionary', c.nav.dictionary)}</a>
</div>
<div class="footer-col">
<h4>${labelled('nav.community', c.footer.community)}</h4>
<a href="/app/rankings">${labelled('nav.rankings', c.nav.rankings)}</a>
<a href="/register">${labelled('footer.join', c.footer.join)}</a>
<a href="/login">${labelled('nav.login', c.nav.login)}</a>
</div>
<div class="footer-col">
<h4>${labelled('footer.app', c.footer.app)}</h4>
${/* plain text until there is a listing, as in the app's Footer.tsx */ ''}
<span class="footer-soon">${labelled('footer.iosSoon', c.footer.ios)}</span>
<span class="footer-soon">${labelled('footer.androidSoon', c.footer.android)}</span>
</div>
</div>
<div class="footer-bottom">
<span class="footer-bottom-left"><span>© ${new Date().getFullYear()} Hevalo</span><span class="muted">${licence}</span><a class="footer-imprint" href="/about#provider">${escape(`${PROVIDER.legalName} · KvK ${PROVIDER.kvk}`)}</a></span>
${/* the imprint, drawn exactly as the app draws it — see ZagrosianCredit.tsx */ ''}
<a class="by-zagrosian" href="${ZAGROSIAN_URL}" target="_blank" rel="noreferrer noopener">${labelled('footer.byZagrosian', c.footer.byZagrosian)}<svg class="by-zagrosian-mark" viewBox="${ZAGROSIAN_VIEWBOX}" fill="currentColor" focusable="false" aria-hidden="true"><path fill-rule="evenodd" d="${ZAGROSIAN_MARK}"></path></svg></a>
</div>
</div>
</footer>`;
}

/**
 * A bar or footer word chrome.js may translate, always in its own span: chrome.js sets `dir` on what it relabels, and on
 * a block that would also flip its alignment.
 */
function labelled(key: ChromeKey, text: string, vars?: Record<string, string | number>): string {
  return `<span${copyHook(key, undefined, vars)}>${escape(text)}</span>`;
}

/** One nav entry, glyph then word, the word in its own span (see `labelled`) so chrome.js can relabel it alone. */
function navLink(key: string, href: string, label: string, copy: ChromeKey, current = false): string {
  return (
    `<a class="nav-link${current ? ' active' : ''}" href="${escape(href)}"${current ? ' aria-current="page"' : ''}>` +
    `<svg class="nav-link-icon" viewBox="0 0 256 256" width="18" height="18" fill="currentColor" aria-hidden="true">` +
    `<path d="${NAV_ICONS[key]!}"></path></svg>` +
    `${labelled(copy, label)}</a>`
  );
}

/**
 * This page in each published language, for search engines. Page for page, since both sets page identically
 * (`/ferheng/ab/` and `/dictionary/ab/`); naming the front pages from every page contradicted the canonicals. `x-default`
 * is English, as `ferhengLocaleFor` picks.
 */
function alternates(canonical: string, c: Copy): string {
  const rest = canonical.slice(`${ORIGIN}/${c.base}/`.length);
  const at = (base: string): string => escape(`${ORIGIN}/${base}/${rest}`);
  return (
    `<link rel="alternate" hreflang="ku" href="${at(COPY.ku.base)}">\n` +
    `<link rel="alternate" hreflang="en" href="${at(COPY.en.base)}">\n` +
    `<link rel="alternate" hreflang="x-default" href="${at(COPY.en.base)}">`
  );
}

/** The shell every page shares: nothing fetched off this origin, and one script, chrome.js, which only relabels (ferheng-chrome.ts). */
export function document_(opts: {
  title: string;
  description: string;
  canonical: string;
  body: string;
  /** Which chrome.js title template this title is, and what fills it. */
  titleCopy?: { key: PageKey; vars?: Record<string, string | number> };
  /** The steps above this page; the page itself is added last. */
  breadcrumb?: Crumb[];
  /** What the trail calls this page, when not the title. */
  here?: string;
  /** The template for `here`, when it is our word rather than the corpus's. */
  hereCopy?: PageKey;
  /** Which published language this page is in. */
  copy: Copy;
  /** The 404: `noindex`, with no canonical or alternates. */
  missing?: boolean;
}): string {
  const c = opts.copy;
  return `<!doctype html>
<html lang="${c.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title${opts.titleCopy ? copyHook(opts.titleCopy.key, undefined, opts.titleCopy.vars) : ''}>${escape(opts.title)}</title>
<meta name="description" content="${escape(opts.description)}">
${opts.missing ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${escape(opts.canonical)}">`}
<link rel="icon" href="/favicon.png" type="image/png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hevalo">
<meta property="og:url" content="${escape(opts.canonical)}">
<meta property="og:title" content="${escape(opts.title)}">
<meta property="og:description" content="${escape(opts.description)}">
<link rel="stylesheet" href="/${c.base}/ferheng.css">
${opts.missing ? '' : alternates(opts.canonical, c)}
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
 * Senses grouped by part of speech and numbered within each, as a dictionary prints them. Labels are the source's own
 * Kurdish ("Navdêr", "Lêker"); inflected forms, half the corpus, get a class and are set back. Regrouped here because a
 * page entry can merge two writings of one key (`Kurd` and `kurd`), whose senses arrive concatenated.
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
 * The same word in the other Kurdish and in Arabic, the row most asked for, since the two Kurdish scripts are often
 * unreadable to each other's readers. Only Soranî is marked `alternateName`; the Arabic is a translation.
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

/** Synonyms from the source's own field, as links; one whose page does not exist is printed unlinked. */
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
  // Some words list forty; eight are enough to read, the rest wait behind a tap.
  const shown = words.slice(0, SYNONYMS_SHOWN).map(link).join(sep);
  const rest = words.slice(SYNONYMS_SHOWN);
  const more = rest.length
    ? `<details class="more"><summary>+${rest.length}</summary>${sep}${rest.map(link).join(sep)}</details>`
    : '';
  return `<p class="row"><span class="label"${copyHook('page.rows.synonyms')}>${escape(copy.rows.synonyms)}</span><span class="vals">${shown}${more}</span></p>`;
}

/** How many synonyms an entry shows before "+N". */
const SYNONYMS_SHOWN = 8;

/**
 * A word that is only a grammatical form of another, with nothing else to say (over half the corpus). Shown as one line,
 * the kind of form, an arrow and the base word as a link, with the grammar a tap away.
 */
function isFormOnly(w: Word): boolean {
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

/** The search box, hidden until search.js shows it so a script-free browser never sees a dead box; chrome.js translates its words. */
function searchBox(copy: Copy, total: number, id: string, big = false): string {
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
    // The headword links to its own anchor, so one word can be sent on its own.
    `<h2 class="hw" itemprop="name" dir="auto"><a href="#${escape(w.key)}">${escape(w.headword)}</a></h2>` +
    `<div class="body">${senseList(w.senses, copy)}${equivalents(w, copy)}${synonymList(w.synonyms, pageOf, copy)}</div>` +
    `</article>`
  );
}

/**
 * One page of words. `pageOf` maps every key to its page, built once for the whole dictionary, so synonyms can link.
 * `DefinedTermSet` and `DefinedTerm` are microdata attributes rather than JSON-LD, which `script-src 'none'` allows.
 */
export function wordsPage(
  page: Page,
  prev: string | null,
  next: string | null,
  pageOf: Map<string, string> = new Map(),
  copy: Copy = COPY.ku,
  /** Every word in the dictionary, for the search box's placeholder. */
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

/** One letter's pages, each row named by its first and last words, like a printed running head. */
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
 * Entries to open the dictionary with: words in their own right (not inflections) with a sentence of definition and at
 * least one Soranî or Arabic form or cross-reference, so a full entry's shape shows. One per letter, in order, so the
 * choice is spread across the alphabet and stable between builds.
 */
export function featured(words: Word[], count: number): Word[] {
  /** 0 disqualifies; above that, how much of a full entry the word shows. */
  const score = (w: Word): number => {
    // A single character is a letter of the alphabet, not a word, though the corpus glosses them.
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
    // Ties go to the earlier word, so the choice does not depend on iteration order.
    if (!at || n > at.score) best.set(letter, { word, score: n });
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || compareKeys(a.word.key, b.word.key))
    .slice(0, count)
    .map((x) => x.word)
    .sort((a, b) => compareKeys(a.key, b.key));
}

/**
 * The page for a dictionary address with nothing behind it. It must be a file here, not the app's not-found screen:
 * Cloudflare answers unmatched paths with the app shell, but `_headers` applies this directory's `default-src 'none'` by
 * URL, so the shell's bundle was refused and the page was blank. Re-imports move page ranges, so old range URLs land here
 * and are sent to the letters, which never move.
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
    missing: true,
    body: `<header class="head">
<p class="eyebrow">404</p>
<h1 class="running">${labelled('page.notFound.heading', copy.notFound.heading)}</h1>
</header>
<p class="prose">${labelled('page.notFound.body', copy.notFound.body)}</p>
<nav class="pager"><a class="pill" href="/${copy.base}/">${labelled('page.notFound.action', copy.notFound.action)}</a></nav>`,
  });
}

/**
 * The three blocks of the index: Hawar, Soranî, and letters in neither (`ḧ`, `ẍ`, loanword `ط ص ظ`, a little Cyrillic),
 * shown so they can be found but not claimed for either alphabet. Readers of one alphabet often cannot read the other, so
 * the blocks are named. Membership is in ferheng-alphabet.ts.
 */
const ALPHABETS = ['hawar', 'sorani', 'other'] as const;

/** What to call the alphabet a letter is in. */
export function alphabetName(letter: string, copy: Copy = COPY.ku): string {
  return copy.alphabets[alphabetOf(letter)];
}

/** The front page: what this is, a few words of it, and the A–Z as a printed thumb index with counts. */
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
    // Letters in neither alphabet have a handful of words each: findable, but not a third block to read past.
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

/** A front-page word card: the word, its kind and first meaning; the full entry is a tap away. */
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
 * The stylesheet: web/src/styles/tokens.css, base.css and layout.css's nav and footer, value for value, then the
 * dictionary's own rules. Copied rather than imported because these pages load no bundle, so keep it in step with the
 * app; a reader should not be able to tell they left it.
 */
export const STYLE = `
/* ======================================================================== *
 * Copied from the app, value for value: tokens.css, base.css and layout.css's nav and footer. Keep it in step.
 * ======================================================================== */

/* ---- tokens.css -------------------------------------------------------- */
:root {
  color-scheme: dark;
  --app-bg: #131c20;
  --ink: #eef3f5;
  --ink-2: #d3dde1;
  --ink-3: #a3b2b9;
  --ink-4: #8b9da6;
  --bg: #1a262b;
  --surface: #1a262b;
  --surface-2: rgba(156, 190, 204, 0.1);
  --border: rgba(238, 243, 245, 0.12);
  --border-strong: rgba(238, 243, 245, 0.24);
  /* the one accent by night, as the app draws it */
  --accent: #32d46b;
  --accent-hover: #4be07f;
  --accent-lip: #019a46;
  --accent-ink: #0a2a17;
  --accent-text: #32d46b;
  --primary: #eef3f5;
  --primary-hover: #ffffff;
  --primary-ink: #131c20;
  --gold: #f2b632;
  --gold-ink: #f5c85a;
  --focus: #32d46b;
  --glass-blur: 20px;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --r-xs: 6px;
  --r-sm: 8px;
  --r-md: 12px;
  --r-lg: 16px;
  --r-pill: 999px;
  --shadow-sm: 0 2px 10px rgba(0, 0, 0, 0.3);
  --shadow: 0 10px 34px rgba(0, 0, 0, 0.4);
  --container: 1120px;
  --nav-h: 64px;
  --text-title: 1.75rem;
  --text: 1rem;
}

/* ---- base.css ---------------------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
/* Clip, not hidden: hidden makes a scroll container, which breaks the sticky nav. */
html, body { overflow-x: clip; max-width: 100%; }
body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text);
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
/* The app sets every heading in its one face. */
h1, h2, h3, h4 {
  font-family: var(--font-sans);
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
  font-size: var(--text);
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.kurdish { font-family: var(--font-sans); font-style: italic; color: var(--ink-2); }
.display { font-size: var(--text-title); letter-spacing: -0.022em; }
.h-section { font-size: var(--text-title); }
.lead { font-size: var(--text); line-height: 1.6; color: var(--ink-2); }

/* ---- layout.css: the nav ----------------------------------------------- */
/* The bar may be wider than the page: 1440px against the content column's 1120px. */
@media (min-width: 1180px) {
  .nav .container.nav-inner { max-width: 1440px; }
}
.nav {
  position: sticky; top: 0; z-index: 40; height: var(--nav-h);
  background: rgba(11, 13, 16, 0.78);
  -webkit-backdrop-filter: saturate(1.2) blur(20px);
  backdrop-filter: saturate(1.2) blur(20px);
  border-bottom: 1px solid var(--border);
}
.nav-inner { height: 100%; display: flex; align-items: center; gap: 28px; }
.brand {
  display: inline-flex; align-items: center; gap: 9px; flex: none;
  font-family: var(--font-sans); font-size: var(--text); font-weight: 600;
  letter-spacing: -0.01em; color: var(--ink);
}
.brand-mark { flex: none; width: 30px; height: 30px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); }
.nav-links { display: flex; align-items: center; gap: 4px; }
.nav-link {
  display: inline-flex; align-items: center; height: 40px; padding: 0 14px;
  border-radius: var(--r-pill); font-size: var(--text); font-weight: 600;
  color: var(--ink-3); transition: color 0.15s ease, background 0.15s ease;
}
.nav-link:hover { color: var(--ink); background: var(--surface-2); }
.nav-link.active { color: var(--ink); background: var(--surface-2); }
.nav-link-icon { flex: none; margin-inline-end: 8px; color: inherit; }
.nav-spacer { flex: 1; }
.nav-actions { display: flex; align-items: center; gap: 14px; }
/* ui.css's .btn and .btn-sm folded together: the bar's two buttons are the app's. */
.btn-sm {
  display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 14px;
  border: 1px solid transparent; border-radius: var(--r-pill);
  font-size: var(--text); font-weight: 600; line-height: 1; white-space: nowrap;
  background: var(--primary); color: var(--primary-ink);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.btn-sm:hover { background: var(--primary-hover); }
.btn-ghost { background: transparent; color: var(--ink-2); }
.btn-ghost:hover { background: var(--surface-2); color: var(--ink); }
/*
 * The menu toggle is a checkbox and a label, since these pages run no app code: the panel reads ":checked ~". Same
 * breakpoint, panel and behaviour as the app. The checkbox is moved off-screen rather than hidden, so it stays in the tab
 * order; the focus ring is drawn on the label.
 */
.nav-toggle-state { position: absolute; width: 1px; height: 1px; opacity: 0; margin: 0; }
.nav-toggle {
  display: none; width: 40px; height: 40px; flex: none;
  border: 1px solid var(--border-strong); border-radius: var(--r-sm);
  background: var(--bg); color: var(--ink);
  align-items: center; justify-content: center; cursor: pointer;
}
.nav-toggle-state:focus-visible ~ .nav-actions .nav-toggle { outline: 2px solid var(--focus); outline-offset: 2px; }
/* The toggle turns into a cross while the menu is open, as the app's does. */
.nav-toggle-close { display: none; }
.nav-toggle-state:checked ~ .nav-actions .nav-toggle-open { display: none; }
.nav-toggle-state:checked ~ .nav-actions .nav-toggle-close { display: block; }
.nav-mobile-actions { display: none; }

/* Between 861 and 1179 the app drops the words and keeps the glyphs. */
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
  .nav-link { height: 44px; font-size: var(--text); }
  /* The app's links sit in list items as wide as their words; these are the panel's own children. */
  .nav-links > .nav-link { align-self: flex-start; }
  .nav-desktop-only { display: none; }
  .nav-mobile-actions {
    display: flex; flex-direction: column; gap: 2px;
    margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--border);
  }
  /* In the menu, Get started is the button it is on the bar. */
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
.footer-brand .muted { margin-top: 12px; font-size: var(--text); }
.footer-brand .kurdish { margin-top: 10px; }
.footer-col h4 { font-family: var(--font-sans); font-size: var(--text); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 12px; font-weight: 600; }
.footer-col a { display: block; color: var(--ink-2); font-size: var(--text); padding: 4px 0; }
.footer-col a:hover { color: var(--ink); }
.footer-soon { display: block; color: var(--ink-3); font-size: var(--text); padding: 4px 0; }
.footer-bottom {
  margin-top: 36px; padding-top: 20px; border-top: 1px solid var(--border);
  display: flex; flex-wrap: wrap; gap: 10px 20px; align-items: center;
  justify-content: space-between; color: var(--ink-3); font-size: var(--text);
}
.footer-bottom-left { display: flex; flex-wrap: wrap; gap: 4px 20px; align-items: center; }
.footer-imprint { color: var(--ink-3); }
.footer-imprint:hover { color: var(--ink); }
@media (pointer: coarse) { .footer-imprint { display: inline-flex; align-items: center; min-height: 44px; } }
/* The maker's imprint at the copyright line's weight, lifting on hover; the mark uses currentColor. */
.by-zagrosian { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-3); white-space: nowrap; transition: color 0.18s ease; }
.by-zagrosian:hover { color: var(--ink); }
.by-zagrosian-mark { height: 17px; width: auto; flex: none; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45)); }

/* ======================================================================== *
 * The dictionary's own rules, below here.
 * ======================================================================== */

main { padding-bottom: 8px; }

.crumbs ol {
  list-style: none; display: flex; flex-wrap: wrap; gap: 8px;
  padding: 0; margin: 20px 0 0; font-size: var(--text); color: var(--ink-4);
}
.crumbs li + li::before { content: "›"; margin-right: 8px; color: var(--ink-4); }
.crumbs a { color: var(--ink-3); }
.crumbs a:hover { color: var(--ink); }

.head { padding: 28px 0 0; }
.running { font-size: var(--text-title); margin: 10px 0; }
.letter { font-size: var(--text-title); line-height: 1; margin: 6px 0 10px; }

/* ---- the front page ---------------------------------------------------- */
.hero { padding: 48px 0 0; }
.hero .eyebrow { margin-bottom: 16px; }
.hero .display { margin-bottom: 18px; }
.hero .lead { max-width: 36rem; }

/* The app landing page's two-column hero, so both front pages share a shape (see pages.css). */
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
.thumb-t { font-family: var(--font-sans); font-size: var(--text-title); line-height: 1; color: var(--ink); }
.thumb-n { font-size: var(--text); color: var(--ink-4); }
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
.range-span { font-family: var(--font-sans); font-size: var(--text); color: var(--ink); }
.range-n { margin-left: auto; font-size: var(--text); color: var(--ink-4); }

/* ---- the entries ------------------------------------------------------- */
.entries { margin-top: 20px; }
.entry { padding: 20px 0; border-top: 1px solid var(--border); scroll-margin-top: calc(var(--nav-h) + 12px); }
.entry:target { background: rgba(238, 243, 245, 0.06); box-shadow: inset 2px 0 0 var(--gold); padding-left: 14px; }
.hw { font-size: var(--text-title); margin: 0 0 10px; }
.hw a:hover { color: var(--gold); }

/* One grid for every labelled row, so parts of speech and the Soranî line up. */
.row { display: grid; grid-template-columns: 7.5rem 1fr; gap: 4px 18px; align-items: baseline; margin: 0 0 8px; }
/* Italic at 0.78rem like the app's .dict-pos, which also keeps "Formeke navdêrê" on one line. */
.row .label { font-size: var(--text); font-style: italic; color: var(--ink-3); text-align: right; line-height: 1.9; }
.sense ol { margin: 0; padding-left: 1.2rem; color: var(--ink-2); }
.sense ol li { margin-bottom: 4px; }
.sense ol li::marker { color: var(--ink-4); font-size: var(--text); }
.sense ol:not(:has(li + li)) { list-style: none; padding-left: 0; }

/* An inflected form is set back, since half the corpus is these. */
.sense.form ol { color: var(--ink-3); font-size: var(--text); }

/* Flex, not inline text: a long synonym row joined by a glyph separator is one unbreakable token, but flex items wrap. */
.vals { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 0.5em; color: var(--ink-2); }
.vals a { border-bottom: 1px solid var(--border); }
.vals a:hover { color: var(--ink); border-color: var(--ink); }
/* The corpus's Soranî and Arabic forms, not the bar, footer or chrome.js's words, which keep the app's type. */
:is([lang="ar"], [dir="rtl"]):not(.nav, .footer, [data-copy], [data-copy-pos]) { font-family: var(--font-sans); font-size: var(--text); }

.pager { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin: 40px 0 0; }
.pager .pill {
  display: inline-flex; align-items: center; height: 36px; padding: 0 16px;
  border: 1px solid var(--border); border-radius: var(--r-pill);
  background: var(--surface); color: var(--ink-2); font-size: var(--text);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.pager.alphabet-link { justify-content: flex-start; margin: 22px 0 0; }
.pager .pill:hover { background: var(--surface-2); border-color: var(--ink-4); color: var(--ink); }

@media (max-width: 40rem) {
  .row { grid-template-columns: 1fr; gap: 2px; }
  .row .label { text-align: left; line-height: 1.6; }
}

/* ======================================================================== *
 * Calmer pages: the search box first, one line per grammatical form, long lists folded.
 * ======================================================================== */
[hidden] { display: none !important; }
/* On a phone the search box comes first, not the deer. */
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
.search--big .search-field { height: 58px; padding: 0 20px; font-size: var(--text); }
.search-field:focus-within { border-color: var(--ink-3); background: var(--surface-2); box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.06); }
.search-field input {
  flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent;
  color: var(--ink); font: inherit; font-size: var(--text);
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
.search-word { flex: none; font-family: var(--font-sans); font-size: var(--text); color: var(--ink); }
.search-gloss { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text); color: var(--ink-3); }
.search-msg { margin: 10px 4px 0; font-size: var(--text); color: var(--ink-3); }
.search-msg a { color: var(--ink-2); border-bottom: 1px solid var(--border); }

/* ---- the front page's words, as cards ---------------------------------- */
.cards { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); }
.word-card {
  display: flex; flex-direction: column; gap: 4px; padding: 16px 18px;
  border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.word-card:hover { background: var(--surface-2); border-color: var(--ink-4); transform: translateY(-1px); }
.word-card-hw { font-family: var(--font-sans); font-size: var(--text); color: var(--ink); }
.word-card .label { font-size: var(--text); font-style: italic; color: var(--ink-3); }
.word-card-def {
  color: var(--ink-2); font-size: var(--text); line-height: 1.5;
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
.form-entry .hw { font-size: var(--text); margin: 0; overflow-wrap: anywhere; }
.form-of { color: var(--ink-3); font-size: var(--text); }
.form-of summary { cursor: pointer; list-style: none; }
.form-of summary::-webkit-details-marker { display: none; }
.form-of summary .label { font-style: italic; font-size: var(--text); }
.form-of summary a { color: var(--ink-2); border-bottom: 1px solid var(--border); }
.form-of summary a:hover { color: var(--ink); border-color: var(--ink); }
.form-of .arrow { color: var(--ink-4); }
.form-of ol { margin: 6px 0 2px; padding-left: 1.1rem; font-size: var(--text); color: var(--ink-3); }
.form-of ol:not(:has(li + li)) { list-style: none; padding-left: 0; }
.forms .entry.form-entry:target { padding-left: 12px; }
@media (max-width: 560px) {
  .forms .entry.form-entry { grid-template-columns: 1fr; }
}

/* ---- "+N" more synonyms ------------------------------------------------ */
.more { display: contents; }
.more summary {
  cursor: pointer; list-style: none; padding: 0 8px; border-radius: var(--r-pill);
  border: 1px solid var(--border); font-size: var(--text); color: var(--ink-3); line-height: 1.6;
}
.more summary::-webkit-details-marker { display: none; }
.more[open] summary { display: none; }
@media (prefers-reduced-motion: reduce) {
  .word-card, .search-field { transition: none; }
  .word-card:hover { transform: none; }
}
`;
