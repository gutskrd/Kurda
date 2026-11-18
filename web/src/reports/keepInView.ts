import { growFromOpener } from '../lib/opener';

/**
 * Nudges a small popup menu back inside both the window and any clipping card around it, `edge` px clear, in either
 * direction; a menu that would open upward under the fixed top bar opens downward instead. Call it in a layout effect
 * each time the menu opens. Once placed, the menu is set to grow from the press that opened it (lib/opener.ts), which
 * can only be worked out after placement.
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

/** Where the fixed top bar ends, in px from the top of the window, as the stylesheet measures it. */
function barBottom(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:var(--nav-bottom, 0px);left:0;width:0;height:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const y = probe.getBoundingClientRect().top;
  probe.remove();
  return Number.isFinite(y) ? y : 0;
}
