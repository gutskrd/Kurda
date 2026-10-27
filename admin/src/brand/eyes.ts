/**
 * Hevalo's eyes follow the pointer: the mouse, or on a touch screen the
 * finger while it touches and a moment after. With nothing to follow, the
 * pupils go back to where the icon has them, turned in towards each other.
 * Each pupil moves within the white of its eye and eases towards where it
 * looks. Nothing runs while the eyes are still, and they stay as drawn for
 * whoever asks the system for less motion.
 *
 * An icon can be given something else to look at (`gaze`: the caret in a box
 * being typed in, say), and can lean a little towards where it looks
 * (`tilt`), as a head turns with its eyes.
 *
 * The measures are each picture's own, in its pixels (`EyeGeometry`).
 */
/** An eye as a picture draws it, in that picture's own pixels: its white, how far a pupil's middle may move from the white's middle, and where the picture has each pupil. */
export interface EyeGeometry {
  width: number;
  height: number;
  reach: Point;
  /** the left eye's pupil, then the right's */
  rest: readonly [Point, Point];
}

/** The icon's eyes (its square is 360): each white 58 by 68, the pupils turned in towards each other. */
export const ICON_EYES: EyeGeometry = {
  width: 58,
  height: 68,
  reach: { x: 13, y: 10 },
  rest: [
    { x: 40.6, y: 36 },
    { x: 19.3, y: 36.1 },
  ],
};

/** The sign-in's Hevalo, head and neck (744 by 810): each white 149 by 172, the pupils 64 by 97 and turned in as drawn. */
export const PEEK_EYES: EyeGeometry = {
  width: 149,
  height: 172,
  reach: { x: 36, y: 30 },
  rest: [
    { x: 97, y: 87.5 },
    { x: 53, y: 87.5 },
  ],
};

/** How long the eyes keep looking where a finger left the screen. */
const LINGER_MS = 1500;

/** How far an icon given `tilt` leans, in degrees, looking as far as it can. */
const LEAN = { x: 9, y: 7 } as const;

export interface Point {
  x: number;
  y: number;
}

/** What an icon looks at instead of the pointer: a point on the screen, null for straight ahead, undefined for the pointer. */
export type Gaze = () => Point | null | undefined;

interface Pupil {
  element: HTMLElement;
  eye: HTMLElement;
  rest: Point;
  x: number;
  y: number;
}

interface Face {
  pupils: Pupil[];
  eyes: EyeGeometry;
  gaze?: Gaze;
  /** the element that leans, and how far it leans now */
  tilt?: { element: HTMLElement; x: number; y: number };
}

const faces = new Set<Face>();
let pointer: Point | null = null;
let release = 0;
let running = false;
let frameId = 0;
let listening = false;

/** Where a face looks: what it was given to look at, else the pointer. */
function lookingAt(face: Face): Point | null {
  const given = face.gaze?.();
  return given === undefined ? pointer : given;
}

/** Where a pupil looks: at the point, further the further away it is; else where the picture has it. */
function target(pupil: Pupil, eyes: EyeGeometry, at: Point | null): Point {
  if (!at) return pupil.rest;
  const box = pupil.eye.getBoundingClientRect();
  const dx = at.x - (box.left + box.width / 2);
  const dy = at.y - (box.top + box.height / 2);
  const distance = Math.hypot(dx, dy) || 1;
  const reach = Math.min(1, distance / (box.width * 3 + 40));
  return { x: eyes.width / 2 + (dx / distance) * eyes.reach.x * reach, y: eyes.height / 2 + (dy / distance) * eyes.reach.y * reach };
}

