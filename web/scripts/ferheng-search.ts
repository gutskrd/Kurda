/**
 * Finding a word, on a dictionary that is nothing but files.
 *
 * ── why it was needed ────────────────────────────────────────────────────
 *
 * 409,435 words and no search box. The only way to a word was letter → range
 * → scroll, which is how a printed dictionary works and how nobody looks a
 * word up on a phone. Every dictionary people actually use opens on a box.
 *
 * ── how, with no server ──────────────────────────────────────────────────
 *
 * The words are split into small files by how they begin — `se`, `ser`,
 * `sera`, … — each holding at most LIMIT words, with the place each one lives
 * and a few words of what it means. Typing loads only the one file the query
 * falls in (about 20 KB), once, and filters it as you type. Nothing is sent
 * anywhere: the file is the same for every reader and says nothing about who
 * asked.
 *
 * The files are loaded as scripts, not fetched. These pages run under
 * `connect-src 'none'` (see public/_headers), which is a second wall between a
 * stranger's Wiktionary text and the network, and a search box is not a reason
 * to take it down. A `<script src>` to this origin is already allowed, and each
 * file is a single call with a JSON literal in it — data, never markup.
 *
 * ── what typing finds ────────────────────────────────────────────────────
 *
 * Most keyboards have no ê, î, û, ç or ş, so the match ignores them: "sev"
 * finds sêv, "cav" finds çav. The suggestion shows the word as it is really
 * spelled, so the reader learns the spelling by finding the word. A query
 * typed with the marks ranks the words that have them first.
 */
import { foldLetter } from '@kurda/shared';
import { compareKeys } from './ferheng-alphabet.js';
import { formOf, isInflected } from './ferheng-entries.js';
import { pageKey, type Page } from './ferheng-pages.js';

/** The most words one file holds before it is split by the next letter. */
export const LIMIT = 1500;
/** How long the meaning in a suggestion may be. */
const GLOSS = 72;

/** The five marks most keyboards cannot type, folded away for matching only. */
const MARKS: Record<string, string> = { ê: 'e', î: 'i', û: 'u', ç: 'c', ş: 's' };

/** What a word is matched by: its page key with the five marks folded. Mirrored exactly in the client below. */
export function searchKey(word: string): string {
  return pageKey(word).replace(/[êîûçş]/g, (c) => MARKS[c]!);
}

