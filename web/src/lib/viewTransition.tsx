import { startTransition, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { NavigationType, Router, UNSAFE_createBrowserHistory as createBrowserHistory, type Location } from 'react-router-dom';
import { playsMotion } from './motion';

/**
 * How one page becomes the next: carried, not cut.
 *
 * A link followed used to be a hard cut: one page was there, then another
 * was, and the reader found their place again. Here the browser keeps a
 * picture of the page being left while the next one is drawn, and fades the
 * one into the other (its view transitions; the movements themselves are in
 * styles/motion.css, on the same tokens as everything else). A card pressed
 * on the way does more than fade: its picture travels to the matching head of
 * the page it opens and becomes it, and on the way back the head shrinks to
 * the card it came from.
 *
 * All of it is an extra. Where the browser has no view transitions, or the
 * reader asked their device for less motion, nothing here runs and a page
 * changes exactly as it always did (`carriesPages`).
 *
 * `CarriedRouter` is the app's router. The router library draws a new page
 * the moment the address changes, and only its data routers can be told to
 * wait for a transition, one link at a time; the app's routes are components,
 * where that request is quietly dropped. So this is the library's own
 * BrowserRouter, written out, with one difference: a change of page is handed
 * to the browser as a transition, and drawn inside it. That covers every way
 * of getting to a page at once — a link, a redirect, the browser's own Back
 * and Forward — with no link having to ask. It is built on the library's own
 * browser history, the very one BrowserRouter uses, which the library exports
 * under a name that warns it may move between versions: if it does, this file
 * stops compiling, which is the right way to find out.
 *
 * Only another page is carried (`isAnotherPage`): a filter, a tab or a
 * conversation chosen changes what follows the `?`, and the reader has not
 * gone anywhere, as layouts/usePageTop.ts also has it.
 *
 * To make the next card grow into its page, name the journey once at each
 * end, with the same words:
 *
 *   on the card   <img ref={useGrowsFrom(`recipe:${id}`, { within: '.recipe-card' })} />
 *   on the page   <img ref={useGrowsInto(`recipe:${id}`)} />
 *
 * `within` is the card around the picture, whose links start the journey;
 * without it the element is its own card. The page's line goes at the top of
 * the page, above anything the page waits for: calling it is how the page
 * says that the head is coming, which is what a card's picture is held for.
 * A picture fills the box as it travels from the one size to the other, so
 * the two ends should show the same drawing. A whole card that becomes a page
 * says `shape: 'card'` at both ends instead: its words are not scaled, and
 * the box opens from the card's size to the page's. Nothing else is needed,
 * and nothing has to be undone: the way back is found from the same two
 * lines.
 *
 * The browser pairs the two ends by a name both wear, and gives up on the
 * whole transition if two things on one page wear the same name. So nothing
 * wears one at rest. The card pressed takes the name as the page is left, the
 * head takes it as the next page is drawn, and both drop it when the picture
 * has landed. A story listed on three shelves is therefore no trouble: only
 * the one that was pressed is named.
 *
 * The next page has `HOLD_MS` to show the head it has promised. A page still
 * waiting for its data after that is shown as it is, and the change is the
 * plain fade: the picture is an addition to getting there, never a wait for
 * it. A page that promises no such head is not waited for at all. Going back
 * works the same way round, with two more conditions: the card has to be on
 * the page that is returned to, and on the screen. A list that has changed,
 * or is somewhere else by now, gets the plain fade as well. A list that is
 * drawn in two goes, its cards moving when the second arrives, gives null for
 * the journey until it has its final shape (pages/Games.tsx): a head goes
 * back to where its card will stay, and is held for that.
 *
 * Back and Forward land where the reader was. The browser puts the scroll
 * back by itself as soon as the address changes, which is before the page it
 * belongs to has been drawn here, so inside a transition the place is kept
 * and put back by this file instead (`left`), once the page is there — and
 * if the page comes back shorter than it was, part of it still being asked
 * for, it is waited for within the same `HOLD_MS` and put back when it is
 * long enough. A shelf scrolled sideways is put back too, for the card a
 * head is returning to. A page whose place is not known — one from before
 * the tab was loaded again — is not carried: it changes at once, and the
 * browser restores it as it always has. Neither is a Back the reader made
 * by swiping the page aside on a phone: the browser has moved the page under
 * the finger by then, and a second movement would play the change twice.
 */

/** How long the page being left is held still for the next one, at most; after that the next page is shown as it is. */
export const HOLD_MS = 400;

/** What travels: a picture, the same drawing at both ends, or a card that becomes a longer page. */
export type CarriedShape = 'picture' | 'card';

/** The name each shape travels under; styles/motion.css draws the two by these. */
const WORN: Record<CarriedShape, string> = { picture: 'carried-picture', card: 'carried-card' };

/** On the root element for as long as a page is changing: the bars take their own names for exactly that long (styles/motion.css). */
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

/** A card pressed a moment ago: what it carries, and the page its link leads to. */
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

/**
 * Where a journey started: the page its card is on, the page it opened,
 * where on the screen the card was, and how far each shelf around it had
 * been scrolled, the nearest first.
 */
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
  /** what wears the name on the page being left */
  from: HTMLElement;
  /** which end the next page has to show for the picture to land */
  end: 'head' | 'card';
  /** where the card was when it was pressed, for the way back to it; only that page is held for the card */
  home: Home | null;
}

