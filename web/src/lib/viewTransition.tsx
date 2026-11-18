import { startTransition, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { NavigationType, Router, UNSAFE_createBrowserHistory as createBrowserHistory, type Location } from 'react-router-dom';
import { playsMotion } from './motion';

/**
 * Page changes as view transitions, where a pressed card's picture grows into the head of the page it opens.
 *
 * `CarriedRouter` is the library's BrowserRouter written out so that every change of page (link, redirect, Back,
 * Forward) runs inside a view transition; the library offers that only to its data routers. It uses the library's
 * `UNSAFE_createBrowserHistory`, so an upgrade that moves it fails the build here. Nothing is carried without browser
 * support, under reduced motion, or when only the query or hash changes.
 *
 * Name a journey once at each end with the same words: `useGrowsFrom(name, { within: '.card' })` on the card's picture
 * and `useGrowsInto(name)` at the top of the page, above anything it waits for; `shape: 'card'` at both ends grows a
 * whole card into the page. The browser drops a transition when two elements share a name, so names are worn only
 * during a change. The next page has `HOLD_MS` to draw its head before the plain fade is used. Back and Forward restore
 * the scroll here, once the page is drawn, and a swipe-back the browser has already animated is not carried again.
 */

/** The longest the old page is held for the next one; after that the next page is shown as it is. */
export const HOLD_MS = 400;

/** A picture keeps the same drawing at both ends; a card opens into a longer page. */
export type CarriedShape = 'picture' | 'card';

/** The transition name of each shape, used by styles/motion.css. */
const WORN: Record<CarriedShape, string> = { picture: 'carried-picture', card: 'carried-card' };

/** On the root element while a page is changing, so the bars take their own transition names (styles/motion.css). */
const CHANGING = 'is-changing-page';

type BrowserHistory = ReturnType<typeof createBrowserHistory>;
/** One change of address, as the history reports it. */
type Update = Parameters<Parameters<BrowserHistory['listen']>[0]>[0];

/** A rectangle on the screen. */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A card just pressed: its journey and the page its link leads to. */
interface Pressed {
  journey: string;
  shape: CarriedShape;
  card: HTMLElement;
  to: string;
}

/** How far a box that scrolls inside the page had been scrolled. */
interface Scrolled {
  left: number;
  top: number;
}

/** Where a journey started: the card's page and screen box, the page it opened, and the scroll of each shelf around it, nearest first. */
interface Home {
  path: string;
  to: string;
  near: Box | null;
  shelves: Scrolled[];
}

/** What one change of page carries, decided as the page is left. */
interface Plan {
  journey: string;
  shape: CarriedShape;
  /** The element wearing the name on the page being left. */
  from: HTMLElement;
  /** Which end the next page must show for the picture to land. */
  end: 'head' | 'card';
  /** Where the card was when pressed, for the way back; only that page is held for the card. */
  home: Home | null;
}

/** A change of page in progress. */
interface Flight {
  /** The key of the page it is waiting to see drawn, and that page's path. */
  awaits: string;
  path: string;
  /** True from asking the browser until the next page is handed over; address changes meanwhile join this change, in order. */
  open: boolean;
  /** Address changes not yet drawn; null once drawn. */
  waiting: Update[] | null;
  /** The scroll to restore once the page is drawn (Back and Forward), or undefined to leave it to the page. */
  top: number | undefined;
  /** Resolves the wait for the page being drawn. */
  drawn: (() => void) | null;
  /** Called when something that could be the other end has been drawn. */
  arrived: (() => void) | null;
  /** Stops waiting for the other end. */
  dropped: (() => void) | null;
  /** Every element named for this change, so the names can come off again. */
  worn: HTMLElement[];
}

/** Card pictures and page heads currently drawn, by journey. */
const cards = new Map<string, Set<HTMLElement>>();
const heads = new Map<string, Set<HTMLElement>>();
const shapes = new WeakMap<HTMLElement, CarriedShape>();
/** How many parts of the current page promise a head for each journey, drawn yet or not. */
const promised = new Map<string, number>();
/** Where each journey in this tab started, for the way back. */
const homes = new Map<string, Home>();
/** The scroll position of each page when it was left, by history key. */
const left = new Map<string, number>();

let pressed: Pressed | null = null;
let flight: Flight | null = null;
/** The key of the page drawn last. */
let lastDrawn: string | null = null;
/** Set when the browser animated this Back or Forward itself (an edge swipe); carrying it again would play the change twice. */
let swiped = false;

/** Caps a map at its newest entries, since one tab can open many pages. */
function keep<V>(map: Map<string, V>, key: string, value: V, most = 200): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > most) map.delete(map.keys().next().value as string);
}

