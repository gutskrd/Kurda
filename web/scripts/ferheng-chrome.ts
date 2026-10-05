/**
 * The published dictionary, in whichever of the app's nine languages the
 * reader is using.
 *
 * ── the problem ──────────────────────────────────────────────────────────
 *
 * These pages are published in two languages — see ferheng-copy.ts for why not
 * nine — and a reader who is not using Kurmancî is sent to the English set. So
 * somebody using Hevalo in German, Turkish or Arabic clicked Dictionary and the
 * page turned English under their cursor: the bar they had just been using,
 * the headings, the counts, the labels, the footer. The words in the
 * dictionary are Kurdish whatever happens, and the definitions exist in
 * English and Kurmancî only; everything around them belonged to the reader a
 * moment ago.
 *
 * ── the fix, and the one thing it does ───────────────────────────────────
 *
 * One small file per language set, `/<base>/chrome.js`, generated from the
 * app's own catalogues (for the bar and footer) and from ferheng-copy.ts (for
 * the page) so it cannot fall out of step with either. It reads the language
 * the app stored — the same `hevalo_locale` the SPA writes, falling back to the
 * browser's language exactly as `resolveLocale` does — and, when that is not
 * the language the page was published in, rewrites the text of the elements
 * marked `data-copy` and nothing else. No request, no storage write, no
 * markup: it builds text nodes and `<br>`s and moves the page's own links, so
 * no string in it can ever become HTML.
 *
 * Without it, or where it is blocked, the page is exactly what it was.
 *
 * ── why a script is allowed here at all ──────────────────────────────────
 *
 * These pages ran no script by design: `_headers` gave them a policy with no
 * `script-src`, as a second line behind the escaping in escape.ts, so that a
 * stranger's Wiktionary text could never execute even if it got past the first.
 *
 * The policy is now `script-src 'self'` and no more, which keeps what that was
 * for. An injected inline script, or inline handler, is still refused. A
 * `<script src>` can only name a file on this origin, and every script file on
 * this origin is one of ours: user uploads live on another host, the Worker's
 * pages are HTML, and `X-Content-Type-Options: nosniff` (sent on every path)
 * stops a browser running anything that is not served as JavaScript. Even one
 * of the app's own bundles, pulled in by an injection, could reach nothing —
 * `connect-src` here is still `'none'`.
 *
 * It is `'self'` rather than this file's full URL so that it works wherever the
 * site is deployed. Pinned to `https://hevalo.app/...` it was refused on every
 * preview and test deployment, which is exactly where the fix is checked, and
 * the page stayed English there.
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

/** What the file is called inside each language's folder. */
export const CHROME_FILE = 'chrome.js';

/**
 * Every piece of the bar and footer that has a word in it, by the app key that
 * already says it.
 *
 * Only keys whose meaning is the same in both places, so the bar reads the way
 * the app's own bar reads in that language.
 */
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
  'footer.tagline',
  'footer.join',
  'footer.app',
  'footer.iosSoon',
  'footer.androidSoon',
  'footer.byZagrosian',
] as const;

/**
 * Every piece of the page itself, from ferheng-copy.ts.
 *
 * A template where the published copy is a function: `{n}`, `{letter}` and the
 * rest are filled from the element's own `data-v-*` attributes, so the number
 * on the page and the number in the sentence are the same number. `\n` is a
 * line break — the front page's headline is two lines — and `{wiki}` and
 * `{licence}` in the licence sentence are the two links already in the footer.
 */
export const PAGE_KEYS = [
  'page.alphabets.hawar',
  'page.alphabets.sorani',
  'page.alphabets.other',
  'page.index.eyebrow',
  'page.index.headline',
  'page.index.lead',
  'page.index.statWords',
  'page.index.statLetters',
  'page.index.statPages',
  'page.index.selected',
  'page.index.about',
  'page.index.aboutBody',
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

/** For the backwards-compatible name the tests and pages grew up with. */
export const CHROME_KEYS: readonly ChromeKey[] = [...BAR_KEYS, ...PAGE_KEYS];

const CATALOGUES: Record<AppLocale, Catalogue> = { ku, ckb, en, nl, de, es, fr, tr, ar };

/**
 * Mark an element as one the script may relabel.
 *
 * Its text by default; `attr` for a label that lives in an attribute, such as
 * the menu toggle's `aria-label`. A text hook goes on an inline `<span>` that
 * holds only the words: the script replaces its whole text and sets `dir` on
 * it, which on a link or heading would also flip that block's alignment. The
 * pages use `labelled()` in ferheng-pages.ts for exactly this.
 *
 * `vars` are the values a template's `{name}` holes are filled with.
 */
export function copyHook(key: ChromeKey, attr?: 'aria-label', vars?: Record<string, string | number>): string {
  const filled = Object.entries(vars ?? {})
    .map(([name, value]) => ` data-v-${name}="${escapeAttr(String(value))}"`)
    .join('');
  return ` data-copy="${key}"${attr ? ` data-copy-attr="${attr}"` : ''}${filled}`;
}

/* the same five characters escape.ts escapes; repeated here so this file stays importable on its own */
function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A published function, turned back into the template it fills. */
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
    'page.index.statWords': p.index.statWords,
    'page.index.statLetters': p.index.statLetters,
    'page.index.statPages': p.index.statPages,
    'page.index.selected': p.index.selected,
    'page.index.about': p.index.about,
    'page.index.aboutBody': p.index.aboutBody,
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
    // the four shapes of <title> the pages use; see document_() in ferheng-pages.ts
    'page.title.index': `${p.titleSuffix} — Hevalo`,
    'page.title.words': `${hole('here')} · ${p.titleSuffix}`,
    'page.title.letter': `${p.letter.title(hole('letter'))} · ${p.titleSuffix}`,
    'page.title.notFound': `${p.notFound.title} · ${p.titleSuffix}`,
  };
}

export interface ChromeWords {
  words: Record<ChromeKey, string>;
  /** the corpus's part-of-speech labels in this language; a label not listed is shown as the corpus wrote it */
  pos: Record<string, string>;
}

/** Each language's words, English wherever a catalogue has a gap — as the app does. */
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
 * The script itself.
 *
 * Written for the oldest browser that can open the page, because it is not
 * bundled: `var`, plain loops, no arrow functions. It runs where it is placed
 * — straight after the bar, so the bar is relabelled before it is painted — and
 * again once the document has parsed, for the page and the footer.
 *
 * The bar keeps the same shape in every language, as the app's does — brand on
 * the left, the way in on the right — and only its words change; each one is
 * set right to left inside its own span where the language needs it. The
 * footer takes the reader's direction as a whole, as the app's footer does.
 * The page between them keeps the published direction, because its entries —
 * Kurmancî words, English or Kurmancî definitions — read left to right.
 *
 * Four kinds of mark:
 *   - `data-copy` — replace the text with this key's template, `{name}` filled
 *     from `data-v-name`, `\n` drawn as a `<br>`;
 *   - `data-copy-attr="aria-label"` — the same, into that attribute;
 *   - `data-copy-slots` — the template's `{name}` holes are the element's own
 *     children marked `data-slot="name"` (the licence's two links), moved back
 *     in between the new words rather than rebuilt;
 *   - `data-copy-pos` — a part-of-speech label, looked up by the corpus's own
 *     word for it.
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
    // the bar is left to right in every language, as the app's is; the footer follows the app's footer
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
      if (el.getAttribute('data-copy-attr') === 'aria-label') {
        el.setAttribute('aria-label', text);
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
