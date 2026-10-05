/// <reference lib="dom" />
// The one test under scripts/ that needs a page: it runs chrome.js over published ones.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_LOCALES } from '@kurda/shared';
import { CHROME_KEYS, chromeScript, chromeTable } from './ferheng-chrome';
import { COPY, PAGE_TEXT } from './ferheng-copy';
import { indexPage, letterPage, notFoundPage, wordsPage, type Word } from './ferheng-pages';

const word: Word = {
  headword: 'av',
  key: 'av',
  senses: [{ pos: 'Navdêr', definition: 'water' }],
  synonyms: ['ava'],
  sorani: ['ئاو'],
  arabic: ['ماء'],
};

type Published = 'ku' | 'en';
const pages = {
  words: (c: Published) => wordsPage({ prefix: 'a', words: [word] }, null, null, new Map(), COPY[c]),
  letter: (c: Published) => letterPage('a', [{ prefix: 'a', words: [word] }], 1234, COPY[c]),
  index: (c: Published) => indexPage([{ letter: 'a', words: 1 }], 409435, 3611, [word], new Map(), COPY[c]),
  notFound: (c: Published) => notFoundPage(COPY[c]),
};

/** A published page, loaded as the browser would load it, then chrome.js run over it. */
function open(html: string, stored: string | null, browser = 'en-US'): Document {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.documentElement.innerHTML = parsed.documentElement.innerHTML;
  document.documentElement.lang = parsed.documentElement.lang;
  localStorage.clear();
  if (stored) localStorage.setItem('hevalo_locale', stored);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(browser);
  new Function(chromeScript())();
  return document;
}

const text = (doc: Document, key: string): string[] =>
  [...doc.querySelectorAll(`[data-copy="${key}"]`)].map((el) => el.textContent ?? '');

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.innerHTML = '';
});

