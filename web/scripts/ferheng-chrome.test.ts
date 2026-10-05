/// <reference lib="dom" />
// The one test under scripts/ that needs a page: it runs chrome.js over a published one.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_LOCALES } from '@kurda/shared';
import { CHROME_KEYS, chromeScript, chromeTable } from './ferheng-chrome';
import { COPY } from './ferheng-copy';
import { wordsPage, type Word } from './ferheng-pages';

const word: Word = { headword: 'av', key: 'av', senses: [{ pos: 'Navdêr', definition: 'water' }], synonyms: [], sorani: [], arabic: [] };

/** A published page, loaded as the browser would load it, then chrome.js run over it. */
function open(locale: 'ku' | 'en', stored: string | null, browser = 'en-US'): Document {
  const html = wordsPage({ prefix: 'a', words: [word] }, null, null, new Map(), COPY[locale]);
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, 'text/html').documentElement.innerHTML;
  document.documentElement.lang = COPY[locale].htmlLang;
  localStorage.clear();
  if (stored) localStorage.setItem('hevalo_locale', stored);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(browser);
  new Function(chromeScript())();
  return document;
}

const label = (doc: Document, key: string): string[] =>
  [...doc.querySelectorAll(`[data-copy="${key}"]`)].map((el) => el.textContent ?? '');

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.innerHTML = '';
});

describe('the dictionary bar, in the reader’s language', () => {
  /** The reported bug: German in the app, English in the bar the moment you open the dictionary. */
  it('keeps the bar in the language the app was set to', () => {
    const doc = open('en', 'de');
    expect(new Set(label(doc, 'nav.home'))).toEqual(new Set(['Start'])); // the bar and the footer
    expect(label(doc, 'nav.dictionary')[0]).toBe('Wörterbuch');
    expect(label(doc, 'nav.games')[0]).toBe('Spiele');
    expect(label(doc, 'nav.login')).toEqual(['Anmelden', 'Anmelden', 'Anmelden']);
    expect(doc.querySelector('[data-copy="nav.menu"]')?.getAttribute('aria-label')).toBe('Menü');
    // a screen reader picks its voice from lang, so the words say what they are
    expect(doc.querySelector('[data-copy="nav.home"]')?.getAttribute('lang')).toBe('de');
  });

  it('leaves the glyph beside each nav word where it was', () => {
    const doc = open('en', 'tr');
    const home = doc.querySelector('[data-copy="nav.home"]')!.closest('a')!;
    expect(home.querySelector('svg')).not.toBeNull();
    expect(home.textContent).toBe('Ana sayfa');
  });

  it('touches nothing when the page is already in the reader’s language', () => {
    const before = open('en', null).documentElement.innerHTML;
    const doc = open('en', 'en');
    expect(doc.documentElement.innerHTML).toBe(before);
    expect(doc.querySelector('[data-copy="nav.home"]')?.hasAttribute('lang')).toBe(false);
  });

  /** The same order as the app's own `resolveLocale`: a choice, then the browser, then English. */
  it('falls back to the browser’s language when nothing was chosen, as the app does', () => {
    expect(label(open('en', null, 'fr-FR'), 'nav.games')[0]).toBe('Jeux');
    expect(label(open('ku', null, 'xx'), 'nav.games')[0]).toBe('Games');
  });

  it('turns an English bar Kurmancî for a Kurmancî reader, and the other way round', () => {
    expect(label(open('en', 'ku'), 'nav.dictionary')[0]).toBe('Ferheng');
    expect(label(open('ku', 'en'), 'nav.dictionary')[0]).toBe('Dictionary');
  });

  it('sets right-to-left words right to left', () => {
    const doc = open('en', 'ar');
    const home = doc.querySelector('[data-copy="nav.home"]')!;
    expect(home.getAttribute('dir')).toBe('rtl');
    expect(home.textContent).not.toBe('Home');
  });

  it('ignores a stored value that is not one of the app’s languages', () => {
    expect(label(open('en', 'klingon', 'de-DE'), 'nav.games')[0]).toBe('Spiele');
  });

  /** `dir` on a block would flip its alignment too; on an inline span it only orders the letters. */
  it('only ever relabels an inline span, so a right-to-left word cannot move the layout', () => {
    const doc = open('en', 'ckb');
    const marked = [...doc.querySelectorAll('[data-copy]:not([data-copy-attr])')];
    expect(marked.length).toBeGreaterThan(15);
    for (const el of marked) expect(el.tagName, el.outerHTML).toBe('SPAN');
  });

  it('relabels the footer as well as the bar', () => {
    const doc = open('en', 'nl');
    expect(label(doc, 'footer.join')[0]).toBe(chromeTable().nl['footer.join']);
    expect(label(doc, 'footer.byZagrosian')[0]).toBe(chromeTable().nl['footer.byZagrosian']);
  });
});

describe('what chrome.js is allowed to be', () => {
  it('has a word for every label in every language the app speaks', () => {
    const table = chromeTable();
    for (const { code } of APP_LOCALES) {
      for (const key of CHROME_KEYS) expect(table[code][key], `${code} ${key}`).toMatch(/\S/);
    }
  });

  /** The promise the policy relies on: it relabels, and that is all it can do. */
  it('writes text and attributes only — no markup, no requests, no storage writes', () => {
    const js = chromeScript();
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(/);
    expect(js).not.toMatch(/eval\(|new Function|setItem/);
  });

  /** Named by full URL, one file per set — never `'self'`, which would let any script on the origin run. */
  it('is the only script the dictionary’s policy allows', () => {
    const headers = readFileSync(resolve(__dirname, '../public/_headers'), 'utf8');
    for (const base of ['ferheng', 'dictionary']) {
      const block = headers.split(`\n/${base}/*\n`)[1]!.split('\n\n')[0]!;
      const csp = /Content-Security-Policy: (.+)/.exec(block)![1]!;
      expect(csp).toContain(`script-src https://hevalo.app/${base}/chrome.js;`);
      expect(csp).not.toMatch(/script-src[^;]*'self'/);
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toContain('connect-src');
    }
  });
});