function frame(): void {
  let moving = false;
  for (const face of faces) {
    const at = lookingAt(face);
    for (const pupil of face.pupils) {
      const box = pupil.eye.getBoundingClientRect();
      if (box.width === 0) continue;
      const to = target(pupil, face.eyes, at);
      pupil.x += (to.x - pupil.x) * 0.2;
      pupil.y += (to.y - pupil.y) * 0.2;
      if (Math.abs(to.x - pupil.x) + Math.abs(to.y - pupil.y) > 0.05) moving = true;
      else {
        pupil.x = to.x;
        pupil.y = to.y;
      }
      // in the eye's own pixels on the screen, from where the icon draws the pupil
      const scale = box.width / face.eyes.width;
      const x = (pupil.x - pupil.rest.x) * scale;
      const y = (pupil.y - pupil.rest.y) * scale;
      pupil.element.style.translate = Math.abs(x) + Math.abs(y) < 0.01 ? '' : `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    }
    const tilt = face.tilt;
    if (tilt) {
      // leaning as far as the eyes have turned: right and down are where the pupils' middles have moved to
      const { width, height, reach } = face.eyes;
      const turned = face.pupils.reduce((sum, p) => ({ x: sum.x + (p.x - width / 2) / reach.x, y: sum.y + (p.y - height / 2) / reach.y }), { x: 0, y: 0 });
      const to = at ? { x: (turned.x / face.pupils.length) * LEAN.x, y: (turned.y / face.pupils.length) * LEAN.y } : { x: 0, y: 0 };
      tilt.x += (to.x - tilt.x) * 0.15;
      tilt.y += (to.y - tilt.y) * 0.15;
      if (Math.abs(to.x - tilt.x) + Math.abs(to.y - tilt.y) > 0.02) moving = true;
      tilt.element.style.setProperty('--lean-y', `${tilt.x.toFixed(2)}deg`);
      tilt.element.style.setProperty('--lean-x', `${(-tilt.y).toFixed(2)}deg`);
    }
  }
  running = moving;
  if (moving) frameId = requestAnimationFrame(frame);
}

function wake(): void {
  if (running || faces.size === 0) return;
  running = true;
  frameId = requestAnimationFrame(frame);
}

/** Something an icon's `gaze` reads has changed (the caret moved): its eyes move to it. */
export function nudge(): void {
  wake();
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
 * Lets one icon's pupils (`left`, `right`) follow the pointer, or what `gaze`
 * gives, and `tilt` lean with them; returns what stops them. The page listens
 * for the pointer only while an icon is there.
 */
export function followPointer(
  left: HTMLElement,
  right: HTMLElement,
  options: { gaze?: Gaze; tilt?: HTMLElement | null; eyes?: EyeGeometry } = {},
): () => void {
  if (typeof window === 'undefined' || stillWanted()) return () => undefined;
  const eyes = options.eyes ?? ICON_EYES;
  const mine = [left, right].map((element, i) => {
    const rest = eyes.rest[i]!;
    return { element, eye: element.parentElement ?? element, rest, x: rest.x, y: rest.y };
  });
  const face: Face = { pupils: mine, eyes, gaze: options.gaze, tilt: options.tilt ? { element: options.tilt, x: 0, y: 0 } : undefined };
  faces.add(face);
  if (!listening) {
    listening = true;
    window.addEventListener('pointermove', look, { passive: true });
    window.addEventListener('pointerdown', look, { passive: true });
    window.addEventListener('pointerup', lookAway, { passive: true });
    window.addEventListener('pointercancel', lookAway, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
  }
  if (pointer || options.gaze) wake();
  return () => {
    faces.delete(face);
    for (const pupil of mine) pupil.element.style.translate = '';
    face.tilt?.element.style.removeProperty('--lean-x');
    face.tilt?.element.style.removeProperty('--lean-y');
    // the last icon gone: no frame is left waiting, so the next one starts afresh
    if (faces.size === 0 && running) {
      cancelAnimationFrame(frameId);
      running = false;
    }
    if (faces.size === 0 && listening) {
      listening = false;
      window.removeEventListener('pointermove', look);
      window.removeEventListener('pointerdown', look);
      window.removeEventListener('pointerup', lookAway);
      window.removeEventListener('pointercancel', lookAway);
      document.documentElement.removeEventListener('pointerleave', leave);
    }
  };
}

/**
 * About where the caret is in a box being typed in, on the screen, for the
 * eyes to follow along as an address is typed: worked out from how much text
 * is before it, which is near enough for eyes.
 */
export function caretPoint(input: HTMLInputElement): Point {
  const box = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  const start = Number.parseFloat(style.paddingLeft) || 0;
  const end = Number.parseFloat(style.paddingRight) || 0;
  const size = Number.parseFloat(style.fontSize) || 16;
  const typed = input.selectionEnd ?? input.value.length;
  const x = box.left + start + typed * size * 0.52 - input.scrollLeft;
  return { x: Math.min(box.right - end, Math.max(box.left + start, x)), y: box.top + box.height / 2 };
}
