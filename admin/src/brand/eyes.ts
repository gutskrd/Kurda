/**
 * Hevalo's eyes follow the pointer: the mouse, or on a touch screen the
 * finger while it touches and a moment after. With nothing to follow, the
 * pupils go back to where the icon has them, turned in towards each other.
 * Each pupil moves within the white of its eye and eases towards where it
 * looks. Nothing runs while the eyes are still, and they stay as drawn for
 * whoever asks the system for less motion.
 *
 * The measures are the icon's own, in pixels of the square it is cut to (360):
 * each eye's white is 58 by 68, and a pupil's middle may move this far from
 * the middle of its white.
 */
const EYE = { width: 58, height: 68 } as const;
const REACH = { x: 13, y: 10 } as const;
/** Where each pupil's middle is drawn in the icon, in its eye's white: the left eye's, then the right's. */
export const REST = [
  { x: 40.6, y: 36 },
  { x: 19.3, y: 36.1 },
] as const;
/** How long the eyes keep looking where a finger left the screen. */
const LINGER_MS = 1500;

interface Pupil {
  element: HTMLElement;
  eye: HTMLElement;
  rest: { x: number; y: number };
  x: number;
  y: number;
}

const pupils = new Set<Pupil>();
let pointer: { x: number; y: number } | null = null;
let release = 0;
let running = false;
let listening = false;

/** Where a pupil looks: at the pointer, further the further away it is; else where the icon has it. */
function target(pupil: Pupil): { x: number; y: number } {
  if (!pointer) return pupil.rest;
  const box = pupil.eye.getBoundingClientRect();
  const dx = pointer.x - (box.left + box.width / 2);
  const dy = pointer.y - (box.top + box.height / 2);
  const distance = Math.hypot(dx, dy) || 1;
  const reach = Math.min(1, distance / (box.width * 3 + 40));
  return { x: EYE.width / 2 + (dx / distance) * REACH.x * reach, y: EYE.height / 2 + (dy / distance) * REACH.y * reach };
}

function frame(): void {
  let moving = false;
  for (const pupil of pupils) {
    const box = pupil.eye.getBoundingClientRect();
    if (box.width === 0) continue;
    const to = target(pupil);
    pupil.x += (to.x - pupil.x) * 0.2;
    pupil.y += (to.y - pupil.y) * 0.2;
    if (Math.abs(to.x - pupil.x) + Math.abs(to.y - pupil.y) > 0.05) moving = true;
    else {
      pupil.x = to.x;
      pupil.y = to.y;
    }
    // in the eye's own pixels on the screen, from where the icon draws the pupil
    const scale = box.width / EYE.width;
    const x = (pupil.x - pupil.rest.x) * scale;
    const y = (pupil.y - pupil.rest.y) * scale;
    pupil.element.style.translate = Math.abs(x) + Math.abs(y) < 0.01 ? '' : `${x.toFixed(2)}px ${y.toFixed(2)}px`;
  }
  running = moving;
  if (moving) requestAnimationFrame(frame);
}

function wake(): void {
  if (running || pupils.size === 0) return;
  running = true;
  requestAnimationFrame(frame);
}

function look(event: PointerEvent): void {
  // a finger is followed only while it touches the screen
  if (event.pointerType === 'touch' && event.type === 'pointermove' && event.buttons === 0) return;
  window.clearTimeout(release);
  pointer = { x: event.clientX, y: event.clientY };
  wake();
}

function lookAway(event: PointerEvent): void {
  if (event.pointerType !== 'touch') return;
  window.clearTimeout(release);
  release = window.setTimeout(() => {
    pointer = null;
    wake();
  }, LINGER_MS);
}

function leave(): void {
  pointer = null;
  wake();
}

const stillWanted = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Lets one icon's pupils (`left`, `right`) follow the pointer; returns what
 * stops them. The page listens for the pointer only while an icon is there.
 */
export function followPointer(left: HTMLElement, right: HTMLElement): () => void {
  if (typeof window === 'undefined' || stillWanted()) return () => undefined;
  const mine = [left, right].map((element, i) => {
    const rest = REST[i]!;
    return { element, eye: element.parentElement ?? element, rest, x: rest.x, y: rest.y };
  });
  for (const pupil of mine) pupils.add(pupil);
  if (!listening) {
    listening = true;
    window.addEventListener('pointermove', look, { passive: true });
    window.addEventListener('pointerdown', look, { passive: true });
    window.addEventListener('pointerup', lookAway, { passive: true });
    window.addEventListener('pointercancel', lookAway, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
  }
  if (pointer) wake();
  return () => {
    for (const pupil of mine) {
      pupils.delete(pupil);
      pupil.element.style.translate = '';
    }
    if (pupils.size === 0 && listening) {
      listening = false;
      window.removeEventListener('pointermove', look);
      window.removeEventListener('pointerdown', look);
      window.removeEventListener('pointerup', lookAway);
      window.removeEventListener('pointercancel', lookAway);
      document.documentElement.removeEventListener('pointerleave', leave);
    }
  };
}
