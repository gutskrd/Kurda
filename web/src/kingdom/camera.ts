import { KINGDOM_PLOTS, KINGDOM_SCENE, KINGDOM_BUILDINGS } from '@kurda/shared';

/**
 * The camera over The Village's world on the website: where it looks (a
 * point on the world's canvas, in canvas units) and how near (CSS pixels per
 * canvas unit), and the pure steps the page takes with it — keep it inside
 * the world and between its zoom limits, turn a point on the screen into one
 * on the canvas, zoom about a point, find what is in view, open on the
 * village's heart, and go to a building.
 *
 * The stage shows the whole world under a top bar and over a tray of cards,
 * so the camera centres what it looks at in the band between them; the
 * world itself always covers the whole stage, under the bar and the tray
 * too, so its edge is never seen.
 */

export interface Camera {
  /** the point on the canvas at the middle of the band in view */
  x: number;
  y: number;
  /** CSS pixels per canvas unit */
  s: number;
}

/** The stage on the screen: its size, and how much of its top and bottom the bar and the tray cover. */
export interface Stage {
  w: number;
  h: number;
  top: number;
  bottom: number;
}

const WORLD = { w: KINGDOM_SCENE.width, h: KINGDOM_SCENE.height };

/** On a 390-wide phone at the opening zoom, the narrowest building's box is at least this many pixels across. */
export const OPENING_MIN_BUILDING = 110;

/** The narrowest building's tap box, in canvas units. */
const NARROWEST = Math.min(...KINGDOM_BUILDINGS.map((b) => KINGDOM_PLOTS[b].box.w));

/** The heart of the village: the middle of the six buildings' boxes. */
export const HEART = (() => {
  const boxes = KINGDOM_BUILDINGS.map((b) => KINGDOM_PLOTS[b].box);
  const x0 = Math.min(...boxes.map((b) => b.x));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
})();

/** The middle of the band between the bar and the tray, from the stage's top. */
const bandMiddle = (v: Stage): number => v.top + Math.max(0, v.h - v.top - v.bottom) / 2;

/** How far out and how far in the camera may go, and where it opens: out until the world just covers the stage; in until a building nearly fills a phone. */
export function zoomLimits(v: Stage): { min: number; max: number; open: number } {
  const min = Math.max(v.w / WORLD.w, v.h / WORLD.h);
  const open = Math.max(min, OPENING_MIN_BUILDING / NARROWEST + 0.02);
  return { min, max: Math.max(open * 2.2, min * 1.5), open };
}

/** The camera kept between its zoom limits and far enough inside the world that its edge never shows. */
export function clampCamera(c: Camera, v: Stage): Camera {
  const { min, max } = zoomLimits(v);
  const s = Math.min(max, Math.max(min, c.s));
  const mid = bandMiddle(v);
  const x0 = v.w / 2 / s;
  const x1 = WORLD.w - v.w / 2 / s;
  const y0 = mid / s;
  const y1 = WORLD.h - (v.h - mid) / s;
  return { s, x: x0 > x1 ? WORLD.w / 2 : Math.min(x1, Math.max(x0, c.x)), y: y0 > y1 ? WORLD.h / 2 : Math.min(y1, Math.max(y0, c.y)) };
}

/** Where the world's top left sits on the stage, in CSS pixels, and its scale: the transform the page gives the world. */
export function transformOf(c: Camera, v: Stage): { tx: number; ty: number; s: number } {
  return { tx: v.w / 2 - c.x * c.s, ty: bandMiddle(v) - c.y * c.s, s: c.s };
}

/** The point on the canvas under a point on the stage. */
export function canvasAt(c: Camera, v: Stage, px: number, py: number): { x: number; y: number } {
  const { tx, ty, s } = transformOf(c, v);
  return { x: (px - tx) / s, y: (py - ty) / s };
}

/** The camera zoomed by `factor` about a point on the stage, which keeps the same point of the world under it. */
export function zoomAt(c: Camera, v: Stage, px: number, py: number, factor: number): Camera {
  const { min, max } = zoomLimits(v);
  const s = Math.min(max, Math.max(min, c.s * factor));
  const at = canvasAt(c, v, px, py);
  // the new centre puts `at` back under (px, py) at the new scale
  const mid = bandMiddle(v);
  return clampCamera({ s, x: at.x - (px - v.w / 2) / s, y: at.y - (py - mid) / s }, v);
}

/** The camera moved by a drag of (dx, dy) CSS pixels. */
export function panBy(c: Camera, v: Stage, dx: number, dy: number): Camera {
  return clampCamera({ ...c, x: c.x - dx / c.s, y: c.y - dy / c.s }, v);
}

/** What of the canvas is in view, widened on every side by `margin` of the stage's own size, so what is about to come into view is ready. */
export function visibleRect(c: Camera, v: Stage, margin = 0.25): { x: number; y: number; w: number; h: number } {
  const a = canvasAt(c, v, -v.w * margin, -v.h * margin);
  const b = canvasAt(c, v, v.w * (1 + margin), v.h * (1 + margin));
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** Where the camera opens: on the village's heart, near enough that every building is big. */
export function openingCamera(v: Stage): Camera {
  return clampCamera({ x: HEART.x, y: HEART.y, s: zoomLimits(v).open }, v);
}

/** The camera looking at a box on the canvas (a building), at least as near as the opening view. */
export function cameraOn(box: { x: number; y: number; w: number; h: number }, v: Stage, s?: number): Camera {
  const { open } = zoomLimits(v);
  return clampCamera({ x: box.x + box.w / 2, y: box.y + box.h / 2, s: Math.max(s ?? open, open) }, v);
}

/** A step of the way from one camera to another, `f` from 0 to 1, eased so it starts and ends gently (the zoom goes evenly in proportion). */
export function between(a: Camera, b: Camera, f: number): Camera {
  const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, s: a.s * Math.pow(b.s / a.s, e) };
}
