#!/usr/bin/env node
/**
 * How far each control on a page answers a finger, measured in a real browser.
 *
 * The website gives its controls an area that answers past their edges
 * (web/src/styles/reach.css), and the phone app's browser build draws the
 * phone's own reach (mobile/src/theme/Pressable.tsx, with
 * EXPO_PUBLIC_SHOW_REACH=1). Neither can be judged from the code alone: a
 * scrolling row cuts a reach off, a neighbour drawn later takes it over, and
 * the browser decides. So this opens each page in a headless browser the size
 * of a phone, with touch on, and asks the page itself what answers where.
 *
 * For every control in view it walks out from each side, a pixel at a time
 * and up to 20px, at three points along the side, and records how far the
 * control still answers. It flags:
 *
 *   - stolen: a point just inside a control (2px) that a different control
 *     answers, by its reach rather than by what it draws. A press there goes
 *     to the wrong control. Any stolen point ends the run with status 1.
 *   - short: a control whose area that answers is under the minimum (48px,
 *     or 44px with --desktop) on its shorter side, outside the controls left
 *     alone on purpose. Any short control ends the run with status 2.
 *   - dead seam: neighbours under 16px apart whose midline answers nothing.
 *   - overlaps: two controls drawn over each other, which is layout, not reach.
 *
 * With --tap it also taps 3px outside each edge of the buttons, chips and
 * segments it found, and checks the tapped control is the one that hears the
 * click (the click is stopped before the app sees it, so nothing happens).
 * A tap that the measurement says should land, and does not, ends the run
 * with status 3. A tap that lands where nothing reaches is reported as
 * nudged: the browser itself moved it onto the nearest control, which a
 * phone's browser may do and another may not, so it is no reach to count on.
 *
 *   node scripts/reach-probe.mjs --base http://localhost:5174 --pages /,/login,/register
 *   node scripts/reach-probe.mjs --base http://localhost:5174 --pages /app,/app/learn --session session.json
 *   node scripts/reach-probe.mjs --base http://localhost:8081 --rnw --pages /home,/learn
 *   node scripts/reach-probe.mjs --base http://localhost:5174 --pages /login --desktop
 *
 * Options:
 *   --base <url>        where the app is served (required)
 *   --pages <a,b,c>     paths to open, comma-separated (default: /)
 *   --session <file>    JSON of what to put in the page's storage before the
 *                       pages open, as { "localStorage": { key: value } }, so
 *                       pages behind a sign-in can be measured
 *   --rnw               measure the phone app's browser build: its controls
 *                       are found by role, and a drawn reach answers for the
 *                       control it belongs to
 *   --desktop           1280×800 with a mouse instead of a phone with touch
 *   --tap               also tap outside the edges, as above
 *   --allow <selectors> more controls to leave alone, comma-separated
 *   --flagged           print only the controls with a flag
 *   --json <file>       also write every measurement to a file
 *   --wait <ms>         how long a page is given to settle (default 1500)
 *   --browser <path>    the browser to drive (default: $REACH_BROWSER, then /usr/bin/google-chrome)
 *
 * It needs nothing installed: the browser is driven over its debugging
 * protocol with the WebSocket built into Node 22.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- options ---------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const list = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []);

const base = option('base');
if (!base) {
  console.error('reach-probe: --base <url> is required, e.g. --base http://localhost:5174');
  process.exit(64);
}
const pages = list(option('pages', '/'));
const rnw = flag('rnw');
const desktop = flag('desktop');
const tap = flag('tap');
const flaggedOnly = flag('flagged');
const jsonFile = option('json');
const settle = Number(option('wait', '1500'));
const browserPath = option('browser', process.env.REACH_BROWSER || '/usr/bin/google-chrome');
const session = option('session') ? JSON.parse(readFileSync(option('session'), 'utf8')) : null;

/** What can be pressed: on the website, the same list the pressed look uses (web/src/lib/press.ts); in the phone build, by role. */
const PRESSABLE = rnw
  ? '[role="button"], [role="link"], [role="switch"], [role="tab"], [role="radio"], [tabindex="0"]'
  : /const PRESSABLE =\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'web/src/lib/press.ts'), 'utf8'))[1];