/** A meaning cut at a word boundary, so a suggestion stays one line. */
export function shorten(text: string, max = GLOSS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

/** One suggestion: the word, the page it is on, and a few words about it. */
export type Row = [headword: string, page: string, gloss: string];

export function rowOf(word: Page['words'][number], page: string): Row {
  const main = word.senses.find((s) => !isInflected(s.pos));
  if (main) return [word.headword, page, shorten(main.definition)];
  const base = word.senses[0] ? formOf(word.senses[0].definition) : null;
  return [word.headword, page, base ? `→ ${base}` : ''];
}

/**
 * Split the dictionary into files by how its words begin.
 *
 * A prefix with more than LIMIT words splits by its next letter; the words
 * that are exactly the prefix get a file of their own, named with a trailing
 * dot. Ids are the prefixes themselves; `fileName` turns them into names safe
 * for any host.
 */
export function shard(pages: readonly Page[]): Map<string, Row[]> {
  const all: Array<{ key: string; row: Row }> = [];
  for (const page of pages) for (const w of page.words) all.push({ key: searchKey(w.headword), row: rowOf(w, page.prefix) });

  const out = new Map<string, Row[]>();
  const split = (items: typeof all, prefix: string): void => {
    const depth = [...prefix].length;
    if (depth > 0 && (items.length <= LIMIT || depth >= 12)) {
      out.set(prefix, items.map((i) => i.row));
      return;
    }
    const exact: Row[] = [];
    const next = new Map<string, typeof all>();
    for (const item of items) {
      const chars = [...item.key];
      if (chars.length === depth) exact.push(item.row);
      else {
        const p = prefix + chars[depth]!;
        next.set(p, [...(next.get(p) ?? []), item]);
      }
    }
    if (exact.length) out.set(`${prefix}.`, exact);
    for (const [p, list] of next) split(list, p);
  };
  split(
    all.filter((i) => i.key),
    '',
  );
  // within a file, in dictionary order, so a short query lists words the way the pages do
  for (const rows of out.values()) rows.sort((a, b) => compareKeys(pageKey(a[0]), pageKey(b[0])));
  return out;
}

/** A file name for an id: its code points in hex, so no host has to agree on how to spell ş or ڕ in a path. */
export function fileName(id: string): string {
  return `${[...id].map((c) => (c === '.' ? 'x' : c.codePointAt(0)!.toString(16))).join('-')}.js`;
}

/** Where the files live: one set for both languages, since a word's page has the same name in each. */
export const SEARCH_DIR = 'ferheng/s';
export const SEARCH_FILE = 'search.js';

/** One file: a call, with the rows as a JSON literal. `<` is escaped so the text can never read as markup. */
export function shardFile(id: string, rows: Row[]): string {
  return `__hevaloSearch(${JSON.stringify(id)},${JSON.stringify(rows).replace(/</g, '\\u003c')});\n`;
}

/** The variants foldLetter folds, as the client needs them. */
function variantTable(): Record<string, string> {
  const table: Record<string, string> = {};
  for (const ch of ['ك', 'ي', 'ى', 'ه', 'ۀ', 'ı']) table[ch] = foldLetter(ch);
  return table;
}

/**
 * The search box's script.
 *
 * Plain ES5-ish like chrome.js, because it is not bundled. It finds every
 * `form.search` on the page, shows it (the form is hidden in the markup, so a
 * browser without scripts never sees a box that does nothing), and answers as
 * the reader types.
 *
 * It is a combobox in the ARIA sense: arrows move through the suggestions,
 * Enter opens the highlighted one (or the first), Escape closes the list.
 */
export function searchScript(ids: readonly string[]): string {
  return `/* Generated by web/scripts/ferheng-search.ts. Search the dictionary, with no server. */
(function () {
  'use strict';
  var IDS = ${JSON.stringify([...ids].sort())};
  var HAVE = {};
  for (var n = 0; n < IDS.length; n++) HAVE[IDS[n]] = true;
  var VARIANTS = ${JSON.stringify(variantTable())};
  var MARKS = ${JSON.stringify(MARKS)};
  var MAX = 8;
  var cache = {};
  var waiting = {};

  // the same two keys the build uses: pageKey, then the five marks folded
  function pageKey(s) {
    var out = '';
    var t = String(s).normalize('NFKC').toLowerCase().normalize('NFC').replace(/[^\\p{L}]/gu, '').replace(/\\p{Lm}/gu, '');
    for (var ch of t) out += VARIANTS[ch] || ch;
    return out;
  }
  function fold(s) {
    return pageKey(s).replace(/[êîûçş]/g, function (c) { return MARKS[c]; });
  }
  function hex(id) {
    var parts = [];
    for (var ch of id) parts.push(ch === '.' ? 'x' : ch.codePointAt(0).toString(16));
    return parts.join('-');
  }

  window.__hevaloSearch = function (id, rows) {
    cache[id] = rows;
    var queue = waiting[id] || [];
    delete waiting[id];
    for (var i = 0; i < queue.length; i++) queue[i]();
  };
  function load(id, done) {
    if (cache[id]) return done();
    if (waiting[id]) return void waiting[id].push(done);
    waiting[id] = [done];
    var s = document.createElement('script');
    s.src = '/${SEARCH_DIR}/' + hex(id) + '.js';
    s.async = true;
    s.onerror = function () { window.__hevaloSearch(id, []); };
    document.head.appendChild(s);
  }

  /** Which files can hold words starting with q, and whether there are more beyond them. */
  function filesFor(q) {
    var chars = Array.from(q);
    for (var i = chars.length; i > 0; i--) {
      var p = chars.slice(0, i).join('');
      if (HAVE[p]) return { ids: HAVE[q + '.'] ? [q + '.', p] : [p], more: false };
    }
    var under = IDS.filter(function (id) { return id.indexOf(q) === 0 && id.charAt(id.length - 1) !== '.'; });
    var ids = (HAVE[q + '.'] ? [q + '.'] : []).concat(under.slice(0, 2));
    return { ids: ids, more: under.length > 2 };
  }

  function rank(rows, q, typed) {
    var hits = [];
    for (var i = 0; i < rows.length; i++) {
      var key = fold(rows[i][0]);
      if (key.indexOf(q) !== 0) continue;
      var exact = key === q ? 0 : 1;
      // typed with the marks: words that have them, as typed, come first
      var spelled = pageKey(rows[i][0]).indexOf(typed) === 0 ? 0 : 1;
      var form = rows[i][2].indexOf('→') === 0 ? 1 : 0;
      hits.push({ row: rows[i], score: [exact, spelled, form, key.length, i] });
    }
    hits.sort(function (a, b) {
      for (var k = 0; k < a.score.length; k++) if (a.score[k] !== b.score[k]) return a.score[k] - b.score[k];
      return 0;
    });
    return hits.slice(0, MAX).map(function (h) { return h.row; });
  }

  function setUp(form) {
    var base = form.getAttribute('data-base');
    var input = form.querySelector('input');
    var list = form.querySelector('.search-list');
    var msgs = {};
    var ms = form.querySelectorAll('[data-msg]');
    for (var m = 0; m < ms.length; m++) msgs[ms[m].getAttribute('data-msg')] = ms[m];
    var active = -1;
    var asked = 0;
    form.hidden = false;

    function show(which) {
      for (var k in msgs) msgs[k].hidden = k !== which;
    }
    function options() {
      return list.querySelectorAll('a');
    }
    function highlight(i) {
      var opts = options();
      active = opts.length ? (i + opts.length) % opts.length : -1;
      for (var j = 0; j < opts.length; j++) opts[j].parentNode.setAttribute('aria-selected', j === active ? 'true' : 'false');
      input.setAttribute('aria-activedescendant', active >= 0 ? opts[active].parentNode.id : '');
    }
    function letterLink(typed) {
      var letter = Array.from(typed)[0];
      var a = msgs.letter && msgs.letter.querySelector('a');
      if (!a || !letter) return;
      a.href = '/' + base + '/' + encodeURIComponent(letter) + '/';
      var slot = a.querySelector('[data-letter]');
      if (slot) slot.textContent = letter.toUpperCase();
    }
    function render(rows) {
      while (list.firstChild) list.removeChild(list.firstChild);
      for (var i = 0; i < rows.length; i++) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.id = form.id + '-o' + i;
        var a = document.createElement('a');
        a.href = '/' + base + '/' + encodeURIComponent(rows[i][1]) + '/#' + encodeURIComponent(pageKey(rows[i][0]));
        a.tabIndex = -1;
        var w = document.createElement('span');
        w.className = 'search-word';
        w.setAttribute('lang', 'ku');
        w.setAttribute('dir', 'auto');
        w.textContent = rows[i][0];
        var g = document.createElement('span');
        g.className = 'search-gloss';
        g.setAttribute('dir', 'auto');
        g.textContent = rows[i][2];
        a.appendChild(w);
        a.appendChild(g);
        li.appendChild(a);
        list.appendChild(li);
      }
      list.hidden = rows.length === 0;
      input.setAttribute('aria-expanded', rows.length ? 'true' : 'false');
      highlight(rows.length ? 0 : -1);
    }
    function ask() {
      var typed = pageKey(input.value);
      var q = fold(input.value);
      var mine = ++asked;
      if (!q) { render([]); show(null); return; }
      letterLink(typed);
      if (Array.from(q).length < 2) { render([]); show('letter'); return; }
      var plan = filesFor(q);
      if (!plan.ids.length) { render([]); show('none'); return; }
      var left = plan.ids.length;
      plan.ids.forEach(function (id) {
        load(id, function () {
          if (--left > 0 || mine !== asked) return;
          var rows = [];
          plan.ids.forEach(function (x) { rows = rows.concat(cache[x] || []); });
          var found = rank(rows, q, typed);
          render(found);
          show(found.length === 0 ? 'none' : plan.more ? 'more' : null);
        });
      });
    }

    var timer = 0;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(ask, 60);
    });
    input.addEventListener('keydown', function (e) {
      var opts = options();
      if (e.key === 'ArrowDown' && opts.length) { e.preventDefault(); highlight(active + 1); }
      else if (e.key === 'ArrowUp' && opts.length) { e.preventDefault(); highlight(active - 1); }
      else if (e.key === 'Escape') { input.value = ''; render([]); show(null); }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var opts = options();
      if (opts.length) location.href = opts[Math.max(0, active)].href;
    });
    // a click outside closes the list; back in the box opens it again
    document.addEventListener('click', function (e) {
      if (!form.contains(e.target)) list.hidden = true;
    });
    input.addEventListener('focus', function () {
      if (list.firstChild) list.hidden = false;
    });
  }

  function start() {
    var forms = document.querySelectorAll('form.search');
    for (var i = 0; i < forms.length; i++) setUp(forms[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;
}