/** A change of page in progress. */
interface Flight {
  /** the key of the page it is waiting to see drawn, and that page's path */
  awaits: string;
  path: string;
  /**
   * True from the moment the browser is asked until the next page is handed
   * to it: another change of address in that time is part of this one, and
   * is drawn after it, in the order the addresses changed.
   */
  open: boolean;
  /** the changes of address it has yet to draw, until the browser calls for the next page; null once they are drawn */
  waiting: Update[] | null;
  /** where to put the scroll once the page is there (Back and Forward), or undefined to leave it to the page */
  top: number | undefined;
  /** tells it the page it waits for has been drawn */
  drawn: (() => void) | null;
  /** tells it something that could be the other end has just been drawn */
  arrived: (() => void) | null;
  /** stops it waiting for the other end */
  dropped: (() => void) | null;
  /** everything given a name for it, to take the names off again */
  worn: HTMLElement[];
}

/** The pictures of cards on the page now, by journey, and the heads of pages. */
const cards = new Map<string, Set<HTMLElement>>();
const heads = new Map<string, Set<HTMLElement>>();
const shapes = new WeakMap<HTMLElement, CarriedShape>();
/** The heads the page on the screen says it has, drawn yet or not: how many parts of it say so, by journey. */
const promised = new Map<string, number>();
/** Where each journey made in this tab started, for the way back. */
const homes = new Map<string, Home>();
/** How far down each page was when it was left, by its entry in the browser's history. */
const left = new Map<string, number>();

let pressed: Pressed | null = null;
let flight: Flight | null = null;
/** The key of the page drawn last. */
let lastDrawn: string | null = null;
/**
 * Whether the browser itself has just moved the page across for the Back or
 * Forward now arriving: a swipe from the edge of a phone's screen, which
 * slides the page under the finger. The page has been carried already, by
 * the hand, and carrying it again would play the change twice.
 */
let swiped = false;

/** Keeps a map to its newest entries: one tab can open a great many pages. */
function keep<V>(map: Map<string, V>, key: string, value: V, most = 200): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > most) map.delete(map.keys().next().value as string);
}

/** Everything remembered is dropped: for the tests, where one file is many visits. */
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

/** Whether a change of page is carried here: the browser can do it, and the reader has not asked for less motion. */
export function carriesPages(): boolean {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function' && playsMotion();
}

/** An address as the router reads it: `/app/` is `/app`. */
const trimmed = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

/**
 * Whether one address is another page than the other. What follows the `?`
 * or the `#` is the same page narrowed or scrolled: a search typed a letter
 * at a time rewrites the address on every one, and must not fade the page
 * each time.
 */
export function isAnotherPage(from: Pick<Location, 'pathname'>, to: Pick<Location, 'pathname'>): boolean {
  return trimmed(from.pathname) !== trimmed(to.pathname);
}

/** Whether a box cuts off what overflows it ('' is what a browser without layout answers, and cuts nothing). */
const clips = (overflow: string): boolean => overflow !== '' && overflow !== 'visible';

/**
 * The part of an element that is on the screen, or null when none of it is:
 * it is off the window, or scrolled out of a shelf that scrolls sideways, or
 * not drawn at all. A picture is only ever sent somewhere it can be seen
 * arriving.
 */
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

/** The largest of them on the screen: a page that shows its picture twice lands the card on the bigger one. */
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

/** The boxes around an element that scroll by themselves inside the page (a shelf of cards scrolled sideways), the nearest first. */
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
 * The card a head goes back to: the one of them where the pressed card was.
 *
 * The same story can stand on several shelves, and the one at the height the
 * pressed card was at is the one that was pressed. A page drawn again draws
 * its shelves from their start, so the shelves round that card are first put
 * back where they had been scrolled to. After that the card is either on the
 * screen, and is the answer, or it is not, and there is none.
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

/** Puts an end of a journey on the books while it is drawn; gives back the way to take it off. */
function enrol(book: Map<string, Set<HTMLElement>>, journey: string, el: HTMLElement, shape: CarriedShape): () => void {
  const listed = book.get(journey) ?? new Set<HTMLElement>();
  book.set(journey, listed);
  listed.add(el);
  shapes.set(el, shape);
  // a change of page may be waiting for exactly this
  flight?.arrived?.();
  return () => {
    listed.delete(el);
    if (listed.size === 0 && book.get(journey) === listed) book.delete(journey);
  };
}

