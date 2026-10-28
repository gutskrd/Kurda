/**
 * Holding the page still while something covers it: a sheet, a dialog, a
 * picture viewer, the notifications on a phone.
 *
 * The lock goes on the root element, never on <body>. The root's overflow is
 * the window's, so the window stops scrolling and stays the scroll container.
 * A `hidden` on <body> is not handed up to the window here, because the root
 * already clips sideways overflow (base.css): it made <body> a scroll
 * container of its own, the sticky top bar stuck to that instead of the
 * window, and on a page already scrolled the bar left the screen with
 * whatever had just opened, while the page behind kept scrolling.
 *
 * Locks nest, as a dialog can open over a sheet: the page moves again when
 * the last one is released. Where the window had a scrollbar, its gutter is
 * kept while locked, so nothing behind shifts sideways.
 */
let holders = 0;
let saved: { overflow: string; gutter: string } | null = null;

/** Locks the page's scrolling until the returned function is called (once; later calls do nothing). */
export function lockPageScroll(): () => void {
  const root = document.documentElement;
  if (holders === 0) {
    saved = { overflow: root.style.overflow, gutter: root.style.getPropertyValue('scrollbar-gutter') };
    if (root.scrollHeight > root.clientHeight) root.style.setProperty('scrollbar-gutter', 'stable');
    root.style.overflow = 'hidden';
  }
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders > 0 || !saved) return;
    root.style.overflow = saved.overflow;
    root.style.setProperty('scrollbar-gutter', saved.gutter);
    saved = null;
  };
}
