/**
 * The published dictionary's bar, footer and labels in the reader's language. The pages are published in Kurmancî and
 * English only (ferheng-copy.ts), so `/<base>/chrome.js`, generated from the app's catalogues and ferheng-copy.ts, reads
 * the stored `hevalo_locale` (else the browser's language, as `resolveLocale` does) and rewrites only elements marked
 * `data-copy`, building text nodes and `<br>`s so no string can become HTML. Without it the page is unchanged.
 *
 * Its policy is `script-src 'self'`: injected inline script is still refused, every script on this origin is ours
 * (uploads live on another host, and `nosniff` is sent everywhere), and `connect-src` stays `'none'`. It is `'self'`
 * rather than a full URL so preview deployments work too.
 */
import { ar } from '../src/i18n/ar.js';
import { ckb } from '../src/i18n/ckb.js';
import { de } from '../src/i18n/de.js';
import { en, type Catalogue } from '../src/i18n/en.js';
import { es } from '../src/i18n/es.js';
import { fr } from '../src/i18n/fr.js';
import { ku } from '../src/i18n/ku.js';
import { nl } from '../src/i18n/nl.js';
import { tr } from '../src/i18n/tr.js';
import { APP_LOCALES, type AppLocale } from '@kurda/shared';
import { PAGE_TEXT, type PageText } from './ferheng-copy.js';

/** The file's name inside each language's folder. */
export const CHROME_FILE = 'chrome.js';

/** Every bar and footer piece with words in it, by the app key that already says it with the same meaning. */
export const BAR_KEYS = [
  'nav.home',
  'nav.dictionary',
  'nav.games',
  'nav.rankings',
  'nav.login',
  'nav.register',
  'nav.menu',
  'nav.learn',
  'nav.community',
  'learn.title',
  'footer.teach',
  'footer.tagline',
  'footer.join',
  'footer.app',
  'footer.iosSoon',
  'footer.androidSoon',
  'footer.byZagrosian',
] as const;

/**
 * Every piece of the page itself, from ferheng-copy.ts. Function copy becomes a template whose `{n}`, `{letter}` and the
 * rest come from the element's `data-v-*` attributes; `\n` is a line break, and `{wiki}` and `{licence}` are the footer's
 * two links.
 */
export const PAGE_KEYS = [
  'page.alphabets.hawar',
  'page.alphabets.sorani',
  'page.alphabets.other',
  'page.index.eyebrow',
  'page.index.headline',
  'page.index.lead',
  'page.index.selected',
  'page.index.about',
  'page.index.aboutBody',
  'page.index.alphabet',
  'page.search.label',
  'page.search.placeholder',
  'page.search.more',
  'page.search.none',
  'page.search.letter',
  'page.letter.count',
  'page.words.count',
  'page.words.all',
  'page.notFound.heading',
  'page.notFound.body',
  'page.notFound.action',
  'page.notFound.here',
  'page.rows.sorani',
  'page.rows.arabic',
  'page.rows.synonyms',
  'page.root',
  'page.licence',
  'page.title.index',
  'page.title.words',
  'page.title.letter',
  'page.title.notFound',
] as const;

export type BarKey = (typeof BAR_KEYS)[number];
export type PageKey = (typeof PAGE_KEYS)[number];
export type ChromeKey = BarKey | PageKey;

const CATALOGUES: Record<AppLocale, Catalogue> = { ku, ckb, en, nl, de, es, fr, tr, ar };

/**
 * Marks an element the script may relabel: its text by default, or an attribute (`attr`, such as the toggle's
 * `aria-label`). Text hooks go on an inline span holding only the words, since the script sets `dir` on it; the pages use
 * `labelled()` in ferheng-pages.ts. `vars` fill a template's `{name}` holes.
 */
export function copyHook(key: ChromeKey, attr?: 'aria-label' | 'placeholder', vars?: Record<string, string | number>): string {
  const filled = Object.entries(vars ?? {})
    .map(([name, value]) => ` data-v-${name}="${escapeAttr(String(value))}"`)
    .join('');
  return ` data-copy="${key}"${attr ? ` data-copy-attr="${attr}"` : ''}${filled}`;
}

/* The same five characters escape.ts escapes, repeated so this file stays importable on its own. */
function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A published function turned back into the template it fills. */
const hole = (name: string): string => `{${name}}`;

/** One language's page text, as flat templates. */
function pageTemplates(p: PageText): Record<PageKey, string> {
  return {
    'page.alphabets.hawar': p.alphabets.hawar,
    'page.alphabets.sorani': p.alphabets.sorani,
    'page.alphabets.other': p.alphabets.other,
    'page.index.eyebrow': p.index.eyebrow,
    'page.index.headline': p.index.headline.replace(/<br\s*\/?>/g, '\n'),
    'page.index.lead': p.index.lead,
    'page.index.selected': p.index.selected,
    'page.index.about': p.index.about,
    'page.index.aboutBody': p.index.aboutBody,
    'page.index.alphabet': p.index.alphabet,
    'page.search.label': p.search.label,
    'page.search.placeholder': p.search.placeholder(hole('n')),
    'page.search.more': p.search.more,
    'page.search.none': p.search.none,
    'page.search.letter': p.search.letter,
    'page.letter.count': p.letter.count(hole('words'), hole('total')),
    'page.words.count': p.words.count(hole('n') as unknown as number),
    'page.words.all': p.words.all(hole('letter')),
    'page.notFound.heading': p.notFound.heading,
    'page.notFound.body': p.notFound.body,
    'page.notFound.action': p.notFound.action,
    'page.notFound.here': p.notFound.here,
    'page.rows.sorani': p.rows.sorani,
    'page.rows.arabic': p.rows.arabic,
    'page.rows.synonyms': p.rows.synonyms,
    'page.root': p.root,
    'page.licence': p.licence,
    // The four <title> shapes the pages use; see document_() in ferheng-pages.ts.
    'page.title.index': `${p.titleSuffix} — Hevalo`,
    'page.title.words': `${hole('here')} · ${p.titleSuffix}`,
    'page.title.letter': `${p.letter.title(hole('letter'))} · ${p.titleSuffix}`,
    'page.title.notFound': `${p.notFound.title} · ${p.titleSuffix}`,
  };
}

