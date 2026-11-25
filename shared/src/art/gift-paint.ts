/**
 * The gifts' hand: gouache laid on cut paper. Edges wander a little, as a cut or brushed edge does; lines are brush
 * marks that swell and lift off rather than ruled strokes; and each form is one flat colour with one cut piece of light
 * and one of shade laid over it. No gradients, glows or filters. Randomness comes from the gift's seeded generator, so
 * a drawing is the same string on every machine.
 */
import type { Drawing, Pt } from './svg.js';
import { n, n2 } from './svg.js';

export type Rnd = () => number;

/** A point `t` of the way from a to b. */
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const shift = (pts: readonly Pt[], dx: number, dy: number): Pt[] => pts.map(([x, y]) => [x + dx, y + dy]);

/** The points grown or shrunk about (cx, cy). */
export const scaleAbout = (pts: readonly Pt[], cx: number, cy: number, sx: number, sy = sx): Pt[] =>
  pts.map(([x, y]) => [cx + (x - cx) * sx, cy + (y - cy) * sy]);

/** The points turned `deg` degrees about (cx, cy). */
export function turn(pts: readonly Pt[], cx: number, cy: number, deg: number): Pt[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

export function centroid(pts: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

/** Every point nudged by up to `tremor` either way: the small unevenness of an edge cut or brushed by hand. */
export const tremble = (pts: readonly Pt[], rnd: Rnd, tremor = 0.35): Pt[] => pts.map(([x, y]) => [x + (rnd() - 0.5) * tremor, y + (rnd() - 0.5) * tremor]);

/** Straight runs between corners with a point every `step` or so, so a cut edge keeps its corners and still wanders. */
export function runs(corners: readonly Pt[], step = 4, closed = true): Pt[] {
  const out: Pt[] = [];
  const last = closed ? corners.length : corners.length - 1;
  for (let i = 0; i < last; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    const count = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < count; k++) out.push(lerp(a, b, k / count));
  }
  if (!closed) out.push(corners[corners.length - 1]!);
  return out;
}

/**
 * Points round an ellipse turned `rot` degrees, its radius wandering in a few slow waves and a fine tremor, as a round
 * thing cut from paper by hand does.
 */
export function roundish(cx: number, cy: number, rx: number, ry: number, rnd: Rnd, { wobble = 0.03, tremor = 0.3, count = 24, rot = 0 } = {}): Pt[] {
  const waves = [2, 3, 5].map((k) => [k, rnd() * Math.PI * 2, (0.5 + rnd() * 0.5) / k] as const);
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    let m = 1;
    for (const [k, ph, amp] of waves) m += Math.sin(a * k + ph) * amp * wobble * 2;
    out.push([cx + Math.cos(a) * rx * m + (rnd() - 0.5) * tremor, cy + Math.sin(a) * ry * m + (rnd() - 0.5) * tremor]);
  }
  return rot ? turn(out, cx, cy, rot) : out;
}

const tenth = (v: number): number => Math.round(v * 10) / 10;

/** Numbers as a path writes them: tenths, never "-0", a space between each. */
const nums = (...vs: number[]): string => vs.map((v) => n(v)).join(' ');

/**
 * A smooth curve through the points (Catmull-Rom), closed unless `closed` is false. Its tangents are mirrored at every
 * point, so after the first piece each is an `s` curve, and all of them are relative: half the length of the same
 * curve written out in full, which keeps a gift light enough to inline.
 */