/**
 * A press on a card: remembered if it was a plain press on a link of the
 * card's, for the change of page that link starts and no other. A press that
 * opens another tab, or a button that goes nowhere, carries nothing.
 */
function press(e: MouseEvent, host: HTMLElement, card: HTMLElement, journey: string, shape: CarriedShape): void {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
  // the link is in the card, or the card is in the link: a cover inside the link that is the whole card
  if (!link || !(host.contains(link) || link.contains(host))) return;
  if (link.target && link.target !== '_self') return;
  const mine: Pressed = { journey, shape, card, to: trimmed(link.pathname) };
  pressed = mine;
  // the link changes the address before this press is over; whatever is still here after it led nowhere
  window.setTimeout(() => {
    if (pressed === mine) pressed = null;
  }, 0);
}

/**
 * For the picture on a card that grows into a page: give the result as its
 * `ref`. `journey` is the same words the page's head is given
 * (`useGrowsInto`). `within` is a selector for the card around the picture,
 * whose links start the journey; left out, the element is its own card. A
 * component that is a card in one place and something else in another gives
 * null where it is not one.
 */
export function useGrowsFrom(
  journey: string | null,
  { within, shape = 'picture' }: { within?: string; shape?: CarriedShape } = {},
): (el: HTMLElement | null) => (() => void) | undefined {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || journey === null) return undefined;
      const host = (within ? el.closest<HTMLElement>(within) : null) ?? el;
      // heard on the way down, so the press is known before the link it lands on changes the address
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
 * For the head of a page that a card grows into: give the result as its
 * `ref`, with the card's own `journey` and `shape`.
 *
 * Calling it is a promise as well. A page says here that it has such a head
 * from the moment it is on the screen, which may be before the head is — a
 * story's cover waits for the story. A page that has made the promise is the
 * only one a card's picture is held for; a link in a card that leads to any
 * other page ("sign in to play", a game whose page has no cover) changes the
 * page at once. So the call belongs at the top of the page, above whatever
 * the page still has to wait for, and its result goes down to the head. A
 * component that is a page's head in one place and something else in another
 * gives null where it is not one, and promises nothing there.
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

/** Gives an element the name its shape travels under, for this change of page. */
function wear(f: Flight, el: HTMLElement, shape: CarriedShape): void {
  el.style.viewTransitionName = WORN[shape];
  f.worn.push(el);
}

/** A change of page is over, or overtaken: every name it gave comes off, so nothing wears one at rest. */
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
 * What this change of page carries, if anything.
 *
 * The card just pressed, when the page being opened is the one its link leads
 * to. Otherwise the head of the page being left, when its card is known to be
 * somewhere (the journey was made in this tab) or the reader is going Back:
 * it lands only if the page arrived at turns out to have the card, so a link
 * that leads home by way of an old address is as good as Back. Or, on
 * Forward, the card that was pressed the first time, when the same page is
 * being opened again.
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
    // the page is as the reader has it now, shelves included: the card goes from where it stands
    const card = cardAt(cards.get(journey), home, false);
    if (card) return { journey, shape: shapes.get(card) ?? 'picture', from: card, end: 'head', home: null };
  }
  return null;
}

/** Told by the router as each page is drawn. */
function drawn(location: Location): void {
  lastDrawn = location.key;
  if (flight && flight.awaits === location.key) flight.drawn?.();
}

/** Waits for the page a change is going to, until `until`; false when it was not drawn in time. */
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

/** A wait of `ms`. */
const pause = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** How often a page that is still growing is looked at again, while the last one is held for it. */
const LOOK_MS = 30;

/**
 * Back and Forward: the page is put where the reader left it. A list is not
 * always its full length the moment it is drawn — part of it is still being
 * asked for — and a page too short to be scrolled that far cannot be put
 * there yet. So it is tried again as the page grows, until it is there or
 * `until` has come, and then it is as near as the page allows.
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
 * The other end of what is carried, on the page just drawn: the head, or the
 * card it came from. A page that has drawn it answers at once: with it, or,
 * when it is drawn somewhere off the screen, with nothing. A page that has
 * not drawn it yet is waited for, until `until`, only where it is known to
 * be coming: a head the page has promised (`useGrowsInto`), a card on the
 * page it was pressed on. Any other page answers now, with nothing.
 */