/** The controls whose area was cut by hand to their seams (web/src/lib/reach.ts), read from where they are kept. */
function handTuned() {
  const text = readFileSync(join(ROOT, 'web/src/lib/reach.ts'), 'utf8');
  const block = /export const HAND_TUNED = \[([\s\S]*?)\] as const/.exec(text)?.[1] ?? '';
  // the comments between the entries say where each is tuned, and are not entries
  return [...block.replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/*
 * Left alone on purpose, so never "short": the hand-tuned seams; the word
 * games' keys, which tile their gaps exactly and cannot be any wider; a
 * story's running text, where every word is its own target and the next
 * word touches it; and the range inputs other than a story's seek line.
 */
const LEAVE_ALONE = rnw ? list(option('allow')) : [...handTuned(), '.wordle-key', '.story-sentence', 'input[type="range"]:not(.story-player-seek)', ...list(option('allow'))];

/** The controls a tap is tried on, outside each of their edges. */
const TAP_TARGETS = rnw ? PRESSABLE : '.btn, .close-btn, .link-btn, .chip, .seg-btn';

const MIN_REACH = desktop ? 44 : 48;
const VIEWPORT = desktop ? { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false } : { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };

// ---- the browser -----------------------------------------------------------

/** Starts the browser with a profile of its own, and gives back where its debugging protocol listens. */
function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'reach-probe-'));
  const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio'];
  // a browser run by root refuses to start inside its own sandbox
  if (process.getuid?.() === 0) flags.push('--no-sandbox');
  const child = spawn(browserPath, [...flags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  // the profile goes once the browser has let go of it
  const done = () =>
    new Promise((resolve) => {
      child.once('exit', () => {
        try {
          rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {
          // a helper process of the browser can still be writing into it; the system's temporary files are cleared in time
        }
        resolve();
      });
      child.kill('SIGKILL');
    });
  return new Promise((resolve, reject) => {
    let said = '';
    const timer = setTimeout(() => reject(new Error(`the browser did not start: ${said.slice(-400)}`)), 20_000);
    child.on('error', reject);
    child.stderr.on('data', (chunk) => {
      said += chunk;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(said);
      if (m) {
        clearTimeout(timer);
        resolve({ url: m[1], done });
      }
    });
  });
}

/** The browser's debugging protocol over one socket: commands answered by id, and events by name. */
class Protocol {
  constructor(socket) {
    this.socket = socket;
    this.next = 1;
    this.waiting = new Map();
    this.listeners = [];
    socket.addEventListener('message', (e) => {
      const msg = JSON.parse(String(e.data));
      if (msg.id && this.waiting.has(msg.id)) {
        const { resolve, reject } = this.waiting.get(msg.id);
        this.waiting.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      } else if (msg.method) for (const fn of this.listeners) fn(msg);
    });
  }
  static open(url) {
    const socket = new WebSocket(url);
    return new Promise((resolve, reject) => {
      socket.addEventListener('open', () => resolve(new Protocol(socket)));
      socket.addEventListener('error', () => reject(new Error(`could not reach ${url}`)));
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.next++;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.waiting.set(id, { resolve, reject }));
  }
  once(method, sessionId, ms = 30_000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish(null), ms);
      const fn = (msg) => {
        if (msg.method === method && msg.sessionId === sessionId) finish(msg.params);
      };
      const finish = (value) => {
        clearTimeout(timer);
        this.listeners = this.listeners.filter((f) => f !== fn);
        resolve(value);
      };
      this.listeners.push(fn);
    });
  }
  close() {
    this.socket.close();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- what runs in the page -------------------------------------------------

/*
 * The measuring itself, run inside the page. It scrolls the page through,
 * a screen at a time, and measures each control once, when the whole of it is
 * in view, nothing is drawn over its middle and no bar that stays put lies
 * over any of its edges. Each control measured is marked with its number,
 * so a tap can find it again.
 */
async function measure({ selector, leaveAlone, minReach, rnw, maxOut }) {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const owner = (node) => {
    if (!(node instanceof Element)) return null;
    // a drawn reach in the phone build answers for the control it is drawn inside
    const shim = rnw ? node.closest('[data-reach]') : null;
    const from = shim ? shim.parentElement : node;
    return from ? from.closest(selector) : null;
  };
  const at = (x, y) => (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight ? undefined : owner(document.elementFromPoint(x, y)));
  const mine = (el, hit) => !!hit && (hit === el || el.contains(hit));
  const FRACTIONS = [0.25, 0.5, 0.75];
  /*
   * A bar that stays put and is drawn over part of a control hides that part,
   * reach and all, so what answers there is the bar's, not a stolen point.
   * Such a control is measured on a screen where it is clear. On the website
   * a bar stays put by being sticky or fixed; in the phone build the pages
   * scroll inside a box of their own, and the bars floating over them are
   * placed absolutely outside it. A bar's reach that falls outside the bar
   * itself is not hidden by it, and is still caught as stolen.
   */
  const scrollerOf = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (/auto|scroll/.test(`${style.overflowY} ${style.overflowX}`) && (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth)) return n;
    }
    return document.scrollingElement || document.documentElement;
  };
  const pinned = (node, el) => {
    const own = scrollerOf(el);
    for (let n = node instanceof Element ? node : null; n && n !== document.body; n = n.parentElement) {
      const position = getComputedStyle(n).position;
      if (position === 'sticky' || position === 'fixed') return n;
      // a control's own drawn reach is placed absolutely too, and is never a bar
      if (position === 'absolute' && !own.contains(n) && !n.closest(`${selector}, [data-reach]`)) return n;
    }
    return null;
  };
  // the points just inside each side that the stolen check below reads
  const insidePoints = (r) =>
    FRACTIONS.flatMap((f) => [
      [r.left + f * r.width, r.top + 2],
      [r.left + f * r.width, r.bottom - 3],
      [r.left + 2, r.top + f * r.height],
      [r.right - 3, r.top + f * r.height],
    ]);
  const underBar = (el, r) =>
    insidePoints(r).some(([x, y]) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const bar = pinned(document.elementFromPoint(x, y), el);
      if (!bar || bar.contains(el)) return false;
      const b = bar.getBoundingClientRect();
      return x >= b.left && x < b.right && y >= b.top && y < b.bottom;
    });
  const describe = (el) => {
    const classes = [...el.classList].filter((c) => !/^is-/.test(c)).slice(0, 3);
    const words = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22);
    return `${el.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join('')}${words ? ` "${words}"` : ''}`;
  };

  const rows = [];
  const measured = new Map();
  const paired = new Set();
  const scroller = document.scrollingElement || document.documentElement;
  // a screen at a time, and no more than forty of them, so a list that grows as it is scrolled still ends
  for (let top = 0, screens = 0; screens < 40; top += Math.max(200, innerHeight - 120), screens++) {
    scroller.scrollTo({ top, behavior: 'instant' });
    await frame();
    const inView = [];
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      // something drawn over its middle (a closed sheet, a sticky bar): measured where it is not covered, if anywhere
      if (!mine(el, at(r.left + r.width / 2, r.top + r.height / 2))) continue;
      if (!measured.has(el) && underBar(el, r)) continue;
      // a box inside a label is pressed through its label, which is measured instead; a label beside its field is words, not a control
      if (!rnw && ((el.matches('input') && el.closest('label')) || (el.matches('label') && !el.querySelector('input, select, textarea')))) continue;
      if (measured.has(el)) {
        inView.push({ id: measured.get(el), r });
        continue;
      }

      const reach = { t: maxOut, r: maxOut, b: maxOut, l: maxOut };
      const flags = new Set();
      const walk = (side, x0, y0, dx, dy) => {
        let d = 0;
        while (d < maxOut && mine(el, at(x0 + dx * (d + 1), y0 + dy * (d + 1)))) d++;
        reach[side] = Math.min(reach[side], d);
      };
      for (const f of FRACTIONS) {
        const x = r.left + f * r.width;
        const y = r.top + f * r.height;
        walk('t', x, r.top, 0, -1);
        walk('b', x, r.bottom - 1, 0, 1);
        walk('l', r.left, y, -1, 0);
        walk('r', r.right - 1, y, 1, 0);
        // just inside each side: whoever answers there should be this control
        for (const [px, py] of [
          [x, r.top + 2],
          [x, r.bottom - 3],
          [r.left + 2, y],
          [r.right - 3, y],
        ]) {
          const hit = at(px, py);
          if (!hit || mine(el, hit) || hit.contains(el)) continue;
          const box = hit.getBoundingClientRect();
          const drawnThere = px >= box.left && px < box.right && py >= box.top && py < box.bottom;
          flags.add(drawnThere ? 'overlaps' : `stolen by ${describe(hit)}`);
        }
      }
      const answers = Math.min(r.width + reach.l + reach.r, r.height + reach.t + reach.b);
      if (answers < minReach && !el.matches(leaveAlone || ':not(*)')) flags.add('short');
      const id = rows.length;
      el.setAttribute('data-reach-probe', String(id));
      measured.set(el, id);
      rows.push({ id, control: describe(el), x: Math.round(r.left), y: Math.round(r.top + scroller.scrollTop), w: Math.round(r.width), h: Math.round(r.height), ...reach, answers: Math.round(answers), flags });
      inView.push({ id, r });
    }

    // neighbours under 16px apart, side by side or one above the other, whose midline answers nothing
    for (const a of inView) {
      for (const b of inView) {
        if (a.id === b.id || paired.has(`${a.id}:${b.id}`)) continue;
        paired.add(`${a.id}:${b.id}`);
        const gapX = b.r.left - a.r.right;
        const gapY = b.r.top - a.r.bottom;
        const overlapY = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        const overlapX = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        let point = null;
        if (gapX > 0 && gapX < 16 && overlapY > 0) point = [a.r.right + gapX / 2, Math.max(a.r.top, b.r.top) + overlapY / 2];
        else if (gapY > 0 && gapY < 16 && overlapX > 0) point = [Math.max(a.r.left, b.r.left) + overlapX / 2, a.r.bottom + gapY / 2];
        if (point && at(point[0], point[1]) === null) rows[a.id].flags.add(`dead seam with #${b.id}`);
      }
    }
    if (scroller.scrollTop + innerHeight >= scroller.scrollHeight - 1) break;
  }
  scroller.scrollTo({ top: 0, behavior: 'instant' });
  return rows.map((row) => ({ ...row, flags: [...row.flags] }));
}