/** Clears everything remembered, for tests. */
export function forgetCarried(): void {
  settle();
  cards.clear();
  heads.clear();
  promised.clear();
  homes.clear();
  left.clear();
  pressed = null;
  lastDrawn = null;
  swiped = false;
}

/** Whether page changes are carried: the browser supports view transitions and the reader has not asked for less motion. */
export function carriesPages(): boolean {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function' && playsMotion();
}

/** A path as the router matches it, without a trailing slash. */
const trimmed = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

/** Whether two addresses are different pages; a change of query or hash (a search typed letter by letter) is not. */
export function isAnotherPage(from: Pick<Location, 'pathname'>, to: Pick<Location, 'pathname'>): boolean {
  return trimmed(from.pathname) !== trimmed(to.pathname);
}

/** Whether an overflow value clips; '' comes from a browser without layout and clips nothing. */
const clips = (overflow: string): boolean => overflow !== '' && overflow !== 'visible';

/** The visible part of an element, or null when it is off the window, scrolled out of a shelf, or not drawn. */
function seen(el: HTMLElement): Box | null {
  if (!el.isConnected) return null;
  const own = el.getBoundingClientRect();
  const box: Box = {
    left: Math.max(own.left, 0),
    top: Math.max(own.top, 0),
    right: Math.min(own.right, window.innerWidth),
    bottom: Math.min(own.bottom, window.innerHeight),
  };
  for (let up = el.parentElement; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
    const style = getComputedStyle(up);
    if (!clips(style.overflowX) && !clips(style.overflowY)) continue;
    const by = up.getBoundingClientRect();
    box.left = Math.max(box.left, by.left);
    box.top = Math.max(box.top, by.top);
    box.right = Math.min(box.right, by.right);
    box.bottom = Math.min(box.bottom, by.bottom);
  }
  return box.right > box.left && box.bottom > box.top ? box : null;
}

/** The largest visible element of a set, so a page showing a picture twice lands on the bigger one. */
function biggest(among: Set<HTMLElement> | undefined): HTMLElement | null {
  let best: HTMLElement | null = null;
  let most = 0;
  for (const el of among ?? []) {
    const box = seen(el);
    const size = box ? (box.right - box.left) * (box.bottom - box.top) : 0;
    if (size > most) {
      best = el;
      most = size;
    }
  }
  return best;
}

/** The ancestors that scroll inside the page, nearest first. */
function shelvesOf(el: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (let up = el.parentElement; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
    if (up.scrollWidth <= up.clientWidth && up.scrollHeight <= up.clientHeight) continue;
    const style = getComputedStyle(up);
    if (clips(style.overflowX) || clips(style.overflowY)) found.push(up);
  }
  return found;
}

/**
 * The card a head returns to: among cards for the same journey, the one at the pressed card's height. A redrawn page
 * starts its shelves at zero, so their scroll is restored first; if the card is then off screen, there is none.
 */
function cardAt(among: Set<HTMLElement> | undefined, home: Home | null, redrawn = true): HTMLElement | null {
  let best: HTMLElement | null = null;
  let least = Infinity;
  for (const el of among ?? []) {
    if (!el.isConnected) continue;
    const own = el.getBoundingClientRect();
    const far = home?.near ? Math.abs(own.top + own.bottom - home.near.top - home.near.bottom) : 0;
    if (far < least) {
      best = el;
      least = far;
    }
  }
  if (!best) return null;
  const shelves = redrawn ? shelvesOf(best) : [];
  if (home && shelves.length > 0 && shelves.length === home.shelves.length) {
    shelves.forEach((shelf, i) => {
      const at = home.shelves[i]!;
      if (shelf.scrollLeft !== at.left || shelf.scrollTop !== at.top) shelf.scrollTo({ left: at.left, top: at.top, behavior: 'instant' });
    });
  }
  return seen(best) ? best : null;
}

/** Registers an end of a journey while it is drawn; returns the cleanup. */
function enrol(book: Map<string, Set<HTMLElement>>, journey: string, el: HTMLElement, shape: CarriedShape): () => void {
  const listed = book.get(journey) ?? new Set<HTMLElement>();
  book.set(journey, listed);
  listed.add(el);
  shapes.set(el, shape);
  // A change of page may be waiting for exactly this.
  flight?.arrived?.();
  return () => {
    listed.delete(el);
    if (listed.size === 0 && book.get(journey) === listed) book.delete(journey);
  };
}