export function curve(points: readonly Pt[], closed = true): string {
  const p = points.map(([x, y]): Pt => [tenth(x), tenth(y)]);
  const count = p.length;
  if (count < 2) return '';
  const at = (i: number): Pt => (closed ? p[(i + count) % count]! : p[Math.max(0, Math.min(count - 1, i))]!);
  const tangent = (i: number): Pt => [(at(i + 1)[0] - at(i - 1)[0]) / 6, (at(i + 1)[1] - at(i - 1)[1]) / 6];
  let d = `M${nums(p[0]![0], p[0]![1])}`;
  for (let i = 0; i < (closed ? count : count - 1); i++) {
    const a = at(i);
    const b = at(i + 1);
    const [tx, ty] = tangent(i + 1);
    const c2: Pt = [tenth(b[0] - tx - a[0]), tenth(b[1] - ty - a[1])];
    const end: Pt = [tenth(b[0] - a[0]), tenth(b[1] - a[1])];
    if (i === 0) {
      const [sx, sy] = tangent(i);
      d += `c${nums(tenth(sx), tenth(sy), c2[0], c2[1], end[0], end[1])}`;
    } else d += `s${nums(c2[0], c2[1], end[0], end[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** A closed outline through the points. */
export const outline = (pts: readonly Pt[]): string => curve(pts, true);

/** `count` + 1 points along a smooth curve through `points` (Catmull-Rom). */
export function along(points: readonly Pt[], count = 20): Pt[] {
  const out: Pt[] = [];
  const m = points.length - 1;
  for (let k = 0; k <= count; k++) {
    const t = (k / count) * m;
    const i = Math.min(m - 1, Math.floor(t));
    const f = t - i;
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(m, i + 2)]!;
    const at = (c: 0 | 1): number =>
      0.5 * (2 * p1[c] + (p2[c] - p0[c]) * f + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * f * f + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * f * f * f);
    out.push([at(0), at(1)]);
  }
  return out;
}

export interface BrushShape {
  /** The width at the first point, as a share of the fullest. */
  start?: number;
  /** The width where the brush lifts off, as a share of the fullest. */
  end?: number;
  /** Where along the mark it is fullest, 0 to 1. */
  peak?: number;
  count?: number;
}

/** A brush mark along a curve through `points`, `width` at its fullest, its width trembling a little as a loaded brush's does. */
export function brush(points: readonly Pt[], width: number, rnd: Rnd, { start = 0.3, end = 0.1, peak = 0.35, count = 12 }: BrushShape = {}): string {
  const line = along(points, count);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const a = line[Math.max(0, i - 1)]!;
    const b = line[Math.min(count, i + 1)]!;
    const p = line[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    const rise = t < peak ? start + (1 - start) * Math.sin(((t / peak) * Math.PI) / 2) : end + (1 - end) * Math.cos((((t - peak) / (1 - peak)) * Math.PI) / 2);
    const w = (width / 2) * rise * (0.88 + rnd() * 0.24);
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  }
  return outline([...left, ...right.reverse()]);
}

/** A small lens of paint `len` long and `wid` across at `deg` degrees, fuller where the brush touched down. */
export function touch(cx: number, cy: number, len: number, wid: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const [vx, vy] = [-uy, ux];
  const x0 = tenth(cx - (ux * len) / 2);
  const y0 = tenth(cy - (uy * len) / 2);
  const dx = tenth(ux * len);
  const dy = tenth(uy * len);
  const cx0 = ux * len * 0.4;
  const cy0 = uy * len * 0.4;
  return (
    `M${nums(x0, y0)}q${nums(tenth(cx0 + vx * wid), tenth(cy0 + vy * wid), dx, dy)}` +
    `q${nums(tenth(cx0 - vx * wid - dx), tenth(cy0 - vy * wid - dy), -dx, -dy)}Z`
  );
}

/** Short dry-brush marks scattered over a box, all laid near `deg` degrees, as one path to paint thinly over a form. */
export function streaks(rnd: Rnd, [x0, y0, x1, y1]: readonly [number, number, number, number], count: number, deg: number, len: number, width: number): string {
  let d = '';
  for (let i = 0; i < count; i++) {
    const cx = x0 + rnd() * (x1 - x0);
    const cy = y0 + rnd() * (y1 - y0);
    d += touch(cx, cy, len * (0.6 + rnd() * 0.6), (width / 2) * (0.6 + rnd() * 0.6), deg + (rnd() - 0.5) * 14);
  }
  return d;
}

/** Paints a path flat. */
export function paint(dr: Drawing, d: string, colour: string, opacity = 1): void {
  if (!d) return;
  dr.add(`<path d="${d}" fill="${colour}"${opacity < 1 ? ` fill-opacity="${n2(opacity)}"` : ''}/>`);
}

/** Each drawing's clip paths by outline, so a form clipped to more than once is written out once. */
const clips = new WeakMap<Drawing, Map<string, string>>();

/** Runs `draw` with all it paints kept inside `d`. */
export function within(dr: Drawing, d: string, draw: () => void): void {
  let known = clips.get(dr);
  if (!known) clips.set(dr, (known = new Map()));
  let id = known.get(d);
  if (!id) known.set(d, (id = dr.clip(d)));
  dr.add(`<g clip-path="url(#${id})">`);
  draw();
  dr.add('</g>');
}

/** Everything round the canvas and a little beyond it, to cut a shape out of. */
const EVERYWHERE = 'M-9 -9H129V129H-9Z';

/**
 * Lays a crescent of `colour` along one side of the form `pts`: what of the form is left uncovered when a copy of it is
 * moved by (dx, dy) and grown by `grow`. Moved up and left it leaves the shade on the lower right; moved down and right,
 * the light on the upper left.
 */
export function side(dr: Drawing, pts: readonly Pt[], dx: number, dy: number, colour: string, { grow = 1, opacity = 1 } = {}): void {
  const [cx, cy] = centroid(pts);
  const cover = scaleAbout(shift(pts, dx, dy), cx + dx, cy + dy, grow);
  within(dr, outline(pts), () => {
    dr.add(`<path d="${EVERYWHERE}${outline(cover)}" fill="${colour}" fill-rule="evenodd"${opacity < 1 ? ` fill-opacity="${n2(opacity)}"` : ''}/>`);
  });
}

/** A form's three colours: its own, its one step of light and its one step of shade. */
export interface Tone {
  base: string;
  light: string;
  shade: string;
}

/** A form painted whole: its flat colour, one crescent of shade and one of light. */
export function form(dr: Drawing, pts: readonly Pt[], tone: Tone, shade: Pt = [-2, -1.6], light: Pt = [1.4, 1.4], grow = 1): void {
  paint(dr, outline(pts), tone.base);
  if (shade[0] || shade[1]) side(dr, pts, shade[0], shade[1], tone.shade, { grow });
  if (light[0] || light[1]) side(dr, pts, light[0], light[1], tone.light, { grow });
}

/** A shape with straight sides, as a woven motif has. */
export const polygon = (pts: readonly Pt[]): string => `M${pts.map(([x, y]) => nums(x, y)).join('L')}Z`;

/** An exact ellipse as a path, for what is turned on a wheel or too small for a hand's wobble to show. */
export const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z`;