function landing(f: Flight, plan: Plan, until: number): Promise<HTMLElement | null> {
  const book = plan.end === 'head' ? heads : cards;
  const isDrawn = (): boolean => (book.get(plan.journey)?.size ?? 0) > 0;
  const isComing = (): boolean => (plan.end === 'head' ? promised.has(plan.journey) : plan.home?.path === f.path);
  const found = (): HTMLElement | null => {
    // a card is looked for where the reader left the list, and what is drawn with it may have made the list longer
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

/** How the router draws: one change of address, and whatever the page just drawn is waiting to do. */
interface Draws {
  /** hands a change of address to the page, to be drawn as soon as its code is here */
  apply: (update: Update) => void;
  /** lets the page that was just drawn do at once what it does on being drawn — send the reader on, ask for its data */
  finish: () => void;
}

/**
 * The next page, drawn while the browser holds the picture of the last one:
 * what the browser's transition waits on. The addresses are applied before
 * anything else, in the order they changed, so a page is never left undrawn
 * by a transition that went wrong.
 */
async function nextPage(f: Flight, plan: Plan | null, draws: Draws, skip: () => void): Promise<void> {
  const until = Date.now() + HOLD_MS;
  for (const update of f.waiting ?? []) draws.apply(update);
  f.waiting = null;
  try {
    for (;;) {
      const key = f.awaits;
      if (!(await drawnBy(f, until))) {
        // its code is slow today: the old page is let go, and the new one cuts in when it is ready, as it always did
        skip();
        return;
      }
      // a page that only sends the reader on (an old address) is not the page: it is let do so now, and the page it
      // leads to is waited for in its place
      draws.finish();
      if (f.awaits !== key) continue;
      await placedBy(f, until);
      if (f.awaits !== key) continue;
      if (!plan) return;
      const lands = await landing(f, plan, until);
      if (f.awaits !== key) continue;
      // where the page the card was on is still drawn, the card must not wear the name beside the head
      plan.from.style.viewTransitionName = '';
      if (lands) wear(f, lands, plan.shape);
      return;
    }
  } finally {
    f.open = false;
  }
}

/**
 * One change of address, drawn. Carried when it is another page and the
 * browser and the reader allow it; otherwise applied at once, exactly as the
 * library's own router does.
 */
export function changePage(from: Location, update: Update, draws: Draws): void {
  const to = update.location;
  const popped = update.action === NavigationType.Pop;
  const mine = pressed;
  pressed = null;
  const moved = popped && swiped;
  swiped = false;

  if (flight?.open) {
    // the next page is still being got ready and the address has moved again (a page that sends the reader on, a second
    // press, Back twice): it is one change, to wherever this leads, drawn in the order the addresses changed
    flight.awaits = to.key;
    flight.path = trimmed(to.pathname);
    flight.top = popped ? left.get(to.key) : undefined;
    // and the head is looked for on that page, not the one it was first expected on
    flight.dropped?.();
    if (flight.waiting) flight.waiting.push(update);
    else draws.apply(update);
    return;
  }
  // where the page being left was, for the day the reader comes back to it (a page passed through in a hurry was never
  // on the screen, and what it remembers of an earlier visit is left alone)
  keep(left, from.key, window.scrollY);
  // a page whose place is not known is the browser's to restore, which it can only do when the page is drawn at once
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
    // the browser has begun gliding the page being left to where the next one was; it is put back before its picture is taken
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
  // the browser calls back even for a transition it skips; should it ever not, the page still changes
  late = window.setTimeout(() => {
    if (!f.waiting) return;
    for (const waiting of f.waiting) draws.apply(waiting);
    f.waiting = null;
    f.open = false;
    transition?.skipTransition();
  }, HOLD_MS);
  // a transition skipped (the tab was hidden, another began) is reported as a refusal, which is nobody's error
  const over = (): void => settle(f);
  transition.ready.catch(() => undefined);
  transition.updateCallbackDone.catch(() => undefined);
  transition.finished.then(over, over);
}

/**
 * The app's router: the library's BrowserRouter, with each change of page
 * handed to `changePage`. A change it does not carry is applied as that
 * router applies every change, as a transition of the page's own, so a page
 * whose code is still arriving leaves the last one standing until it is here.
 */
export function CarriedRouter({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [history] = useState(() => createBrowserHistory({ v5Compat: true }));
  const [state, setState] = useState(() => ({ action: history.action, location: history.location }));
  // counted up to have the page drawn once more, at once: the page's own effects are let run before that, which is the point
  const [, setTurn] = useState(0);
  // the page the reader is on or on the way to: the last address handed over, drawn yet or not
  const here = useRef(state.location);

  useLayoutEffect(() => {
    const draws: Draws = {
      apply: ({ action, location }) => startTransition(() => setState({ action, location })),
      finish: () => flushSync(() => setTurn((n) => n + 1)),
    };
    // heard on the way down, which is before the history hears it and reports the change
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
  // after every effect of the page itself, which is when the page is on the screen to be pictured
  useLayoutEffect(() => drawn(state.location), [state.location]);

  return (
    <Router location={state.location} navigationType={state.action} navigator={history}>
      {children}
    </Router>
  );
}