/** Remembers a plain press on one of the card's links, for the page change that link starts; new-tab presses carry nothing. */
function press(e: MouseEvent, host: HTMLElement, card: HTMLElement, journey: string, shape: CarriedShape): void {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
  // The link is inside the card, or the card is inside the link (a cover that is the whole card).
  if (!link || !(host.contains(link) || link.contains(host))) return;
  if (link.target && link.target !== '_self') return;
  const mine: Pressed = { journey, shape, card, to: trimmed(link.pathname) };
  pressed = mine;
  // The link has changed the address by now; a press still remembered led nowhere.
  window.setTimeout(() => {
    if (pressed === mine) pressed = null;
  }, 0);
}

/**
 * A ref for the picture on a card that grows into a page; `journey` matches the page's `useGrowsInto`. `within` selects
 * the card whose links start the journey (default: the element itself). Pass null where the component is not a card.
 */
export function useGrowsFrom(
  journey: string | null,
  { within, shape = 'picture' }: { within?: string; shape?: CarriedShape } = {},
): (el: HTMLElement | null) => (() => void) | undefined {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || journey === null) return undefined;
      const host = (within ? el.closest<HTMLElement>(within) : null) ?? el;
      // Capture phase, so the press is known before the link changes the address.
      const onClick = (e: MouseEvent): void => press(e, host, el, journey, shape);
      host.addEventListener('click', onClick, true);
      const strike = enrol(cards, journey, el, shape);
      return () => {
        host.removeEventListener('click', onClick, true);
        strike();
      };
    },
    [journey, within, shape],
  );
}

/**
 * A ref for the head of a page that a card grows into, with the card's `journey` and `shape`.
 *
 * Calling it also promises the head from the moment the page mounts, before the head itself may be drawn, and only a
 * page with that promise is waited for. So call it at the top of the page, above anything the page waits for, and pass
 * the ref down. Pass null where the component is not a page head.
 */
export function useGrowsInto(
  journey: string | null,
  { shape = 'picture' }: { shape?: CarriedShape } = {},
): (el: HTMLElement | null) => (() => void) | undefined {
  useLayoutEffect(() => {
    if (journey === null) return undefined;
    promised.set(journey, (promised.get(journey) ?? 0) + 1);
    return () => {
      const others = (promised.get(journey) ?? 1) - 1;
      if (others > 0) promised.set(journey, others);
      else promised.delete(journey);
    };
  }, [journey]);
  return useCallback((el: HTMLElement | null) => (el && journey !== null ? enrol(heads, journey, el, shape) : undefined), [journey, shape]);
}

/** Gives an element its shape's transition name for this change. */
function wear(f: Flight, el: HTMLElement, shape: CarriedShape): void {
  el.style.viewTransitionName = WORN[shape];
  f.worn.push(el);
}

/** Ends or abandons a change of page, taking off every name it gave. */
function settle(f: Flight | null = flight): void {
  if (!f) return;
  for (const el of f.worn) el.style.viewTransitionName = '';
  f.worn = [];
  f.dropped?.();
  if (flight !== f) return;
  flight = null;
  document.documentElement.classList.remove(CHANGING);
}

/**
 * What this change of page carries, if anything: the card just pressed, when the next page is the one its link opens;
 * else the head of the page being left, when its card's page is known or this is Back, landing only if the next page
 * has the card; else, on Forward, the card pressed the first time.
 */
function planFor(from: Location, to: Location, popped: boolean, mine: Pressed | null): Plan | null {
  const here = trimmed(from.pathname);
  const next = trimmed(to.pathname);
  if (mine && mine.to === next && mine.card.isConnected) {
    const at = mine.card.getBoundingClientRect();
    const shelves = shelvesOf(mine.card).map((shelf) => ({ left: shelf.scrollLeft, top: shelf.scrollTop }));
    keep(homes, mine.journey, { path: here, to: next, near: { left: at.left, top: at.top, right: at.right, bottom: at.bottom }, shelves });
    return { journey: mine.journey, shape: mine.shape, from: mine.card, end: 'head', home: null };
  }
  for (const [journey, among] of heads) {
    const home = homes.get(journey) ?? null;
    const head = home || popped ? biggest(among) : null;
    if (head) return { journey, shape: shapes.get(head) ?? 'picture', from: head, end: 'card', home };
  }
  if (!popped) return null;
  for (const [journey, home] of homes) {
    if (home.path !== here || home.to !== next) continue;
    // The page is as the reader has it now, shelves included, so the card starts from where it is.
    const card = cardAt(cards.get(journey), home, false);
    if (card) return { journey, shape: shapes.get(card) ?? 'picture', from: card, end: 'head', home: null };
  }
  return null;
}

