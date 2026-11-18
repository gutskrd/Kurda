/**
 * Holds the page still under a sheet, dialog or viewer. The lock goes on the root element, never <body>: the root
 * already clips sideways overflow (base.css), so `hidden` on <body> made it a scroll container and the sticky top bar
 * stuck to it instead of the window. Locks nest, and the scrollbar gutter is kept so nothing shifts sideways.
 */
let holders = 0;
let saved: { overflow: string; gutter: string } | null = null;

/** Locks page scrolling until the returned function is called (once; later calls do nothing). */
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
