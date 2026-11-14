/**
 * When a button, a link or a row shows that it is pressed.
 *
 * A browser shows `:active` the instant a finger lands, so a finger that
 * lands on a button only to scroll the page lit the button up, and every
 * scroll through a list flickered the rows it passed over. The pressed look
 * is drawn from a class instead (`is-pressed`; the build turns the styles'
 * `:active` into it, `pressStyles.ts`), and the class is set here the way the
 * systems' own lists do it: at once for a mouse or a pen, but for a finger
 * only once it has stayed put for `TOUCH_HOLD_MS` without moving off to
 * scroll. A quick tap, let go before then, still flashes pressed as it lands,
 * so a tap always answers. The keyboard's Space and Enter press too.
 */

/** What can be pressed: whatever a click or a tap does something on. */
const PRESSABLE =
  'a[href], button, summary, label, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"]';

/** How long a finger stays put before it is a press rather than the start of a scroll, as a phone's own lists wait. */
export const TOUCH_HOLD_MS = 100;
/** How long a quick tap shows as pressed, so it is seen. */
export const TAP_FLASH_MS = 120;
/** How far a finger may move and still be pressing, rather than scrolling. */
const SLOP_PX = 10;

/** Starts showing presses on the page; gives back a way to stop. */
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
    // a finger that has set off is scrolling, not pressing
    if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > SLOP_PX) clear();
  };

  const up = (e: PointerEvent): void => {
    if (!pressed || e.pointerId !== from.id) return;
    const el = pressed;
    if (hold) {
      // let go before the hold was up: a tap, shown for an instant as it lands
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
  // scrolling anywhere ends a press, so it is heard on the way down from every scrolling box
  for (const [type, fn] of listen) doc.addEventListener(type, fn, { capture: true, passive: true });
  return () => {
    clear();
    window.clearTimeout(flash);
    for (const [type, fn] of listen) doc.removeEventListener(type, fn, { capture: true });
  };
}