/** Called by the router as each page is drawn. */
function drawn(location: Location): void {
  lastDrawn = location.key;
  if (flight && flight.awaits === location.key) flight.drawn?.();
}

/** Waits until the awaited page is drawn or `until` passes; false when it was not drawn in time. */
function drawnBy(f: Flight, until: number): Promise<boolean> {
  if (lastDrawn === f.awaits) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      f.drawn = null;
      resolve(false);
    }, Math.max(0, until - Date.now()));
    f.drawn = () => {
      window.clearTimeout(timer);
      f.drawn = null;
      resolve(true);
    };
  });
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** How often a growing page is checked again while the old one is held. */
const LOOK_MS = 30;

/**
 * Restores the scroll for Back and Forward. A list may still be loading and too short to scroll that far, so this
 * retries as the page grows until `until`, then settles as near as the page allows.
 */
async function placedBy(f: Flight, until: number): Promise<void> {
  const key = f.awaits;
  while (f.top !== undefined && f.awaits === key) {
    window.scrollTo({ top: f.top, behavior: 'instant' });
    if (Math.abs(window.scrollY - f.top) <= 1 || Date.now() >= until) return;
    await pause(LOOK_MS);
  }
}

/**
 * The other end on the page just drawn: the head, or the card it came from. Off screen counts as none. If it is not
 * drawn yet, it is waited for until `until` only when it is expected: a promised head, or a card on its own page.
 */
function landing(f: Flight, plan: Plan, until: number): Promise<HTMLElement | null> {
  const book = plan.end === 'head' ? heads : cards;
  const isDrawn = (): boolean => (book.get(plan.journey)?.size ?? 0) > 0;
  const isComing = (): boolean => (plan.end === 'head' ? promised.has(plan.journey) : plan.home?.path === f.path);
  const found = (): HTMLElement | null => {
    // The card is looked for at the restored scroll, and what was drawn with it may have lengthened the list.
    if (f.top !== undefined) window.scrollTo({ top: f.top, behavior: 'instant' });
    return plan.end === 'head' ? biggest(heads.get(plan.journey)) : cardAt(cards.get(plan.journey), plan.home);
  };
  const there = found();
  if (there || isDrawn() || !isComing()) return Promise.resolve(there);
  return new Promise((resolve) => {
    const done = (el: HTMLElement | null): void => {
      window.clearTimeout(timer);
      f.arrived = null;
      f.dropped = null;
      resolve(el);
    };
    const timer = window.setTimeout(() => done(found()), Math.max(0, until - Date.now()));
    f.arrived = () => {
      if (isDrawn()) done(found());
    };
    f.dropped = () => done(null);
  });
}

/** How the router draws a change of address. */
interface Draws {
  /** Hands an address change to the page, drawn once its code has loaded. */
  apply: (update: Update) => void;
  /** Lets the page just drawn run its effects at once (redirects, data requests). */
  finish: () => void;
}

/**
 * Draws the next page while the browser holds a picture of the last; the transition waits on this. Addresses apply
 * first, in order, so a failed transition never leaves a page undrawn.
 */
async function nextPage(f: Flight, plan: Plan | null, draws: Draws, skip: () => void): Promise<void> {
  const until = Date.now() + HOLD_MS;
  for (const update of f.waiting ?? []) draws.apply(update);
  f.waiting = null;
  try {
    for (;;) {
      const key = f.awaits;
      if (!(await drawnBy(f, until))) {
        // The page's code is slow: the old page is let go and the new one cuts in when it is ready.
        skip();
        return;
      }
      // A page that only redirects is not the destination: let it redirect now and wait for where it leads.
      draws.finish();
      if (f.awaits !== key) continue;
      await placedBy(f, until);
      if (f.awaits !== key) continue;
      if (!plan) return;
      const lands = await landing(f, plan, until);
      if (f.awaits !== key) continue;
      // Where the card's page is still drawn, the card must not share the head's name.
      plan.from.style.viewTransitionName = '';
      if (lands) wear(f, lands, plan.shape);
      return;
    }
  } finally {
    f.open = false;
  }
}

