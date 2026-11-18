import { playsMotion } from './motion';

/**
 * Where the press that opened something was, so dialogs and menus can grow out of it (components/Modal.tsx,
 * styles/motion.css). Openers are usually state changes several components away from the button, so the last press is
 * watched for here. A keyboard click counts from the middle of the focused control. Only a press within `RECENT_MS`
 * counts; a dialog that opens by itself (a badge, a gift) has no opener.
 */

/** How long after a press an opening element counts as opened by it. */
export const RECENT_MS = 500;

/** A point on the screen. */
export interface Point {
  x: number;
  y: number;
}

let last: (Point & { at: number }) | null = null;

/** The middle of an element, as it is drawn now. */
function middle(el: Element): Point {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** Starts watching presses on the page; returns the way to stop. */
export function watchOpeners(doc: Document = document): () => void {
  const onClick = (e: MouseEvent): void => {
    // A keyboard click has no position (`detail` is 0), so it counts from the control's middle.
    const at = e.detail === 0 && e.target instanceof Element ? middle(e.target) : { x: e.clientX, y: e.clientY };
    last = { ...at, at: Date.now() };
  };
  const onKey = (e: KeyboardEvent): void => {
    // Typing in a field opens nothing: a key counts only from a control, or from nowhere in particular.
    const on = doc.activeElement;
    if (e.metaKey || e.ctrlKey || e.altKey || !on || on === doc.body || on.matches('input, textarea, select, [contenteditable]')) return;
    last = { ...middle(on), at: Date.now() };
  };
  doc.addEventListener('click', onClick, { capture: true, passive: true });
  doc.addEventListener('keydown', onKey, { capture: true, passive: true });
  return () => {
    doc.removeEventListener('click', onClick, { capture: true });
    doc.removeEventListener('keydown', onKey, { capture: true });
    last = null;
  };
}

/** Where the press opening something now was made, or null when nothing was pressed just before. */
export function openerPoint(now: number = Date.now()): Point | null {
  if (!last || now - last.at > RECENT_MS) return null;
  return { x: last.x, y: last.y };
}

/**
 * Once a hanging menu is placed (reports/keepInView.ts), gives it the opener as its origin and the `menu-grow` class.
 * Does nothing without an opener or under reduced motion.
 */
export function growFromOpener(menu: HTMLElement, now: number = Date.now()): void {
  if (!playsMotion()) return;
  const from = openerPoint(now);
  if (!from) return;
  const box = menu.getBoundingClientRect();
  menu.style.transformOrigin = `${Math.round(from.x - box.left)}px ${Math.round(from.y - box.top)}px`;
  menu.classList.add('grows-from-opener');
}

/** A signed offset for a calc() sum: `+ 31px`, `- 528px`. */
const fromMiddle = (px: number): string => (px < 0 ? `- ${-px}px` : `+ ${px}px`);

/**
 * The panel's `transform-origin` at the opener, or null without one or under reduced motion. It is measured from the
 * panel's middle, which stays put when late content resizes a centred dialog, and from its resting box (`offsetLeft`),
 * not where its opening animation has it.
 */
export function originIn(panel: HTMLElement, now: number = Date.now()): string | null {
  if (!playsMotion()) return null;
  const from = openerPoint(now);
  if (!from) return null;
  const across = Math.round(from.x - (panel.offsetLeft + panel.offsetWidth / 2));
  const down = Math.round(from.y - (panel.offsetTop + panel.offsetHeight / 2));
  return `calc(50% ${fromMiddle(across)}) calc(50% ${fromMiddle(down)})`;
}
