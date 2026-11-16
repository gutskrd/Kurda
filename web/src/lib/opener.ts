import { playsMotion } from './motion';

/**
 * Where something that opens came from: the press that opened it.
 *
 * A dialog used to rise in the middle of the screen whatever had been
 * pressed, in a corner or at the foot of a long page, and the reader was left
 * to work out that the two belonged together. It grows out of what opened it
 * now (components/Modal.tsx, styles/motion.css), and for that the dialog has
 * to know where that was. Nothing hands it over: a dialog is opened by a
 * change of state several components away from the button, so the last press
 * is watched for here instead, and asked for as the dialog opens.
 *
 * A press is a click: with a pointer it is the point that was touched; from
 * the keyboard (Enter or Space on a button, which the browser reports as a
 * click at no point at all) it is the middle of the control the keyboard was
 * on. A key that opens something by itself, with no click, counts from the
 * control that has the focus.
 *
 * Only a press just made is an opener (`RECENT_MS`). A dialog that arrives by
 * itself — a badge earned, a warning, a gift — may come long after the last
 * press, from nothing on the screen, and has no opener: it opens as dialogs
 * always did.
 */

/** How long after a press something that opens is taken to have been opened by it. */
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

/** Starts watching presses on the page; gives back a way to stop. */
export function watchOpeners(doc: Document = document): () => void {
  const onClick = (e: MouseEvent): void => {
    // a click the keyboard made has no place of its own (`detail` counts presses of a pointer, and is 0)
    const at = e.detail === 0 && e.target instanceof Element ? middle(e.target) : { x: e.clientX, y: e.clientY };
    last = { ...at, at: Date.now() };
  };
  const onKey = (e: KeyboardEvent): void => {
    // typing in a field opens nothing: a key counts only from a control, or from nowhere in particular
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

/** Where the press that is opening something now was made, or null when nothing was pressed just before. */
export function openerPoint(now: number = Date.now()): Point | null {
  if (!last || now - last.at > RECENT_MS) return null;
  return { x: last.x, y: last.y };
}

/**
 * A small menu that hangs from its button grows out of the press that opened
 * it: called once the menu has been placed (reports/keepInView.ts), it gives
 * the menu that point to grow from and the class that makes it grow
 * (styles/motion.css `menu-grow`). Nothing happens for a menu no press
 * opened, or for a reader who asked for less motion: it is simply there, as
 * it was.
 */
export function growFromOpener(menu: HTMLElement, now: number = Date.now()): void {
  if (!playsMotion()) return;
  const from = openerPoint(now);
  if (!from) return;
  const box = menu.getBoundingClientRect();
  menu.style.transformOrigin = `${Math.round(from.x - box.left)}px ${Math.round(from.y - box.top)}px`;
  menu.classList.add('grows-from-opener');
}

/** A distance from the middle, as the rest of a sum: `+ 31px`, `- 528px`. */
const fromMiddle = (px: number): string => (px < 0 ? `- ${-px}px` : `+ ${px}px`);

/**
 * The point a panel grows from and goes back to, as the `transform-origin`
 * it is given: the opener. Null when nothing opened it, or the reader asked
 * for less motion — a panel that does not grow needs no point to grow from.
 *
 * The point is written from the panel's middle, not its corner. A dialog
 * stands in the middle of the layer that covers the window, and often opens
 * before what it holds has arrived: when that lands the panel is another
 * size, its corner has moved, and its middle has not. So the opener stays
 * where it was however the panel settles.
 *
 * The panel is measured where it rests, not where its opening movement has
 * it for the moment: `offsetLeft` and the rest are the box's place before
 * anything is moved, within that layer.
 */
export function originIn(panel: HTMLElement, now: number = Date.now()): string | null {
  if (!playsMotion()) return null;
  const from = openerPoint(now);
  if (!from) return null;
  const across = Math.round(from.x - (panel.offsetLeft + panel.offsetWidth / 2));
  const down = Math.round(from.y - (panel.offsetTop + panel.offsetHeight / 2));
  return `calc(50% ${fromMiddle(across)}) calc(50% ${fromMiddle(down)})`;
}