/** Draws one change of address: carried when it is another page and the browser and reader allow it, otherwise applied at once. */
function changePage(from: Location, update: Update, draws: Draws): void {
  const to = update.location;
  const popped = update.action === NavigationType.Pop;
  const mine = pressed;
  pressed = null;
  const moved = popped && swiped;
  swiped = false;

  if (flight?.open) {
    // The address moved again before the next page was ready (a redirect, a second press, Back twice): one change to
    // wherever it ends up, drawn in order.
    flight.awaits = to.key;
    flight.path = trimmed(to.pathname);
    flight.top = popped ? left.get(to.key) : undefined;
    // The head is now looked for on the new destination.
    flight.dropped?.();
    if (flight.waiting) flight.waiting.push(update);
    else draws.apply(update);
    return;
  }
  // Remember the scroll for coming back; a page passed through without being shown keeps what it had.
  keep(left, from.key, window.scrollY);
  // A page whose scroll is unknown is left to the browser to restore, which needs it drawn at once.
  if (!carriesPages() || !isAnotherPage(from, to) || document.visibilityState === 'hidden' || moved || (popped && !left.has(to.key))) {
    draws.apply(update);
    return;
  }

  settle();
  const plan = planFor(from, to, popped, mine);
  const f: Flight = {
    awaits: to.key,
    path: trimmed(to.pathname),
    open: true,
    waiting: [update],
    top: popped ? left.get(to.key) : undefined,
    drawn: null,
    arrived: null,
    dropped: null,
    worn: [],
  };
  flight = f;
  document.documentElement.classList.add(CHANGING);
  if (plan) wear(f, plan.from, plan.shape);

  let late = 0;
  let transition: ViewTransition | null = null;
  const begin = (): Promise<void> => {
    if (!f.waiting) return Promise.resolve();
    window.clearTimeout(late);
    return nextPage(f, plan, draws, () => transition?.skipTransition());
  };
  if (popped) {
    // The browser has started scrolling the old page for Back; put it back before its picture is taken.
    const at = window.scrollY;
    requestAnimationFrame(() => {
      if (f.waiting) window.scrollTo({ top: at, behavior: 'instant' });
    });
  }
  try {
    transition = document.startViewTransition(begin);
  } catch {
    f.open = false;
    f.waiting = null;
    settle(f);
    draws.apply(update);
    return;
  }
  // The browser calls back even for a skipped transition; this timer changes the page should it ever not.
  late = window.setTimeout(() => {
    if (!f.waiting) return;
    for (const waiting of f.waiting) draws.apply(waiting);
    f.waiting = null;
    f.open = false;
    transition?.skipTransition();
  }, HOLD_MS);
  // A skipped transition (hidden tab, another one started) rejects, which is not an error.
  const over = (): void => settle(f);
  transition.ready.catch(() => undefined);
  transition.updateCallbackDone.catch(() => undefined);
  transition.finished.then(over, over);
}

/**
 * The app's router: the library's BrowserRouter with each change handed to `changePage`. Changes it does not carry are
 * applied in a React transition, as that router does, so the old page stays up while the next page's code loads.
 */
export function CarriedRouter({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [history] = useState(() => createBrowserHistory({ v5Compat: true }));
  const [state, setState] = useState(() => ({ action: history.action, location: history.location }));
  // Bumped to redraw at once, after the page's own effects have run.
  const [, setTurn] = useState(0);
  // The last address handed over, drawn yet or not.
  const here = useRef(state.location);

  useLayoutEffect(() => {
    const draws: Draws = {
      apply: ({ action, location }) => startTransition(() => setState({ action, location })),
      finish: () => flushSync(() => setTurn((n) => n + 1)),
    };
    // Capture phase, before the history hears the event and reports the change.
    const onPop = (e: PopStateEvent): void => {
      swiped = e.hasUAVisualTransition === true;
    };
    window.addEventListener('popstate', onPop, true);
    const stop = history.listen((update) => {
      const from = here.current;
      here.current = update.location;
      changePage(from, update, draws);
    });
    return () => {
      stop();
      window.removeEventListener('popstate', onPop, true);
    };
  }, [history]);
  // After the page's own effects, when it is on screen to be pictured.
  useLayoutEffect(() => drawn(state.location), [state.location]);

  return (
    <Router location={state.location} navigationType={state.action} navigator={history}>
      {children}
    </Router>
  );
}