export interface ChromeWords {
  words: Record<ChromeKey, string>;
  /** The corpus's part-of-speech labels in this language; unlisted ones show as the corpus wrote them. */
  pos: Record<string, string>;
}

/** Each language's words, falling back to English wherever a catalogue has a gap, as the app does. */
export function chromeTable(): Record<AppLocale, ChromeWords> {
  const table = {} as Record<AppLocale, ChromeWords>;
  for (const { code } of APP_LOCALES) {
    const bar = {} as Record<BarKey, string>;
    for (const key of BAR_KEYS) bar[key] = CATALOGUES[code][key] ?? en[key];
    table[code] = { words: { ...bar, ...pageTemplates(PAGE_TEXT[code]) }, pos: PAGE_TEXT[code].pos };
  }
  return table;
}

/**
 * The script itself, written for old browsers since it is not bundled (`var`, plain loops, no arrows). It runs where it
 * is placed, right after the bar so the bar is relabelled before paint, and again once the document has parsed. The bar
 * keeps its shape in every language with right-to-left words in their own spans; the footer takes the reader's
 * direction; the entries keep the published direction.
 *
 * Marks:
 *   - `data-copy`: replace the text with this key's template, `{name}` from `data-v-name`, `\n` as `<br>`;
 *   - `data-copy-attr="aria-label"` (or `placeholder`): the same, into that attribute;
 *   - `data-copy-slots`: the template's holes are the element's own `data-slot` children, moved between the new words;
 *   - `data-copy-pos`: a part-of-speech label, looked up by the corpus's word for it.
 */
export function chromeScript(): string {
  const rtl = APP_LOCALES.filter((l) => l.dir === 'rtl').map((l) => l.code);
  return `/* Generated by web/scripts/ferheng-chrome.ts. The dictionary in the reader's language. */
(function () {
  'use strict';
  var COPY = ${JSON.stringify(chromeTable())};
  var RTL = ${JSON.stringify(rtl)};
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function stored() {
    try {
      return localStorage.getItem('hevalo_locale') || localStorage.getItem('mykurda_locale');
    } catch (e) {
      return null;
    }
  }
  function fromTag(tag) {
    if (!tag) return null;
    var base = String(tag).toLowerCase().split('-')[0];
    return has(COPY, base) ? base : null;
  }
  var choice = stored();
  var locale = choice && has(COPY, choice) ? choice : fromTag(navigator.language) || 'en';
  if (locale === document.documentElement.lang) return;
  var words = COPY[locale].words;
  var pos = COPY[locale].pos;
  var dir = RTL.indexOf(locale) >= 0 ? 'rtl' : 'ltr';
  function fill(template, el) {
    return template.replace(/\\{(\\w+)\\}/g, function (hole, name) {
      var value = el.getAttribute('data-v-' + name);
      return value === null ? hole : value;
    });
  }
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  function write(el, text) {
    clear(el);
    var lines = text.split('\\n');
    for (var i = 0; i < lines.length; i++) {
      if (i > 0) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(lines[i]));
    }
  }
  function writeSlots(el, template) {
    var slots = {};
    var kids = el.querySelectorAll('[data-slot]');
    for (var i = 0; i < kids.length; i++) slots[kids[i].getAttribute('data-slot')] = kids[i];
    var parts = template.split(/(\\{\\w+\\})/);
    clear(el);
    for (var j = 0; j < parts.length; j++) {
      var m = /^\\{(\\w+)\\}$/.exec(parts[j]);
      if (m && slots[m[1]]) el.appendChild(slots[m[1]]);
      else if (parts[j]) el.appendChild(document.createTextNode(parts[j]));
    }
  }
  function mark(el) {
    if (el.tagName === 'TITLE') return;
    el.setAttribute('lang', locale);
    el.setAttribute('dir', dir);
  }
  function relabel() {
    // The bar is left to right in every language, as the app's is; the footer follows the app's footer.
    var bar = document.querySelector('header.nav');
    if (bar) bar.setAttribute('lang', locale);
    var footer = document.querySelector('footer.footer');
    if (footer) {
      footer.setAttribute('lang', locale);
      footer.setAttribute('dir', dir);
    }
    var marked = document.querySelectorAll('[data-copy]');
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i];
      var template = words[el.getAttribute('data-copy')];
      if (typeof template !== 'string') continue;
      var text = fill(template, el);
      var attr = el.getAttribute('data-copy-attr');
      if (attr === 'aria-label' || attr === 'placeholder') {
        el.setAttribute(attr, text);
        continue;
      }
      if (el.hasAttribute('data-copy-done')) continue;
      if (el.hasAttribute('data-copy-slots')) writeSlots(el, text);
      else write(el, text);
      el.setAttribute('data-copy-done', '');
      mark(el);
    }
    var labels = document.querySelectorAll('[data-copy-pos]');
    for (var k = 0; k < labels.length; k++) {
      var label = labels[k];
      var src = label.getAttribute('data-copy-pos');
      var said = has(pos, src) ? pos[src] : src;
      if (label.textContent !== said) label.textContent = said;
      mark(label);
    }
  }
  relabel();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', relabel);
})();
`;
}