/* In the page: brings a measured control to the middle of the screen and says where its box now is. */
function bringIntoView(id) {
  const el = document.querySelector(`[data-reach-probe="${id}"]`);
  if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
}

/* In the page: from now on, hears every click before the app does, notes which measured control it was for, and stops it there. */
function listenForTaps() {
  window.__reachTaps = [];
  window.addEventListener(
    'click',
    (e) => {
      const hit = e.target instanceof Element ? e.target.closest('[data-reach-probe]') : null;
      window.__reachTaps.push(hit ? hit.getAttribute('data-reach-probe') : null);
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    { capture: true },
  );
}

// ---- running it ------------------------------------------------------------

async function evaluate(cdp, sessionId, fn, arg) {
  const expression = `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`;
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

async function open(cdp, sessionId, url) {
  const loaded = cdp.once('Page.loadEventFired', sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  await loaded;
  await evaluate(cdp, sessionId, () => document.fonts.ready.then(() => true));
  await sleep(settle);
}

async function tapAround(cdp, sessionId, rows) {
  await evaluate(cdp, sessionId, listenForTaps);
  const outcomes = [];
  const targets = await evaluate(cdp, sessionId, (sel) => [...document.querySelectorAll(sel)].map((el) => el.getAttribute('data-reach-probe')).filter((id) => id !== null), TAP_TARGETS);
  for (const id of targets) {
    const row = rows[Number(id)];
    const box = await evaluate(cdp, sessionId, bringIntoView, id);
    if (!row || !box) continue;
    await sleep(80);
    const sides = {
      t: { x: box.x + box.w / 2, y: box.y - 3, expected: row.t >= 3 },
      b: { x: box.x + box.w / 2, y: box.y + box.h + 2, expected: row.b >= 3 },
      l: { x: box.x - 3, y: box.y + box.h / 2, expected: row.l >= 3 },
      r: { x: box.x + box.w + 2, y: box.y + box.h / 2, expected: row.r >= 3 },
    };
    const result = {};
    for (const [side, p] of Object.entries(sides)) {
      if (p.x < 0 || p.y < 0 || p.x >= box.vw || p.y >= box.vh) continue;
      await evaluate(cdp, sessionId, () => (window.__reachTaps = []));
      const point = { x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1, id: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }, sessionId);
      await sleep(30);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
      await sleep(350);
      const heard = await evaluate(cdp, sessionId, () => window.__reachTaps.slice());
      const fired = heard.includes(String(id));
      // nudged: no reach there, but the browser moved the tap onto the nearest control by itself, as a phone's browser may
      result[side] = fired ? (p.expected ? 'ok' : 'nudged') : p.expected ? 'MISS' : 'none';
    }
    outcomes.push({ id: Number(id), control: row.control, ...result });
  }
  return outcomes;
}

function table(rows) {
  const head = ['#', 'control', 'drawn', 'T', 'R', 'B', 'L', 'answers', 'flags'];
  const body = rows.filter((r) => !flaggedOnly || r.flags.length).map((r) => [String(r.id), r.control, `${r.w}×${r.h}`, r.t, r.r, r.b, r.l, r.answers, r.flags.join('; ')].map(String));
  const widths = head.map((h, i) => Math.min(i === 1 ? 44 : 60, Math.max(h.length, ...body.map((row) => row[i].length))));
  const line = (cells) => cells.map((c, i) => (c.length > widths[i] ? `${c.slice(0, widths[i] - 1)}…` : c.padEnd(widths[i]))).join('  ');
  return [line(head), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n');
}

async function main() {
  const browser = await launch();
  const cdp = await Protocol.open(browser.url);
  const report = { base, viewport: VIEWPORT, minReach: MIN_REACH, pages: {} };
  let stolen = 0;
  let short = 0;
  let missed = 0;
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', VIEWPORT, sessionId);
    await cdp.send('Emulation.setTouchEmulationEnabled', desktop ? { enabled: false } : { enabled: true, maxTouchPoints: 5 }, sessionId);

    if (session) {
      await open(cdp, sessionId, new URL('/', base).href);
      await evaluate(
        cdp,
        sessionId,
        (stores) => {
          for (const [name, entries] of Object.entries(stores)) for (const [k, v] of Object.entries(entries)) window[name].setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
          return true;
        },
        { localStorage: session.localStorage ?? {}, sessionStorage: session.sessionStorage ?? {} },
      );
    }

    for (const path of pages) {
      const url = new URL(path, base).href;
      await open(cdp, sessionId, url);
      const coarse = await evaluate(cdp, sessionId, () => matchMedia('(any-pointer: coarse)').matches);
      if (coarse === desktop) {
        throw new Error(desktop ? 'the page still sees a finger; the desktop pass needs a mouse' : 'the page does not see a finger: (any-pointer: coarse) does not match, so nothing would be measured as a phone');
      }
      const rows = await evaluate(cdp, sessionId, measure, { selector: PRESSABLE, leaveAlone: LEAVE_ALONE.join(', '), minReach: MIN_REACH, rnw, maxOut: 20 });
      const taps = tap ? await tapAround(cdp, sessionId, rows) : [];
      const pageStolen = rows.filter((r) => r.flags.some((f) => f.startsWith('stolen'))).length;
      const pageShort = rows.filter((r) => r.flags.includes('short')).length;
      const pageMissed = taps.filter((t) => Object.values(t).includes('MISS')).length;
      stolen += pageStolen;
      short += pageShort;
      missed += pageMissed;
      report.pages[path] = { rows, taps };

      console.log(`\n${url}  (${VIEWPORT.width}×${VIEWPORT.height}, ${desktop ? 'mouse' : 'touch'})  ${rows.length} controls, ${pageStolen} stolen, ${pageShort} short`);
      console.log(table(rows));
      if (tap) {
        console.log(`\ntaps 3px outside each edge (${pageMissed} missed):`);
        for (const t of taps) console.log(`  #${t.id} ${t.control}: ${['t', 'r', 'b', 'l'].map((s) => `${s.toUpperCase()} ${t[s] ?? '-'}`).join(', ')}`);
      }
    }
  } finally {
    cdp.close();
    await browser.done();
  }
  if (jsonFile) writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${stolen} stolen, ${short} short${tap ? `, ${missed} taps missed` : ''}, across ${pages.length} page(s)`);
  process.exit(stolen ? 1 : short ? 2 : missed ? 3 : 0);
}

main().catch((err) => {
  console.error(`reach-probe: ${err.message}`);
  process.exit(70);
});
