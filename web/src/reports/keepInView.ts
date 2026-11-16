import { growFromOpener } from '../lib/opener';

/**
 * Nudge a small popup menu so all of it can be seen.
 *
 * A ⋯ can sit anywhere along a line — at the far edge of a phone screen beside
 * a long message, or at the left of a profile card — and its menu, anchored to
 * the button, then opened half off the window or half under the edge of the
 * card around it (a card that clips its overflow cuts a menu off before the
 * window does). This moves it back inside both, `edge` px clear, whichever
 * way the page reads. A menu that opens upward from a ⋯ near the top of the
 * page went up under the app's bar fixed at the top, out of reach: it opens
 * downward instead. Call it after the menu is drawn (a layout effect), each
 * time it opens.
 *
 * Once it is where it will stand, the menu grows out of the press that opened
 * it (lib/opener.ts), so it is seen to come from its button and not merely to
 * be there. That is done here, last, because here is where every such menu is
 * placed as it opens, and where it comes from can only be worked out once it
 * has been.
 */
export function keepInView(el: HTMLElement, edge = 8): void {
  el.style.transform = '';
  el.style.top = '';
  el.style.bottom = '';
  let r = el.getBoundingClientRect();
  if (r.height > 0 && r.top < barBottom() + edge) {
    el.style.top = 'calc(100% + 8px)';
    el.style.bottom = 'auto';
    r = el.getBoundingClientRect();
  }
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
  growFromOpener(el);
}

/** Where the app's bar fixed at the top of the page ends, in px from the top of the window: the stylesheet's own measure of it. */
function barBottom(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:var(--nav-bottom, 0px);left:0;width:0;height:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const y = probe.getBoundingClientRect().top;
  probe.remove();
  return Number.isFinite(y) ? y : 0;
}
