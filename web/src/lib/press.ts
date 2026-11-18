/**
 * Sets the `is-pressed` class that the build substitutes for `:active` (`pressStyles.ts`). A browser shows `:active`
 * the instant a finger lands, so scrolling lit up whatever it started on. Here a mouse, pen or key presses at once, a
 * finger only after holding still for `TOUCH_HOLD_MS`, and a quicker tap still flashes pressed.
 */

/** Whatever a click or tap does something on. */
const PRESSABLE =
  'a[href], button, summary, label, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"]';

/** How long a finger holds still before it is a press rather than the start of a scroll. */
export const TOUCH_HOLD_MS = 100;
/** How long a quick tap shows as pressed. */
export const TAP_FLASH_MS = 120;
/** How far a finger may move and still be pressing. */
const SLOP_PX = 10;

/** Starts showing presses on the page; returns the way to stop. */
export function installPressFeedback(doc: Document = document): () => void {
  let pressed: Element | null = null;
  let hold = 0;
  let flash = 0;
  let from = { x: 0, y: 0, id: -1 };

  const clear = (): void => {
    window.clearTimeout(hold);
    hold = 0;
    pressed?.classList.remove('is-pressed');
    pressed = null;
  };

  const target = (e: Event): Element | null => {
    const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
    if (!el || el.matches(':disabled, [aria-disabled="true"]')) return null;
    return el;
  };

  const down = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = target(e);
    clear();
    window.clearTimeout(flash);
    if (!el) return;
    pressed = el;
    from = { x: e.clientX, y: e.clientY, id: e.pointerId };
    if (e.pointerType === 'touch') {
      hold = window.setTimeout(() => {
        hold = 0;
        el.classList.add('is-pressed');
      }, TOUCH_HOLD_MS);
    } else el.classList.add('is-pressed');
  };

  const move = (e: PointerEvent): void => {
    if (!pressed || e.pointerId !== from.id || e.pointerType !== 'touch') return;
    // A finger that moves off is scrolling.
    if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > SLOP_PX) clear();
  };

  const up = (e: PointerEvent): void => {
    if (!pressed || e.pointerId !== from.id) return;
    const el = pressed;
    if (hold) {
      // Released before the hold was up: a tap, flashed briefly.
      window.clearTimeout(hold);
      hold = 0;
      el.classList.add('is-pressed');
      pressed = null;
      flash = window.setTimeout(() => el.classList.remove('is-pressed'), TAP_FLASH_MS);
      return;
    }
    clear();
  };

  const keyDown = (e: KeyboardEvent): void => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const el = target(e);
    if (el) el.classList.add('is-pressed');
  };
  const keyUp = (e: KeyboardEvent): void => {
    const el = target(e);
    el?.classList.remove('is-pressed');
  };

  const listen: Array<[string, EventListener]> = [
    ['pointerdown', down as EventListener],
    ['pointermove', move as EventListener],
    ['pointerup', up as EventListener],
    ['pointercancel', clear],
    ['dragstart', clear],
    ['scroll', clear],
    ['keydown', keyDown as EventListener],
    ['keyup', keyUp as EventListener],
  ];
  // Capture phase, so a scroll in any scrolling box ends the press.
  for (const [type, fn] of listen) doc.addEventListener(type, fn, { capture: true, passive: true });
  return () => {
    clear();
    window.clearTimeout(flash);
    for (const [type, fn] of listen) doc.removeEventListener(type, fn, { capture: true });
  };
}
