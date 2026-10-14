/**
 * Nudge a small popup menu sideways so all of it can be seen.
 *
 * A ⋯ can sit anywhere along a line — at the far edge of a phone screen beside
 * a long message, or at the left of a profile card — and its menu, anchored to
 * the button, then opened half off the window or half under the edge of the
 * card around it (a card that clips its overflow cuts a menu off before the
 * window does). This moves it back inside both, `edge` px clear, whichever
 * way the page reads. Call it after the menu is drawn (a layout effect), each
 * time it opens.
 */
export function keepInView(el: HTMLElement, edge = 8): void {
  el.style.transform = '';
  const r = el.getBoundingClientRect();
  let left = edge;
  let right = window.innerWidth - edge;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowX;
    if (overflow && overflow !== 'visible') {
      const box = p.getBoundingClientRect();
      left = Math.max(left, box.left + edge);
      right = Math.min(right, box.right - edge);
      break;
    }
  }
  let dx = 0;
  if (r.right > right) dx = right - r.right;
  if (r.left + dx < left) dx = left - r.left;
  if (dx !== 0) el.style.transform = `translateX(${Math.round(dx)}px)`;
}