describe('the dictionary bar, in the reader’s language', () => {
  /** The first report: German in the app, English in the bar the moment you open the dictionary. */
  it('keeps the bar in the language the app was set to', () => {
    const doc = open(pages.words('en'), 'de');
    expect(new Set(text(doc, 'nav.home'))).toEqual(new Set(['Start'])); // the bar and the footer
    expect(text(doc, 'nav.dictionary')[0]).toBe('Wörterbuch');
    expect(text(doc, 'nav.games')[0]).toBe('Spiele');
    expect(text(doc, 'nav.login')).toEqual(['Anmelden', 'Anmelden', 'Anmelden']);
    expect(doc.querySelector('[data-copy="nav.menu"]')?.getAttribute('aria-label')).toBe('Menü');
    // a screen reader picks its voice from lang, so the words say what they are
    expect(doc.querySelector('[data-copy="nav.home"]')?.getAttribute('lang')).toBe('de');
  });

  it('leaves the glyph beside each nav word where it was', () => {
    const doc = open(pages.words('en'), 'tr');
    const home = doc.querySelector('[data-copy="nav.home"]')!.closest('a')!;
    expect(home.querySelector('svg')).not.toBeNull();
    expect(home.textContent).toBe('Ana sayfa');
  });

  it('touches nothing when the page is already in the reader’s language', () => {
    const before = open(pages.words('en'), null).documentElement.innerHTML;
    const doc = open(pages.words('en'), 'en');
    expect(doc.documentElement.innerHTML).toBe(before);
    expect(doc.querySelector('[data-copy="nav.home"]')?.hasAttribute('lang')).toBe(false);
  });

  /** The same order as the app's own `resolveLocale`: a choice, then the browser, then English. */
  it('falls back to the browser’s language when nothing was chosen, as the app does', () => {
    expect(text(open(pages.words('en'), null, 'fr-FR'), 'nav.games')[0]).toBe('Jeux');
    expect(text(open(pages.words('ku'), null, 'xx'), 'nav.games')[0]).toBe('Games');
  });

  it('turns an English page Kurmancî for a Kurmancî reader, and the other way round', () => {
    expect(text(open(pages.words('en'), 'ku'), 'nav.dictionary')[0]).toBe('Ferheng');
    expect(text(open(pages.words('ku'), 'en'), 'nav.dictionary')[0]).toBe('Dictionary');
  });

  it('sets right-to-left words right to left', () => {
    const doc = open(pages.words('en'), 'ar');
    const home = doc.querySelector('[data-copy="nav.home"]')!;
    expect(home.getAttribute('dir')).toBe('rtl');
    expect(home.textContent).not.toBe('Home');
  });

  /** As the app's bar: the same shape in every language — only the footer follows the reader's direction. */
  it('never mirrors the bar, even for a right-to-left reader', () => {
    for (const locale of ['ar', 'ckb']) {
      const doc = open(pages.words('en'), locale);
      const bar = doc.querySelector('header.nav')!;
      expect(bar.getAttribute('dir')).not.toBe('rtl');
      expect(bar.querySelector('.brand')?.compareDocumentPosition(bar.querySelector('.nav-actions')!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(doc.querySelector('footer.footer')?.getAttribute('dir')).toBe('rtl');
      expect(doc.querySelector('main')?.hasAttribute('dir')).toBe(false);
    }
  });

  it('ignores a stored value that is not one of the app’s languages', () => {
    expect(text(open(pages.words('en'), 'klingon', 'de-DE'), 'nav.games')[0]).toBe('Spiele');
  });

  /** `dir` on a block would flip its alignment too; on an inline element it only orders the letters. */
  it('only ever relabels an inline element, so a right-to-left word cannot move the layout', () => {
    for (const page of Object.values(pages)) {
      const doc = open(page('en'), 'ckb');
      const marked = [...doc.querySelectorAll('[data-copy]:not([data-copy-attr]):not(title), [data-copy-pos]')];
      expect(marked.length).toBeGreaterThan(15);
      for (const el of marked) expect(el.tagName, el.outerHTML.slice(0, 120)).toBe('SPAN');
    }
  });
});

/**
 * The second report: the bar followed the reader, and the page under it still
 * turned English. Everything that is ours rather than the corpus's follows now.
 */
describe('the dictionary page, in the reader’s language', () => {
  it('turns the front page’s words', () => {
    const doc = open(pages.index('en'), 'de');
    expect(text(doc, 'page.index.eyebrow')).toEqual(['Kurdisches Wörterbuch']);
    expect(text(doc, 'page.index.lead')[0]).toMatch(/^Bedeutungen/);
    expect(text(doc, 'page.index.statWords')).toEqual(['Wörter']);
    expect(text(doc, 'page.index.selected')).toEqual(['Ausgewählte Wörter']);
    expect(text(doc, 'page.alphabets.hawar')).toEqual(['Hawar-Alphabet']);
    expect(doc.title).toBe('Kurdisches Wörterbuch — Hevalo');
  });

  /** The headline is two lines, and the break is drawn with an element, not by parsing markup. */
  it('keeps the headline on two lines without writing any markup', () => {
    const h = open(pages.index('en'), 'fr').querySelector('[data-copy="page.index.headline"]')!;
    expect(h.querySelectorAll('br')).toHaveLength(1);
    expect(h.textContent).toBe('Chaque mot kurmandji,au même endroit.');
    expect(chromeScript()).not.toContain('<br>');
  });

  it('fills counts with the page’s own numbers', () => {
    expect(text(open(pages.letter('en'), 'nl'), 'page.letter.count')).toEqual(['1 van 1,234 woorden']);
    expect(text(open(pages.words('en'), 'es'), 'page.words.count')).toEqual(['1 palabras']);
    expect(text(open(pages.words('en'), 'tr'), 'page.words.all')).toEqual(['A harfinin tümü']);
    expect(open(pages.letter('en'), 'de').title).toBe('Kurdische Wörter, die mit A beginnen · Kurdisches Wörterbuch');
  });

  it('turns an entry’s labels — the part of speech and the rows — and leaves the Kurdish alone', () => {
    const doc = open(pages.words('en'), 'de');
    expect(doc.querySelector('[data-copy-pos]')?.textContent).toBe('Substantiv');
    expect(text(doc, 'page.rows.sorani')).toEqual(['Sorani']);
    expect(text(doc, 'page.rows.arabic')).toEqual(['Arabisch']);
    expect(text(doc, 'page.rows.synonyms')).toEqual(['Synonyme']);
    expect(doc.querySelector('.hw')?.textContent).toBe('av');
    // the definitions are the corpus's, and exist in English and Kurmancî only
    expect(doc.querySelector('[itemprop="description"]')?.textContent).toBe('water');
  });

  it('gives a Kurmancî reader the corpus’s own part-of-speech words', () => {
    expect(open(pages.words('en'), 'ku').querySelector('[data-copy-pos]')?.textContent).toBe('Navdêr');
  });

  it('turns the trail, and keeps the licence’s two links as the same two links', () => {
    const doc = open(pages.words('en'), 'ar');
    expect(text(doc, 'page.root')).toEqual(['القاموس']);
    const licence = doc.querySelector('[data-copy="page.licence"]')!;
    expect(licence.textContent).toBe('الكلمات من Wîkîferheng، بترخيص CC BY-SA 4.0.');
    expect([...licence.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      'https://ku.wiktionary.org/',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    ]);
  });

  it('turns the page for an address that is not there', () => {
    const doc = open(pages.notFound('ku'), 'en');
    expect(text(doc, 'page.notFound.heading')).toEqual(['This page was not found.']);
    expect(text(doc, 'page.notFound.action')).toEqual(['Go to the dictionary']);
    expect(text(doc, 'page.notFound.here')).toEqual(['Not found']);
    expect(doc.title).toBe('This page was not found · Kurdish dictionary');
  });

  /** Run twice — once after the bar, once when the page has parsed — and it must not stack up. */
  it('can run again over a page it already turned', () => {
    const doc = open(pages.words('en'), 'de');
    new Function(chromeScript())();
    expect(text(doc, 'page.words.all')).toEqual(['Alle mit A']);
    expect(doc.querySelector('[data-copy="page.licence"]')?.querySelectorAll('a')).toHaveLength(2);
  });
});

describe('what chrome.js is allowed to be', () => {
  it('has a word for every label in every language the app speaks', () => {
    const table = chromeTable();
    for (const { code } of APP_LOCALES) {
      for (const key of CHROME_KEYS) expect(table[code].words[key], `${code} ${key}`).toMatch(/\S/);
    }
  });

  /** Every part of speech English names, every other language names too — Kurmancî is the corpus's own. */
  it('names every part of speech in every language', () => {
    const labels = Object.keys(PAGE_TEXT.en.pos);
    for (const { code } of APP_LOCALES) {
      if (code === 'ku') continue;
      expect(Object.keys(PAGE_TEXT[code].pos).sort(), code).toEqual([...labels].sort());
    }
  });

  /** The published Kurmancî and English are read, not copied, so the files and the swap say the same thing. */
  it('swaps in exactly what the published pages already say', () => {
    for (const locale of ['ku', 'en'] as const) {
      const table = chromeTable()[locale].words;
      expect(table['page.index.lead']).toBe(COPY[locale].index.lead);
      expect(table['page.letter.count'].replace('{words}', '7').replace('{total}', '9')).toBe(COPY[locale].letter.count('7', '9'));
      expect(table['page.title.letter'].replace('{letter}', 'B')).toBe(`${COPY[locale].letter.title('B')} · ${COPY[locale].titleSuffix}`);
    }
  });

  /** The promise the policy relies on: it relabels, and that is all it can do. */
  it('writes text and moves its own links — no markup, no requests, no storage writes', () => {
    const js = chromeScript();
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(/);
    expect(js).not.toMatch(/eval\(|new Function|setItem/);
  });

  /**
   * `'self'` and nothing more: no inline script, no other host, still no
   * connections. Not a full URL, which names a host — that was refused on
   * every preview deployment and left the page English exactly where the fix
   * was being checked.
   */
  it('is allowed by the dictionary’s policy, and nothing else is', () => {
    const headers = readFileSync(resolve(__dirname, '../public/_headers'), 'utf8');
    expect(headers).toMatch(/X-Content-Type-Options: nosniff/);
    for (const base of ['ferheng', 'dictionary']) {
      const block = headers.split(`\n/${base}/*\n`)[1]!.split('\n\n')[0]!;
      const csp = /Content-Security-Policy: (.+)/.exec(block)![1]!;
      expect(csp).toMatch(/script-src 'self';/);
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toContain('connect-src');
      expect(csp).not.toContain('https://');
    }
  });
});
