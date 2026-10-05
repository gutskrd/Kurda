/**
 * The dictionary's bar and footer, in whichever of the app's nine languages the
 * reader is using.
 *
 * ── the problem ──────────────────────────────────────────────────────────
 *
 * These pages are published in two languages — see ferheng-copy.ts for why not
 * nine — and a reader who is not using Kurmancî is sent to the English set. So
 * somebody using Hevalo in German, Turkish or Arabic clicked Dictionary and the
 * navigation bar they had just been using turned into English under their
 * cursor. The words in the dictionary are Kurdish whatever happens, and the
 * definitions exist in English and Kurmancî only; the bar and the footer are
 * the app's, and they belonged to the reader a moment ago.
 *
 * ── the fix, and the one thing it does ───────────────────────────────────
 *
 * One small file per language set, `/<base>/chrome.js`, generated from the
 * app's own catalogues so it cannot fall out of step with them. It reads the
 * language the app stored — the same `hevalo_locale` the SPA writes, falling
 * back to the browser's language exactly as `resolveLocale` does — and, when
 * that is not the language the page was published in, rewrites the text of the
 * elements marked `data-copy` and nothing else. No request, no storage write,
 * no markup: it sets `textContent` and attributes, so no string in it can ever
 * become HTML.
 *
 * Without it, or where it is blocked, the page is exactly what it was.
 *
 * ── why a script is allowed here at all ──────────────────────────────────
 *
 * These pages ran no script by design: `_headers` gives them a policy with no
 * `script-src`, as a second line behind the escaping in escape.ts, so that a
 * stranger's Wiktionary text could never execute even if it got past the first.
 * That property is kept. The policy names this one file by its full URL —
 * `script-src https://hevalo.app/ferheng/chrome.js` — not `'self'`, so the only
 * script any page can run is this one: an injected `<script>` is refused
 * whether it is inline or points anywhere else on the origin, and pointing it
 * at this file runs code that only relabels the bar.
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

/** What the file is called inside each language's folder. */
export const CHROME_FILE = 'chrome.js';

/**
 * Every piece of the bar and footer that has a word in it, by the app key that
 * already says it.
 *
 * Only keys whose meaning is the same in both places. The licence sentence is
 * left alone: it is about where the definitions come from, it carries two links
 * the app has no copy for, and it is in the language the definitions are in.
 */
export const CHROME_KEYS = [
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
export type ChromeKey = (typeof CHROME_KEYS)[number];

const CATALOGUES: Record<AppLocale, Catalogue> = { ku, ckb, en, nl, de, es, fr, tr, ar };

/**
 * Mark an element as one the script may relabel.
 *
 * Its text by default; `attr` for a label that lives in an attribute, such as
 * the menu toggle's `aria-label`. A text hook goes on an inline `<span>` that
 * holds only the words: the script replaces its whole text and sets `dir` on
 * it, which on a link or heading would also flip that block's alignment. The
 * pages use `labelled()` in ferheng-pages.ts for exactly this.
 */
export function copyHook(key: ChromeKey, attr?: 'aria-label'): string {
  return ` data-copy="${key}"${attr ? ` data-copy-attr="${attr}"` : ''}`;
}

/** Each language's words for the bar, English wherever a catalogue has a gap — as the app does. */
export function chromeTable(): Record<AppLocale, Record<ChromeKey, string>> {
  const table = {} as Record<AppLocale, Record<ChromeKey, string>>;
  for (const { code } of APP_LOCALES) {
    const words = {} as Record<ChromeKey, string>;
    for (const key of CHROME_KEYS) words[key] = CATALOGUES[code][key] ?? en[key];
    table[code] = words;
  }
  return table;
}

/**
 * The script itself.
 *
 * Written for the oldest browser that can open the page, because it is not
 * bundled: `var`, a plain loop, no arrow functions. It runs where it is placed
 * — straight after the bar, so the bar is relabelled before it is painted — and
 * again once the document has parsed, for the footer.
 */
export function chromeScript(): string {
  const rtl = APP_LOCALES.filter((l) => l.dir === 'rtl').map((l) => l.code);
  return `/* Generated by web/scripts/ferheng-chrome.ts. The bar and footer in the reader's language. */
(function () {
  'use strict';
  var COPY = ${JSON.stringify(chromeTable())};
  var RTL = ${JSON.stringify(rtl)};
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
    return Object.prototype.hasOwnProperty.call(COPY, base) ? base : null;
  }
  var choice = stored();
  var locale = choice && Object.prototype.hasOwnProperty.call(COPY, choice) ? choice : fromTag(navigator.language) || 'en';
  if (locale === document.documentElement.lang) return;
  var words = COPY[locale];
  var dir = RTL.indexOf(locale) >= 0 ? 'rtl' : 'ltr';
  function relabel() {
    var marked = document.querySelectorAll('[data-copy]');
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i];
      var text = words[el.getAttribute('data-copy')];
      if (typeof text !== 'string') continue;
      var attr = el.getAttribute('data-copy-attr');
      if (attr === 'aria-label') {
        el.setAttribute('aria-label', text);
        continue;
      }
      if (el.textContent !== text) el.textContent = text;
      el.setAttribute('lang', locale);
      el.setAttribute('dir', dir);
    }
  }
  relabel();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', relabel);
})();
`;
}
